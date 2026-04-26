export type OrganizationRole = 'owner' | 'admin' | 'member' | 'reviewer' | 'viewer';

export const PRODUCT_ROLES = ['owner', 'admin', 'reviewer', 'member', 'viewer'] as const satisfies readonly OrganizationRole[];

export const ADMIN_ROLES = ['owner', 'admin'] as const satisfies readonly OrganizationRole[];
export const REVIEWER_WRITE_ROLES = ['owner', 'admin', 'reviewer'] as const satisfies readonly OrganizationRole[];

const ROLE_RANK: Record<OrganizationRole, number> = {
  owner: 4,
  admin: 3,
  reviewer: 2,
  member: 1,
  viewer: 1
};

export function assertRoleAllowed(role: OrganizationRole, allowedRoles: readonly OrganizationRole[]): void {
  if (!allowedRoles.includes(role)) {
    throw new Error('forbidden');
  }
}

export function canManageRole(actorRole: OrganizationRole, targetRole: OrganizationRole): boolean {
  if (actorRole === 'owner') {
    return (PRODUCT_ROLES as readonly OrganizationRole[]).includes(targetRole);
  }

  if (actorRole === 'admin') {
    return targetRole === 'reviewer' || targetRole === 'member' || targetRole === 'viewer';
  }

  return false;
}

export function assertCanManageRole(actorRole: OrganizationRole, targetRole: OrganizationRole): void {
  if (!canManageRole(actorRole, targetRole)) {
    throw new Error('forbidden');
  }
}

export function assertCanChangeMemberRole(
  actorRole: OrganizationRole,
  fromRole: OrganizationRole,
  toRole: OrganizationRole,
  ownerCount: number
): void {
  assertCanManageRole(actorRole, toRole);

  if (isPrivilegeEscalation(actorRole, fromRole, toRole)) {
    throw new Error('forbidden');
  }

  if (fromRole === 'owner' && toRole !== 'owner' && ownerCount <= 1) {
    throw new Error('last_owner');
  }
}

export function assertCanRemoveMember(actorRole: OrganizationRole, targetRole: OrganizationRole, ownerCount: number): void {
  assertCanManageRole(actorRole, targetRole);

  if (targetRole === 'owner' && ownerCount <= 1) {
    throw new Error('last_owner');
  }
}

export function isPrivilegeEscalation(actorRole: OrganizationRole, fromRole: OrganizationRole, toRole: OrganizationRole): boolean {
  return ROLE_RANK[toRole] > ROLE_RANK[actorRole];
}
