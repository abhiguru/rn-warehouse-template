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
