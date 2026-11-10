/**
 * The full invoice number (WH-139): the prefix and the digits, no space ("SRT/12"). The server sends it as `invoice_label`
 * (and `invoice_labels`); a server before migration 175 sends none, and the digits alone are the number there.
 */
export function invoiceLabelOf(label: unknown, digits: string | number | null | undefined): string {
  if (typeof label === 'string' && label.trim() !== '') return label;
  return digits === null || digits === undefined ? '' : String(digits);
}

/** The labels of an `invoice_labels` array, else the digits of the matching `invoice_numbers` array. */
export function invoiceLabelsOf(labels: unknown, digits: ReadonlyArray<number | string> | null | undefined): string[] {
  if (Array.isArray(labels) && labels.length > 0) return labels.map((label) => invoiceLabelOf(label, '')).filter((label) => label !== '');
  return (digits ?? []).map((number) => String(number));
}

/** The prefix a label carries: the label without the trailing digits of `digits` ("SRT/" from "SRT/12" and 12). */
export function invoicePrefixOf(label: unknown, digits: string | number | null | undefined): string {
  const full = invoiceLabelOf(label, digits);
  const tail = digits === null || digits === undefined ? '' : String(digits);
  return tail !== '' && full.endsWith(tail) ? full.slice(0, full.length - tail.length) : '';
}

/** An invoice number as part of a file name: "SRT/12" becomes "SRT-12" (a slash is no file name character). */
export const invoiceFileName = (label: string): string => label.replace(/[^A-Za-z0-9._-]+/g, '-');
