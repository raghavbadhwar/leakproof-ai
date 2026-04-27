import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { runReconciliationSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { sanitizeOperationalErrorMessage } from '@/lib/audit/auditEvents';
import { buildFindingLogicalKey, readFindingPeriod } from '@/lib/audit/runVersions';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { findingToInsert, mapContractTerm, mapInvoiceRecord, mapUsageRecord } from '@/lib/db/mappers';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { reconcileLeakage } from '@/lib/leakage/reconcile';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = runReconciliationSchema.parse(await request.json());
    const auth = await requireWorkspaceRole(request, body.organization_id, body.workspace_id, REVIEWER_WRITE_ROLES);
    await enforceRateLimit({
      key: `reconciliation:${auth.userId}:${body.organization_id}:${body.workspace_id}`,
      limit: 5,
      windowMs: 10 * 60 * 1000
    });
    const supabase = createSupabaseServiceClient();

    const { data: latestRun, error: latestRunError } = await supabase
      .from('reconciliation_runs')
      .select('run_version')
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', body.workspace_id)
      .order('run_version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestRunError) throw latestRunError;

    const { data: reconciliationRun, error: runError } = await supabase
      .from('reconciliation_runs')
      .insert({
        organization_id: body.organization_id,
        workspace_id: body.workspace_id,
        status: 'processing',
        run_version: Number(latestRun?.run_version ?? 0) + 1,
        created_by: auth.userId,
        started_at: new Date().toISOString()
      })
      .select('id, run_version')
      .single();
    if (runError) throw runError;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'reconciliation_run_started',
      entityType: 'reconciliation_run',
      entityId: reconciliationRun.id,
      metadata: {
        run_version: reconciliationRun.run_version
      }
    });

    try {
      const [
        { data: termRows, error: termsError },
        { data: invoiceRows, error: invoiceError },
        { data: usageRows, error: usageError },
        { count: previousCompletedRuns, error: previousRunsError }
      ] = await Promise.all([
        supabase
          .from('contract_terms')
          .select('*')
          .eq('organization_id', body.organization_id)
          .eq('workspace_id', body.workspace_id)
          .eq('is_active', true)
          .in('review_status', ['approved', 'edited']),
        supabase
          .from('invoice_records')
          .select('*')
          .eq('organization_id', body.organization_id)
          .eq('workspace_id', body.workspace_id),
        supabase
          .from('usage_records')
          .select('*')
          .eq('organization_id', body.organization_id)
          .eq('workspace_id', body.workspace_id),
        supabase
          .from('reconciliation_runs')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', body.organization_id)
          .eq('workspace_id', body.workspace_id)
          .eq('status', 'completed')
          .neq('id', reconciliationRun.id)
      ]);

      if (termsError) throw termsError;
      if (invoiceError) throw invoiceError;
      if (usageError) throw usageError;
      if (previousRunsError) throw previousRunsError;

      const terms = (termRows ?? []).map(mapContractTerm);
      const invoices = (invoiceRows ?? []).map(mapInvoiceRecord);
      const usage = (usageRows ?? []).map(mapUsageRecord);
      const unassignedRecordCount = [...terms, ...invoices, ...usage].filter((row) => row.customerId === 'unassigned').length;
      const customerIds = Array.from(new Set([...terms, ...invoices, ...usage].map((row) => row.customerId))).filter(
        (customerId) => customerId !== 'unassigned'
      );
      const findings = customerIds.flatMap((customerId) => reconcileLeakage({ customerId, terms, invoices, usage }));
      const stagedFindings = Array.from(new Map(findings.map((finding) => [buildFindingLogicalKey(finding), finding] as const)).values());
      let insertedFindings: Array<{
        id: string;
        finding_type: string;
        outcome_type: string;
        title: string;
        estimated_amount_minor: number;
        currency: string;
        status: string;
      }> = [];

      if (stagedFindings.length > 0) {
        const { data, error: findingsError } = await supabase
          .from('leakage_findings')
          .insert(
            stagedFindings.map((finding) => {
              const [periodStart, periodEnd] = readFindingPeriod(finding.calculation);
              return {
                ...findingToInsert(finding, {
                  organizationId: body.organization_id,
                  workspaceId: body.workspace_id,
                  reconciliationRunId: reconciliationRun.id
                }),
                is_active: false,
                logical_key: buildFindingLogicalKey(finding),
                period_start: periodStart,
                period_end: periodEnd
              };
            })
          )
          .select('id, finding_type, outcome_type, title, estimated_amount_minor, currency, status');

        if (findingsError) throw findingsError;
        insertedFindings = data ?? [];
      }

      const evidenceRows = insertedFindings.flatMap((insertedFinding, index) => {
        const originalFinding = stagedFindings[index];
        if (!originalFinding) return [];

        return originalFinding.citations.map((citation) => ({
          organization_id: body.organization_id,
          workspace_id: body.workspace_id,
          finding_id: insertedFinding.id,
          evidence_type: citation.sourceType === 'contract' ? 'contract_term' : citation.sourceType === 'invoice' ? 'invoice_row' : citation.sourceType === 'usage' ? 'usage_row' : 'calculation',
          source_id: isUuid(citation.sourceId) ? citation.sourceId : null,
          citation,
          excerpt: citation.excerpt,
          approval_state: 'suggested',
          relevance_explanation: 'System-created from deterministic reconciliation citations. Reviewer approval is required before export.'
        }));
      });

      if (evidenceRows.length > 0) {
        const { error: evidenceError } = await supabase.from('evidence_items').insert(evidenceRows);
        if (evidenceError) throw evidenceError;
      }

      const { error: completeRunError } = await supabase.rpc('complete_reconciliation_run', {
        p_run_id: reconciliationRun.id,
        p_organization_id: body.organization_id,
        p_workspace_id: body.workspace_id,
        p_findings_created: insertedFindings.length
      });
      if (completeRunError) throw completeRunError;

      if ((previousCompletedRuns ?? 0) > 0) {
        await writeAuditEvent(supabase, {
          organizationId: body.organization_id,
          actorUserId: auth.userId,
          eventType: 'run_superseded',
          entityType: 'reconciliation_run',
          entityId: reconciliationRun.id,
          metadata: {
            run_kind: 'reconciliation',
            superseded_run_count: previousCompletedRuns ?? 0
          }
        });
      }

      await writeAuditEvent(supabase, {
        organizationId: body.organization_id,
        actorUserId: auth.userId,
        eventType: 'finding.created',
        entityType: 'reconciliation_run',
        entityId: reconciliationRun.id,
        metadata: {
          findings_created: insertedFindings.length
        }
      });

      await writeAuditEvent(supabase, {
        organizationId: body.organization_id,
        actorUserId: auth.userId,
        eventType: 'reconciliation_run_completed',
        entityType: 'reconciliation_run',
        entityId: reconciliationRun.id,
        metadata: {
          customer_count: customerIds.length,
          unassigned_record_count: unassignedRecordCount,
          findings_created: insertedFindings.length
        }
      });

      return NextResponse.json({ status: 'completed', run_id: reconciliationRun.id, findings: insertedFindings });
    } catch (runError) {
      await supabase
        .from('reconciliation_runs')
        .update({
          status: 'failed',
          error_message: sanitizeOperationalErrorMessage(runError, 'Reconciliation run failed.'),
          completed_at: new Date().toISOString()
        })
        .eq('id', reconciliationRun.id)
        .eq('organization_id', body.organization_id);

      await writeAuditEvent(supabase, {
        organizationId: body.organization_id,
        actorUserId: auth.userId,
        eventType: 'reconciliation_run_failed',
        entityType: 'reconciliation_run',
        entityId: reconciliationRun.id,
        metadata: {
          reason: sanitizeOperationalErrorMessage(runError, 'Reconciliation run failed.')
        }
      });

      throw runError;
    }
  } catch (error) {
    return handleApiError(error);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
