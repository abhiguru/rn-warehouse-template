import { isCustomerAccount } from '@/config/roles';

/**
 * What Create order does on the Orders tab:
 *
 *   search   the staff customer search sheet
 *   open     that customer's order, straight away
 *   choose   the customer account's own businesses, to pick one
 */
export type CreateOrderAction =
  | { kind: 'search' }
  | { kind: 'open'; customerId: string }
  | { kind: 'choose' };

interface CreateOrderInput {
  role: string | null | undefined;
  /** The customer the list was opened for, if any. */
  explicitCustomerId?: string;
  /** The customers linked to the account, as the phone holds them. */
  assignedCustomerIds?: readonly string[];
}

/**
 * Decide what Create order does. Only a customer account is routed by its own
 * customers; every other role searches, and the server refuses the search to
 * anyone who is not admin, supervisor or staff.
 *
 * A customer account with no id on the phone is asked to choose as well: the
 * phone holding none is not proof that the facility linked none (a failed lookup
 * at sign-in stores none), so the chooser asks the facility and says so when
 * there really is none.
 */
export function createOrderAction({
  role,
  explicitCustomerId,
  assignedCustomerIds = [],
}: CreateOrderInput): CreateOrderAction {
  if (!isCustomerAccount(role)) return { kind: 'search' };
  if (explicitCustomerId) return { kind: 'open', customerId: explicitCustomerId };
  const ids = [...new Set(assignedCustomerIds.filter(Boolean))];
  return ids.length === 1 ? { kind: 'open', customerId: ids[0] } : { kind: 'choose' };
}
