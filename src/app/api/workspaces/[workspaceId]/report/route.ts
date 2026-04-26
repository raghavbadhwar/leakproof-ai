import { NextResponse } from 'next/server';
import { workspaceScopedBodySchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { isEvidenceCandidateExportReady } from '@/lib/evidence/candidates';
import { CUSTOMER_FACING_REPORT_STATUSES, generateExecutiveAuditReport, type ReportCitation, type ReportFinding } from '@/lib/evidence/report';

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
          .select(
            'id, title, finding_type, outcome_type, status, estimated_amount_minor, currency, confidence, recommended_action, calculation, reviewer_user_id, reviewed_at, customers(name)'
          )
          .eq('organization_id', body.organization_id)
          .eq('workspace_id', workspaceId)
          .eq('is_active', true)
          .in('status', [...CUSTOMER_FACING_REPORT_STATUSES])
      ]);
    if (organizationError) throw organizationError;
    if (workspaceError) throw workspaceError;
    if (findingsError) throw findingsError;

    const findingIds = (findingRows ?? []).map((finding) => finding.id);
    const safeFindingIds = findingIds.length > 0 ? findingIds : ['00000000-0000-0000-0000-000000000000'];
    const [{ data: approvedEvidenceRows, error: evidenceError }, { data: candidateRows, error: candidatesError }] = await Promise.all([
      supabase
        .from('evidence_items')
        .select('id, finding_id, citation, excerpt, approval_state')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', workspaceId)
        .eq('approval_state', 'approved')
        .in('finding_id', safeFindingIds),
      supabase
        .from('evidence_candidates')
        .select('approval_state, attached_evidence_item_id')
        .eq('organization_id', body.organization_id)
        .eq('workspace_id', workspaceId)
        .in('finding_id', safeFindingIds)
    ]);
    if (evidenceError) throw evidenceError;
    if (candidatesError) throw candidatesError;

    const approvedCandidateEvidenceIds = new Set(
      (candidateRows ?? [])
        .filter(isEvidenceCandidateExportReady)
        .map((candidate) => candidate.attached_evidence_item_id as string)
    );
    const candidateEvidenceIds = new Set(
      (candidateRows ?? [])
        .filter((candidate) => candidate.attached_evidence_item_id)
        .map((candidate) => candidate.attached_evidence_item_id as string)
    );

    const evidenceByFinding = new Map<string, ReportCitation[]>();
    for (const row of approvedEvidenceRows ?? []) {
      if (candidateEvidenceIds.has(row.id) && !approvedCandidateEvidenceIds.has(row.id)) continue;
      const citation = row.citation as { label?: string; excerpt?: string; sourceType?: string };
      const next = evidenceByFinding.get(row.finding_id) ?? [];
      next.push({
        label: citation.label ?? 'Source evidence',
        excerpt: row.excerpt ?? citation.excerpt,
        sourceType: citation.sourceType,
        approvalState: row.approval_state
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
        calculation: (finding.calculation as Record<string, unknown>) ?? {},
        reviewerUserId: finding.reviewer_user_id,
        reviewedAt: finding.reviewed_at,
        evidenceCitations: evidenceByFinding.get(finding.id) ?? []
      };
    });
    const report = generateExecutiveAuditReport({
      organizationName: organization.name,
      workspaceName: workspace.name,
      workspaceId,
      generatedBy: auth.userId,
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
