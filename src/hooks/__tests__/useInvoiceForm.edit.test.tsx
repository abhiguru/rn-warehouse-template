/**
 * useInvoiceForm({ mode, step }) on an invoice being edited, and the rules the
 * two modes share: the number cap, the screen's own step, one save at a time,
 * and the move into another financial year.
 *
 * The real validation schemas run, on a real invoice-form slice; the server
 * calls and the router are mocked.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { router } from 'expo-router';
import { setCurrentStep } from '@/store/slices/invoiceFormSlice';
import {
  checkGrnStillInvoiceable,
  createInvoice,
  getNextInvoiceNumber,
  updateInvoice,
} from '@/features/invoice/services/invoiceFormService';
import { showAlert } from '@/utils/alert';
import {
  invoiceHeader,
  invoiceLine,
  makeInvoiceStore,
  openForEdit,
  fillNewInvoice,
  type InvoiceStore,
} from '@/tests/helpers/invoiceFixtures';
import { useInvoiceForm, type InvoiceFormMode, type UseInvoiceFormReturn } from '../useInvoiceForm';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getNextInvoiceNumber: jest.fn(),
  loadInvoiceFormData: jest.fn(),
  loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn(async () => true) }));

const nextNumber = jest.mocked(getNextInvoiceNumber);
const answer = (number: number, finYear: string) =>
  ({ success: true, data: { next_invoice_number: number, financial_year: finYear } });

/** A promise the test settles when it wants. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mount(mode: InvoiceFormMode, step: number, prepare: (store: InvoiceStore) => void) {
  const store = makeInvoiceStore();
  prepare(store);
  mockStore = store;
  const latest: { current: UseInvoiceFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useInvoiceForm({ mode, step });
    return null;
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  return {
    form: () => latest.current!,
    header: () => store.getState().invoiceForm.header,
    store,
    unmount: () => act(async () => { tree.unmount(); }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  nextNumber.mockReset();
  nextNumber.mockImplementation(async (finYear: string) => answer(finYear === '2025-26' ? 1210 : 55, finYear));
  jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
});

describe('the invoice number cap in an edit', () => {
  const edit = (invNo: number) => (store: InvoiceStore) => openForEdit(store, [invoiceLine()], { inv_no: invNo });

  it('keeps a 9-digit number the invoice was saved with: it is not refused when the number did not change', async () => {
    const { form, unmount } = await mount('edit', 1, edit(123456789));

    const check = await form().validateCurrentStep(1);

    expect(check.isValid).toBe(true);
    await unmount();
  });

  it('refuses a changed number above 99999999, with the range message on the number field', async () => {
    const { form, unmount } = await mount('edit', 1, edit(123456789));
    await act(async () => { form().updateHeaderField('inv_no', 100000000); });

    let check!: Awaited<ReturnType<UseInvoiceFormReturn['validateCurrentStep']>>;
    await act(async () => { check = await form().validateCurrentStep(1); });

    expect(check.isValid).toBe(false);
    expect(check.errors.inv_no).toBe('Invoice number must be between 1 and 99999999');
    expect(form().validationErrors.inv_no).toBe(check.errors.inv_no);
    await unmount();
  });

  it('accepts a changed number inside the range', async () => {
    const { form, unmount } = await mount('edit', 1, edit(123456789));
    await act(async () => { form().updateHeaderField('inv_no', 99999999); });

    const check = await form().validateCurrentStep(1);

    expect(check.isValid).toBe(true);
    await unmount();
  });

  it('saves an invoice that keeps its 9-digit number', async () => {
    jest.mocked(updateInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'inv-42', invoice_no: 123456789, total: 735 } } as never);
    const { form, unmount } = await mount('edit', 3, edit(123456789));

    let result: Awaited<ReturnType<UseInvoiceFormReturn['submitForm']>> = 'busy';
    await act(async () => { result = await form().submitForm(); });

    expect(result).toMatchObject({ success: true });
    expect(updateInvoice).toHaveBeenCalledWith(
      'inv-42',
      expect.objectContaining({ header: expect.objectContaining({ inv_no: 123456789 }) }),
      expect.stringMatching(/^warehouse-invoice-update-/)
    );
    await unmount();
  });

  it('refuses a save with a changed number above the cap, and sends nothing', async () => {
    const { form, unmount } = await mount('edit', 3, edit(123456789));
    await act(async () => { form().updateHeaderField('inv_no', 100000000); });

    await act(async () => { await form().submitForm(); });

    expect(updateInvoice).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Check the invoice', expect.stringContaining('between 1 and 99999999'));
    await unmount();
  });
});

describe('the screen\'s own step', () => {
  it('checks step 1 when going on from step 1, although the slice says the form is on step 3', async () => {
    const { form, store, unmount } = await mount('edit', 1, (s) => openForEdit(s, [invoiceLine()], { customer_id: 'not-a-uuid' }));
    await act(async () => { store.dispatch(setCurrentStep(3)); });

    let result = '';
    await act(async () => { result = await form().navigateToStep(2); });

    // Compared with the slice's step 3 the move would have been "back", unchecked.
    expect(result).toBe('invalid');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Check the invoice', expect.any(String));
    await unmount();
  });

  it('does not check step 1 from step 2, although the slice says the form is on step 1', async () => {
    const { form, store, unmount } = await mount('edit', 2, (s) => openForEdit(s, [invoiceLine()], { customer_id: 'not-a-uuid' }));
    await act(async () => { store.dispatch(setCurrentStep(1)); });

    let result = '';
    await act(async () => { result = await form().navigateToStep(3); });

    expect(result).toBe('ok');
    expect(router.navigate).toHaveBeenCalledWith('/invoice-edit/inv-42/step3');
    await unmount();
  });

  it('goes back with dismissTo, unchecked, even from a slice that says step 1', async () => {
    const { form, store, unmount } = await mount('edit', 3, (s) => openForEdit(s, [invoiceLine()], { customer_id: 'not-a-uuid' }));
    await act(async () => { store.dispatch(setCurrentStep(1)); });

    await act(async () => { await form().navigateToStep(2); });

    expect(router.dismissTo).toHaveBeenCalledWith('/invoice-edit/inv-42/step2');
    expect(router.navigate).not.toHaveBeenCalled();
    await unmount();
  });

  it('keeps the slice\'s step to the screen in front', async () => {
    const { store, unmount } = await mount('edit', 2, (s) => openForEdit(s));

    expect(store.getState().invoiceForm.currentStep).toBe(2);
    await unmount();
  });

  it('says there is no GRN yet, instead of a field message, when step 1 has no lines', async () => {
    const { form, unmount } = await mount('create', 1, () => {});

    let result = '';
    await act(async () => { result = await form().navigateToStep(2); });

    expect(result).toBe('noItems');
    expect(showAlert).not.toHaveBeenCalled();
    await unmount();
  });
});

describe('saving twice', () => {
  it('sends one update when the second tap comes while the first is still being sent', async () => {
    const sending = deferred<unknown>();
    jest.mocked(updateInvoice).mockReturnValue(sending.promise as never);
    const { form, store, unmount } = await mount('edit', 3, (s) => openForEdit(s));

    let first!: Promise<unknown>;
    let second: unknown;
    await act(async () => {
      first = form().submitForm();
      second = await form().submitForm();
    });
    expect(second).toBe('busy');
    expect(store.getState().invoiceForm.is_saving).toBe(true);
    await act(async () => { sending.resolve({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 735 } }); await first; });

    expect(updateInvoice).toHaveBeenCalledTimes(1);
    expect(store.getState().invoiceForm.is_saving).toBe(false);
    await unmount();
  });

  it('sends one new invoice when the second tap comes while the GRN is still being checked', async () => {
    const checking = deferred<{ ok: boolean }>();
    jest.mocked(checkGrnStillInvoiceable).mockReturnValue(checking.promise as never);
    jest.mocked(createInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'new-1', invoice_no: 55, total: 735 } } as never);
    const { form, unmount } = await mount('create', 3, (s) => {
      fillNewInvoice(s);
      s.dispatch({ type: 'invoiceForm/updateHeader', payload: { inv_no: 55, inv_date: '2026-10-05' } });
    });

    let first!: Promise<unknown>;
    let second: unknown;
    await act(async () => {
      first = form().submitForm();
      // The first call has not yet got an answer from the server about the GRN.
      second = await form().submitForm();
    });
    expect(second).toBe('busy');
    await act(async () => { checking.resolve({ ok: true }); await first; });

    expect(createInvoice).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('is free again after a refused save, so a corrected form can be saved', async () => {
    jest.mocked(updateInvoice).mockResolvedValueOnce({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'No' } as never);
    jest.mocked(updateInvoice).mockResolvedValueOnce({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 735 } } as never);
    const { form, unmount } = await mount('edit', 3, (s) => openForEdit(s));

    let first: unknown;
    let second: unknown;
    await act(async () => { first = await form().submitForm(); });
    await act(async () => { second = await form().submitForm(); });

    expect(first).toMatchObject({ success: false });
    expect(second).toMatchObject({ success: true });
    await unmount();
  });
});

describe('the financial year of an edit', () => {
  const prepare = (store: InvoiceStore) =>
    openForEdit(store, [invoiceLine()], invoiceHeader({ inv_date: '2026-10-05', inv_no: 42 }));

  it('asks for the next number of the other year first; the date stays as it was until the number is known and the move is confirmed', async () => {
    const forLastYear = deferred<ReturnType<typeof answer>>();
    nextNumber.mockReturnValueOnce(forLastYear.promise as never);
    const { form, header, unmount } = await mount('edit', 1, prepare);

    await act(async () => { form().updateHeaderField('inv_date', '2026-03-31'); });

    expect(nextNumber.mock.calls).toEqual([['2025-26']]);
    // Nothing changes while the number is on its way: the saved date, year and number stay.
    expect(header()).toMatchObject({ inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 42 });
    await act(async () => { forLastYear.resolve(answer(1210, '2025-26')); });
    expect(header()).toMatchObject({ inv_date: '2026-03-31', inv_fin_year: '2025-26', inv_no: 1210 });
    expect(form().isGettingNextNumber).toBe(false);
    await unmount();
  });

  it('gives the saved number back when the date returns to the saved year, and asks nothing more', async () => {
    const { form, header, unmount } = await mount('edit', 1, prepare);
    await act(async () => { form().updateHeaderField('inv_date', '2026-03-31'); });
    expect(header().inv_no).toBe(1210);

    await act(async () => { form().updateHeaderField('inv_date', '2026-10-06'); });

    expect(header()).toMatchObject({ inv_fin_year: '2026-27', inv_no: 42 });
    expect(nextNumber).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('keeps a number the person typed when the date moves to another year', async () => {
    const { form, header, unmount } = await mount('edit', 1, prepare);
    await act(async () => { form().updateHeaderField('inv_no', 7301); });

    await act(async () => { form().updateHeaderField('inv_date', '2026-03-31'); });

    expect(nextNumber).not.toHaveBeenCalled();
    expect(header()).toMatchObject({ inv_fin_year: '2025-26', inv_no: 7301 });
    await unmount();
  });

  it('asks for a typed number when the other year has none to give', async () => {
    nextNumber.mockResolvedValue({ success: false, message: 'none' } as never);
    const { form, header, unmount } = await mount('edit', 1, prepare);

    await act(async () => { form().updateHeaderField('inv_date', '2026-03-31'); });

    expect(form().nextNumberFailed).toBe(true);
    expect(header().inv_no).toBe(0);
    // The empty number is refused by the check, in words.
    let check!: Awaited<ReturnType<UseInvoiceFormReturn['validateCurrentStep']>>;
    await act(async () => { check = await form().validateCurrentStep(1); });
    expect(check.errors.inv_no).toBeDefined();
    await unmount();
  });

  it('holds Next while the number of the other year is on its way', async () => {
    const forLastYear = deferred<ReturnType<typeof answer>>();
    // The question's own lookup fails, so "Move invoice" asks for the number as before, and that answer is slow.
    nextNumber.mockResolvedValueOnce({ success: false, message: 'none' } as never).mockReturnValueOnce(forLastYear.promise as never);
    const { form, unmount } = await mount('edit', 1, prepare);
    await act(async () => { form().updateHeaderField('inv_date', '2026-03-31'); });

    let result = '';
    await act(async () => { result = await form().navigateToStep(2); });

    expect(result).toBe('busy');
    expect(router.navigate).not.toHaveBeenCalled();
    await act(async () => { forLastYear.resolve(answer(1210, '2025-26')); });
    await unmount();
  });
});

describe('the changed flag of an edit', () => {
  it('follows the form against the saved invoice', async () => {
    const { form, unmount } = await mount('edit', 1, (s) => openForEdit(s));
    expect(form().getIsChanged()).toBe(false);

    await act(async () => { form().updateDiscountAmount(10); });
    expect(form().getIsChanged()).toBe(true);

    await act(async () => { form().updateDiscountAmount(0); });
    expect(form().getIsChanged()).toBe(false);
    await unmount();
  });
});
