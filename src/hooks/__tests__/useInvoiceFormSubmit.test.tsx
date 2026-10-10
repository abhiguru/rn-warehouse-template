/**
 * Saving from the invoice form hook.
 *
 * RF-13: a new invoice asks the server once more whether its GRN can still be
 * invoiced before save_invoice is sent. The question itself is tested with the
 * service (invoiceSaveRefusals.test.ts); this is the wiring: a refusal stops
 * the save, and an existing invoice is not asked.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import invoiceFormReducer, { loadInvoiceEditData } from '@/store/slices/invoiceFormSlice';
import { checkGrnStillInvoiceable, createInvoice, updateInvoice } from '@/features/invoice/services/invoiceFormService';
import { validateFullInvoice } from '@/features/invoice/schemas/invoiceValidation';
import { showAlert } from '@/utils/alert';
import { useInvoiceForm, type InvoiceFormMode, type UseInvoiceFormReturn } from '../useInvoiceForm';

// react-redux is not transformed for jest here, so the store is bound by hand.
let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getNextInvoiceNumber: jest.fn(async () => ({ success: true, data: { next_invoice_no: 12 } })),
  loadInvoiceFormData: jest.fn(),
  loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/features/invoice/schemas/invoiceValidation', () => ({
  validateStep1: jest.fn(async () => ({ isValid: true, errors: {} })),
  validateStep2: jest.fn(async () => ({ isValid: true, errors: {} })),
  validateFullInvoice: jest.fn(async () => ({ isValid: true, errors: {} })),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const INVOICE = '11111111-2222-4333-8444-555555555555';
const GRN = '22222222-2222-4333-8444-555555555555';
const header = {
  inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 12, customer_id: 'c1', customer_name: 'Example Traders',
  gr_id: GRN, gr_no: 'A0010', one_time_charge: false, discount: 0, discount_reason: '', labour: 200, tax_amount: 35, total: 735,
};
const line = {
  temp_id: 't1', disp_trl_id: 'd1', grn_item_id: 'gi', item_id: 'item', item_name: 'Example Potatoes', qty: 100,
  grn_original_qty: 100, package_mark: 'FIX', rack: 'A1', weight: 50, dispatch_id: 'd', dispatch_no: 'I0001',
  dispatch_date: '2026-10-01', grn_id: GRN, grn_no: 'A0010', grn_date: '2026-04-01', duration: 1, no_of_days: 30,
  charge: 5, labour_rate: 2, tax: 5, amount: 500, labour_amount: 200, tax_amount: 35, item_total: 735,
};

function makeStore() {
  return configureStore({ reducer: { invoiceForm: invoiceFormReducer, auth: () => ({ userProfile: null }) } });
}

/** A form holding one invoice with one line; `mode` decides whether the hook treats it as new. */
async function mount(mode: InvoiceFormMode) {
  const store = makeStore();
  store.dispatch(loadInvoiceEditData({ invoiceId: INVOICE, grId: GRN, header: header as never, items: [line as never] }));
  mockStore = store;
  const latest: { current: UseInvoiceFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useInvoiceForm({ mode, invoiceIdParam: mode === 'edit' ? INVOICE : undefined });
    return null;
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  return { form: () => latest.current!, store, unmount: () => act(async () => { tree.unmount(); }) };
}
const submit = async (form: () => UseInvoiceFormReturn) => {
  let result!: Awaited<ReturnType<UseInvoiceFormReturn['submitForm']>>;
  await act(async () => { result = await form().submitForm(); });
  return result;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('saving a new invoice', () => {
  it('does not send the save when the GRN can no longer be invoiced, and says why', async () => {
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: false, message: 'This GRN has already been invoiced.' });
    const { form, store, unmount } = await mount('create');

    const result = await submit(form);

    expect(checkGrnStillInvoiceable).toHaveBeenCalledWith(GRN, [expect.objectContaining({ disp_trl_id: 'd1', qty: 100 })]);
    expect(createInvoice).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'This GRN has already been invoiced.' });
    expect(showAlert).toHaveBeenCalledWith(expect.any(String), 'This GRN has already been invoiced.');
    // The form is free again for another try.
    expect(store.getState().invoiceForm.is_saving).toBe(false);
    await unmount();
  });

  it('sends the save once the GRN is confirmed, and returns the stored total', async () => {
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
    jest.mocked(createInvoice).mockResolvedValue({ success: true, data: { invoice_id: INVOICE, invoice_no: 12, total: 735 } } as never);
    const { form, unmount } = await mount('create');

    const result = await submit(form);

    expect(jest.mocked(checkGrnStillInvoiceable).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(createInvoice).mock.invocationCallOrder[0]);
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, invoiceId: INVOICE, invoiceNo: 12, total: 735 });
    await unmount();
  });

  it('does not ask the server anything when the form itself is not valid', async () => {
    jest.mocked(validateFullInvoice).mockResolvedValueOnce({ isValid: false, errors: { discount: 'Discount is too large' } });
    const { form, unmount } = await mount('create');

    expect((await submit(form)).success).toBe(false);
    expect(checkGrnStillInvoiceable).not.toHaveBeenCalled();
    expect(createInvoice).not.toHaveBeenCalled();
    await unmount();
  });
});

describe('saving an existing invoice', () => {
  it('is not asked whether its own GRN can be invoiced (it already holds it)', async () => {
    jest.mocked(updateInvoice).mockResolvedValue({ success: true, data: { invoice_id: INVOICE, invoice_no: 12, total: 735 } } as never);
    const { form, unmount } = await mount('edit');

    const result = await submit(form);

    expect(checkGrnStillInvoiceable).not.toHaveBeenCalled();
    expect(updateInvoice).toHaveBeenCalledWith(INVOICE, expect.objectContaining({ items: [expect.objectContaining({ disp_trl_id: 'd1' })] }));
    expect(result.success).toBe(true);
    await unmount();
  });
});
