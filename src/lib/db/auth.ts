import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createSupabaseAnonClient, createSupabaseServiceClient } from './supabaseServer';
import { assertRoleAllowed, type OrganizationRole } from './roles';

export type RequestAuthContext = {
  user: User;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
};

export async function requireAuthenticatedUser(request: Request): Promise<User> {
  const token = bearerToken(request);
  if (!token) {
    throw new Error('unauthorized');
  }

  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error('unauthorized');
  }

  return data.user;
}

export async function requireOrganizationMember(request: Request, organizationId: string): Promise<RequestAuthContext> {
  const user = await requireAuthenticatedUser(request);
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    throw new Error('forbidden');
  }

  return {
    user,
    userId: user.id,
    organizationId,
    role: data.role as OrganizationRole
  };
}

export async function requireOrganizationRole(
  request: Request,
  organizationId: string,
  allowedRoles: readonly OrganizationRole[]
): Promise<RequestAuthContext> {
  const auth = await requireOrganizationMember(request, organizationId);
  assertRoleAllowed(auth.role, allowedRoles);
  return auth;
}

export async function requireWorkspaceMember(request: Request, organizationId: string, workspaceId: string): Promise<RequestAuthContext> {
  const auth = await requireOrganizationMember(request, organizationId);
  await assertWorkspaceBelongsToOrganization(organizationId, workspaceId);
  return auth;
}

export async function requireWorkspaceRole(
  request: Request,
  organizationId: string,
  workspaceId: string,
  allowedRoles: readonly OrganizationRole[]
): Promise<RequestAuthContext> {
  const auth = await requireWorkspaceMember(request, organizationId, workspaceId);
  assertRoleAllowed(auth.role, allowedRoles);
  return auth;
}

export async function assertWorkspaceBelongsToOrganization(organizationId: string, workspaceId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('audit_workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('forbidden');
  }
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim() || null;
}
