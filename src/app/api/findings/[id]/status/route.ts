import { NextResponse } from 'next/server';
import { findingStatusUpdateSchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { assertValidFindingStatusTransition } from '@/lib/api/status';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationMember } from '@/lib/db/auth';
import { assertRoleAllowed, REVIEWER_WRITE_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const organizationId = uuidSchema.parse(url.searchParams.get('organization_id'));
    const body = findingStatusUpdateSchema.parse(await request.json());
    const auth = await requireOrganizationMember(request, organizationId);
    assertRoleAllowed(auth.role, REVIEWER_WRITE_ROLES);
    const supabase = createSupabaseServiceClient();

    const { data: currentFinding, error: currentError } = await supabase
      .from('leakage_findings')
      .select('status, workspace_id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (currentError) throw currentError;
    await assertWorkspaceBelongsToOrganization(organizationId, currentFinding.workspace_id);
    const transition = assertValidFindingStatusTransition(currentFinding.status, body.status);

    const { data, error } = await supabase
      .from('leakage_findings')
      .update({
        status: transition.to,
        reviewer_user_id: auth.userId,
        reviewed_at: new Date().toISOString(),
        review_note: body.note,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('workspace_id', currentFinding.workspace_id)
      .select('*')
      .single();

    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId,
      actorUserId: auth.userId,
      eventType: body.status === 'approved' ? 'finding.approved' : 'finding.status_changed',
      entityType: 'leakage_finding',
      entityId: id,
      metadata: {
        from_status: transition.from,
        to_status: transition.to,
        note: body.note
      }
    });

    return NextResponse.json({ finding: data });
  } catch (error) {
    return handleApiError(error);
  }
}
