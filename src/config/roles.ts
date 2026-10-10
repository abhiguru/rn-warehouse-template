/**
 * Who a signed-in profile is, in the app's terms.
 *
 * The word "staff" used to mean two opposite things in the app (admin or supervisor in one
 * hook, the `staff` role in another). These helpers replace both; the names say which roles
 * they cover, and the server's role table (backend docs/STAFF_GRN_POLICY.md, "Roles after
 * migration 45") is the reference for what each group may do.
 *
 *   isWarehouseUser   admin, supervisor, staff   works for the facility: every customer's data
 *   isManager         admin, supervisor          deletes, user management, operations dashboard
 *   isCustomerAccount customer                   reads its assigned customers only
 */

export type RoleName = 'admin' | 'supervisor' | 'staff' | 'customer';

const ROLE_NAMES: readonly RoleName[] = ['admin', 'supervisor', 'staff', 'customer'];

/** The profile's role in lowercase, or null when it is missing or not one of the four. */
export function normalizeRole(role: string | null | undefined): RoleName | null {
  const value = typeof role === 'string' ? role.trim().toLowerCase() : '';
  return (ROLE_NAMES as readonly string[]).includes(value) ? (value as RoleName) : null;
}

/** admin, supervisor or staff: works for the facility and sees every customer. */
export function isWarehouseUser(role: string | null | undefined): boolean {
  const name = normalizeRole(role);
  return name === 'admin' || name === 'supervisor' || name === 'staff';
}

/** admin or supervisor. */
export function isManager(role: string | null | undefined): boolean {
  const name = normalizeRole(role);
  return name === 'admin' || name === 'supervisor';
}

/** A customer's own login: reads the customers assigned to it and nothing else. */
export function isCustomerAccount(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'customer';
}

/**
 * What a report screen shows first.
 *
 *   all-customers   the facility-wide list (get_all_* RPCs): admin, supervisor, staff
 *   one-customer    straight to the account's only customer
 *   choose-customer a customer account with several customers picks one; the server refuses
 *                   it every all-customers RPC, so each view names one customer
 *   none            no customer is linked to the account (or there is no profile)
 */
export type ReportScopeKind = 'all-customers' | 'one-customer' | 'choose-customer' | 'none';

export function reportScopeFor(
  role: string | null | undefined,
  assignedCustomerIds: readonly string[]
): ReportScopeKind {
  if (isWarehouseUser(role)) return 'all-customers';
  if (!isCustomerAccount(role)) return 'none';
  if (assignedCustomerIds.length === 1) return 'one-customer';
  return assignedCustomerIds.length > 1 ? 'choose-customer' : 'none';
}

/** Screens outside the tabs, by who the app offers them to. Mirrors the server's role table. */
export type RoleGatedScreen =
  | 'operationsDashboard'
  | 'itemPricing'
  | 'itemPricingWrite'
  | 'sensors'
  | 'userManagement'
  | 'enrollmentReview'
  | 'masterData';

export function canOpenScreen(role: string | null | undefined, screen: RoleGatedScreen): boolean {
  switch (screen) {
    case 'itemPricing':
    case 'itemPricingWrite':
    case 'sensors':
      return isWarehouseUser(role);
    case 'operationsDashboard':
    case 'userManagement':
    case 'masterData':
      return isManager(role);
    case 'enrollmentReview':
      return normalizeRole(role) === 'admin';
  }
}

/** The rows of Settings > Features, in the order shown. A customer account gets none. */
export type SettingsFeature = 'customers' | 'enrollmentReview' | 'items' | 'users' | 'itemPricing' | 'sensors';

export function settingsFeatureRows(role: string | null | undefined): SettingsFeature[] {
  const rows: SettingsFeature[] = [];
  if (canOpenScreen(role, 'masterData')) rows.push('customers');
  if (canOpenScreen(role, 'enrollmentReview')) rows.push('enrollmentReview');
  if (canOpenScreen(role, 'masterData')) rows.push('items');
  if (canOpenScreen(role, 'userManagement')) rows.push('users');
  if (canOpenScreen(role, 'itemPricing')) rows.push('itemPricing');
  if (canOpenScreen(role, 'sensors')) rows.push('sensors');
  return rows;
}

export interface UserActionTarget {
  id: string;
  role: string | null | undefined;
}

export interface UserManagementActions {
  /** May change the target's role and active status. */
  canEdit: boolean;
  /** May add or remove the target's customer assignments. */
  canChangeAssignments: boolean;
  /** Roles the caller may give the target. Empty when canEdit is false. */
  assignableRoles: RoleName[];
}

/**
 * What the caller may do to one user. The server's rules (migrations 44 and 45): nobody
 * changes the own role or status; an administrator may change anyone else, and the own
 * customer assignments; a supervisor may change users who are not administrators, never
 * anything on the own profile, and can never grant the administrator role.
 */
export function userManagementActions(
  caller: { id: string | null | undefined; role: string | null | undefined },
  target: UserActionTarget
): UserManagementActions {
  const none: UserManagementActions = { canEdit: false, canChangeAssignments: false, assignableRoles: [] };
  const callerRole = normalizeRole(caller.role);
  if (!isManager(callerRole) || !caller.id || !target.id) return none;
  const self = caller.id === target.id;
  if (callerRole === 'admin') {
    return self
      ? { ...none, canChangeAssignments: true }
      : { canEdit: true, canChangeAssignments: true, assignableRoles: ['customer', 'staff', 'supervisor', 'admin'] };
  }
  if (self || normalizeRole(target.role) === 'admin') return none;
  return { canEdit: true, canChangeAssignments: true, assignableRoles: ['customer', 'staff', 'supervisor'] };
}
