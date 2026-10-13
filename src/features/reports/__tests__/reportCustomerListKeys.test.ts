/**
 * The report id -> one-customer list key map that opening a customer's report clears under
 * (SR-06) names the list key each screen really uses.
 */
import fs from 'fs';
import path from 'path';
import { CUSTOMER_ACTIVITY_CUSTOMER } from '@/features/filters/configs/reports/customerActivity';
import { DISPATCH_ACTIVITY_CUSTOMER, DISPATCH_ACTIVITY_CUSTOMER_WITH_WEIGHT } from '@/features/filters/configs/reports/dispatchActivity';
import { GRN_ACTIVITY_CUSTOMER } from '@/features/filters/configs/reports/grnActivity';
import { INVOICE_HISTORY_CUSTOMER } from '@/features/filters/configs/reports/invoiceHistory';
import { ITEM_STOCK } from '@/features/filters/configs/reports/itemStock';
import { STOCK_AGING_CUSTOMER } from '@/features/filters/configs/reports/stockAging';
import { STOCK_SUMMARY_CUSTOMER } from '@/features/filters/configs/reports/stockSummary';
import { REPORT_CUSTOMER_LIST_KEYS, reportCustomerListKey } from '../reportCustomerListKeys';

/** Each report's one-customer configuration, and its name in the screen's source. */
const CONFIGS: Record<string, { listKey: string; names: string[] }> = {
  'grn-activity': { listKey: GRN_ACTIVITY_CUSTOMER.listKey, names: ['GRN_ACTIVITY_CUSTOMER'] },
  'dispatch-activity': { listKey: DISPATCH_ACTIVITY_CUSTOMER.listKey, names: ['DISPATCH_ACTIVITY_CUSTOMER'] },
  'invoice-history': { listKey: INVOICE_HISTORY_CUSTOMER.listKey, names: ['INVOICE_HISTORY_CUSTOMER'] },
  'stock-aging': { listKey: STOCK_AGING_CUSTOMER.listKey, names: ['STOCK_AGING_CUSTOMER'] },
  'stock-summary': { listKey: STOCK_SUMMARY_CUSTOMER.listKey, names: ['STOCK_SUMMARY_CUSTOMER'] },
  'customer-activity': { listKey: CUSTOMER_ACTIVITY_CUSTOMER.listKey, names: ['CUSTOMER_ACTIVITY_CUSTOMER'] },
  'item-stock-summary': { listKey: ITEM_STOCK.listKey, names: ['ITEM_STOCK'] },
};

const screenSource = (reportId: string) =>
  fs.readFileSync(path.join(__dirname, '../../../../app/reports', `${reportId}.tsx`), 'utf8');

describe('report customer list keys', () => {
  it('names every report with a one-customer level, and no other', () => {
    expect(Object.keys(REPORT_CUSTOMER_LIST_KEYS).sort()).toEqual(Object.keys(CONFIGS).sort());
  });

  it.each(Object.keys(CONFIGS))('%s: the key is its configuration\'s list key', reportId => {
    expect(REPORT_CUSTOMER_LIST_KEYS[reportId]).toBe(CONFIGS[reportId].listKey);
    expect(reportCustomerListKey(reportId)).toBe(CONFIGS[reportId].listKey);
  });

  it.each(Object.keys(CONFIGS))('%s: the screen of that route uses that configuration', reportId => {
    const source = screenSource(reportId);
    expect(source).toContain(`const REPORT_ID = '${reportId}';`);
    for (const name of CONFIGS[reportId].names) expect(source).toContain(name);
  });

  it('the two dispatch configurations share one list key', () => {
    expect(DISPATCH_ACTIVITY_CUSTOMER_WITH_WEIGHT.listKey).toBe(DISPATCH_ACTIVITY_CUSTOMER.listKey);
  });

  it('answers undefined for a report without a customer level, and for inherited names', () => {
    expect(reportCustomerListKey('operations-dashboard')).toBeUndefined();
    expect(reportCustomerListKey('toString')).toBeUndefined();
  });
});
