/**
 * Moves the invoice flow tests share: actions on a FlowApp, no assertions and no jest globals.
 */
import type { FlowApp } from '@/tests/helpers/invoiceFlowHarness';

export const SEARCH_FIELD = 'Search GRN number or customer';
export const NUMBER_FIELD = 'Invoice number';
export const DISCOUNT = 'invoice-summary-discount';
export const DISCOUNT_REASON = 'invoice-summary-discount-reason';

/** From the Invoices tab to step 1 of a new invoice. */
export async function openNewInvoice(app: FlowApp) {
  await app.tap('create-invoice-fab');
}

/** Opens the GRN picker, types the number, taps the GRN in the results and waits for its lines. */
export async function pickGrn(app: FlowApp, grNo: string) {
  await app.tap('Search GRNs');
  await app.typeKeys(SEARCH_FIELD, grNo, { stayInField: true });
  await app.settle();
  await app.tap(new RegExp(`^GRN ${grNo},`));
}

/** From the invoice's page to step 1 of its edit form. */
export async function openEditFromDetails(app: FlowApp, id = 'inv-42') {
  await app.go(`/invoice-details/${id}`);
  await app.tap('open-edit');
}

/** The test ids of the editor's fields, from the store's lines. */
export const cell = (tempId: string, field: 'charge' | 'labour_rate' | 'tax' = 'charge') => `cell|${tempId}|${field}`;
export const groupField = (groupKey: string, field: 'charge' | 'labour_rate' | 'tax') => `group|${groupKey}|${field}`;
/** The Review table row of an item group. */
export const reviewRow = (groupKey: string) => `invoice-review-group-${groupKey}`;
