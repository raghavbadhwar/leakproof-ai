import { NextResponse } from 'next/server';
import { createOrganizationSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireAuthenticatedUser } from '@/lib/db/auth';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organizations(id, name, created_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      organizations: (data ?? []).map((row) => ({
        role: row.role,
        organization: row.organizations
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = createOrganizationSchema.parse(await request.json());
    const supabase = createSupabaseServiceClient();

    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: body.name })
      .select('id, name, created_at')
      .single();

    if (orgError) throw orgError;

    const { error: memberError } = await supabase.from('organization_members').insert({
      organization_id: organization.id,
      user_id: user.id,
      role: 'owner'
    });

    if (memberError) throw memberError;

    await writeAuditEvent(supabase, {
      organizationId: organization.id,
      actorUserId: user.id,
      eventType: 'organization.created',
      entityType: 'organization',
      entityId: organization.id,
      metadata: {
        role: 'owner'
      }
    });

    return NextResponse.json({ organization });
  } catch (error) {
    return handleApiError(error);
  }
}
