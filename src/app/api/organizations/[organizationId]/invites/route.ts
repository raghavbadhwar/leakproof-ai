import { NextResponse } from 'next/server';
import { createInviteSchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireOrganizationMember, requireOrganizationRole } from '@/lib/db/auth';
import { ADMIN_ROLES, assertCanManageRole } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await context.params;
    const parsedOrganizationId = uuidSchema.parse(organizationId);
    await requireOrganizationMember(request, parsedOrganizationId);
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('organization_invites')
      .select('id, email, role, token, status, created_at, expires_at')
      .eq('organization_id', parsedOrganizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      invites: (data ?? []).map((invite) => toInviteResponse(request, invite))
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await context.params;
    const parsedOrganizationId = uuidSchema.parse(organizationId);
    const body = createInviteSchema.parse(await request.json());
    if (body.organization_id !== parsedOrganizationId) throw new Error('forbidden');

    const auth = await requireOrganizationRole(request, parsedOrganizationId, ADMIN_ROLES);
    assertCanManageRole(auth.role, body.role);
    const supabase = createSupabaseServiceClient();
    const token = crypto.randomUUID();

    const { data, error } = await supabase
      .from('organization_invites')
      .insert({
        organization_id: parsedOrganizationId,
        email: body.email.toLowerCase(),
        role: body.role,
        token,
        status: 'pending',
        invited_by: auth.userId
      })
      .select('id, email, role, token, status, created_at, expires_at')
      .single();

    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId: parsedOrganizationId,
      actorUserId: auth.userId,
      eventType: 'invite_created',
      entityType: 'organization_invite',
      entityId: data.id,
      metadata: {
        invited_email: body.email.toLowerCase(),
        role: body.role
      }
    });

    return NextResponse.json({ invite: toInviteResponse(request, data) });
  } catch (error) {
    return handleApiError(error);
  }
}

function toInviteResponse(
  request: Request,
  invite: { id: string; email: string; role: string; token: string; status: string; created_at: string; expires_at?: string | null }
) {
  const inviteUrl = `${new URL(request.url).origin}/app/team?invite=${invite.token}`;
  return {
    ...invite,
    invite_url: inviteUrl,
    invite_text: `Join LeakProof AI as ${invite.role}: ${inviteUrl}`
  };
}
