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
