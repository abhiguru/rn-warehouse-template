/**
 * Role-Based Access Control (RBAC) Permission System
 *
 * Defines user roles and their associated permissions for CRUD operations.
 *
 * Permission Matrix:
 * | Role       | Create | Read | Update | Delete |
 * |------------|--------|------|--------|--------|
 * | admin      | Yes    | Yes  | Yes    | Yes    |
 * | supervisor | Yes    | Yes  | Yes    | Yes    |
 * | staff      | Yes    | Yes  | Yes    | No     |
 * | customer   | No     | Yes  | No     | No     |
 */

export type UserRole = 'admin' | 'supervisor' | 'staff' | 'customer';
export type Permission = 'create' | 'read' | 'update' | 'delete';

/**
 * Maps each role to its allowed permissions
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ['create', 'read', 'update', 'delete'],
  supervisor: ['create', 'read', 'update', 'delete'],
  staff: ['create', 'read', 'update'],
  customer: ['read'],
};

/**
 * Check if a role has a specific permission
 * @param role - The user's role
 * @param permission - The permission to check
 * @returns true if the role has the permission, false otherwise
 */
export const hasPermission = (
  role: UserRole | string | undefined,
  permission: Permission
): boolean => {
  if (!role) return false;
  const rolePermissions = ROLE_PERMISSIONS[role as UserRole];
  return rolePermissions?.includes(permission) ?? false;
};

/**
 * Check if a role can perform CRUD operations
 * @param role - The user's role
 * @returns Object with boolean flags for each permission
 */
export const getRolePermissions = (role: UserRole | string | undefined) => ({
  canCreate: hasPermission(role, 'create'),
  canRead: hasPermission(role, 'read'),
  canUpdate: hasPermission(role, 'update'),
  canDelete: hasPermission(role, 'delete'),
});

/**
 * Roles that have full CRUD access
 */
export const FULL_ACCESS_ROLES: UserRole[] = ['admin', 'supervisor'];

/**
 * Roles that can create/update but not delete
 */
export const WRITE_ROLES: UserRole[] = ['admin', 'supervisor', 'staff'];

/**
 * Check if role has write access (create/update)
 */
export const canWrite = (role: UserRole | string | undefined): boolean => {
  if (!role) return false;
  return WRITE_ROLES.includes(role as UserRole);
};

/**
 * Check if role has full access (including delete)
 */
export const hasFullAccess = (role: UserRole | string | undefined): boolean => {
  if (!role) return false;
  return FULL_ACCESS_ROLES.includes(role as UserRole);
};
