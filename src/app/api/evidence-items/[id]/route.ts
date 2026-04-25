import { NextResponse } from 'next/server';
import { evidenceCandidateActionSchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireWorkspaceRole } from '@/lib/db/auth';
import { REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const evidenceItemId = uuidSchema.parse(id);
    const url = new URL(request.url);
    const jsonBody = await request.json().catch(() => ({}));
    const body = evidenceCandidateActionSchema.parse({
      organization_id: jsonBody.organization_id ?? url.searchParams.get('organization_id'),
      note: jsonBody.note ?? url.searchParams.get('note') ?? undefined
    });
    const supabase = createSupabaseServiceClient();
    const evidenceItem = await getEvidenceItem(supabase, body.organization_id, evidenceItemId);
    const auth = await requireWorkspaceRole(request, body.organization_id, evidenceItem.workspace_id, REVIEWER_WRITE_ROLES);

    const { error } = await supabase
      .from('evidence_items')
      .delete()
      .eq('id', evidenceItemId)
      .eq('organization_id', body.organization_id);
    if (error) throw error;

    await supabase
      .from('evidence_candidates')
      .update({
        attached_evidence_item_id: null,
        attached_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('attached_evidence_item_id', evidenceItemId)
      .eq('organization_id', body.organization_id);

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'evidence_item.removed',
      entityType: 'evidence_item',
      entityId: evidenceItemId,
      metadata: {
        finding_id: evidenceItem.finding_id,
        has_note: Boolean(body.note)
      }
    });

    return NextResponse.json({ status: 'removed' });
  } catch (error) {
    return handleApiError(error);
  }
}

async function getEvidenceItem(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  evidenceItemId: string
): Promise<{ id: string; workspace_id: string; finding_id: string }> {
  const { data, error } = await supabase
    .from('evidence_items')
    .select('id, workspace_id, finding_id')
    .eq('id', evidenceItemId)
    .eq('organization_id', organizationId)
    .single();
  if (error) throw error;
  return data;
}
