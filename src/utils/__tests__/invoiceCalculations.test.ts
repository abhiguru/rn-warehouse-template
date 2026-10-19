import {
  calculateItemAmounts, calculateHeaderTotals, calculateInvoiceBreakdown, savedInvoiceAmounts, roundMoney,
  formatInvoiceAmount, formatInvoiceDeduction,
} from '../invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import reducer, {
  loadInvoiceFormData, updateDiscount,
  updateEditedItem, bulkUpdateItemGroupPricing,
} from '@/store/slices/invoiceFormSlice';

function line(id: string, qty: number, charge: number, labour: number, tax: number, duration = 1): InvoiceItemData {
  return {
    temp_id: id, disp_trl_id: id, grn_item_id: 'grn-line', item_id: 'item',
    item_name: 'Fictional potatoes', qty, grn_original_qty: 100, package_mark: 'FIX',
    rack: 'A1', weight: 10, dispatch_id: id, dispatch_no: id,
    dispatch_date: '2026-05-02', grn_id: 'grn', grn_no: 'FIX01', grn_date: '2026-04-01',
    duration, no_of_days: 31, charge, labour_rate: labour, tax,
    ...calculateItemAmounts(qty, charge, labour, tax, duration),
  };
}

const observedLines = () => [line('first', 7, 5, 2, 5, 1.5), line('partial', 2, 5, 2, 5, 6.5), line('final', 1, 5, 2, 5, 6.5)];
const loaded = () => reducer(undefined, loadInvoiceFormData({ header: {}, items: observedLines(), grId: 'grn' }));

it('reconciles the observed native ₹178.50 preview with the existing ₹179 save', () => {
  expect(calculateHeaderTotals(observedLines())).toEqual({ labour: 20, tax_amount: 9, total: 179 });
  expect(loaded().header).toMatchObject({ labour: 20, tax_amount: 9, total: 179 });
});

it('matches the documented 100-bag split dispatch example', () => {
  const items = [line('20', 20, 5, 2, 5, 1.5), line('80', 80, 5, 2, 5, 1.5)];
  expect(items.map(i => [i.amount, i.labour_amount, i.tax_amount, i.item_total]))
    .toEqual([[150, 40, 9.5, 199.5], [600, 160, 38, 798]]);
  expect(calculateHeaderTotals(items)).toEqual({ labour: 200, tax_amount: 48, total: 998 });
});

it('ceilings unrounded line taxes even when each displayed tax rounds to zero', () => {
  const items = [line('a', 1, 0.01, 0, 5), line('b', 1, 0.01, 0, 5)];
  expect(items.map(i => i.tax_amount)).toEqual([0, 0]);
  expect(calculateHeaderTotals(items)).toEqual({ labour: 0, tax_amount: 1, total: 2 });
});

it('does not add a rupee for floating point noise at an exact tax boundary', () => {
  expect(calculateHeaderTotals(Array.from({ length: 10 }, (_, i) => line(String(i), 1, 2, 0, 5))))
    .toEqual({ labour: 0, tax_amount: 1, total: 21 });
});

it.each([[0, 179, 0], [2.5, 177, 0.5], [-2.5, 182, 0.5], [179, 0, 0]])(
  'preserves absolute discount %s with whole-rupee total %s and explicit adjustment %s',
  (discount, total, rounding) => {
    const state = reducer(loaded(), updateDiscount(discount));
    expect(state.header).toMatchObject({ discount, total, labour: 20, tax_amount: 9 });
    expect(calculateInvoiceBreakdown(state.items, state.header)).toEqual({ subtotal: 150, base: 179, rounding });
  }
);

it.each([[1, 7, 147], [1.5, 10, 200], [2, 12, 252]])(
  'preserves duration %s supplied by the backend at 30/31/46-day boundaries', (duration, tax, total) => {
    // Date-to-duration authority remains the backend, covered by invoice_duration.sql.
    const items = [line('boundary', 20, 5, 2, 5, duration)];
    expect(calculateHeaderTotals(items)).toEqual({ labour: 40, tax_amount: tax, total });
  }
);

// The server decides "one-time" from the GRN's pricing mode: storage is charged
// once per unit whatever the duration, and labour is not charged
// (docs/INVOICE_RULES.md in the backend). There is no client-side switch.
describe('a one-time GRN', () => {
  const oneTime = (id: string, qty: number, duration: number): InvoiceItemData => ({
    ...line(id, qty, 5, 2, 5, duration),
    one_time: true,
    ...calculateItemAmounts(qty, 5, 2, 5, duration, true),
  });

  it('charges storage once per unit, without duration and without labour', () => {
    expect(calculateItemAmounts(100, 5, 2, 5, 1.5, true)).toEqual({
      amount: 500, labour_amount: 0, taxable_amount: 500, tax_amount: 25, item_total: 525,
    });
    // The same line on a monthly GRN: 750 storage + 200 labour.
    expect(calculateItemAmounts(100, 5, 2, 5, 1.5)).toMatchObject({ amount: 750, labour_amount: 200, item_total: 997.5 });
  });

  it('gives the header the server stores: 525 for 100 bags at 5 with labour 2 and tax 5 %', () => {
    const state = reducer(undefined, loadInvoiceFormData({
      header: { one_time_charge: true }, items: [oneTime('20', 20, 1.5), oneTime('80', 80, 1.5)], grId: 'grn',
    }));

    expect(state.header).toMatchObject({ one_time_charge: true, labour: 0, tax_amount: 25, total: 525 });
    // The durations the server worked out are kept; they are not replaced by 1.
    expect(state.items.map(i => i.duration)).toEqual([1.5, 1.5]);
  });

  it('stays one-time through individual and group edits', () => {
    const start = reducer(undefined, loadInvoiceFormData({ header: { one_time_charge: true }, items: [oneTime('a', 100, 1.5)], grId: 'grn' }));

    const edited = reducer(start, updateEditedItem({ temp_id: 'a', values: { charge: 6 } }));
    expect(edited.items[0]).toMatchObject({ amount: 600, labour_amount: 0, tax_amount: 30, item_total: 630 });
    expect(edited.header).toMatchObject({ labour: 0, tax_amount: 30, total: 630 });

    const grouped = reducer(start, bulkUpdateItemGroupPricing({ group_key: 'item:::FIX', pricing: { charge: 4, labour_rate: 9, tax: 5 } }));
    expect(grouped.items[0]).toMatchObject({ amount: 400, labour_amount: 0, item_total: 420 });
    expect(grouped.header).toMatchObject({ labour: 0, tax_amount: 20, total: 420 });
  });

  it('takes the amounts of a monthly GRN from the durations, whatever the header flag says', () => {
    // A stored invoice can carry one_time_charge = true from the old switch; the GRN is monthly.
    const state = reducer(undefined, loadInvoiceFormData({
      header: { one_time_charge: true }, items: [line('20', 20, 5, 2, 5, 1.5), line('80', 80, 5, 2, 5, 1.5)], grId: 'grn',
    }));

    expect(state.items.map(i => i.duration)).toEqual([1.5, 1.5]);
    expect(state.header).toMatchObject({ labour: 200, tax_amount: 48, total: 998 });
  });
});

it('uses the same header contract after individual and group edits', () => {
  for (const action of [
    updateEditedItem({ temp_id: 'first', values: { charge: 5 } }),
    bulkUpdateItemGroupPricing({ group_key: 'item:::FIX', pricing: { charge: 5, labour_rate: 2, tax: 5 } }),
  ]) {
    expect(reducer(loaded(), action).header).toMatchObject({ labour: 20, tax_amount: 9, total: 179 });
  }
});


it.each([
  [179, 0, 170, false, 'Discount', '-', 0],
  [177, 2.5, 168, true, 'Discount', '-', 2.5],
  [182, -2.5, 173, true, 'Surcharge', '+', 2.5],
] as const)('labels saved total%s/discount%s without inventing a storage subtotal',
  (total, discount, netBeforeTax, hasAdjustment, adjustmentLabel, adjustmentSign, adjustmentAmount) => {
    expect(savedInvoiceAmounts({total, tax_amount: 9, discount})).toEqual({
      netBeforeTax, hasAdjustment, isSurcharge: discount < 0, adjustmentLabel, adjustmentSign, adjustmentAmount,
    });
  });

it.each([[1.5, 0.44, 0.11, 0.55], [3.5, 1.02, 0.26, 1.28]])(
  'rounds half-cent storage at duration%s like database numeric arithmetic', (duration, amount, tax_amount, item_total) => {
    expect(calculateItemAmounts(1, 0.29, 0, 25, duration)).toMatchObject({ amount, tax_amount, item_total });
  });

it.each([[1.005, 1.01], [-1.005, -1.01], [10.075, 10.08], [-10.075, -10.08]])(
  'rounds amount %s to %s consistently with NUMERIC(12,2)', (value, expected) => {
    expect(roundMoney(value)).toBe(expected);
  });

describe('invoice money formatting', () => {
  it('uses Indian grouping, the rupee sign and two decimals', () => {
    expect(formatInvoiceAmount(123456.5)).toBe('₹1,23,456.50');
    expect(formatInvoiceAmount(0)).toBe('₹0.00');
    expect(formatInvoiceAmount(undefined)).toBe('₹0.00');
    expect(formatInvoiceAmount(-250)).toBe('−₹250.00');
  });

  it('shows deductions with a minus sign', () => {
    expect(formatInvoiceDeduction(250)).toBe('−₹250.00');
    expect(formatInvoiceDeduction(-250)).toBe('−₹250.00');
    expect(formatInvoiceDeduction(0)).toBe('₹0.00');
  });
});
