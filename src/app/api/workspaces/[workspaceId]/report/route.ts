import { NextResponse } from 'next/server';
import { workspaceScopedBodySchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { generateExecutiveAuditReport, type ReportFinding } from '@/lib/evidence/report';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params;
    const body = workspaceScopedBodySchema.parse(await request.json());
    const auth = await requireWorkspaceRole(request, body.organization_id, workspaceId, REVIEWER_WRITE_ROLES);
    const supabase = createSupabaseServiceClient();

    const [{ data: organization, error: organizationError }, { data: workspace, error: workspaceError }, { data: findingRows, error: findingsError }] =
      await Promise.all([
        supabase.from('organizations').select('name').eq('id', body.organization_id).single(),
        supabase.from('audit_workspaces').select('name').eq('id', workspaceId).eq('organization_id', body.organization_id).single(),
        supabase
          .from('leakage_findings')
          .select('id, title, finding_type, outcome_type, status, estimated_amount_minor, currency, confidence, recommended_action, customers(name)')
          .eq('organization_id', body.organization_id)
          .eq('workspace_id', workspaceId)
      ]);
    if (organizationError) throw organizationError;
    if (workspaceError) throw workspaceError;
    if (findingsError) throw findingsError;

    const findingIds = (findingRows ?? []).map((finding) => finding.id);
    const { data: approvedEvidenceRows, error: evidenceError } = await supabase
      .from('evidence_items')
      .select('finding_id, citation, excerpt')
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', workspaceId)
      .eq('approval_state', 'approved')
      .in('finding_id', findingIds.length > 0 ? findingIds : ['00000000-0000-0000-0000-000000000000']);
    if (evidenceError) throw evidenceError;

    const evidenceByFinding = new Map<string, Array<{ label: string; excerpt?: string; sourceType?: string }>>();
    for (const row of approvedEvidenceRows ?? []) {
      const citation = row.citation as { label?: string; excerpt?: string; sourceType?: string };
      const next = evidenceByFinding.get(row.finding_id) ?? [];
      next.push({
        label: citation.label ?? 'Source evidence',
        excerpt: row.excerpt ?? citation.excerpt,
        sourceType: citation.sourceType
      });
      evidenceByFinding.set(row.finding_id, next);
    }

    const findings: ReportFinding[] = (findingRows ?? []).map((finding) => {
      const customerRelation = finding.customers as { name?: string } | Array<{ name?: string }> | null;
      return {
        id: finding.id,
        title: finding.title,
        findingType: finding.finding_type,
        outcomeType: finding.outcome_type,
        status: finding.status,
        amountMinor: finding.estimated_amount_minor,
        currency: finding.currency,
        confidence: Number(finding.confidence),
        customerName: Array.isArray(customerRelation) ? customerRelation[0]?.name : customerRelation?.name,
        recommendedAction: finding.recommended_action,
        evidenceCitations: evidenceByFinding.get(finding.id) ?? []
      };
    });
    const report = generateExecutiveAuditReport({
      organizationName: organization.name,
      workspaceName: workspace.name,
      findings
    });

    const { data: pack, error: packError } = await supabase
      .from('evidence_packs')
      .insert({
        organization_id: body.organization_id,
        workspace_id: workspaceId,
        title: `${workspace.name} Executive Audit Report`,
        selected_finding_ids: report.topFindings.map((finding) => finding.id),
        report_json: report,
        status: 'generated',
        generated_by: auth.userId
      })
      .select('id')
      .single();
    if (packError) throw packError;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'report.generated',
      entityType: 'evidence_pack',
      entityId: pack.id,
      metadata: {
        finding_count: report.topFindings.length,
        total_minor: report.totalPotentialLeakageMinor
      }
    });

    return NextResponse.json({ report, evidence_pack_id: pack.id });
  } catch (error) {
    return handleApiError(error);
  }
}
