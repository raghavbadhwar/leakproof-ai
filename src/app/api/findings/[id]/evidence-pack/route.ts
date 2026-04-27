import { NextResponse } from 'next/server';
import { uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { assertRoleAllowed, REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';
import { isEvidenceCandidateExportReady } from '@/lib/evidence/candidates';
import { exportBlockerForFinding, exportCitationForEvidenceRow } from '@/lib/evidence/exportReadiness';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const organizationId = uuidSchema.parse(url.searchParams.get('organization_id'));
    const auth = await requireOrganizationMember(request, organizationId);
    assertRoleAllowed(auth.role, REVIEWER_WRITE_ROLES);
    const supabase = createSupabaseServiceClient();

    const { data: finding, error: findingError } = await supabase
      .from('leakage_findings')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();
    if (findingError) throw findingError;
    await assertWorkspaceBelongsToOrganization(organizationId, finding.workspace_id);

    if (!['approved', 'customer_ready', 'recovered'].includes(finding.status)) {
      throw new Error('invalid_status_transition');
    }

    const [{ data: evidence, error: evidenceError }, { data: candidates, error: candidatesError }] = await Promise.all([
      supabase
        .from('evidence_items')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('workspace_id', finding.workspace_id)
        .eq('finding_id', id)
        .eq('approval_state', 'approved')
        .not('reviewed_by', 'is', null)
        .not('reviewed_at', 'is', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('evidence_candidates')
        .select('approval_state, attached_evidence_item_id')
        .eq('organization_id', organizationId)
        .eq('workspace_id', finding.workspace_id)
        .eq('finding_id', id)
    ]);
    if (evidenceError) throw evidenceError;
    if (candidatesError) throw candidatesError;

    const candidateEvidenceIds = new Set(
      (candidates ?? []).filter((candidate) => candidate.attached_evidence_item_id).map((candidate) => candidate.attached_evidence_item_id as string)
    );
    const approvedCandidateEvidenceIds = new Set(
      (candidates ?? [])
        .filter(isEvidenceCandidateExportReady)
        .map((candidate) => candidate.attached_evidence_item_id as string)
    );
    const exportableEvidence = (evidence ?? []).filter((item) => !candidateEvidenceIds.has(item.id) || approvedCandidateEvidenceIds.has(item.id));
    const blocker = exportBlockerForFinding({
      status: finding.status,
      outcomeType: finding.outcome_type,
      calculation: (finding.calculation as Record<string, unknown>) ?? {},
      evidenceCitations: exportableEvidence.map(exportCitationForEvidenceRow)
    });
    if (blocker) throw new Error(blocker);

    await writeAuditEvent(supabase, {
      organizationId,
      actorUserId: auth.userId,
      eventType: 'finding.exported',
      entityType: 'leakage_finding',
      entityId: id,
      metadata: {
        format: 'html'
      }
    });

    return NextResponse.json({ finding, evidence: exportableEvidence, export_status: 'ready' });
  } catch (error) {
    return handleApiError(error);
  }
}
