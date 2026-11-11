/**
 * Money maths of the charging rule (WH-137): the invoice total and the header tax are rounded as the facility's rule says
 * (backend warehouse_security.round_invoice_total), and a line's storage follows the server's own figure while the charge is
 * the one it was worked out for. Fictional figures only.
 */
import {
  applyBulkGroupPricing, calculateHeaderTotals, calculateItemAmounts, recalculateItemWithEdits, roundByRule,
} from '../invoiceCalculations';
import reducer, { applyServerDurations, loadInvoiceFormData } from '@/store/slices/invoiceFormSlice';
import type { InvoiceItemData } from '@/types/invoice.types';

function line(
  qty: number, charge: number, labour: number, tax: number, duration: number, noOfDays = 31,
  server?: InvoiceItemData['server_storage']
): InvoiceItemData {
  return {
    temp_id: 'l', disp_trl_id: 'l', grn_item_id: 'g', item_id: 'i', item_name: 'Fictional potatoes', qty, grn_original_qty: qty,
    package_mark: 'FIX', rack: 'A1', weight: 10, dispatch_id: 'd', dispatch_no: 'd', dispatch_date: '2026-05-02', grn_id: 'g',
    grn_no: 'FIX01', grn_date: '2026-04-01', duration, no_of_days: noOfDays, charge, labour_rate: labour, tax,
    ...(server ? { server_storage: server } : {}),
    ...calculateItemAmounts(qty, charge, labour, tax, duration, false, server, noOfDays),
  };
}

describe('roundByRule', () => {
  it.each([
    // [value, up, nearest, none]
    [100, 100, 100, 100],
    [100.01, 101, 100, 100.01],
    [100.49, 101, 100, 100.49],
    [100.5, 101, 101, 100.5],
    [100.51, 101, 101, 100.51],
    [1234.5, 1235, 1235, 1234.5],
    [0, 0, 0, 0],
  ])('%s: up %s, nearest %s, none %s', (value, up, nearest, none) => {
    expect(roundByRule(value, 'up')).toBe(up);
    expect(roundByRule(value, 'nearest')).toBe(nearest);
    expect(roundByRule(value, 'none')).toBe(none);
  });

  it('rounds up by default, as every invoice did before the rule', () => {
    expect(roundByRule(10.2)).toBe(11);
  });

  it('is not fooled by binary noise: 1.005 + 2.495 is 3.50 and rounds half up', () => {
    expect(roundByRule(1.005 + 2.495, 'nearest')).toBe(4);
    expect(roundByRule(0.1 + 0.2, 'none')).toBe(0.3);
  });

  it('keeps a negative amount (a credit) symmetrical for nearest', () => {
    expect(roundByRule(-100.5, 'nearest')).toBe(-101);
    expect(roundByRule(-100.49, 'nearest')).toBe(-100);
  });
});

describe('calculateHeaderTotals under each rounding', () => {
  // 3 bags at 4.25 for 1.5 months, labour 1.1 each, 5% tax: storage 19.125 -> 19.13, labour 3.30, tax (19.13+3.30) x 5% = 1.1215.
  const items = [line(3, 4.25, 1.1, 5, 1.5)];

  it('up: the tax and the total go to the next rupee', () => {
    expect(calculateHeaderTotals(items, 0, 'up')).toEqual({ labour: 3.3, tax_amount: 2, total: 25 });
  });

  it('nearest: the tax and the total go to the nearest rupee', () => {
    expect(calculateHeaderTotals(items, 0, 'nearest')).toEqual({ labour: 3.3, tax_amount: 1, total: 23 });
  });

  it('none: the tax and the total keep their paise', () => {
    expect(calculateHeaderTotals(items, 0, 'none')).toEqual({ labour: 3.3, tax_amount: 1.12, total: 23.55 });
  });

  it('applies a discount before rounding, and a surcharge (negative discount) the same way', () => {
    expect(calculateHeaderTotals(items, 0.4, 'none').total).toBe(23.15);
    expect(calculateHeaderTotals(items, -0.4, 'none').total).toBe(23.95);
    expect(calculateHeaderTotals(items, 0.4, 'up').total).toBe(25);
  });

  it('gives the same result without the argument as with up', () => {
    expect(calculateHeaderTotals(items, 0)).toEqual(calculateHeaderTotals(items, 0, 'up'));
  });
});

type ServerStorage = NonNullable<InvoiceItemData['server_storage']>;
/** The server's figure for a line, with what it was worked out from (migration 164). */
const served = (overrides: Partial<ServerStorage> = {}): ServerStorage => ({
  amount: 17, charge: 3, duration: 0.5, no_of_days: 17, by_days: true, minimum_days: 0, ...overrides,
});

describe('storage of a line with the server\'s own figure (server_storage)', () => {
  it('uses the server\'s amount while charge, duration and days are the ones it was worked out from', () => {
    // By the day: 10 bags, 3 per month, 17 days -> the server says 17/30 x 30 = 17.00, not qty x charge x rounded months (30 or 15).
    expect(calculateItemAmounts(10, 3, 0, 0, 0.5, false, served(), 17).amount).toBe(17);
  });

  it('works storage out again by the day when the charge changed (rate x qty x days / 30)', () => {
    expect(calculateItemAmounts(10, 6, 0, 0, 0.5, false, served(), 17).amount).toBe(34);
  });

  it('works storage out again as qty x charge x duration for a monthly rule when the charge changed', () => {
    const server = served({ amount: 45, duration: 1.5, no_of_days: 45, by_days: false });
    expect(calculateItemAmounts(10, 6, 0, 0, 1.5, false, server, 45).amount).toBe(90);
  });

  it('ignores a server figure that is not a number, and a one-time line is qty x charge', () => {
    expect(calculateItemAmounts(10, 3, 0, 0, 2, false, served({ amount: NaN, duration: 2, by_days: false }), 17).amount).toBe(60);
    expect(calculateItemAmounts(10, 3, 0, 0, 2, true, served({ amount: 999, charge: 4, duration: 2 }), 17).amount).toBe(30);
  });

  it('feeds the line tax and total from the server\'s amount', () => {
    const amounts = calculateItemAmounts(10, 3, 1, 5, 0.5, false, served(), 17);
    // taxable 17 + labour 10 = 27; tax 1.35; total 28.35
    expect(amounts).toMatchObject({ amount: 17, labour_amount: 10, tax_amount: 1.35, item_total: 28.35 });
  });

  it('stops using the server\'s amount when the duration is edited', () => {
    const server = served({ amount: 30, duration: 1, no_of_days: 30, by_days: false });
    expect(calculateItemAmounts(10, 3, 0, 0, 1, false, server, 30).amount).toBe(30);
    expect(calculateItemAmounts(10, 3, 0, 0, 1.5, false, server, 30).amount).toBe(45);
  });

  it('stops using the server\'s amount when the days are edited', () => {
    const server = served();
    expect(calculateItemAmounts(10, 3, 0, 0, 0.5, false, server, 17).amount).toBe(17);
    expect(calculateItemAmounts(10, 3, 0, 0, 0.5, false, server, 20).amount).toBe(20);
  });

  it('stops using the server\'s amount when the days are edited through recalculateItemWithEdits', () => {
    const base = line(10, 3, 0, 0, 0.5, 17, served());
    expect(base.amount).toBe(17);
    expect(recalculateItemWithEdits(base, { no_of_days: 30 }).amount).toBe(30);
  });
});

describe('server_storage on a line after the server\'s own durations (TOTAL_CHANGED)', () => {
  const monthly = served({ amount: 30, duration: 1, no_of_days: 30, by_days: false });
  const loaded = () => reducer(undefined, loadInvoiceFormData({
    header: { customer_id: 'c', customer_name: 'Fictional Traders', gr_id: 'grn', gr_no: 'FIX01' },
    items: [{ ...line(10, 3, 1, 5, 1, 30, monthly), temp_id: 'a', disp_trl_id: 'a' }],
    grId: 'grn',
  }));

  it('shows the server\'s amount while it matches', () => {
    expect(loaded().items[0].amount).toBe(30);
  });

  it('after 1 -> 1.5 months the storage is qty x charge x 1.5 and the total changes', () => {
    const before = loaded();
    const after = reducer(before, applyServerDurations([{ disp_trl_id: 'a', duration: 1.5, no_of_days: 30 }]));
    expect(after.items[0].duration).toBe(1.5);
    expect(after.items[0].amount).toBe(45);
    expect(after.header.total).not.toBe(before.header.total);
  });
});

describe('storage under a rule that charges by the day (step 1)', () => {
  const dayRule = (minimum_days = 0, overrides: Partial<ServerStorage> = {}) =>
    served({ amount: 0, charge: 0, duration: 1, no_of_days: 40, by_days: true, minimum_days, ...overrides });
  const storage = (qty: number, charge: number, days: number, minimum = 0) =>
    calculateItemAmounts(qty, charge, 0, 0, 1, false, dayRule(minimum, { no_of_days: days }), days).amount;

  it('a looked-up charge of 0 with 12.50 typed, 10 bags, 40 days is 166.67', () => {
    expect(storage(10, 12.5, 40)).toBe(166.67);
  });

  it('the same through applyBulkGroupPricing', () => {
    const item = { ...line(10, 0, 0, 0, 1, 40, dayRule(0)), item_id: 'item', package_mark: 'FIX' };
    expect(item.amount).toBe(0);
    const { updatedItems, updatedCount } = applyBulkGroupPricing([item], 'item:::FIX', { charge: 12.5 }, {});
    expect(updatedCount).toBe(1);
    expect(updatedItems[0].amount).toBe(166.67);
  });

  it('a 30-day minimum with 10 days charges 30 days', () => {
    expect(storage(10, 3, 10, 30)).toBe(30);
  });

  it('days of 0 or less count as 1', () => {
    expect(storage(30, 3, 0)).toBe(3);
    expect(storage(30, 3, -5)).toBe(3);
  });

  it.each([
    [5.85, 3, 61, 35.69],
    [6.35, 3, 7, 4.45],
  ])('rounds a tie away from zero: %s x %s bags x %s days -> %s', (charge, qty, days, expected) => {
    expect(storage(qty, charge, days)).toBe(expected);
  });

  it('a one-time line stays qty x charge', () => {
    expect(calculateItemAmounts(10, 12.5, 0, 0, 1, true, dayRule(0), 40).amount).toBe(125);
  });
});
