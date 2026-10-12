/**
 * Invoice History Report Service (C4)
 *
 * Fetches invoice history data from the get_customer_invoice_summary RPC.
 * Returns invoices with line items, payment status, and monthly breakdown.
 */

import { getAuthenticatedClient } from '@/config/supabaseConfig';
import type {
  InvoiceHistoryResponse,
  InvoiceHistoryData,
  InvoiceHistoryKPIs,
  InvoiceHistoryRecord,
  InvoiceMonthlyBreakdown,
  AllInvoiceHistoryResponse,
  AllInvoiceHistoryData,
  AllInvoiceHistoryKPIs,
  CustomerInvoiceSummary,
} from '@/types/report.types';

import { t } from '@/i18n';
import { toPaise, toRupees } from '@/features/filters/configs/reports/invoicePayment';
import { getDateDaysAgo, getToday } from './reportDates';
import { createLogger } from '@/utils/logger';
import { reportBody, reportRefusal, refusedReport } from './reportEnvelope';

const logger = createLogger('Reports');

// ---------------------------------------------------------------------------
// An older server lists an invoice once per payment
// ---------------------------------------------------------------------------

/**
 * The invoice's id as a key to merge by; '' for a row that has none (missing, empty or blank), which is
 * never merged with another.
 */
function invoiceKey(id: unknown): string {
  if (typeof id === 'string') return id.trim() === '' ? '' : id;
  return typeof id === 'number' && Number.isFinite(id) ? String(id) : '';
}

/** A payment amount that can be read: a finite number, or a number written as text (as `invoicePayment` reads it). */
function isUsableAmount(amount: unknown): boolean {
  if (typeof amount === 'number') return Number.isFinite(amount);
  return typeof amount === 'string' && amount.trim() !== '' && Number.isFinite(Number(amount));
}

/** When the row was paid, as a time; NaN for a row with no date that can be read. */
function paidTime(row: InvoiceHistoryRecord): number {
  const date = row.payment_status.paid_date;
  return typeof date === 'string' && date.trim() !== '' ? Date.parse(date) : Number.NaN;
}

/**
 * One invoice from the several rows an older server sent for it (one per payment):
 * - the first row's fields, and its place in the list;
 * - `payment_status.amount` is the sum of the rows' amounts, added in whole paise (a row without a readable
 *   amount adds nothing; with none readable, the first row's stays as it was);
 * - `payment_status.status` is "paid" when any row says so, else the first row's: the money decides on the
 *   screen (`invoicePayment`), the word only when an answer says "paid" and carries no amount;
 * - the payment's date, reference and mode are those of the row paid last (a row with no date loses to one
 *   with a date; on the same date the earlier row wins).
 */
function mergeRowsOfOneInvoice(rows: InvoiceHistoryRecord[]): InvoiceHistoryRecord {
  const [first] = rows;
  let latest = first;
  for (const row of rows) {
    const time = paidTime(row);
    if (!Number.isNaN(time) && (Number.isNaN(paidTime(latest)) || time > paidTime(latest))) latest = row;
  }
  const readable = rows.filter(row => isUsableAmount(row.payment_status.amount));
  const paid = rows.some(row => row.payment_status.status === 'paid');
  return {
    ...first,
    payment_status: {
      status: paid ? 'paid' : first.payment_status.status,
      paid_date: latest.payment_status.paid_date,
      payment_ref: latest.payment_status.payment_ref,
      amount:
        readable.length > 0
          ? toRupees(readable.reduce((sum, row) => sum + toPaise(row.payment_status.amount), 0))
          : first.payment_status.amount,
      payment_mode: latest.payment_status.payment_mode,
    },
  };
}

/**
 * A server before backend migration 61 joins an invoice to its payments row by row, so an invoice paid in two
 * parts (4.00 and 10.00 of 14.00) arrives twice with the same `invoice_id` and `total`: counted twice by every
 * figure of the screen (Amount 28, Pending 14 instead of Amount 14, Pending 0). From migration 61 the server
 * sends one row with the summed amount, and this returns the answer as it came: the same array, the same
 * objects. Rows with no `invoice_id` are never merged. The order is that of first appearance.
 */
function oneRowPerInvoice(rows: InvoiceHistoryRecord[]): InvoiceHistoryRecord[] {
  const groups: InvoiceHistoryRecord[][] = [];
  const byId = new Map<string, InvoiceHistoryRecord[]>();
  for (const row of rows) {
    const key = invoiceKey(row.invoice_id);
    const group = key ? byId.get(key) : undefined;
    if (group) {
      group.push(row);
    } else {
      const created = [row];
      groups.push(created);
      if (key) byId.set(key, created);
    }
  }
  if (groups.length === rows.length) return rows;
  return groups.map(group => (group.length === 1 ? group[0] : mergeRowsOfOneInvoice(group)));
}

/**
 * Default empty response for error cases
 */
const EMPTY_RESPONSE: InvoiceHistoryData = {
  summary: {
    total_invoices: 0,
    total_amount: 0,
    total_labour: 0,
    total_tax: 0,
    total_discount: 0,
    net_amount: 0,
    paid_count: 0,
    pending_count: 0,
    paid_amount: 0,
    pending_amount: 0,
  },
  invoices: [],
  by_month: [],
};

/**
 * Default empty response for all-customers error cases
 */
const EMPTY_ALL_RESPONSE: AllInvoiceHistoryData = {
  summary: {
    total_invoices: 0,
    total_customers: 0,
    total_amount: 0,
    total_tax: 0,
    net_amount: 0,
  },
  by_customer: [],
  by_month: [],
};

export interface InvoiceHistoryParams {
  customerId: string; // Required customer UUID
  fromDate?: string;
  toDate?: string;
  daysBack?: number; // Convenience param - defaults to 30 days
  financialYear?: number; // Optional financial year filter
}

/**
 * Fetch customer invoice history
 *
 * @param params - Filter parameters for invoice history (customerId is required)
 * @returns Invoice history with KPIs, invoices, and monthly breakdown
 */
export async function getCustomerInvoiceHistory(
  params: InvoiceHistoryParams
): Promise<InvoiceHistoryResponse> {
  if (!params.customerId) {
    logger.error('[InvoiceHistory] Customer ID is required');
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: t('reports.customerActivity.errors.customerIdRequired'),
      error: 'MISSING_CUSTOMER_ID',
    };
  }

  try {
    const client = await getAuthenticatedClient();

    // Calculate date range
    const toDate = params.toDate ?? getToday();
    const fromDate = params.fromDate ?? getDateDaysAgo(params.daysBack ?? 30);

    // Build RPC params
    const rpcParams: Record<string, unknown> = {
      p_customer_uuid: params.customerId,
      p_from_date: fromDate,
      p_to_date: toDate,
    };

    if (params.financialYear) {
      rpcParams.p_financial_year = params.financialYear;
    }

    const { data, error } = await client.rpc(
      'get_customer_invoice_summary',
      rpcParams
    );

    if (error) {
      logger.error('[InvoiceHistory] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_RESPONSE,
        message: t('reports.invoiceHistory.errors.fetchFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_RESPONSE,
        message: t('reports.invoiceHistory.errors.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      return refusedReport(refusal, EMPTY_RESPONSE, t('reports.invoiceHistory.errors.fetchFailed'));
    }

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = reportBody(data);

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;

    // Map to our expected format
    const summary: InvoiceHistoryKPIs = {
      total_invoices: responseData?.summary?.total_invoices ?? 0,
      total_amount: responseData?.summary?.total_amount ?? 0,
      total_labour: responseData?.summary?.total_labour ?? 0,
      total_tax: responseData?.summary?.total_tax ?? 0,
      total_discount: responseData?.summary?.total_discount ?? 0,
      net_amount: responseData?.summary?.net_amount ?? 0,
      paid_count: responseData?.summary?.paid_count ?? 0,
      pending_count: responseData?.summary?.pending_count ?? 0,
      paid_amount: responseData?.summary?.paid_amount ?? 0,
      pending_amount: responseData?.summary?.pending_amount ?? 0,
    };

    const invoiceRows: InvoiceHistoryRecord[] = (responseData?.invoices ?? []).map(
      (inv: any) => ({
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        financial_year: inv.financial_year ?? '',
        grn_ref: inv.grn_ref ?? '',
        grn_id: inv.grn_id ?? '',
        total: inv.total ?? 0,
        labour: inv.labour ?? 0,
        discount: inv.discount ?? 0,
        tax_amount: inv.tax_amount ?? 0,
        net_total: inv.net_total ?? 0,
        item_count: inv.item_count ?? 0,
        total_quantity: inv.total_quantity ?? 0,
        notes: inv.notes ?? null,
        payment_status: {
          status: inv.payment_status?.status ?? 'pending',
          paid_date: inv.payment_status?.paid_date ?? null,
          payment_ref: inv.payment_status?.payment_ref ?? null,
          amount: inv.payment_status?.amount,
          payment_mode: inv.payment_status?.payment_mode,
        },
        line_items: (inv.line_items ?? []).map((item: any) => ({
          item_id: item.item_id ?? '',
          item_name: item.item_name ?? '',
          packaging: item.packaging ?? '',
          quantity: item.quantity ?? 0,
          rate: item.rate ?? 0,
          no_of_days: item.no_of_days ?? 0,
          charge: item.charge ?? 0,
          labour_rate: item.labour_rate ?? 0,
          labour_amount: item.labour_amount ?? 0,
          tax_percent: item.tax_percent ?? 0,
          tax_amount: item.tax_amount ?? 0,
          line_total: item.line_total ?? 0,
          grn_item_ref: {
            gr_no: item.grn_item_ref?.gr_no ?? '',
            rack: item.grn_item_ref?.rack ?? '',
            package_mark: item.grn_item_ref?.package_mark ?? '',
          },
        })),
      })
    );

    // One row per invoice, whatever the server's version: every figure and list of the screen reads this.
    const invoices = oneRowPerInvoice(invoiceRows);

    const byMonth: InvoiceMonthlyBreakdown[] = (
      responseData?.by_month ?? []
    ).map((m: any) => ({
      month: m.month ?? '',
      invoice_count: m.invoice_count ?? 0,
      total_amount: m.total_amount ?? 0,
      paid_amount: m.paid_amount ?? 0,
      pending_amount: m.pending_amount ?? 0,
    }));

    return {
      success: true,
      data: { summary, invoices, by_month: byMonth },
      message: t('reports.invoiceHistory.retrieved'),
    };
  } catch (error) {
    logger.error('[InvoiceHistory] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_RESPONSE,
      message: t('reports.invoiceHistory.errors.fetchFailed'),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export interface AllInvoiceHistoryParams {
  fromDate: string;
  toDate: string;
  financialYear?: number;
}

/**
 * Fetch all-customers invoice history (staff view)
 *
 * @param params - Date range and optional financial year parameters
 * @returns Invoice history across all customers with per-customer breakdown
 */
export async function getAllInvoiceHistory(
  params: AllInvoiceHistoryParams
): Promise<AllInvoiceHistoryResponse> {
  try {
    const client = await getAuthenticatedClient();

    const rpcParams: Record<string, unknown> = {
      p_customer_uuid: null, // Null for all customers
      p_from_date: params.fromDate,
      p_to_date: params.toDate,
    };

    if (params.financialYear) {
      rpcParams.p_financial_year = params.financialYear;
    }

    const { data, error } = await client.rpc(
      'get_customer_invoice_summary',
      rpcParams
    );

    if (error) {
      logger.error('[AllInvoiceHistory] RPC error:', error.message);
      return {
        success: false,
        data: EMPTY_ALL_RESPONSE,
        message: t('reports.invoiceHistory.errors.fetchAllFailed'),
        error: error.message,
      };
    }

    if (!data) {
      return {
        success: true,
        data: EMPTY_ALL_RESPONSE,
        message: t('reports.invoiceHistory.errors.noData'),
      };
    }

    const refusal = reportRefusal(data);
    if (refusal) {
      return refusedReport(refusal, EMPTY_ALL_RESPONSE, t('reports.invoiceHistory.errors.fetchAllFailed'));
    }

    // Parse the RPC response - handle both wrapped and unwrapped formats
    const rawData = reportBody(data);

    // Unwrap if response has { data, success, metadata } structure
    const responseData = rawData?.data ?? rawData;

    // Map to our expected format
    const summary: AllInvoiceHistoryKPIs = {
      total_invoices: responseData?.summary?.total_invoices ?? 0,
      total_customers: responseData?.summary?.total_customers ?? 0,
      total_amount: responseData?.summary?.total_amount ?? 0,
      total_tax: responseData?.summary?.total_tax ?? 0,
      net_amount: responseData?.summary?.net_amount ?? 0,
    };

    const byCustomer: CustomerInvoiceSummary[] = (
      responseData?.by_customer ?? []
    ).map((customer: any) => ({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      invoice_count: customer.invoice_count ?? 0,
      total_amount: customer.total_amount ?? 0,
      net_amount: customer.net_amount ?? 0,
      latest_invoice_date: customer.latest_invoice_date ?? '',
    }));

    const byMonth = (responseData?.by_month ?? []).map((m: any) => ({
      month: m.month ?? '',
      invoice_count: m.invoice_count ?? 0,
      total_amount: m.total_amount ?? 0,
    }));

    return {
      success: true,
      data: { summary, by_customer: byCustomer, by_month: byMonth },
      message: t('reports.invoiceHistory.retrievedAll'),
    };
  } catch (error) {
    logger.error('[AllInvoiceHistory] Unexpected error:', error);
    return {
      success: false,
      data: EMPTY_ALL_RESPONSE,
      message: t('reports.invoiceHistory.errors.fetchAllFailed'),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
