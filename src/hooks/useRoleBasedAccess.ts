/**
 * useRoleBasedAccess - Hook for role-based access control in reports
 *
 * Extracts common role-checking logic used across all report screens:
 * - isStaff: Whether user is admin or supervisor
 * - assignedCustomerIds: Customer IDs assigned to the user
 * - singleAssignedCustomerId: The single customer ID if user has exactly one
 * - shouldShowListView: Whether to show all-customers list view
 *
 * @see J12 - DRY fix for Role-Based Access Pattern
 */

import { useMemo } from 'react';
import { useAppSelector } from '@/store/hooks';
import type { RootState } from '@/store';

export interface RoleBasedAccess {
  /** Whether user is admin or supervisor */
  isStaff: boolean;
  /** Customer IDs assigned to the user */
  assignedCustomerIds: string[];
  /** Single customer ID if user has exactly one assigned (null otherwise) */
  singleAssignedCustomerId: string | null;
  /** Whether user should see the all-customers list view */
  shouldShowListView: boolean;
  /** User's role (lowercase) */
  role: string | null;
  /** User profile object */
  userProfile: RootState['auth']['userProfile'];
}

/**
 * Hook for role-based access control in reports
 *
 * @example
 * const { isStaff, shouldShowListView, singleAssignedCustomerId } = useRoleBasedAccess();
 *
 * if (!isStaff) {
 *   // Show customer-specific view
 * }
 *
 * if (shouldShowListView) {
 *   // Show all-customers list
 * }
 */
export function useRoleBasedAccess(): RoleBasedAccess {
  const { userProfile } = useAppSelector((state) => state.auth);

  const role = useMemo(() => {
    return userProfile?.role?.toLowerCase() ?? null;
  }, [userProfile]);

  const isStaff = useMemo(() => {
    return role === 'admin' || role === 'supervisor';
  }, [role]);

  const assignedCustomerIds = useMemo(() => {
    return userProfile?.assignedCustomerIds || userProfile?.assignedCustomers?.map((customer) => customer.id) || [];
  }, [userProfile]);

  const singleAssignedCustomerId = useMemo(() => {
    if (!isStaff && assignedCustomerIds.length === 1) {
      return assignedCustomerIds[0];
    }
    return null;
  }, [isStaff, assignedCustomerIds]);

  const shouldShowListView = useMemo(() => {
    return isStaff || assignedCustomerIds.length > 1;
  }, [isStaff, assignedCustomerIds]);

  return {
    isStaff,
    assignedCustomerIds,
    singleAssignedCustomerId,
    shouldShowListView,
    role,
    userProfile,
  };
}

export default useRoleBasedAccess;
