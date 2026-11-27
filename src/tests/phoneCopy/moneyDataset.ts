/// <reference types="jest" />
/**
 * WH-305 (product/tech/app-offline-dues-statement.md): the server's answers of get_customer_dues and
 * get_customer_statement, and the fictional clock, for the kept-answer tests. All names and amounts are made up.
 *
 * Customers are grnDataset's: c1 asha Traders, c2 Bhavin Foods, c3 Chirag Stores. In the copy, c1 has lots with stock
 * (l03, l06, l08), c2 has (l04, l05), c3 has (l01, l07). Nobody has no stock, so a "no goods in store" case empties a lot's
 * stock by a feed change (see `emptyStockOf`).
 */
import { env } from './phoneEnv';
import { seedWarehouse } from './grnDataset';
import { seedDocuments } from './documentsDataset';

/** The feed format of WH-305's step (contract 7.2, build order: 303 is 4, 304 is 5, this is 6). Asserted as "at least". */
export const MONEY_FORMAT_AT_LEAST = 6;
/** 11:00 am on 27 Nov 2026 in India. */
export const NOW = '2026-11-27T05:30:00.000Z';
export const TODAY = '2026-11-27';
/** Computed this morning (9:05 am in India), and on the day before. */
export const MORNING = '2026-11-27T03:35:00.000Z';
export const YESTERDAY = '2026-11-26T09:05:00.000Z';
export const YESTERDAY_DAY = '2026-11-26';

export const CUSTOMERS = ['c1', 'c2', 'c3'] as const;
export const NAMES: Record<string, string> = { c1: 'asha Traders', c2: 'Bhavin Foods', c3: 'Chirag Stores' };

/** What get_customer_dues answers: the totals are the server's own sums (the phone never adds them). */
export function duesBody(opts: { asOf?: string; today?: string; ids?: readonly string[]; invoices?: number } = {}) {
  const ids = opts.ids ?? CUSTOMERS;
  const invoices = opts.invoices ?? 1000;
  return {
    success: true, as_of: opts.asOf ?? MORNING, today: opts.today ?? TODAY, record_payments: true, invoices_basis: 'due',
    // Deliberately not the sum of the rows: a phone that adds would show 3,000.00 here.
    totals: { invoices_amount: invoices * 3 + 7, not_invoiced_left: 70, not_invoiced_in_store: 80 },
    lots_without_rate: 0,
    customers: ids.map((id, n) => ({
      customer_id: id, name: NAMES[id], active: true, lots_without_rate: 0, unlinked_paid_amount: null,
      invoices_amount: invoices + n, not_invoiced_left: 10 * (n + 1), not_invoiced_in_store: 20 * (n + 1),
    })),
  };
}

/** What get_customer_statement answers for one customer. `inStore: false` leaves the "in store" list empty. */
export function statementBody(id: string, opts: { asOf?: string; today?: string; inStore?: boolean; invoiceTotal?: number } = {}) {
  const inStore = opts.inStore ?? true;
  return {
    success: true, as_of: opts.asOf ?? MORNING, today: opts.today ?? TODAY,
    customer: { id, name: NAMES[id], active: true }, record_payments: true, invoices_basis: 'due',
    figures: { invoices_amount: 4321, not_invoiced_left: 111, not_invoiced_in_store: inStore ? 222 : 0 },
    lots_without_rate: 0, unlinked_paid_amount: null,
    left: [{ gr_id: 'g-B1', gr_no: 'B1', bags: 3, amount: 111 }],
    in_store: inStore ? [{ gr_id: 'g-A10', gr_no: 'A10', grn_date: '2026-11-20T05:00:00+00:00', days_in_store: 7, bags: 20, amount: 222, lots: [] }] : [],
    invoices: [{ id: 'inv1', inv_no: 7001, inv_fin_year: 2026, invoice_label: 'INV-7001', inv_date: '2026-11-24', total: opts.invoiceTotal ?? 4321, payment_status: 'due', due_amount: 4321 }],
  };
}

/** The change feed's answer to one sync run: the marks (and anything else) the server sends. */
export const mark = (id: string) => ({ e: 'money', id, op: 'stale' as const });
export function queueRun(changes: unknown[], position = '1048600') {
  env.feed.changeAnswers.push({ position, as_of: env.feed.asOf, more: false, reload_all: null, reload: [], changes: changes as never });
}

/** The warehouse of grnDataset with its documents, as a feed of the WH-305 format. Call after `resetEnv()`. */
export function seedMoney(): void {
  seedWarehouse();
  seedDocuments();
  env.feed.format = MONEY_FORMAT_AT_LEAST;
}
