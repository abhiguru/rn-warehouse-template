/**
 * The roles a phone copy is kept for. Kept apart from offlineStart, which starts listening to the session when it is
 * imported: a module that only needs the role lists must not bring that with it (WH-306).
 */

/** The roles that work in the warehouse: the staff-only surfaces of the phone copy are for them (WH-306). */
export const WAREHOUSE_COPY_ROLES: readonly string[] = ['admin', 'supervisor', 'staff'];
export const isWarehouseCopyRole = (role: unknown): boolean => typeof role === 'string' && WAREHOUSE_COPY_ROLES.includes(role);

/** The roles the phone copy and the offline start are for: the warehouse roles and, from WH-306, customer accounts. */
export const COPY_ROLES: readonly string[] = [...WAREHOUSE_COPY_ROLES, 'customer'];
export const isCopyRole = (role: unknown): boolean => typeof role === 'string' && COPY_ROLES.includes(role);
