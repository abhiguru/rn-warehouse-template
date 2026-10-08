/**
 * usePermissions - Hook for checking user permissions
 *
 * Provides easy access to permission checks based on the current user's role.
 *
 * @example
 * ```tsx
 * const { canCreate, canUpdate, canDelete, role } = usePermissions();
 *
 * return (
 *   <>
 *     {canCreate && <CreateButton />}
 *     {canUpdate && <EditButton />}
 *     {canDelete && <DeleteButton />}
 *   </>
 * );
 * ```
 */

import { useMemo } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectUserRole } from '@/store/slices/authSlice';
import {
  hasPermission,
  getRolePermissions,
  canWrite,
  hasFullAccess,
  type UserRole,
  type Permission,
} from '@/config/permissions';

export interface UsePermissionsResult {
  /** User's current role */
  role: UserRole | string | undefined;
  /** Whether user can create new records */
  canCreate: boolean;
  /** Whether user can read/view records */
  canRead: boolean;
  /** Whether user can update/edit records */
  canUpdate: boolean;
  /** Whether user can delete records */
  canDelete: boolean;
  /** Whether user has any write access (create or update) */
  canWrite: boolean;
  /** Whether user has full CRUD access */
  hasFullAccess: boolean;
  /** Check if user has a specific permission */
  checkPermission: (permission: Permission) => boolean;
  /** Whether user is admin */
  isAdmin: boolean;
  /** Whether user is supervisor */
  isSupervisor: boolean;
  /** Whether user is staff */
  isStaff: boolean;
  /** Whether user is customer (read-only) */
  isCustomer: boolean;
}

/**
 * Hook to get current user's permissions
 */
export const usePermissions = (): UsePermissionsResult => {
  const { role, isAdmin, isSupervisor, isStaff, isCustomer } =
    useAppSelector(selectUserRole);

  return useMemo(() => {
    const permissions = getRolePermissions(role);

    return {
      role,
      ...permissions,
      canWrite: canWrite(role),
      hasFullAccess: hasFullAccess(role),
      checkPermission: (permission: Permission) =>
        hasPermission(role, permission),
      isAdmin,
      isSupervisor: isSupervisor || role === 'supervisor',
      isStaff,
      isCustomer,
    };
  }, [role, isAdmin, isSupervisor, isStaff, isCustomer]);
};

export default usePermissions;
