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
import invoiceFormReducer, { applyServerDurations, loadInvoiceEditData, resetForm, loadInvoiceFormData, updateEditedItem } from '@/store/slices/invoiceFormSlice';
import { checkGrnStillInvoiceable, createInvoice, loadInvoiceData, updateInvoice } from '@/features/invoice/services/invoiceFormService';
import { validateNewInvoice } from '@/features/invoice/schemas/invoiceValidation';
import { showAlert } from '@/utils/alert';
import { useInvoiceForm, type InvoiceFormMode, type UseInvoiceFormReturn } from '../useInvoiceForm';

// react-redux is not transformed for jest here, so the store is bound by hand.
let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppStore: () => mockStore,
    useAppSelector: (selector: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
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
  // A new invoice is checked with the number's ceiling (backend migration 73).
  validateNewInvoiceStep1: jest.fn(async () => ({ isValid: true, errors: {} })),
  validateNewInvoice: jest.fn(async () => ({ isValid: true, errors: {} })),
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
    latest.current = useInvoiceForm({ mode, step: 3 });
    return null;
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  return { form: () => latest.current!, store, unmount: () => act(async () => { tree.unmount(); }) };
}
const submit = async (form: () => UseInvoiceFormReturn) => {
  let result!: Awaited<ReturnType<UseInvoiceFormReturn['submitForm']>>;
  await act(async () => { result = await form().submitForm(); });
  return result as Exclude<typeof result, 'busy'>;
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
    jest.mocked(validateNewInvoice).mockResolvedValueOnce({ isValid: false, errors: { discount: 'Discount is too large' } });
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
    expect(updateInvoice).toHaveBeenCalledWith(
      INVOICE,
      expect.objectContaining({ items: [expect.objectContaining({ disp_trl_id: 'd1' })] }),
      expect.stringMatching(/^warehouse-invoice-update-/)
    );
    expect(result.success).toBe(true);
    await unmount();
  });
});

// Owner decision 3 of 2026-10-11: the reason for a zero charge goes to the
// service as the form holds it; the service trims it and sends it only with a
// free line (invoiceZeroChargeReason.test.ts).
describe('the reason for a zero charge in the save', () => {
  /** A new invoice with the one line of the fixture, as the form holds it after a GRN is chosen. */
  async function mountNew() {
    const mounted = await mount('create');
    await act(async () => {
      mounted.store.dispatch(resetForm());
      mounted.store.dispatch(loadInvoiceFormData({ header: { ...header, inv_no: undefined } as never, items: [line as never], grId: GRN }));
    });
    return mounted;
  }
  beforeEach(() => {
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
    jest.mocked(createInvoice).mockResolvedValue({ success: true, data: { invoice_id: INVOICE, invoice_no: 12, total: 235 } } as never);
  });
  const sentHeader = () => jest.mocked(createInvoice).mock.calls[0][0].header;

  it('is what the user wrote on the review step, with the line at a charge of 0', async () => {
    const { form, store, unmount } = await mountNew();
    await act(async () => { store.dispatch(updateEditedItem({ temp_id: 't1', values: { charge: 0 } })); });
    await act(async () => { form().updateHeaderField('zero_charge_reason', 'Sample lot'); });

    expect((await submit(form)).success).toBe(true);

    expect(sentHeader().zero_charge_reason).toBe('Sample lot');
    expect(jest.mocked(createInvoice).mock.calls[0][0].items[0].charge).toBe(0);
    await unmount();
  });

  it('is empty when nothing was written', async () => {
    const { form, store, unmount } = await mountNew();
    await act(async () => { store.dispatch(updateEditedItem({ temp_id: 't1', values: { charge: 0 } })); });

    await submit(form);

    expect(sentHeader().zero_charge_reason ?? '').toBe('');
    await unmount();
  });
});

// Wave B (owner decisions D1 and D18): a save the server refused for a changed record or a changed total.
describe('a refusal for a changed record or a changed total', () => {
  const refused = (reason: string, fields: Record<string, unknown>, message = 'Refused in English') =>
    ({ success: false, message, error: message, refusal: { reason, fields, text: message } }) as never;
  const serverLines = [{ disp_trl_id: 'd1', duration: 1.5, no_of_days: 45 }];
  /** The total the form works out from the server's durations: what a server that agrees with them would answer. */
  const totalWithServerDurations = () => {
    const scratch = makeStore();
    scratch.dispatch(loadInvoiceEditData({ invoiceId: INVOICE, grId: GRN, header: header as never, items: [line as never] }));
    scratch.dispatch(applyServerDurations(serverLines));
    return scratch.getState().invoiceForm.header.total;
  };

  it('STALE_RECORD on an edit: nothing is changed in the form, the screen is told it is stale', async () => {
    jest.mocked(updateInvoice).mockResolvedValue(refused('STALE_RECORD', { updated_at: '2026-10-20T10:00:00Z' }, 'The invoice was changed by someone else.'));
    const { form, store, unmount } = await mount('edit');
    const before = JSON.stringify(store.getState().invoiceForm.items);
    const onFailure = jest.fn();

    let result!: Awaited<ReturnType<UseInvoiceFormReturn['submitForm']>>;
    await act(async () => { result = await form().submitForm(onFailure); });

    expect(result).toEqual({ success: false, error: 'The invoice was changed by someone else.' });
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][2]).toEqual({ stale: true });
    expect(JSON.stringify(store.getState().invoiceForm.items)).toBe(before);
    expect(store.getState().invoiceForm.is_saving).toBe(false);
    await unmount();
  });

  it('STALE_RECORD on a new invoice is no stale record: it is an ordinary failure', async () => {
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
    jest.mocked(createInvoice).mockResolvedValue(refused('STALE_RECORD', {}, 'Refused in English'));
    const { form, unmount } = await mount('create');
    const onFailure = jest.fn();

    await act(async () => { await form().submitForm(onFailure); });

    expect(onFailure.mock.calls[0][2]).toBeUndefined();
    await unmount();
  });

  it('TOTAL_CHANGED within 1 of what the form works out: the server durations go on the line, the typed figures stay, the new total is named', async () => {
    const serverTotal = totalWithServerDurations();
    expect(serverTotal).not.toBe(header.total);
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
    jest.mocked(createInvoice).mockResolvedValue(refused('TOTAL_CHANGED', { current_total: serverTotal, expected_total: header.total, lines: serverLines }));
    const { form, store, unmount } = await mount('create');
    const onFailure = jest.fn();

    let result!: Awaited<ReturnType<UseInvoiceFormReturn['submitForm']>>;
    await act(async () => { result = await form().submitForm(onFailure); });

    const [saved] = store.getState().invoiceForm.items;
    expect(saved).toMatchObject({ duration: 1.5, no_of_days: 45, charge: 5, labour_rate: 2, tax: 5 });
    expect(store.getState().invoiceForm.header.total).toBe(serverTotal);
    expect(onFailure.mock.calls[0][2]).toEqual({ totalChanged: true });
    expect(onFailure.mock.calls[0][1]).toMatch(/^The total is now ₹.*, not ₹735\.00\. Review the figures and save again\.$/);
    expect(result).toMatchObject({ success: false });
    expect(createInvoice).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('TOTAL_CHANGED that the form cannot reach on a new invoice asks to reload the lines', async () => {
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
    jest.mocked(createInvoice).mockResolvedValue(refused('TOTAL_CHANGED', { current_total: 99999, expected_total: header.total, lines: serverLines }));
    const { form, unmount } = await mount('create');
    const onFailure = jest.fn();

    let result!: Awaited<ReturnType<UseInvoiceFormReturn['submitForm']>>;
    await act(async () => { result = await form().submitForm(onFailure); });

    expect(result).toMatchObject({ success: false, reloadLines: true });
    expect(onFailure.mock.calls[0][2]).toEqual({ reloadLines: true });
    await unmount();
  });

  it('TOTAL_CHANGED that the form cannot reach on an edit is treated as a stale record', async () => {
    jest.mocked(updateInvoice).mockResolvedValue(refused('TOTAL_CHANGED', { current_total: 99999, expected_total: header.total, lines: serverLines }, 'The total is now 99999'));
    const { form, unmount } = await mount('edit');
    const onFailure = jest.fn();

    await act(async () => { await form().submitForm(onFailure); });

    expect(onFailure.mock.calls[0][2]).toEqual({ stale: true });
    await unmount();
  });

  it('TOTAL_CHANGED without a total is no total refusal: an ordinary failure', async () => {
    jest.mocked(updateInvoice).mockResolvedValue(refused('TOTAL_CHANGED', {}, 'Refused in English'));
    const { form, unmount } = await mount('edit');
    const onFailure = jest.fn();

    await act(async () => { await form().submitForm(onFailure); });

    expect(onFailure.mock.calls[0][2]).toBeUndefined();
    await unmount();
  });
});

describe('"Open it again" after a stale record', () => {
  it('reads the invoice again and replaces the form with it, with its version', async () => {
    jest.mocked(loadInvoiceData).mockResolvedValue({
      success: true,
      data: { header: { ...header, discount: 25, gr_id: GRN }, items: [{ ...line, qty: 60 }], updated_at: '2026-10-20T11:00:00Z' },
    } as never);
    const { form, store, unmount } = await mount('edit');

    let reloaded!: boolean;
    await act(async () => { reloaded = await form().reloadInvoice(); });

    expect(reloaded).toBe(true);
    expect(loadInvoiceData).toHaveBeenCalledWith(INVOICE);
    expect(store.getState().invoiceForm.items[0].qty).toBe(60);
    expect(store.getState().invoiceForm.header.discount).toBe(25);
    await unmount();
  });

  it('keeps the form and says so when the read fails', async () => {
    jest.mocked(loadInvoiceData).mockResolvedValue({ success: false, message: 'Request timeout' } as never);
    const { form, store, unmount } = await mount('edit');

    let reloaded!: boolean;
    await act(async () => { reloaded = await form().reloadInvoice(); });

    expect(reloaded).toBe(false);
    expect(store.getState().invoiceForm.items[0].qty).toBe(100);
    expect(showAlert).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('does nothing on a new invoice', async () => {
    const { form, unmount } = await mount('create');
    let reloaded!: boolean;
    await act(async () => { reloaded = await form().reloadInvoice(); });
    expect(reloaded).toBe(false);
    expect(loadInvoiceData).not.toHaveBeenCalled();
    await unmount();
  });
});
