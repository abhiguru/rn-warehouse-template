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

import type { FacilityCapabilities } from './facilityCapabilities';

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
  | 'itemPriceHistory'
  | 'standardRate'
  | 'sensors'
  | 'userManagement'
  | 'enrollmentReview'
  | 'masterData';

/**
 * Whether the app offers `screen` to `role`. With `capabilities` (the facility's, from
 * src/config/facilityCapabilities.ts) a screen of a capability the facility does not have
 * is offered to nobody; without them only the role decides. The route guard and Settings
 * always pass them.
 */
export function canOpenScreen(
  role: string | null | undefined,
  screen: RoleGatedScreen,
  capabilities?: FacilityCapabilities
): boolean {
  switch (screen) {
    case 'sensors':
      return isWarehouseUser(role) && (capabilities === undefined || capabilities.sensors);
    case 'itemPricing':
    case 'itemPricingWrite':
      return isWarehouseUser(role);
    case 'operationsDashboard':
    case 'userManagement':
    case 'masterData':
    case 'itemPriceHistory':
      // The price history too: staff change prices, but the server gives the record of the
      // changes to managers only (get_item_price_history, migration 48).
    case 'standardRate':
      // The standard rate: staff read it, but only managers set it (set_standard_rate, migration 85).
      return isManager(role);
    case 'enrollmentReview':
      return normalizeRole(role) === 'admin';
  }
}

/**
 * The rows of Settings > Features, in the order shown. A customer account gets none, and a
 * row of a capability the facility does not have (`capabilities`, as for canOpenScreen) is
 * left out.
 */
export type SettingsFeature = 'customers' | 'enrollmentReview' | 'items' | 'users' | 'itemPricing' | 'standardRate' | 'sensors';

export function settingsFeatureRows(
  role: string | null | undefined,
  capabilities?: FacilityCapabilities
): SettingsFeature[] {
  const rows: SettingsFeature[] = [];
  if (canOpenScreen(role, 'masterData')) rows.push('customers');
  if (canOpenScreen(role, 'enrollmentReview')) rows.push('enrollmentReview');
  if (canOpenScreen(role, 'masterData')) rows.push('items');
  if (canOpenScreen(role, 'userManagement')) rows.push('users');
  if (canOpenScreen(role, 'itemPricing')) rows.push('itemPricing');
  if (canOpenScreen(role, 'standardRate')) rows.push('standardRate');
  if (canOpenScreen(role, 'sensors', capabilities)) rows.push('sensors');
  return rows;
}

export interface UserActionTarget {
  id: string;
  role: string | null | undefined;
  /** The target's status. Not known (not loaded yet) counts as active. */
  active?: boolean | null;
  /** The target's access request, where the server gives it. Not known counts as approved. */
  enrollmentStatus?: string | null;
}

export interface UserManagementActions {
  /** May change the target's role and active status. */
  canEdit: boolean;
  /** May add or remove the target's customer assignments. */
  canChangeAssignments: boolean;
  /** Roles the caller may give the target. Empty when canEdit is false. */
  assignableRoles: RoleName[];
  /** A supervisor is offered nothing because the target's access is not approved. */
  needsAdministrator: boolean;
}

/**
 * What the caller may do to one user. The server's rules (migrations 44, 45 and 47): nobody
 * changes the own role or status; an administrator may change anyone else, and the own
 * customer assignments; a supervisor may change users who are not administrators, never
 * anything on the own profile, and can never grant the administrator role.
 *
 * Giving access is an administrator's decision: a supervisor deactivates a user but does
 * not activate one, and is offered nothing on a user whose access is not approved. The
 * user list and details carry `active` only; a user who is not active is one whose access
 * is deactivated, rejected or still requested, so that is what decides here.
 */
export function userManagementActions(
  caller: { id: string | null | undefined; role: string | null | undefined },
  target: UserActionTarget
): UserManagementActions {
  const none: UserManagementActions = { canEdit: false, canChangeAssignments: false, assignableRoles: [], needsAdministrator: false };
  const callerRole = normalizeRole(caller.role);
  if (!isManager(callerRole) || !caller.id || !target.id) return none;
  const self = caller.id === target.id;
  if (callerRole === 'admin') {
    return self
      ? { ...none, canChangeAssignments: true }
      : { ...none, canEdit: true, canChangeAssignments: true, assignableRoles: ['customer', 'staff', 'supervisor', 'admin'] };
  }
  if (self || normalizeRole(target.role) === 'admin') return none;
  const approved = target.active !== false && (!target.enrollmentStatus || target.enrollmentStatus === 'approved');
  if (!approved) return { ...none, needsAdministrator: true };
  return { ...none, canEdit: true, canChangeAssignments: true, assignableRoles: ['customer', 'staff', 'supervisor'] };
}
