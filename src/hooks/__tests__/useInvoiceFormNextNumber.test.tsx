/**
 * The suggested invoice number of a new invoice (owner decision 2 of
 * 2026-10-11): it belongs to the financial year of the invoice date, so it is
 * asked for again when the date moves to another financial year. A number the
 * user typed is never replaced.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import invoiceFormReducer, { loadInvoiceEditData, loadInvoiceFormData, updateHeader } from '@/store/slices/invoiceFormSlice';
import { getNextInvoiceNumber } from '@/features/invoice/services/invoiceFormService';
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
  getNextInvoiceNumber: jest.fn(),
  loadInvoiceFormData: jest.fn(),
  loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const INVOICE = '11111111-2222-4333-8444-555555555555';
const nextNumber = jest.mocked(getNextInvoiceNumber);
const answer = (number: number, finYear: string) =>
  ({ success: true, data: { next_invoice_number: number, financial_year: finYear } });
const refusal = (finYear: string) =>
  ({ success: false, data: { next_invoice_number: 1, financial_year: finYear }, message: "Couldn't get the next invoice number" });

/** The next number of each financial year on the pretend server. */
const SERVER: Record<string, number> = { '2026-27': 55, '2025-26': 1210, '2024-25': 3 };

function makeStore() {
  return configureStore({ reducer: { invoiceForm: invoiceFormReducer, auth: () => ({ userProfile: null }) } });
}

/** A new invoice dated 5 October 2026 (financial year 2026-27), as the form opens. */
async function mount(mode: InvoiceFormMode = 'create', prepare?: (store: ReturnType<typeof makeStore>) => void) {
  const store = makeStore();
  store.dispatch(updateHeader({ inv_date: '2026-10-05' }));
  prepare?.(store);
  mockStore = store;
  const latest: { current: UseInvoiceFormReturn | null } = { current: null };
  const Harness = () => {
    latest.current = useInvoiceForm({ mode, invoiceIdParam: mode === 'edit' ? INVOICE : undefined });
    return null;
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Harness />); });
  const form = () => latest.current!;
  return {
    form,
    header: () => store.getState().invoiceForm.header,
    pickDate: (date: string) => act(async () => { form().updateHeaderField('inv_date', date); }),
    typeNumber: (number: number) => act(async () => { form().updateHeaderField('inv_no', number); }),
    unmount: () => act(async () => { tree.unmount(); }),
  };
}

/** A promise the test settles when it wants, to put answers in an order. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  nextNumber.mockImplementation(async (finYear: string) => answer(SERVER[finYear], finYear));
});
afterEach(() => jest.restoreAllMocks());

describe('the suggested number of a new invoice', () => {
  it('is asked for the financial year of the invoice date when the form opens', async () => {
    const { header, form, unmount } = await mount();

    expect(nextNumber.mock.calls).toEqual([['2026-27']]);
    expect(header()).toMatchObject({ inv_no: 55, inv_fin_year: '2026-27' });
    expect(form().nextNumberFailed).toBe(false);
    await unmount();
  });

  it('is asked for again when the date crosses 31 March / 1 April, in both directions', async () => {
    const { header, pickDate, unmount } = await mount();

    // 1 April 2026 is the first day of 2026-27: same year, nothing is asked.
    await pickDate('2026-04-01');
    expect(nextNumber).toHaveBeenCalledTimes(1);
    expect(header().inv_no).toBe(55);

    // 31 March 2026 is the last day of 2025-26.
    await pickDate('2026-03-31');
    expect(nextNumber.mock.calls).toEqual([['2026-27'], ['2025-26']]);
    expect(header()).toMatchObject({ inv_date: '2026-03-31', inv_fin_year: '2025-26', inv_no: 1210 });

    await pickDate('2026-04-01');
    expect(nextNumber.mock.calls).toEqual([['2026-27'], ['2025-26'], ['2026-27']]);
    expect(header()).toMatchObject({ inv_date: '2026-04-01', inv_fin_year: '2026-27', inv_no: 55 });
    await unmount();
  });

  it('is not asked for again while the date stays in the same financial year', async () => {
    const { header, pickDate, unmount } = await mount();

    await pickDate('2026-06-15');
    await pickDate('2027-03-31');

    expect(nextNumber).toHaveBeenCalledTimes(1);
    expect(header()).toMatchObject({ inv_fin_year: '2026-27', inv_no: 55 });
    await unmount();
  });

  it('keeps a number the user typed when the date moves to another financial year', async () => {
    const { header, pickDate, typeNumber, unmount } = await mount();
    await typeNumber(7301);

    await pickDate('2026-03-31');

    expect(nextNumber).toHaveBeenCalledTimes(1);
    expect(header()).toMatchObject({ inv_fin_year: '2025-26', inv_no: 7301 });
    await unmount();
  });

  it('keeps a typed number that happens to equal the suggestion', async () => {
    const { header, pickDate, typeNumber, unmount } = await mount();
    await typeNumber(55);

    await pickDate('2026-03-31');

    expect(nextNumber).toHaveBeenCalledTimes(1);
    expect(header().inv_no).toBe(55);
    await unmount();
  });

  it('keeps the typed number when a GRN is chosen afterwards', async () => {
    const { header, pickDate, typeNumber, unmount } = await mount();
    await typeNumber(7301);
    await act(async () => {
      mockStore.dispatch(loadInvoiceFormData({ header: { customer_id: 'c1', customer_name: 'Example Traders', gr_id: 'g1', gr_no: 'A0010' }, items: [], grId: 'g1' }));
    });

    await pickDate('2026-03-31');

    expect(nextNumber).toHaveBeenCalledTimes(1);
    expect(header().inv_no).toBe(7301);
    await unmount();
  });

  it('asks again once the user has emptied the field: there is no typed number to keep', async () => {
    const { header, pickDate, typeNumber, unmount } = await mount();
    await typeNumber(7301);
    await typeNumber(0);

    await pickDate('2026-03-31');

    expect(nextNumber.mock.calls).toEqual([['2026-27'], ['2025-26']]);
    expect(header().inv_no).toBe(1210);
    // The number in the field is the suggestion again, so the next year change replaces it.
    await pickDate('2025-03-31');
    expect(header()).toMatchObject({ inv_fin_year: '2024-25', inv_no: 3 });
    await unmount();
  });

  it('does not put a late answer over a number typed while it was on its way', async () => {
    const first = deferred<ReturnType<typeof answer>>();
    nextNumber.mockReturnValueOnce(first.promise as never);
    const { header, typeNumber, unmount } = await mount();
    expect(header().inv_no).toBe(0);

    await typeNumber(7301);
    await act(async () => { first.resolve(answer(55, '2026-27')); });

    expect(header().inv_no).toBe(7301);
    await unmount();
  });

  it('takes the answer for the year the form is in when answers come back out of order', async () => {
    const { header, pickDate, unmount } = await mount();
    const forLastYear = deferred<ReturnType<typeof answer>>();
    const forThisYear = deferred<ReturnType<typeof answer>>();
    nextNumber.mockReturnValueOnce(forLastYear.promise as never).mockReturnValueOnce(forThisYear.promise as never);

    await pickDate('2026-03-31');
    await pickDate('2026-04-01');
    await act(async () => { forThisYear.resolve(answer(56, '2026-27')); });
    await act(async () => { forLastYear.resolve(answer(1210, '2025-26')); });

    expect(header()).toMatchObject({ inv_fin_year: '2026-27', inv_no: 56 });
    await unmount();
  });

  it('asks for a typed number when the other year has none left, and drops the suggestion of the year before', async () => {
    const { header, form, pickDate, unmount } = await mount();
    // The server: "No invoice number is left in financial year 2025".
    nextNumber.mockResolvedValueOnce(refusal('2025-26'));

    await pickDate('2026-03-31');

    expect(form().nextNumberFailed).toBe(true);
    expect(header()).toMatchObject({ inv_fin_year: '2025-26', inv_no: 0 });

    // Back in a year that has numbers, the suggestion and the normal hint return.
    await pickDate('2026-04-01');
    expect(form().nextNumberFailed).toBe(false);
    expect(header().inv_no).toBe(55);
    await unmount();
  });

  it('asks for a typed number when the first lookup fails', async () => {
    nextNumber.mockResolvedValueOnce(refusal('2026-27'));
    const { header, form, unmount } = await mount();

    expect(form().nextNumberFailed).toBe(true);
    expect(header().inv_no).toBe(0);
    await unmount();
  });

  it('leaves a late answer out of a form that was reset meanwhile', async () => {
    const first = deferred<ReturnType<typeof answer>>();
    nextNumber.mockReturnValueOnce(first.promise as never);
    nextNumber.mockReturnValueOnce(new Promise(() => {}) as never);
    const { header, form, unmount } = await mount();

    await act(async () => { form().resetFormState(); });
    await act(async () => { first.resolve(answer(55, '2026-27')); });

    expect(header().inv_no).toBe(0);
    await unmount();
  });
});

describe('an invoice that is being edited', () => {
  it('keeps its own number whatever the date becomes', async () => {
    const { header, pickDate, unmount } = await mount('edit', (store) => {
      store.dispatch(loadInvoiceEditData({
        invoiceId: INVOICE,
        grId: 'g1',
        header: { inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 12, customer_id: 'c1', customer_name: 'Example Traders', gr_id: 'g1', gr_no: 'A0010', one_time_charge: false, discount: 0, labour: 0, tax_amount: 0, total: 0 },
        items: [],
      }));
    });

    await pickDate('2026-03-31');

    expect(nextNumber).not.toHaveBeenCalled();
    expect(header()).toMatchObject({ inv_fin_year: '2025-26', inv_no: 12 });
    await unmount();
  });
});
