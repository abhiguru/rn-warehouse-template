/**
 * useRoleBasedAccess - who the signed-in profile is and what a report shows first.
 *
 * The role groups come from `@/config/roles`; read that file for which roles each covers.
 * There is deliberately no `isStaff` here: it used to mean "admin or supervisor" in this
 * hook and "role is staff" in `usePermissions`.
 *
 * - isWarehouseUser: admin, supervisor or staff (sees every customer)
 * - isManager: admin or supervisor
 * - isCustomerAccount: a customer's own login
 * - canManageOrders: works every customer's cart and the order queue (the warehouse users)
 * - assignedCustomerIds / assignedCustomers: the customers linked to a customer account
 * - reportScope: what a report screen shows first (see `reportScopeFor`)
 * - shouldShowListView: the all-customers list, which only warehouse users may load
 * - singleAssignedCustomerId: the customer of an account that has exactly one
 *
 * @see J12 - DRY fix for Role-Based Access Pattern
 */

import { useMemo } from 'react';
import { useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store';
import {
  isCustomerAccount as roleIsCustomerAccount,
  isManager as roleIsManager,
  isWarehouseUser as roleIsWarehouseUser,
  normalizeRole,
  reportScopeFor,
  type ReportScopeKind,
} from '@/config/roles';

export interface AssignedCustomerRef {
  id: string;
  name: string;
}

export interface RoleBasedAccess {
  /** admin, supervisor or staff */
  isWarehouseUser: boolean;
  /** admin or supervisor */
  isManager: boolean;
  /** A customer's own login */
  isCustomerAccount: boolean;
  /** Whether user may work every customer's cart and the order queue (admin, supervisor, staff) */
  canManageOrders: boolean;
  /** Customer IDs assigned to the user */
  assignedCustomerIds: string[];
  /** The assigned customers with their names, for the report customer picker */
  assignedCustomers: AssignedCustomerRef[];
  /** What a report screen shows first */
  reportScope: ReportScopeKind;
  /** The customer of a customer account that has exactly one (null otherwise) */
  singleAssignedCustomerId: string | null;
  /** Whether the user sees the all-customers list view (warehouse users only) */
  shouldShowListView: boolean;
  /** User's role (lowercase) */
  role: string | null;
  /** User profile object */
  userProfile: RootState['auth']['userProfile'];
}

/**
 * @example
 * const { isWarehouseUser, isManager, reportScope } = useRoleBasedAccess();
 */
export function useRoleBasedAccess(): RoleBasedAccess {
  const { userProfile } = useAppSelector((state) => state.auth);

  return useMemo(() => {
    const role = normalizeRole(userProfile?.role);
    const assignedCustomers: AssignedCustomerRef[] = (userProfile?.assignedCustomers ?? []).map(
      (customer) => ({ id: customer.id, name: customer.name ?? '' })
    );
    const assignedCustomerIds =
      userProfile?.assignedCustomerIds || assignedCustomers.map((customer) => customer.id);
    const reportScope = reportScopeFor(role, assignedCustomerIds);

    return {
      isWarehouseUser: roleIsWarehouseUser(role),
      isManager: roleIsManager(role),
      isCustomerAccount: roleIsCustomerAccount(role),
      canManageOrders: roleIsWarehouseUser(role),
      assignedCustomerIds,
      assignedCustomers,
      reportScope,
      singleAssignedCustomerId: reportScope === 'one-customer' ? assignedCustomerIds[0] : null,
      shouldShowListView: reportScope === 'all-customers',
      role,
      userProfile,
    };
  }, [userProfile]);
}

export default useRoleBasedAccess;
