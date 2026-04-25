import { NextResponse } from 'next/server';
import { updateMemberRoleSchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireOrganizationRole } from '@/lib/db/auth';
import { ADMIN_ROLES, assertCanManageRole, isPrivilegeEscalation, type OrganizationRole } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; memberId: string }> }
) {
  try {
    const { organizationId, memberId } = await context.params;
    const parsedOrganizationId = uuidSchema.parse(organizationId);
    const parsedMemberId = uuidSchema.parse(memberId);
    const body = updateMemberRoleSchema.parse(await request.json());
    if (body.organization_id !== parsedOrganizationId) throw new Error('forbidden');

    const auth = await requireOrganizationRole(request, parsedOrganizationId, ADMIN_ROLES);
    assertCanManageRole(auth.role, body.role);
    const supabase = createSupabaseServiceClient();

    const currentMember = await getMember(supabase, parsedOrganizationId, parsedMemberId);
    if (isPrivilegeEscalation(auth.role, currentMember.role, body.role)) {
      throw new Error('forbidden');
    }
    if (currentMember.role === 'owner' && body.role !== 'owner') {
      await assertNotLastOwner(supabase, parsedOrganizationId);
    }

    const { data, error } = await supabase
      .from('organization_members')
      .update({ role: body.role })
      .eq('id', parsedMemberId)
      .eq('organization_id', parsedOrganizationId)
      .select('id, user_id, role, created_at')
      .single();
    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId: parsedOrganizationId,
      actorUserId: auth.userId,
      eventType: 'role.changed',
      entityType: 'organization_member',
      entityId: parsedMemberId,
      metadata: {
        from_role: currentMember.role,
        to_role: body.role,
        target_user_id: currentMember.user_id
      }
    });

    return NextResponse.json({ member: data });
  } catch (error) {
    return handleApiError(error);
  }
}

async function getMember(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  memberId: string
): Promise<{ id: string; user_id: string; role: OrganizationRole }> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .single();
  if (error) throw error;
  return data as { id: string; user_id: string; role: OrganizationRole };
}

async function assertNotLastOwner(supabase: ReturnType<typeof createSupabaseServiceClient>, organizationId: string): Promise<void> {
  const { count, error } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('role', 'owner');
  if (error) throw error;
  if ((count ?? 0) <= 1) {
    throw new Error('last_owner');
  }
}
