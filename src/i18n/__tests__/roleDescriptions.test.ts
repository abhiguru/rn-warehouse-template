/** G-32: the role descriptions (Help, Roles and the role list in Edit user) say what each role can do. */
import { en } from '../locales/en';
import { gu } from '../locales/gu';

const ROLES = ['admin', 'supervisor', 'staff', 'customer'] as const;

describe('role descriptions', () => {
  it.each(ROLES)('has an English and a Gujarati text for %s', (role) => {
    expect(en.users.roleDescription[role].length).toBeGreaterThan(0);
    expect(gu.users.roleDescription[role].length).toBeGreaterThan(0);
    expect(gu.users.roleDescription[role]).not.toBe(en.users.roleDescription[role]);
  });

  it('says staff work with prices and cannot manage customers, items or users', () => {
    const staff = en.users.roleDescription.staff;
    expect(staff).toContain('prices');
    expect(staff).toContain('Cannot manage customers, items or users.');
    expect(staff).not.toContain('Cannot delete');
  });

  it('says a customer places orders for the customers assigned to them', () => {
    expect(en.users.roleDescription.customer).toContain('Places orders');
    expect(en.users.roleDescription.customer).toContain('assigned to them');
  });

  it('says a supervisor cannot approve access requests and an admin can', () => {
    expect(en.users.roleDescription.supervisor).toContain('Cannot approve access requests.');
    expect(en.users.roleDescription.admin).toContain('access requests');
  });
});
