/**
 * Order of receipt (GRN) and dispatch numbers, the same rule the backend uses
 * (warehouse_security.document_number_sort_key, backend migrations 31 to 33).
 *
 * A number is any text up to 8 characters. The order is:
 *   1. prefix rank: one letter A-Z keeps the warehouse's rule (X, Y, Z before A,
 *      then B ...), upper and lower case together; every other prefix after them;
 *   2. the prefix itself (everything before the trailing digits);
 *   3. the trailing digits as a number of any length;
 *   4. the number as written, so C1, C01 and C001 have a fixed order.
 * Lists sorted by the server keep the server's order; this is for lists the
 * app merges itself (a customer account with several customers).
 */

const SEPARATOR = '\u0001';
const OTHER_PREFIX_RANK = 100;

export function documentNumberSortKey(documentNumber: string | null | undefined): string {
  const whole = documentNumber ?? '';
  const digits = /[0-9]+$/.exec(whole)?.[0] ?? '';
  const prefix = whole.slice(0, whole.length - digits.length);
  const upper = prefix.toUpperCase();
  let rank = OTHER_PREFIX_RANK;
  if (/^[A-Z]$/.test(upper)) {
    const code = upper.charCodeAt(0);
    rank = upper >= 'X' ? code - 'X'.charCodeAt(0) : code - 'A'.charCodeAt(0) + 3;
  }
  return [String(rank).padStart(3, '0'), prefix, digits.padStart(20, '0'), whole].join(SEPARATOR);
}

/** Compare by Unicode code point, which is the order the database's bytewise comparison gives. */
function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index++) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

/** Negative when `left` sorts before `right` in ascending number order. */
export function compareDocumentNumbers(left: string | null | undefined, right: string | null | undefined): number {
  return compareCodePoints(documentNumberSortKey(left), documentNumberSortKey(right));
}
