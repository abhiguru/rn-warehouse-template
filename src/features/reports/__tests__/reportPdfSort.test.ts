/**
 * reportPdfSort: every sort a report screen offers is sent to the PDF as one of
 * the columns the backend accepts for that report and level, or not at all.
 */
import { CUSTOMER_ACTIVITY_CUSTOMER, CUSTOMER_ACTIVITY_CUSTOMERS } from '@/features/filters/configs/reports/customerActivity';
import { DISPATCH_ACTIVITY_CUSTOMER, DISPATCH_ACTIVITY_CUSTOMERS } from '@/features/filters/configs/reports/dispatchActivity';
import { GRN_ACTIVITY_CUSTOMER, GRN_ACTIVITY_CUSTOMERS } from '@/features/filters/configs/reports/grnActivity';
import { INVOICE_HISTORY_CUSTOMER, INVOICE_HISTORY_CUSTOMERS } from '@/features/filters/configs/reports/invoiceHistory';
import { ITEM_STOCK } from '@/features/filters/configs/reports/itemStock';
import { STOCK_AGING_CUSTOMER, STOCK_AGING_CUSTOMERS } from '@/features/filters/configs/reports/stockAging';
import { STOCK_SUMMARY_CUSTOMER, STOCK_SUMMARY_CUSTOMERS } from '@/features/filters/configs/reports/stockSummary';
import type { FilterListConfig } from '@/features/filters/types';
import type { ReportPdfName } from '@/services/pdf-service';
import { REPORT_PDF_SORT_COLUMNS, reportPdfSort, type ReportPdfLevel } from '../reportPdfSort';

/**
 * The column keys of each report level: the sorts the server accepts
 * (supabase-warehouse-template functions/_shared/report-definitions.ts,
 * `sortFields`; `customer` = one customer's level, `customers` = `all`).
 */
const BACKEND_COLUMNS: Record<ReportPdfName, Record<ReportPdfLevel, string[]>> = {
  'grn-activity': {
    customer: ['gr_no', 'date', 'items', 'quantity', 'weight', 'stock', 'invoice'],
    customers: ['customer', 'grns', 'quantity', 'weight', 'latest'],
  },
  'dispatch-activity': {
    customer: ['disp_no', 'date', 'grn', 'items', 'quantity'],
    customers: ['customer', 'dispatches', 'quantity', 'latest'],
  },
  'invoice-history': {
    customer: ['invoice_no', 'date', 'grn', 'amount', 'tax', 'net', 'status'],
    customers: ['customer', 'invoices', 'amount', 'net', 'latest'],
  },
  'stock-summary': {
    customer: ['item', 'gr_no', 'date', 'mark', 'rack', 'stock', 'weight'],
    customers: ['customer', 'items', 'grns', 'stock', 'weight'],
  },
  'stock-aging': {
    customer: ['item', 'gr_no', 'date', 'rack', 'stock', 'age', 'last_dispatch'],
    customers: ['customer', 'stock', 'average_age', 'over_one_year'],
  },
  'item-stock-summary': {
    customer: ['item', 'packaging', 'grns', 'received', 'stock'],
    customers: ['item', 'packaging', 'grns', 'received', 'stock'],
  },
  'customer-activity': {
    customer: ['month', 'grns', 'received', 'dispatches', 'dispatched', 'amount', 'stock_end'],
    customers: ['customer', 'city', 'stock', 'grns', 'dispatches', 'amount', 'last_activity'],
  },
};

type AnyConfig = FilterListConfig<any>;

/** The configuration each report level's screen sorts with. */
const SCREEN_CONFIGS: Record<ReportPdfName, Record<ReportPdfLevel, AnyConfig>> = {
  'grn-activity': { customers: GRN_ACTIVITY_CUSTOMERS, customer: GRN_ACTIVITY_CUSTOMER },
  'dispatch-activity': { customers: DISPATCH_ACTIVITY_CUSTOMERS, customer: DISPATCH_ACTIVITY_CUSTOMER },
  'invoice-history': { customers: INVOICE_HISTORY_CUSTOMERS, customer: INVOICE_HISTORY_CUSTOMER },
  'stock-summary': { customers: STOCK_SUMMARY_CUSTOMERS, customer: STOCK_SUMMARY_CUSTOMER },
  'stock-aging': { customers: STOCK_AGING_CUSTOMERS, customer: STOCK_AGING_CUSTOMER },
  'item-stock-summary': { customers: ITEM_STOCK, customer: ITEM_STOCK },
  'customer-activity': { customers: CUSTOMER_ACTIVITY_CUSTOMERS, customer: CUSTOMER_ACTIVITY_CUSTOMER },
};

/** Screen sorts the PDF has no column for: they are not sent. */
const NO_PDF_COLUMN: Partial<Record<ReportPdfName, Partial<Record<ReportPdfLevel, string[]>>>> = {
  'dispatch-activity': { customer: ['weight'] },
};

const REPORTS = Object.keys(SCREEN_CONFIGS) as ReportPdfName[];
const LEVELS: ReportPdfLevel[] = ['customers', 'customer'];
const CASES = REPORTS.flatMap(report => LEVELS.map(level => [report, level] as const));
const sortFieldsOf = (config: AnyConfig) => (config.sort?.options ?? []).map(option => option.field);

describe('reportPdfSort', () => {
  it('has a level for every report the PDF contract names', () => {
    expect(Object.keys(REPORT_PDF_SORT_COLUMNS).sort()).toEqual([...REPORTS].sort());
  });

  it.each(CASES)('%s (%s): every sort of the screen maps to a column the backend accepts', (report, level) => {
    const noColumn = NO_PDF_COLUMN[report]?.[level] ?? [];
    for (const field of sortFieldsOf(SCREEN_CONFIGS[report][level])) {
      for (const order of ['asc', 'desc'] as const) {
        const sent = reportPdfSort(report, level, { field, order });
        if (noColumn.includes(field)) {
          expect(sent).toBeUndefined();
        } else {
          expect(sent).toEqual({ field: expect.any(String), order });
          // Short lower-case names only (report-request.ts), and a column of this level.
          expect(sent!.field).toMatch(/^[a-z_]{1,40}$/);
          expect(BACKEND_COLUMNS[report][level]).toContain(sent!.field);
        }
      }
    }
  });

  it.each(CASES)('%s (%s): the table holds only sorts the screen offers', (report, level) => {
    const offered = sortFieldsOf(SCREEN_CONFIGS[report][level]);
    expect(offered).toEqual(expect.arrayContaining(Object.keys(REPORT_PDF_SORT_COLUMNS[report][level])));
  });

  it('gives the exact columns of the two reports added last', () => {
    expect(reportPdfSort('dispatch-activity', 'customers', { field: 'bags', order: 'desc' })).toEqual({ field: 'quantity', order: 'desc' });
    expect(reportPdfSort('dispatch-activity', 'customer', { field: 'number', order: 'asc' })).toEqual({ field: 'disp_no', order: 'asc' });
    expect(reportPdfSort('invoice-history', 'customers', { field: 'amount', order: 'desc' })).toEqual({ field: 'net', order: 'desc' });
    expect(reportPdfSort('invoice-history', 'customer', { field: 'total', order: 'asc' })).toEqual({ field: 'net', order: 'asc' });
    expect(reportPdfSort('invoice-history', 'customer', { field: 'number', order: 'desc' })).toEqual({ field: 'invoice_no', order: 'desc' });
  });

  it('sends nothing for no sort, an unknown field, or a name of the object prototype', () => {
    expect(reportPdfSort('grn-activity', 'customer', undefined)).toBeUndefined();
    expect(reportPdfSort('grn-activity', 'customer', { field: 'lastActive', order: 'desc' })).toBeUndefined();
    expect(reportPdfSort('grn-activity', 'customer', { field: 'constructor', order: 'desc' })).toBeUndefined();
    expect(reportPdfSort('customer-activity', 'customer', { field: 'stock', order: 'desc' })).toBeUndefined();
  });
});
