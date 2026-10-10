/**
 * Customer Filtering Utilities
 *
 * Provides role-based filtering for customer data in reports.
 * Regular users (non-staff) only see their assigned customers.
 *
 * @see J11 - DRY fix for Customer Data Filtering Logic
 */

/**
 * Filter an array of items by assigned customer IDs.
 * Staff users see all items; regular users see only their assigned customers.
 *
 * @param items - Array of items with customer_id field
 * @param isWarehouseUser - Whether the user is admin, supervisor or staff (sees every customer)
 * @param assignedCustomerIds - Customer IDs assigned to the user
 * @returns Filtered array (original if staff, filtered if regular user)
 *
 * @example
 * const filtered = filterByAssignedCustomers(
 *   response.data.by_customer,
 *   isWarehouseUser,
 *   assignedCustomerIds
 * );
 */
export function filterByAssignedCustomers<T extends { customer_id: string }>(
  items: T[],
  isWarehouseUser: boolean,
  assignedCustomerIds: string[]
): T[] {
  // Staff users see all data
  if (isWarehouseUser || assignedCustomerIds.length === 0) {
    return items;
  }

  // Regular users see only their assigned customers
  const assignedSet = new Set(assignedCustomerIds);
  return items.filter((item) => assignedSet.has(item.customer_id));
}

/**
 * Check if filtering is needed for the current user.
 * Returns true for non-staff users with assigned customers.
 *
 * @param isWarehouseUser - Whether the user is admin, supervisor or staff (sees every customer)
 * @param assignedCustomerIds - Customer IDs assigned to the user
 */
export function shouldFilterByCustomer(
  isWarehouseUser: boolean,
  assignedCustomerIds: string[]
): boolean {
  return !isWarehouseUser && assignedCustomerIds.length > 0;
}
