/**
 * The kinds of invoice document the server makes (backend migration 173, WH-151). The server decides the kind at save and
 * stores it; the app only names it. An invoice saved before the facility's GST details are saved is 'invoice', and a kind
 * the app does not know is read as 'invoice' too.
 */
export type DocType = 'invoice' | 'bill' | 'bill_of_supply' | 'tax_invoice' | 'invoice_cum_bos';

export const DOC_TYPES: readonly DocType[] = ['tax_invoice', 'bill_of_supply', 'invoice_cum_bos', 'bill', 'invoice'];

export function asDocType(value: unknown): DocType {
  return typeof value === 'string' && (DOC_TYPES as readonly string[]).includes(value) ? (value as DocType) : 'invoice';
}

/** The text key of a kind's name ("Tax invoice"). */
export const docTypeKey = (value: unknown) => `gst.doc.${asDocType(value)}` as const;

/** The two tax heads the server chooses between for a taxable line. */
export type TaxHead = 'cgst_sgst' | 'igst';
