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

/**
 * A document number as part of a file name. A "/" becomes "_" and any other character that is no file name character
 * becomes "-", so "GRN/26-27/0042" gives "GRN_26-27_0042" and "GRN-26-27/0042" gives "GRN-26-27_0042": two numbers made of
 * letters, digits, "/", "-" and "." never share a name. A missing number (nothing, or the text "null" / "undefined" of a
 * number that was not there) gives `fallback` (the document's id, where the caller has it) and never "null".
 */
export const invoiceFileName = (label: string | number | null | undefined, fallback = 'document'): string => {
  const text = label === null || label === undefined ? '' : String(label).trim();
  const own = text === '' || text === 'null' || text === 'undefined' ? fallback : text;
  return own.replace(/\/+/g, '_').replace(/[^A-Za-z0-9._-]+/g, '-');
};

/** A customer's or sensor's name as part of a file name: the whole name, with each "/" or "\\" replaced by "_" (it is not cut at the slash). */
export const nameFileNamePart = (name: string | null | undefined): string => (name ?? '').replace(/[\\/]+/g, '_');
