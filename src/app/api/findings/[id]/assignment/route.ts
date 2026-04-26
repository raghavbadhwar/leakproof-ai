import { NextResponse } from 'next/server';
import { findingAssignmentSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { assertWorkspaceBelongsToOrganization, requireOrganizationRole } from '@/lib/db/auth';
import { ADMIN_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = findingAssignmentSchema.parse(await request.json());
    const auth = await requireOrganizationRole(request, body.organization_id, ADMIN_ROLES);
    const supabase = createSupabaseServiceClient();

    const { data: currentFinding, error: currentError } = await supabase
      .from('leakage_findings')
      .select('id, workspace_id, reviewer_user_id')
      .eq('id', id)
      .eq('organization_id', body.organization_id)
      .eq('is_active', true)
      .single();

    if (currentError) throw currentError;
    await assertWorkspaceBelongsToOrganization(body.organization_id, currentFinding.workspace_id);

    if (body.reviewer_user_id) {
      await assertReviewerBelongsToOrganization(supabase, body.organization_id, body.reviewer_user_id);
    }

    const { data, error } = await supabase
      .from('leakage_findings')
      .update({
        reviewer_user_id: body.reviewer_user_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', body.organization_id)
      .eq('workspace_id', currentFinding.workspace_id)
      .eq('is_active', true)
      .select('*')
      .single();

    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'finding_assigned',
      entityType: 'leakage_finding',
      entityId: id,
      metadata: {
        from_reviewer_user_id: currentFinding.reviewer_user_id,
        to_reviewer_user_id: body.reviewer_user_id
      }
    });

    return NextResponse.json({ finding: data });
  } catch (error) {
    return handleApiError(error);
  }
}

async function assertReviewerBelongsToOrganization(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  reviewerUserId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', reviewerUserId)
    .in('role', ['owner', 'admin', 'reviewer'])
    .maybeSingle();

  if (error || !data) {
    throw new Error('forbidden');
  }
}
