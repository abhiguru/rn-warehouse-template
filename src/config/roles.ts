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
  | 'sensorWrite'
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
    case 'sensorWrite':
      // Renaming a sensor and setting its limits: administrators only (update_sensor_device, migration 74).
      return normalizeRole(role) === 'admin' && (capabilities === undefined || capabilities.sensors);
    case 'operationsDashboard':
    case 'userManagement':
    case 'masterData':
    case 'itemPricing':
    case 'itemPricingWrite':
    case 'itemPriceHistory':
    case 'standardRate':
      // Item pricing is for administrators and supervisors (owner, 2026-10-16); the server
      // refuses staff from migration 90. The price history and the standard rate were
      // manager-only before (get_item_price_history, migration 48; set_standard_rate, 85).
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
export type SettingsFeature = 'customers' | 'enrollmentReview' | 'items' | 'users' | 'standardRate' | 'sensors';

export function settingsFeatureRows(
  role: string | null | undefined,
  capabilities?: FacilityCapabilities
): SettingsFeature[] {
  const rows: SettingsFeature[] = [];
  if (canOpenScreen(role, 'masterData')) rows.push('customers');
  if (canOpenScreen(role, 'enrollmentReview')) rows.push('enrollmentReview');
  if (canOpenScreen(role, 'masterData')) rows.push('items');
  if (canOpenScreen(role, 'userManagement')) rows.push('users');
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
  /** The person deleted their own account (backend migration 113). */
  deleted?: boolean | null;
}

/**
 * What the user's page is about: a deleted account, an access request nobody has reviewed,
 * a rejected one, or an ordinary user. The first three have no role, status or customer controls.
 */
export type UserPageKind = 'deleted' | 'pending' | 'rejected' | 'normal';

export function userPageKind(target: Pick<UserActionTarget, 'deleted' | 'enrollmentStatus'>): UserPageKind {
  if (target.deleted) return 'deleted';
  if (target.enrollmentStatus === 'pending') return 'pending';
  if (target.enrollmentStatus === 'rejected') return 'rejected';
  return 'normal';
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
  /** Customer assignments belong to the Customer role only; for any other role the section says so. */
  assignmentsApply: boolean;
  /** The caller could change the assignments, but the Customer is deactivated: activate them first. */
  assignmentsNeedActivation: boolean;
}

/**
 * What the caller may do to one user. The server's rules (migrations 44, 45, 47 and 113): nobody
 * changes the own role or status; an administrator may change anyone else; a supervisor may change
 * users who are not administrators, never anything on the own profile, and can never grant the
 * administrator role. Customer assignments are for the Customer role, and of an active Customer.
 * A deleted account, and an access request that is pending or rejected, are not edited here.
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
  const none: UserManagementActions = {
    canEdit: false,
    canChangeAssignments: false,
    assignableRoles: [],
    needsAdministrator: false,
    assignmentsApply: normalizeRole(target.role) === 'customer',
    assignmentsNeedActivation: false,
  };
  const callerRole = normalizeRole(caller.role);
  if (!isManager(callerRole) || !caller.id || !target.id) return none;
  if (userPageKind(target) !== 'normal') return none;
  const self = caller.id === target.id;
  // Assignments: the Customer role only, and an active Customer (the server refuses the rest).
  const assignable = (allowed: boolean): Pick<UserManagementActions, 'canChangeAssignments' | 'assignmentsNeedActivation'> => {
    const applies = none.assignmentsApply;
    const active = target.active !== false;
    return {
      canChangeAssignments: allowed && applies && active,
      assignmentsNeedActivation: allowed && applies && !active,
    };
  };
  if (callerRole === 'admin') {
    return self
      ? { ...none, ...assignable(true) }
      : { ...none, ...assignable(true), canEdit: true, assignableRoles: ['customer', 'staff', 'supervisor', 'admin'] };
  }
  if (self || normalizeRole(target.role) === 'admin') return none;
  const approved = target.active !== false && (!target.enrollmentStatus || target.enrollmentStatus === 'approved');
  if (!approved) return { ...none, needsAdministrator: true };
  return { ...none, ...assignable(true), canEdit: true, assignableRoles: ['customer', 'staff', 'supervisor'] };
}
