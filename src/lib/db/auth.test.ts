import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLES,
  assertCanChangeMemberRole,
  assertCanManageRole,
  assertCanRemoveMember,
  assertRoleAllowed,
  REVIEWER_WRITE_ROLES
} from './roles';

describe('auth role helpers', () => {
  it('allows owners and admins to manage organization setup', () => {
    expect(() => assertRoleAllowed('owner', ADMIN_ROLES)).not.toThrow();
    expect(() => assertRoleAllowed('admin', ADMIN_ROLES)).not.toThrow();
    expect(() => assertRoleAllowed('reviewer', ADMIN_ROLES)).toThrow('forbidden');
  });

  it('keeps viewers and ordinary members read-only for review workflow mutations', () => {
    expect(() => assertRoleAllowed('reviewer', REVIEWER_WRITE_ROLES)).not.toThrow();
    expect(() => assertRoleAllowed('viewer', REVIEWER_WRITE_ROLES)).toThrow('forbidden');
    expect(() => assertRoleAllowed('member', REVIEWER_WRITE_ROLES)).toThrow('forbidden');
  });

  it('restricts role management to owner and admin boundaries', () => {
    expect(() => assertCanManageRole('owner', 'admin')).not.toThrow();
    expect(() => assertCanManageRole('owner', 'owner')).not.toThrow();
    expect(() => assertCanManageRole('admin', 'reviewer')).not.toThrow();
    expect(() => assertCanManageRole('admin', 'owner')).toThrow('forbidden');
    expect(() => assertCanManageRole('reviewer', 'viewer')).toThrow('forbidden');
  });

  it('prevents demoting or removing the last owner', () => {
    expect(() => assertCanChangeMemberRole('owner', 'owner', 'admin', 1)).toThrow('last_owner');
    expect(() => assertCanRemoveMember('owner', 'owner', 1)).toThrow('last_owner');
    expect(() => assertCanChangeMemberRole('owner', 'owner', 'admin', 2)).not.toThrow();
    expect(() => assertCanRemoveMember('owner', 'owner', 2)).not.toThrow();
  });

  it('prevents admins from promoting members beyond their own authority', () => {
    expect(() => assertCanChangeMemberRole('admin', 'viewer', 'reviewer', 1)).not.toThrow();
    expect(() => assertCanChangeMemberRole('admin', 'reviewer', 'admin', 1)).toThrow('forbidden');
    expect(() => assertCanRemoveMember('admin', 'admin', 1)).toThrow('forbidden');
  });
});
