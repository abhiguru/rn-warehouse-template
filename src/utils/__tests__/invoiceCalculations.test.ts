import {
  calculateItemAmounts, calculateHeaderTotals, calculateInvoiceBreakdown, savedInvoiceAmounts,
} from '../invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import reducer, {
  loadInvoiceFormData, updateDiscount, updateAllDurations, restoreOriginalDurations,
  updateEditedItem, bulkUpdateItemPricing, bulkUpdateItemGroupPricing, recalculateTotals,
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

it('restores fractional monthly durations and reconciles after a one-time toggle', () => {
  let state = loaded();
  state = reducer(state, updateAllDurations(1));
  expect(state.header).toMatchObject({ tax_amount: 4, total: 74 });
  state = reducer(state, restoreOriginalDurations());
  expect(state.items.map(i => i.duration)).toEqual([1.5, 6.5, 6.5]);
  expect(state.header).toMatchObject({ tax_amount: 9, total: 179 });
});

it('uses the same header contract after individual, bulk and group edits', () => {
  for (const action of [
    updateEditedItem({ temp_id: 'first', values: { charge: 5 } }),
    bulkUpdateItemPricing({ tax: 5 }),
    bulkUpdateItemGroupPricing({ group_key: 'item:::FIX', pricing: { charge: 5, labour_rate: 2, tax: 5 } }),
    recalculateTotals(),
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
      netBeforeTax, hasAdjustment, adjustmentLabel, adjustmentSign, adjustmentAmount,
    });
  });
