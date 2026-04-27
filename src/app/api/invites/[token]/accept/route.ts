import { NextResponse } from 'next/server';
import { acceptInviteSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireAuthenticatedUser } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const parsed = acceptInviteSchema.parse({ token });
    const user = await requireAuthenticatedUser(request);
    const supabase = createSupabaseServiceClient();

    const { data: invite, error: inviteError } = await supabase
      .from('organization_invites')
      .select('id, organization_id, email, role, status, expires_at')
      .eq('token', parsed.token)
      .eq('status', 'pending')
      .single();

    if (inviteError) throw inviteError;
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error('forbidden');
    }
    if (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error('forbidden');
    }

    const { data: existingMember, error: existingError } = await supabase
      .from('organization_members')
      .select('id, user_id, role, created_at')
      .eq('organization_id', invite.organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) throw existingError;

    const member = existingMember ?? (await addMember(supabase, invite.organization_id, user.id, invite.role));

    const { error: inviteUpdateError } = await supabase
      .from('organization_invites')
      .update({ status: 'accepted', accepted_by: user.id, accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    if (inviteUpdateError) throw inviteUpdateError;

    await writeAuditEvent(supabase, {
      organizationId: invite.organization_id,
      actorUserId: user.id,
      eventType: 'invite_accepted',
      entityType: 'organization_invite',
      entityId: invite.id,
      metadata: {
        role: invite.role,
        target_user_id: user.id,
        existing_member: Boolean(existingMember)
      }
    });

    if (!existingMember) {
      await writeAuditEvent(supabase, {
        organizationId: invite.organization_id,
        actorUserId: user.id,
        eventType: 'member_added',
        entityType: 'organization_member',
        entityId: member.id,
        metadata: {
          invite_id: invite.id,
          role: invite.role,
          target_user_id: user.id
        }
      });
    }

    return NextResponse.json({ member });
  } catch (error) {
    return handleApiError(error);
  }
}

async function addMember(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  organizationId: string,
  userId: string,
  role: string
): Promise<{ id: string; user_id: string; role: string; created_at: string }> {
  const { data, error } = await supabase
    .from('organization_members')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role
    })
    .select('id, user_id, role, created_at')
    .single();

  if (error) throw error;
  return data;
}
