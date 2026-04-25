import { NextResponse } from 'next/server';
import { runReconciliationSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
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
    const supabase = createSupabaseServiceClient();

    const [{ data: termRows, error: termsError }, { data: invoiceRows, error: invoiceError }, { data: usageRows, error: usageError }] =
      await Promise.all([
        supabase
          .from('contract_terms')
          .select('*')
          .eq('organization_id', body.organization_id)
          .eq('workspace_id', body.workspace_id)
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
          .eq('workspace_id', body.workspace_id)
      ]);

    if (termsError) throw termsError;
    if (invoiceError) throw invoiceError;
    if (usageError) throw usageError;

    const terms = (termRows ?? []).map(mapContractTerm);
    const invoices = (invoiceRows ?? []).map(mapInvoiceRecord);
    const usage = (usageRows ?? []).map(mapUsageRecord);
    const customerIds = Array.from(new Set([...terms, ...invoices, ...usage].map((row) => row.customerId)));

    const { data: reconciliationRun, error: runError } = await supabase
      .from('reconciliation_runs')
      .insert({
        organization_id: body.organization_id,
        workspace_id: body.workspace_id,
        status: 'running',
        created_by: auth.userId
      })
      .select('id')
      .single();
    if (runError) throw runError;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'reconciliation.started',
      entityType: 'reconciliation_run',
      entityId: reconciliationRun.id,
      metadata: {
        customer_count: customerIds.length
      }
    });

    const findings = customerIds.flatMap((customerId) => reconcileLeakage({ customerId, terms, invoices, usage }));

    if (findings.length === 0) {
      await supabase
        .from('reconciliation_runs')
        .update({
          status: 'completed',
          findings_created: 0,
          completed_at: new Date().toISOString()
        })
        .eq('id', reconciliationRun.id)
        .eq('organization_id', body.organization_id);
      return NextResponse.json({ status: 'completed', findings: [] });
    }

    const { data: insertedFindings, error: findingsError } = await supabase
      .from('leakage_findings')
      .insert(
        findings.map((finding) =>
          findingToInsert(finding, {
            organizationId: body.organization_id,
            workspaceId: body.workspace_id,
            reconciliationRunId: reconciliationRun.id
          })
        )
      )
      .select('id, finding_type, outcome_type, title, estimated_amount_minor, currency, status');

    if (findingsError) throw findingsError;

    const evidenceRows = (insertedFindings ?? []).flatMap((insertedFinding, index) => {
      const originalFinding = findings[index];
      if (!originalFinding) return [];

      return originalFinding.citations.map((citation) => ({
        organization_id: body.organization_id,
        workspace_id: body.workspace_id,
        finding_id: insertedFinding.id,
        evidence_type: citation.sourceType === 'contract' ? 'contract_term' : citation.sourceType === 'invoice' ? 'invoice_row' : citation.sourceType === 'usage' ? 'usage_row' : 'calculation',
        source_id: isUuid(citation.sourceId) ? citation.sourceId : null,
        citation,
        excerpt: citation.excerpt
      }));
    });

    if (evidenceRows.length > 0) {
      const { error: evidenceError } = await supabase.from('evidence_items').insert(evidenceRows);
      if (evidenceError) throw evidenceError;
    }

    await supabase
      .from('reconciliation_runs')
      .update({
        status: 'completed',
        findings_created: insertedFindings?.length ?? 0,
        completed_at: new Date().toISOString()
      })
      .eq('id', reconciliationRun.id)
      .eq('organization_id', body.organization_id);

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'finding.created',
      entityType: 'reconciliation_run',
      entityId: reconciliationRun.id,
      metadata: {
        findings_created: insertedFindings?.length ?? 0
      }
    });

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'reconciliation.completed',
      entityType: 'reconciliation_run',
      entityId: reconciliationRun.id,
      metadata: {
        findings_created: insertedFindings?.length ?? 0
      }
    });

    return NextResponse.json({ status: 'completed', findings: insertedFindings ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
