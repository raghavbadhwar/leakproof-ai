import { NextResponse } from 'next/server';
import { createWorkspaceSchema, uuidSchema } from '@/lib/api/schemas';
import { handleApiError } from '@/lib/api/responses';
import { writeAuditEvent } from '@/lib/db/audit';
import { requireOrganizationMember, requireOrganizationRole } from '@/lib/db/auth';
import { ADMIN_ROLES } from '@/lib/db/roles';
import { createSupabaseServiceClient } from '@/lib/db/supabaseServer';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = uuidSchema.parse(url.searchParams.get('organization_id'));
    await requireOrganizationMember(request, organizationId);
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('audit_workspaces')
      .select('id, name, status, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ workspaces: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createWorkspaceSchema.parse(await request.json());
    const auth = await requireOrganizationRole(request, body.organization_id, ADMIN_ROLES);
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from('audit_workspaces')
      .insert({
        organization_id: body.organization_id,
        name: body.name,
        created_by: auth.userId
      })
      .select('id, name, status')
      .single();

    if (error) throw error;

    await writeAuditEvent(supabase, {
      organizationId: body.organization_id,
      actorUserId: auth.userId,
      eventType: 'workspace.created',
      entityType: 'audit_workspace',
      entityId: data.id,
      metadata: {
        status: data.status
      }
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
