import { NextResponse } from 'next/server';
import { updateMemberRoleSchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireOrganizationRole } from '@/lib/db/auth';
import { ADMIN_ROLES, assertCanChangeMemberRole, assertCanRemoveMember, type OrganizationRole } from '@/lib/db/roles';
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
    const supabase = createSupabaseServiceClient();

    const currentMember = await getMember(supabase, parsedOrganizationId, parsedMemberId);
    const ownerCount = await getOwnerCount(supabase, parsedOrganizationId);
    assertCanChangeMemberRole(auth.role, currentMember.role, body.role, ownerCount);

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
      eventType: 'member_role_changed',
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ organizationId: string; memberId: string }> }
) {
  try {
    const { organizationId, memberId } = await context.params;
    const parsedOrganizationId = uuidSchema.parse(organizationId);
    const parsedMemberId = uuidSchema.parse(memberId);

    const auth = await requireOrganizationRole(request, parsedOrganizationId, ADMIN_ROLES);
    const supabase = createSupabaseServiceClient();
    const currentMember = await getMember(supabase, parsedOrganizationId, parsedMemberId);
    const ownerCount = await getOwnerCount(supabase, parsedOrganizationId);
    assertCanRemoveMember(auth.role, currentMember.role, ownerCount);

    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', parsedMemberId)
      .eq('organization_id', parsedOrganizationId);

    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId: parsedOrganizationId,
      actorUserId: auth.userId,
      eventType: 'member_removed',
      entityType: 'organization_member',
      entityId: parsedMemberId,
      metadata: {
        removed_role: currentMember.role,
        target_user_id: currentMember.user_id
      }
    });

    return NextResponse.json({ ok: true });
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

async function getOwnerCount(supabase: ReturnType<typeof createSupabaseServiceClient>, organizationId: string): Promise<number> {
  const { count, error } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('role', 'owner');
  if (error) throw error;
  return count ?? 0;
}
