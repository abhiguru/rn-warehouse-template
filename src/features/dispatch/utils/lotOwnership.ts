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

/**
 * The GRN numbers the server names when it refuses a line of another customer's stock: "Item belongs to another
 * customer: Tamarind (G1), Rice (G2)" or "Cannot change the dispatch customer: items belong to another customer: ...".
 * Null when the text is some other refusal or names no GRN.
 */
export function grnNumbersOfOtherCustomerRefusal(text: string): string[] | null {
  const match = /belongs? to another customer: (.+)$/i.exec(text);
  if (!match) return null;
  const numbers = [...match[1].matchAll(/\(([^()]+)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  return numbers.length > 0 ? [...new Set(numbers)] : null;
}
