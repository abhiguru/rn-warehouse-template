/**
 * A dispatch takes stock only from GRNs of its own customer.
 *
 * The customer of a GRN is known once the GRN has been looked up in this
 * session (`grns_customer_id`). Lines loaded from a saved dispatch do not carry
 * it; for those the server decides.
 */

/** True when both customers are known and they are not the same. */
export function isOtherCustomersStock(
  dispatchCustomerId: string | null | undefined,
  stockCustomerId: string | null | undefined
): boolean {
  return !!dispatchCustomerId && !!stockCustomerId && dispatchCustomerId !== stockCustomerId;
}

/** The lines known to come from a GRN of another customer. */
export function linesFromOtherCustomers<T extends { grns_customer_id?: string }>(
  dispatchCustomerId: string | null | undefined,
  lines: T[]
): T[] {
  return lines.filter((line) => isOtherCustomersStock(dispatchCustomerId, line.grns_customer_id));
}
