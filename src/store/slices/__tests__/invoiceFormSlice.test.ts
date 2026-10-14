import type { InvoiceItemData } from '@/types/invoice.types';

type Slice = typeof import('../invoiceFormSlice');

/** Loads the slice as the app does at start-up: once, on the day given. */
function loadSliceOn(day: Date): Slice {
  jest.useFakeTimers({ now: day });
  let slice!: Slice;
  jest.isolateModules(() => {
    slice = require('../invoiceFormSlice');
  });
  return slice;
}

describe('invoice form default date and financial year', () => {
  afterEach(() => jest.useRealTimers());

  it('is today when the form is reset, not the day the app was started', () => {
    const slice = loadSliceOn(new Date(2026, 9, 9, 18, 0, 0));
    jest.setSystemTime(new Date(2026, 9, 10, 8, 30, 0));

    const state = slice.default(undefined, slice.resetForm());

    expect(state.header.inv_date).toBe('2026-10-10');
    expect(state.header.inv_fin_year).toBe('2026-27');
  });

  it('moves to the new financial year on 1 April without a restart', () => {
    const slice = loadSliceOn(new Date(2026, 2, 31, 18, 0, 0));
    expect(slice.default(undefined, slice.resetForm()).header.inv_fin_year).toBe('2025-26');

    jest.setSystemTime(new Date(2026, 3, 1, 9, 0, 0));

    const state = slice.default(undefined, slice.resetForm());
    expect(state.header.inv_date).toBe('2026-04-01');
    expect(state.header.inv_fin_year).toBe('2026-27');
  });

  it('gives a newly selected GRN a header dated today when none was set', () => {
    const slice = loadSliceOn(new Date(2026, 9, 9, 18, 0, 0));
    jest.setSystemTime(new Date(2026, 9, 10, 8, 30, 0));
    const items: InvoiceItemData[] = [];

    const state = slice.default(
      undefined,
      slice.loadInvoiceFormData({ header: { gr_id: 'g1', gr_no: 'A0001' }, items, grId: 'g1' })
    );

    expect(state.header.inv_date).toBe('2026-10-10');
  });
});

describe('editing a saved invoice', () => {
  const slice: Slice = require('../invoiceFormSlice');
  const reducer = slice.default;
  const { discountNeedsReason } = require('@/utils/invoiceCalculations');

  const line = (overrides: Partial<InvoiceItemData> = {}): InvoiceItemData => ({
    temp_id: 'edit_1_0',
    disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555',
    grn_item_id: 'g1',
    item_id: 'i1',
    item_name: 'Example Potatoes',
    qty: 100,
    grn_original_qty: 100,
    package_mark: 'M1',
    rack: '',
    weight: 50,
    dispatch_id: 'd1',
    dispatch_no: 'I0001',
    dispatch_date: '2026-10-01',
    grn_id: 'gr1',
    grn_no: 'A0010',
    grn_date: '2026-09-01',
    duration: 1,
    no_of_days: 30,
    charge: 5.5,
    labour_rate: 2,
    tax: 5,
    amount: 550,
    labour_amount: 200,
    tax_amount: 37.5,
    item_total: 787.5,
    ...overrides,
  });

  const saved = () =>
    reducer(
      undefined,
      slice.loadInvoiceEditData({
        invoiceId: 'inv-42',
        grId: 'gr1',
        header: {
          inv_date: '2026-10-05',
          inv_fin_year: '2026-27',
          inv_no: 42,
          customer_id: 'c1',
          customer_name: 'Example Traders',
          gr_id: 'gr1',
          gr_no: 'A0010',
          one_time_charge: false,
          discount: 100,
          discount_reason: 'Damaged bags',
          labour: 200,
          tax_amount: 38,
          total: 688,
        },
        items: [line()],
      })
    );

  it('keeps the recorded reason while the discount is unchanged', () => {
    const state = saved();

    expect(state.header.discount_reason).toBe('Damaged bags');
    expect(discountNeedsReason(state.header, 'staff')).toBe(false);
  });

  it('clears the recorded reason when the discount changes, so a new one has to be written', () => {
    const state = reducer(saved(), slice.updateDiscount(5000));

    expect(state.header.discount).toBe(5000);
    expect(state.header.discount_reason).toBe('');
    expect(discountNeedsReason(state.header, 'staff')).toBe(true);
  });

  it('puts the recorded reason back when the stored discount is typed again', () => {
    let state = reducer(saved(), slice.updateDiscount(5000));
    state = reducer(state, slice.updateDiscount(100));

    expect(state.header.discount_reason).toBe('Damaged bags');
    expect(discountNeedsReason(state.header, 'staff')).toBe(false);
  });

  it('keeps a reason written for the new discount when the amount is corrected', () => {
    let state = reducer(saved(), slice.updateDiscount(50));
    state = reducer(state, slice.updateHeader({ discount_reason: 'Late delivery' }));
    state = reducer(state, slice.updateDiscount(60));

    expect(state.header.discount_reason).toBe('Late delivery');
  });

  // RF-2: the amount field reports every keystroke, and an empty field reports 0.
  it('never clears a reason written in this edit, also when the amount passes through the stored amount', () => {
    // Saved without a discount: clearing the field is the stored amount.
    let state = reducer(undefined, slice.loadInvoiceEditData({ invoiceId: 'inv-43', grId: 'gr1', header: { ...saved().header, discount: 0, discount_reason: '' }, items: [line()] }));
    state = reducer(state, slice.updateDiscount(50));
    state = reducer(state, slice.updateHeader({ discount_reason: 'Damaged bags' }));
    state = reducer(state, slice.updateDiscount(0));
    expect(state.header.discount_reason).toBe('Damaged bags');
    state = reducer(state, slice.updateDiscount(75));
    expect(state.header.discount_reason).toBe('Damaged bags');
    expect(discountNeedsReason(state.header, 'staff')).toBe(false);

    // Saved with 100 and a reason: a new reason is not swapped for the old one, nor cleared after it.
    state = reducer(saved(), slice.updateDiscount(1000));
    expect(state.header.discount_reason).toBe('');
    state = reducer(state, slice.updateHeader({ discount_reason: 'Late delivery' }));
    state = reducer(state, slice.updateDiscount(100));
    expect(state.header.discount_reason).toBe('Late delivery');
    state = reducer(state, slice.updateDiscount(10));
    expect(state.header.discount_reason).toBe('Late delivery');
  });

  it('a reason the person erased stays erased', () => {
    let state = reducer(saved(), slice.updateDiscount(50));
    state = reducer(state, slice.updateHeader({ discount_reason: 'x' }));
    state = reducer(state, slice.updateHeader({ discount_reason: '' }));
    state = reducer(state, slice.updateDiscount(60));
    expect(state.header.discount_reason).toBe('');
    expect(discountNeedsReason(state.header, 'staff')).toBe(true);
  });

  it('a freshly loaded invoice starts with the stored reason as stored text again', () => {
    let state = reducer(saved(), slice.updateHeader({ discount_reason: 'typed' }));
    state = reducer(state, slice.loadInvoiceEditData({ invoiceId: 'inv-42', grId: 'gr1', header: saved().header, items: [line()] }));
    state = reducer(state, slice.updateDiscount(5));
    expect(state.header.discount_reason).toBe('');
  });

  it('keeps the stored discount and its reason when another GRN is chosen', () => {
    const state = reducer(
      saved(),
      slice.loadInvoiceFormData({
        grId: 'gr2',
        header: { customer_id: 'c1', customer_name: 'Example Traders', gr_id: 'gr2', gr_no: 'A0011' },
        items: [line({ temp_id: 'temp_1_0', grn_id: 'gr2', grn_no: 'A0011' })],
      })
    );

    expect(state.invoice_id).toBe('inv-42');
    expect(state.header.gr_id).toBe('gr2');
    expect(state.header.discount).toBe(100);
    expect(state.header.saved_discount).toBe(100);
    expect(state.header.discount_reason).toBe('Damaged bags');
    expect(discountNeedsReason(state.header, 'staff')).toBe(false);
  });

  it('does not keep a reason from an earlier form for a new invoice', () => {
    const state = reducer(undefined, slice.updateDiscount(25));

    expect(state.header.discount_reason ?? '').toBe('');
    expect(discountNeedsReason(state.header, 'staff')).toBe(true);
  });
});

// Owner decision 3 of 2026-10-11: a line may have a charge of 0, with a reason.
describe('the reason for a zero charge', () => {
  const slice: Slice = require('../invoiceFormSlice');
  const reducer = slice.default;
  const { zeroChargeNeedsReason } = require('@/utils/invoiceCalculations');

  const line = (id: string, charge: number): InvoiceItemData => ({
    temp_id: `edit_${id}_0`,
    disp_trl_id: `${id}-2222-4333-8444-555555555555`,
    grn_item_id: 'g1',
    item_id: 'i1',
    item_name: 'Example Potatoes',
    qty: 100,
    grn_original_qty: 100,
    package_mark: 'M1',
    rack: '',
    weight: 50,
    dispatch_id: 'd1',
    dispatch_no: 'I0001',
    dispatch_date: '2026-10-01',
    grn_id: 'gr1',
    grn_no: 'A0010',
    grn_date: '2026-09-01',
    duration: 1,
    no_of_days: 30,
    charge,
    labour_rate: 2,
    tax: 5,
    amount: charge * 100,
    labour_amount: 200,
    tax_amount: 10,
    item_total: charge * 100 + 210,
  });
  const FREE = 'aaaaaaaa';
  const PAID = 'bbbbbbbb';

  const header = {
    inv_date: '2026-10-05',
    inv_fin_year: '2026-27',
    inv_no: 42,
    customer_id: 'c1',
    customer_name: 'Example Traders',
    gr_id: 'gr1',
    gr_no: 'A0010',
    one_time_charge: false,
    discount: 0,
    zero_charge_reason: 'Sample lot',
    labour: 400,
    tax_amount: 20,
    total: 970,
  };
  /** An invoice saved with one free line, one paid line and the reason "Sample lot". */
  const saved = () =>
    reducer(undefined, slice.loadInvoiceEditData({ invoiceId: 'inv-42', grId: 'gr1', header, items: [line(FREE, 0), line(PAID, 5.5)] }));
  const setCharge = (state: ReturnType<typeof saved>, id: string, charge: number) =>
    reducer(state, slice.updateEditedItem({ temp_id: `edit_${id}_0`, values: { charge } }));
  const reason = (state: ReturnType<typeof saved>) => state.header.zero_charge_reason ?? '';
  const needed = (state: ReturnType<typeof saved>, role = 'staff') => zeroChargeNeedsReason(state.header, state.items, role);

  it('is loaded with the invoice and satisfies the rule', () => {
    const state = saved();

    expect(reason(state)).toBe('Sample lot');
    expect(needed(state)).toBe(false);
  });

  it('is kept when something other than a charge of 0 changes', () => {
    let state = setCharge(saved(), PAID, 7);
    state = reducer(state, slice.updateDiscount(50));
    state = reducer(state, slice.updateHeader({ inv_date: '2026-10-06' }));

    expect(reason(state)).toBe('Sample lot');
    expect(needed(state)).toBe(false);
  });

  // The server wants the reason back on every save of an invoice with a free
  // line, and reads an empty one from an administrator as "remove it".
  it('stays in the form when another line gets a zero charge', () => {
    const state = setCharge(saved(), PAID, 0);

    expect(reason(state)).toBe('Sample lot');
    expect(needed(state)).toBe(false);
  });

  it('stays in the form while no line is free, and is there again when one is', () => {
    let state = setCharge(saved(), FREE, 4);
    expect(reason(state)).toBe('Sample lot');
    expect(needed(state)).toBe(false);

    state = setCharge(state, PAID, 0);
    expect(reason(state)).toBe('Sample lot');
    expect(needed(state)).toBe(false);
  });

  it('is not touched by a group price', () => {
    const state = reducer(saved(), slice.bulkUpdateItemGroupPricing({ group_key: 'i1:::M1', pricing: { charge: 0, labour_rate: 2, tax: 5 } }));

    expect(state.items.every((item) => item.charge === 0)).toBe(true);
    expect(reason(state)).toBe('Sample lot');
  });

  it('never clears a reason written in this edit, whatever the charges become', () => {
    let state = reducer(saved(), slice.updateHeader({ zero_charge_reason: 'Agreed with the owner' }));
    state = setCharge(state, PAID, 0);
    state = setCharge(state, PAID, 5.5);
    state = setCharge(state, FREE, 3);
    state = setCharge(state, FREE, 0);
    state = reducer(state, slice.updateDiscount(25));

    expect(reason(state)).toBe('Agreed with the owner');
    expect(needed(state)).toBe(false);
  });

  it('a reason the person erased stays erased, and staff are asked for one', () => {
    let state = reducer(saved(), slice.updateHeader({ zero_charge_reason: '' }));
    state = setCharge(state, PAID, 0);
    state = setCharge(state, PAID, 5.5);

    expect(reason(state)).toBe('');
    expect(needed(state)).toBe(true);
    expect(needed(state, 'admin')).toBe(false);
    expect(needed(state, 'supervisor')).toBe(false);
  });

  it('a freshly loaded invoice starts with the stored reason again', () => {
    let state = reducer(saved(), slice.updateHeader({ zero_charge_reason: 'typed' }));
    state = reducer(state, slice.loadInvoiceEditData({ invoiceId: 'inv-42', grId: 'gr1', header, items: [line(FREE, 0), line(PAID, 5.5)] }));

    expect(reason(state)).toBe('Sample lot');
  });

  it('an invoice saved without a free line has no reason, and asks staff for one when a line becomes free', () => {
    let state = reducer(undefined, slice.loadInvoiceEditData({ invoiceId: 'inv-43', grId: 'gr1', header: { ...header, zero_charge_reason: undefined }, items: [line(PAID, 5.5)] }));
    expect(reason(state)).toBe('');
    expect(needed(state)).toBe(false);

    state = setCharge(state, PAID, 0);
    expect(needed(state)).toBe(true);
  });

  it('keeps the reason of an invoice that is being edited, also when another GRN is loaded into it', () => {
    let state = reducer(saved(), slice.updateHeader({ zero_charge_reason: 'Agreed with the owner' }));
    state = reducer(state, slice.loadInvoiceFormData({
      grId: 'gr2',
      header: { customer_id: 'c1', customer_name: 'Example Traders', gr_id: 'gr2', gr_no: 'A0011' },
      items: [{ ...line('cccccccc', 0), temp_id: 'temp_1_0', one_time: false } as InvoiceItemData],
    }));

    expect(state.header.gr_id).toBe('gr2');
    expect(reason(state)).toBe('Agreed with the owner');
  });

  it('a new invoice has no reason until one is written, and keeps it afterwards', () => {
    let state = reducer(undefined, slice.loadInvoiceFormData({
      grId: 'gr1',
      header: { customer_id: 'c1', customer_name: 'Example Traders', gr_id: 'gr1', gr_no: 'A0010' },
      items: [{ ...line(FREE, 0), temp_id: 'edit_aaaaaaaa_0', one_time: false } as InvoiceItemData],
    }));
    expect(reason(state)).toBe('');
    expect(needed(state)).toBe(true);

    state = reducer(state, slice.updateHeader({ zero_charge_reason: 'Sample lot' }));
    state = setCharge(state, FREE, 4);
    state = setCharge(state, FREE, 0);
    expect(reason(state)).toBe('Sample lot');
    expect(needed(state)).toBe(false);
  });

  // A reason is about the goods of one GRN. In a new invoice it must not meet
  // the staff rule for the lines of the GRN chosen after it.
  describe('in a new invoice, when another GRN is chosen', () => {
    const grn = (grId: string, grNo: string, id: string) => slice.loadInvoiceFormData({
      grId,
      header: { customer_id: 'c1', customer_name: 'Example Traders', gr_id: grId, gr_no: grNo },
      items: [{ ...line(id, 0), temp_id: `temp_${id}_0`, one_time: false } as InvoiceItemData],
    });
    const withReasonForGrnA = () => {
      const state = reducer(undefined, grn('gr1', 'A0010', 'aaaaaaaa'));
      return reducer(state, slice.updateHeader({ zero_charge_reason: 'Sample lot' }));
    };

    it('the reason written for the GRN before is not carried over: staff are asked again', () => {
      const state = reducer(withReasonForGrnA(), grn('gr2', 'A0011', 'cccccccc'));

      expect(state.header.gr_id).toBe('gr2');
      expect(reason(state)).toBe('');
      expect(needed(state)).toBe(true);
      expect(needed(state, 'admin')).toBe(false);
    });

    it('the reason stays when the same GRN is loaded again', () => {
      const state = reducer(withReasonForGrnA(), grn('gr1', 'A0010', 'aaaaaaaa'));

      expect(reason(state)).toBe('Sample lot');
      expect(needed(state)).toBe(false);
    });

    it('the discount and its reason still stay with the form, as before', () => {
      let state = reducer(withReasonForGrnA(), slice.updateDiscount(25));
      state = reducer(state, slice.updateHeader({ discount_reason: 'Old customer' }));
      state = reducer(state, grn('gr2', 'A0011', 'cccccccc'));

      expect(state.header).toMatchObject({ discount: 25, discount_reason: 'Old customer' });
      expect(reason(state)).toBe('');
    });
  });

  it('is gone with the form when the form is reset', () => {
    const state = reducer(reducer(saved(), slice.updateHeader({ zero_charge_reason: 'typed' })), slice.resetForm());

    expect(state.header.zero_charge_reason ?? '').toBe('');
  });
});

// A group rate is one field: typing it sets that field on the group's lines
// and leaves the two others as they are. The form used to keep an average of
// the stored rates for every group and gave all three to every line with the
// first group edit, which made a free line of a stored invoice paid (and its
// neighbours cheaper) when only the tax was changed.
describe('a group rate on an invoice whose lines differ', () => {
  const slice: Slice = require('../invoiceFormSlice');
  const reducer = slice.default;
  const { hasZeroChargeLine } = require('@/utils/invoiceCalculations');

  const GROUP = 'i1:::M1';
  const line = (id: string, rates: { charge: number; labour_rate: number; tax: number }, mark = 'M1'): InvoiceItemData => ({
    temp_id: `edit_${id}_0`,
    disp_trl_id: `${id}-2222-4333-8444-555555555555`,
    grn_item_id: 'g1',
    item_id: 'i1',
    item_name: 'Example Potatoes',
    qty: 100,
    grn_original_qty: 100,
    package_mark: mark,
    rack: '',
    weight: 50,
    dispatch_id: 'd1',
    dispatch_no: 'I0001',
    dispatch_date: '2026-10-01',
    grn_id: 'gr1',
    grn_no: 'A0010',
    grn_date: '2026-09-01',
    duration: 1,
    no_of_days: 30,
    ...rates,
    amount: rates.charge * 100,
    labour_amount: rates.labour_rate * 100,
    tax_amount: 0,
    item_total: 0,
  });
  const header = {
    inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 42, customer_id: 'c1', customer_name: 'Example Traders',
    gr_id: 'gr1', gr_no: 'A0010', one_time_charge: false, discount: 0, zero_charge_reason: 'Sample lot',
    labour: 500, tax_amount: 0, total: 1000,
  };
  /** Stored: a free line with labour 2 and tax 5, a paid line (5) with labour 3 and tax 5, and a line of another group. */
  const saved = () =>
    reducer(undefined, slice.loadInvoiceEditData({
      invoiceId: 'inv-42',
      grId: 'gr1',
      header,
      items: [
        line('aaaaaaaa', { charge: 0, labour_rate: 2, tax: 5 }),
        line('bbbbbbbb', { charge: 5, labour_rate: 3, tax: 5 }),
        line('cccccccc', { charge: 7, labour_rate: 1, tax: 18 }, 'M2'),
      ],
    }));
  const rates = (state: ReturnType<typeof saved>) => state.items.map((item) => [item.charge, item.labour_rate, item.tax]);

  it('opening the invoice keeps no average as a group rate', () => {
    const state = saved();

    expect(state.bulkPricing).toEqual({});
    expect(rates(state)).toEqual([[0, 2, 5], [5, 3, 5], [7, 1, 18]]);
  });

  it('changing the group tax changes the tax only: the free line stays free and the reason stays', () => {
    const state = reducer(saved(), slice.bulkUpdateItemGroupPricing({ group_key: GROUP, pricing: { tax: 12 } }));

    expect(rates(state)).toEqual([[0, 2, 12], [5, 3, 12], [7, 1, 18]]);
    expect(hasZeroChargeLine(state.items)).toBe(true);
    expect(state.header.zero_charge_reason).toBe('Sample lot');
    expect(state.bulkPricing).toEqual({ [GROUP]: { tax: 12 } });
    // The amounts follow: 100 x 0 and 100 x 5 storage, 200 and 300 labour, 12% tax on each.
    expect(state.items[0]).toMatchObject({ amount: 0, labour_amount: 200, tax_amount: 24, item_total: 224 });
    expect(state.items[1]).toMatchObject({ amount: 500, labour_amount: 300, tax_amount: 96, item_total: 896 });
  });

  it('changing the group labour rate leaves the charges and the tax alone', () => {
    const state = reducer(saved(), slice.bulkUpdateItemGroupPricing({ group_key: GROUP, pricing: { labour_rate: 4 } }));

    expect(rates(state)).toEqual([[0, 4, 5], [5, 4, 5], [7, 1, 18]]);
  });

  it('changing the group charge gives that charge to every line of the group, and nothing else', () => {
    const state = reducer(saved(), slice.bulkUpdateItemGroupPricing({ group_key: GROUP, pricing: { charge: 6 } }));

    expect(rates(state)).toEqual([[6, 2, 5], [6, 3, 5], [7, 1, 18]]);
    // No line is free any more; the text stays in the form and is back if one becomes free again.
    expect(hasZeroChargeLine(state.items)).toBe(false);
    expect(state.header.zero_charge_reason).toBe('Sample lot');
  });

  it('group rates typed one after the other add up', () => {
    let state = reducer(saved(), slice.bulkUpdateItemGroupPricing({ group_key: GROUP, pricing: { tax: 12 } }));
    state = reducer(state, slice.bulkUpdateItemGroupPricing({ group_key: GROUP, pricing: { labour_rate: 4 } }));

    expect(state.bulkPricing).toEqual({ [GROUP]: { tax: 12, labour_rate: 4 } });
    expect(rates(state)).toEqual([[0, 4, 12], [5, 4, 12], [7, 1, 18]]);
  });

  it('a rate typed on a line itself is still kept when the group rate of that field changes', () => {
    let state = reducer(saved(), slice.updateEditedItem({ temp_id: 'edit_aaaaaaaa_0', values: { tax: 0 } }));
    state = reducer(state, slice.bulkUpdateItemGroupPricing({ group_key: GROUP, pricing: { tax: 12 } }));

    expect(rates(state)).toEqual([[0, 2, 0], [5, 3, 12], [7, 1, 18]]);
  });

  it('all three at once still works (a price taken from the price list)', () => {
    const state = reducer(saved(), slice.bulkUpdateItemGroupPricing({ group_key: GROUP, pricing: { charge: 4, labour_rate: 1, tax: 0 } }));

    expect(rates(state)).toEqual([[4, 1, 0], [4, 1, 0], [7, 1, 18]]);
  });
});

describe('saved rates applied from the rate form', () => {
  const slice: Slice = require('../invoiceFormSlice');
  const reducer = slice.default;
  const base = (id: string, mark: string, weight: number): InvoiceItemData => ({
    temp_id: id, disp_trl_id: id, grn_item_id: `g-${id}`, item_id: 'i1', item_name: 'Example Potatoes', qty: 10,
    grn_original_qty: 10, package_mark: mark, rack: '', weight, dispatch_id: `d-${id}`, dispatch_no: 'I1',
    dispatch_date: '2026-10-01', grn_id: 'gr1', grn_no: 'A1', grn_date: '2026-09-01', duration: 1, no_of_days: 30,
    charge: 10, labour_rate: 2, tax: 5, amount: 100, labour_amount: 20, tax_amount: 6, item_total: 126,
  });
  const loaded = () =>
    reducer(
      undefined,
      slice.loadInvoiceFormData({ header: { gr_id: 'gr1', gr_no: 'A1' }, items: [base('L1', 'M1', 50), base('L2', 'M1', 50), base('L3', 'M2', 50)], grId: 'gr1' })
    );

  it('leaves the lines open to a later group rate (no override mark) and drops the stale group rate', () => {
    let state = reducer(loaded(), slice.bulkUpdateItemGroupPricing({ group_key: 'i1:::M1', pricing: { charge: 9 } }));
    state = reducer(state, slice.applySavedRates([
      { temp_id: 'L1', charge: 12, labour_rate: 2, tax: 5 },
      { temp_id: 'L2', charge: 12, labour_rate: 2, tax: 5 },
    ]));
    expect(state.items.find(i => i.temp_id === 'L1')?.charge).toBe(12);
    expect(state.itemOverrides.L1).toBeUndefined();
    expect(state.bulkPricing['i1:::M1']?.charge).toBeUndefined();

    state = reducer(state, slice.bulkUpdateItemGroupPricing({ group_key: 'i1:::M1', pricing: { charge: 11 } }));
    expect(state.items.filter(i => i.package_mark === 'M1').map(i => i.charge)).toEqual([11, 11]);
  });

  it('keeps a rate typed on a line, including a charge of 0', () => {
    let state = reducer(loaded(), slice.updateEditedItem({ temp_id: 'L3', values: { charge: 0 } }));
    state = reducer(state, slice.applySavedRates([
      { temp_id: 'L1', charge: 12, labour_rate: 3, tax: 5 },
      { temp_id: 'L3', charge: 12, labour_rate: 3, tax: 5 },
    ]));
    const l3 = state.items.find(i => i.temp_id === 'L3')!;
    expect(l3.charge).toBe(0);
    expect(l3.labour_rate).toBe(3);
    expect(state.items.find(i => i.temp_id === 'L1')?.charge).toBe(12);
  });
});
