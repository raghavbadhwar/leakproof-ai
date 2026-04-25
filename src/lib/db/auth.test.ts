import { describe, expect, it } from 'vitest';
import { ADMIN_ROLES, assertRoleAllowed, REVIEWER_WRITE_ROLES } from './roles';

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
});
