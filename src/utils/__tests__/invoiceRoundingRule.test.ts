/**
 * Money maths of the charging rule (WH-137): the invoice total and the header tax are rounded as the facility's rule says
 * (backend warehouse_security.round_invoice_total), and a line's storage follows the server's own figure while the charge is
 * the one it was worked out for. Fictional figures only.
 */
import { calculateHeaderTotals, calculateItemAmounts, roundByRule } from '../invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';

function line(qty: number, charge: number, labour: number, tax: number, duration: number): InvoiceItemData {
  return {
    temp_id: 'l', disp_trl_id: 'l', grn_item_id: 'g', item_id: 'i', item_name: 'Fictional potatoes', qty, grn_original_qty: qty,
    package_mark: 'FIX', rack: 'A1', weight: 10, dispatch_id: 'd', dispatch_no: 'd', dispatch_date: '2026-05-02', grn_id: 'g',
    grn_no: 'FIX01', grn_date: '2026-04-01', duration, no_of_days: 31, charge, labour_rate: labour, tax,
    ...calculateItemAmounts(qty, charge, labour, tax, duration),
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

describe('storage of a line with the server\'s own figure (server_storage)', () => {
  it('uses the server\'s amount while the charge is the one it was worked out for', () => {
    // By the day: 10 bags, 3 per month, 17 days -> the server says 17/30 x 30 = 17.00, not qty x charge x rounded months (30 or 15).
    const amounts = calculateItemAmounts(10, 3, 0, 0, 0.5, false, { amount: 17, charge: 3, by_days: true });
    expect(amounts.amount).toBe(17);
  });

  it('scales the server\'s amount to a charge typed since, under a rule that charges by the day', () => {
    const amounts = calculateItemAmounts(10, 6, 0, 0, 0.5, false, { amount: 17, charge: 3, by_days: true });
    expect(amounts.amount).toBe(34);
  });

  it('falls back to qty x charge x duration for whole and half months when the charge changed', () => {
    const amounts = calculateItemAmounts(10, 6, 0, 0, 1.5, false, { amount: 45, charge: 3, by_days: false });
    expect(amounts.amount).toBe(90);
  });

  it('ignores a server figure that is not a number, and a one-time line is qty x charge', () => {
    expect(calculateItemAmounts(10, 3, 0, 0, 2, false, { amount: NaN, charge: 3, by_days: true }).amount).toBe(60);
    expect(calculateItemAmounts(10, 3, 0, 0, 2, true, { amount: 999, charge: 4, by_days: false }).amount).toBe(30);
  });

  it('feeds the line tax and total from the server\'s amount', () => {
    const amounts = calculateItemAmounts(10, 3, 1, 5, 0.5, false, { amount: 17, charge: 3, by_days: true });
    // taxable 17 + labour 10 = 27; tax 1.35; total 28.35
    expect(amounts).toMatchObject({ amount: 17, labour_amount: 10, tax_amount: 1.35, item_total: 28.35 });
  });
});
