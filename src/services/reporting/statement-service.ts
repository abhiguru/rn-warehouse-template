/**
 * The customer statement and the customer dues list (backend migration 176, WH-155).
 *
 * Every figure is the server's: get_customer_statement and get_customer_dues work out what is due on invoices, what is not yet
 * invoiced for goods that have left, and the estimate for goods still in store, with the invoice's own pricing. The phone adds,
 * rounds and estimates nothing; amounts are shown as they come (2 decimals).
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { t } from '@/i18n';
import { createLogger } from '@/utils/logger';
import { serverText, transportText } from '@/utils/serverText';
import { reportBody, reportRefusal, refusedReport } from './reportEnvelope';

const logger = createLogger('Reports');

/** 'due': the facility records payments and the first figure is what is due; 'invoiced': it does not, and it is this year's invoiced total. */
export type InvoicesBasis = 'due' | 'invoiced';

export interface DuesFigures {
  invoices_amount: number;
  not_invoiced_left: number;
  not_invoiced_in_store: number;
}

export interface StatementLot {
  grn_item_id: string;
  item_name: string;
  packaging: string | null;
  bags: number;
  has_rate: boolean;
  /** Null for a lot with no rate. */
  amount: number | null;
}

export interface StatementLeftRow {
  gr_id: string;
  gr_no: string;
  bags: number;
  amount: number;
}

export interface StatementStoreRow {
  gr_id: string;
  gr_no: string;
  grn_date: string;
  days_in_store: number;
  bags: number;
  amount: number;
  lots: StatementLot[];
}

export interface StatementInvoice {
  id: string;
  inv_no: number;
  inv_fin_year: number;
  invoice_label: string;
  inv_date: string;
  total: number;
  payment_status: 'due' | 'part_paid' | 'paid' | null;
  due_amount: number | null;
}

export interface CustomerStatement {
  as_of: string;
  customer: { id: string; name: string; active: boolean };
  record_payments: boolean;
  invoices_basis: InvoicesBasis;
  figures: DuesFigures;
  lots_without_rate: number;
  /** Payments that name no invoice (Record payments on), null otherwise: shown, added to nothing. */
  unlinked_paid_amount: number | null;
  left: StatementLeftRow[];
  in_store: StatementStoreRow[];
  invoices: StatementInvoice[];
}

export interface CustomerDuesRow extends DuesFigures {
  customer_id: string;
  name: string;
  active: boolean;
  lots_without_rate: number;
  /** As on the statement: shown as a fourth figure, added to nothing and no part of the order. */
  unlinked_paid_amount: number | null;
}

export interface CustomerDues {
  as_of: string;
  record_payments: boolean;
  invoices_basis: InvoicesBasis;
  totals: DuesFigures;
  lots_without_rate: number;
  customers: CustomerDuesRow[];
}

export interface StatementResult<T> {
  success: boolean;
  data?: T | null;
  message?: string;
  error?: unknown;
}

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : num(value));
const text = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? (value as Record<string, unknown>[]) : []);
const basis = (value: unknown): InvoicesBasis => (value === 'due' ? 'due' : 'invoiced');
const figures = (value: unknown): DuesFigures => {
  const f = (value ?? {}) as Record<string, unknown>;
  return { invoices_amount: num(f.invoices_amount), not_invoiced_left: num(f.not_invoiced_left), not_invoiced_in_store: num(f.not_invoiced_in_store) };
};
const paymentStatus = (value: unknown): StatementInvoice['payment_status'] =>
  value === 'due' || value === 'part_paid' || value === 'paid' ? value : null;

function mapStatement(body: Record<string, unknown>): CustomerStatement {
  const customer = (body.customer ?? {}) as Record<string, unknown>;
  return {
    as_of: text(body.as_of),
    customer: { id: text(customer.id), name: text(customer.name), active: customer.active !== false },
    record_payments: body.record_payments === true,
    invoices_basis: basis(body.invoices_basis),
    figures: figures(body.figures),
    lots_without_rate: num(body.lots_without_rate),
    unlinked_paid_amount: numOrNull(body.unlinked_paid_amount),
    left: list(body.left).map(row => ({ gr_id: text(row.gr_id), gr_no: text(row.gr_no), bags: num(row.bags), amount: num(row.amount) })),
    in_store: list(body.in_store).map(row => ({
      gr_id: text(row.gr_id),
      gr_no: text(row.gr_no),
      grn_date: text(row.grn_date),
      days_in_store: num(row.days_in_store),
      bags: num(row.bags),
      amount: num(row.amount),
      lots: list(row.lots).map(lot => ({
        grn_item_id: text(lot.grn_item_id),
        item_name: text(lot.item_name),
        packaging: typeof lot.packaging === 'string' ? lot.packaging : null,
        bags: num(lot.bags),
        has_rate: lot.has_rate === true,
        amount: lot.has_rate === true ? numOrNull(lot.amount) : null,
      })),
    })),
    invoices: list(body.invoices).map(row => ({
      id: text(row.id),
      inv_no: num(row.inv_no),
      inv_fin_year: num(row.inv_fin_year),
      invoice_label: text(row.invoice_label) || text(row.inv_no),
      inv_date: text(row.inv_date),
      total: num(row.total),
      payment_status: paymentStatus(row.payment_status),
      due_amount: numOrNull(row.due_amount),
    })),
  };
}

function mapDues(body: Record<string, unknown>): CustomerDues {
  return {
    as_of: text(body.as_of),
    record_payments: body.record_payments === true,
    invoices_basis: basis(body.invoices_basis),
    totals: figures(body.totals),
    lots_without_rate: num(body.lots_without_rate),
    customers: list(body.customers).map(row => ({
      customer_id: text(row.customer_id),
      name: text(row.name),
      active: row.active !== false,
      lots_without_rate: num(row.lots_without_rate),
      unlinked_paid_amount: numOrNull(row.unlinked_paid_amount),
      ...figures(row),
    })),
  };
}

async function read<T>(rpc: string, args: Record<string, unknown>, map: (body: Record<string, unknown>) => T, failed: string): Promise<StatementResult<T>> {
  try {
    const client = await getAuthenticatedClient();
    const { data, error } = await client.rpc(rpc, args);
    if (error) {
      logger.error(`[Statement] ${rpc} failed`, error.message);
      return { success: false, data: null, message: transportText(error) ?? serverText(error.message, failed), error: error.code || error.message };
    }
    const refusal = reportRefusal(data);
    if (refusal) return refusedReport(refusal, null, failed);
    const body = reportBody(data) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || body.success !== true) return { success: false, data: null, message: failed };
    return { success: true, data: map(body) };
  } catch (error) {
    logger.error(`[Statement] ${rpc} threw`);
    return { success: false, data: null, message: transportText(error) ?? failed, error };
  }
}

/** One customer's statement: administrators, supervisors and the customer's own account (the server refuses staff). */
export const getCustomerStatement = (customerId: string): Promise<StatementResult<CustomerStatement>> =>
  read('get_customer_statement', { p_customer_id: customerId }, mapStatement, t('reports.statement.loadError'));

/** What every customer owes: administrators and supervisors. */
export const getCustomerDues = (): Promise<StatementResult<CustomerDues>> =>
  read('get_customer_dues', {}, mapDues, t('reports.dues.loadError'));
