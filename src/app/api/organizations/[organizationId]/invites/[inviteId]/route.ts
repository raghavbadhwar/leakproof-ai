import { NextResponse } from 'next/server';
import { cancelInviteSchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireOrganizationRole } from '@/lib/db/auth';
import { ADMIN_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ organizationId: string; inviteId: string }> }
) {
  try {
    const { organizationId, inviteId } = await context.params;
    const parsedOrganizationId = uuidSchema.parse(organizationId);
    const parsedInviteId = uuidSchema.parse(inviteId);
    const body = cancelInviteSchema.parse(await request.json().catch(() => ({ organization_id: parsedOrganizationId })));
    if (body.organization_id !== parsedOrganizationId) throw new Error('forbidden');

    const auth = await requireOrganizationRole(request, parsedOrganizationId, ADMIN_ROLES);
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('organization_invites')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', parsedInviteId)
      .eq('organization_id', parsedOrganizationId)
      .eq('status', 'pending')
      .select('id, email, role')
      .single();

    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId: parsedOrganizationId,
      actorUserId: auth.userId,
      eventType: 'invite_cancelled',
      entityType: 'organization_invite',
      entityId: parsedInviteId,
      metadata: {
        invited_email: data.email,
        role: data.role
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
