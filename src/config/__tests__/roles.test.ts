/**
 * The role table of the app. Each row is checked against the server's table
 * (backend docs/STAFF_GRN_POLICY.md, "Roles after migration 45").
 */
import {
  canOpenScreen,
  isCustomerAccount,
  isManager,
  isWarehouseUser,
  normalizeRole,
  reportScopeFor,
  settingsFeatureRows,
  userManagementActions,
  type RoleGatedScreen,
} from '../roles';

describe('role groups', () => {
  it.each([
    // role, isWarehouseUser, isManager, isCustomerAccount
    ['admin', true, true, false],
    ['supervisor', true, true, false],
    ['staff', true, false, false],
    ['customer', false, false, true],
    ['Staff', true, false, false],
    [' ADMIN ', true, true, false],
    ['owner', false, false, false],
    ['', false, false, false],
    [null, false, false, false],
    [undefined, false, false, false],
  ])('%s: warehouse user %s, manager %s, customer account %s', (role, warehouse, manager, customer) => {
    expect(isWarehouseUser(role)).toBe(warehouse);
    expect(isManager(role)).toBe(manager);
    expect(isCustomerAccount(role)).toBe(customer);
  });

  it('reads a role in any letter case and refuses an unknown one', () => {
    expect(normalizeRole('Supervisor')).toBe('supervisor');
    expect(normalizeRole('toString')).toBeNull();
    expect(normalizeRole('constructor')).toBeNull();
  });
});

describe('role by screen', () => {
  const SCREENS: RoleGatedScreen[] = [
    'operationsDashboard',
    'itemPricing',
    'itemPricingWrite',
    'sensors',
    'userManagement',
    'enrollmentReview',
    'masterData',
  ];
  it.each([
    ['admin', [true, true, true, true, true, true, true]],
    ['supervisor', [true, true, true, true, true, false, true]],
    ['staff', [false, true, true, true, false, false, false]],
    ['customer', [false, false, false, false, false, false, false]],
    [null, [false, false, false, false, false, false, false]],
  ])('%s', (role, expected) => {
    expect(SCREENS.map((screen) => canOpenScreen(role, screen))).toEqual(expected);
  });
});

describe('report routing', () => {
  it.each([
    ['admin', [], 'all-customers'],
    ['supervisor', [], 'all-customers'],
    ['staff', [], 'all-customers'],
    // A warehouse user is never narrowed to assignments left on the profile.
    ['staff', ['c1'], 'all-customers'],
    ['customer', ['c1'], 'one-customer'],
    ['customer', ['c1', 'c2'], 'choose-customer'],
    ['customer', ['c1', 'c2', 'c3'], 'choose-customer'],
    ['customer', [], 'none'],
    [null, ['c1'], 'none'],
    ['owner', ['c1', 'c2'], 'none'],
  ])('%s with customers %j: %s', (role, customers, scope) => {
    expect(reportScopeFor(role, customers)).toBe(scope);
  });
});

describe('settings feature rows', () => {
  it.each([
    ['admin', ['customers', 'enrollmentReview', 'items', 'users', 'itemPricing', 'sensors']],
    ['supervisor', ['customers', 'items', 'users', 'itemPricing', 'sensors']],
    ['staff', ['itemPricing', 'sensors']],
    ['customer', []],
    [undefined, []],
  ])('%s sees %j', (role, rows) => {
    expect(settingsFeatureRows(role)).toEqual(rows);
  });
});

describe('user management actions', () => {
  const ALL = ['customer', 'staff', 'supervisor', 'admin'];
  const NOT_ADMIN = ['customer', 'staff', 'supervisor'];
  it.each([
    // caller role, target role, same person, role and status, assignments, roles on offer
    ['admin', 'customer', false, true, true, ALL],
    ['admin', 'staff', false, true, true, ALL],
    ['admin', 'supervisor', false, true, true, ALL],
    ['admin', 'admin', false, true, true, ALL],
    // Nobody changes the own role or status; an administrator may assign customers to itself.
    ['admin', 'admin', true, false, true, []],
    ['supervisor', 'customer', false, true, true, NOT_ADMIN],
    ['supervisor', 'staff', false, true, true, NOT_ADMIN],
    ['supervisor', 'supervisor', false, true, true, NOT_ADMIN],
    // The server refuses a supervisor on an administrator and on the own profile.
    ['supervisor', 'admin', false, false, false, []],
    ['supervisor', 'supervisor', true, false, false, []],
    ['staff', 'customer', false, false, false, []],
    ['customer', 'customer', false, false, false, []],
    [null, 'customer', false, false, false, []],
  ])(
    '%s on a %s (self: %s): role and status %s, assignments %s, roles %j',
    (callerRole, targetRole, self, canEdit, canChangeAssignments, roles) => {
      const actions = userManagementActions(
        { id: 'caller', role: callerRole },
        { id: self ? 'caller' : 'target', role: targetRole }
      );
      expect(actions).toEqual({ canEdit, canChangeAssignments, assignableRoles: roles });
    }
  );

  it('offers nothing while the caller or the target is unknown', () => {
    expect(userManagementActions({ id: undefined, role: 'admin' }, { id: 'target', role: 'staff' }).canEdit).toBe(false);
    expect(userManagementActions({ id: 'caller', role: 'admin' }, { id: '', role: 'staff' }).canEdit).toBe(false);
  });
});
