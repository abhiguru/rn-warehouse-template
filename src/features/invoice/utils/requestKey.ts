/**
 * The request code of one invoice save (owner rule D22, backend migration 120).
 *
 * Save invoice and Update invoice send the code as `p_invoice_data.request_key`. The server stores the answer of a
 * successful save under it, so a repeat of the same save returns that answer instead of writing again, and
 * `get_submission_result` can say whether the save that lost its answer went through. The code is made when the save
 * is first confirmed and kept until that save's outcome is known (the answer came, or the person left the form).
 *
 * It only has to be unique for the signed-in user (the server looks it up for the calling user), so it is built from
 * the time and random digits: no crypto module, nothing to load.
 */
export type InvoiceRequestKind = 'create' | 'update';

const randomHex = (digits: number): string =>
  Array.from({ length: digits }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export function newInvoiceRequestKey(kind: InvoiceRequestKind): string {
  return `warehouse-invoice-${kind}-${Date.now().toString(36)}-${randomHex(20)}`;
}
