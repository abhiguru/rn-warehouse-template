/**
 * New invoice, step 1: the invoice number has a ceiling of 99999999 (backend
 * migration 73 refuses a save outside 1 to 99999999 with WH422). A number typed
 * by hand once was 2147483647, and every later invoice of its financial year
 * failed. The field takes 8 digits at most, and Next refuses a number above
 * the ceiling with the server's sentence in the app's language.
 *
 * The screen is the real step 1 with the real useInvoiceForm on a real
 * invoice-form slice; the server and the router are mocked.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import invoiceFormReducer, { setItems, updateHeader } from '@/store/slices/invoiceFormSlice';
import { getNextInvoiceNumber } from '@/features/invoice/services/invoiceFormService';
import { validateStep1 } from '@/features/invoice/schemas/invoiceValidation';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';

const makeStore = () =>
  configureStore({
    reducer: {
      invoiceForm: invoiceFormReducer,
      auth: () => ({ userProfile: null }),
      theme: () => ({ preference: 'light', brand: 'orange' }),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
let mockStore = makeStore();
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppStore: () => mockStore,
    useAppSelector: (selector: (state: ReturnType<typeof mockStore.getState>) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});
jest.mock('expo-router', () => {
  const mockRouter = { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
  return { router: mockRouter, useRouter: () => mockRouter, useFocusEffect: jest.fn() };
});
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getNextInvoiceNumber: jest.fn(),
  loadInvoiceFormData: jest.fn(),
  loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

const GRN = '11111111-2222-4333-8444-555555555555';
const CUSTOMER = '22222222-3333-4444-8555-666666666666';
const LINE = '33333333-4444-4555-8666-777777777777';
const RANGE = 'Invoice number must be between 1 and 99999999';

let tree: ReactTestRenderer;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockStore = makeStore();
  // No number is suggested: the user types one.
  jest.mocked(getNextInvoiceNumber).mockResolvedValue({ success: false, message: 'none' } as never);
  await act(async () => {
    mockStore.dispatch(updateHeader({
      inv_date: '2026-10-05', inv_fin_year: '2026-27',
      gr_id: GRN, gr_no: 'A0010', customer_id: CUSTOMER, customer_name: 'Example Traders', one_time_charge: false,
    }));
    mockStore.dispatch(setItems([{
      temp_id: 't1', disp_trl_id: LINE, grn_item_id: 'g1', item_name: 'Example Potatoes',
      qty: 10, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 30,
    }] as never));
    tree = create(<InvoiceFormStep1 />);
  });
});

afterEach(async () => {
  await act(async () => { tree.unmount(); });
  setLanguage('en');
  jest.restoreAllMocks();
});

const numberField = () =>
  tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Invoice number')!;
const type = async (text: string) => {
  await act(async () => { numberField().props.onChangeText(text); });
};
const pressNext = async () => {
  const next = tree.root.find((node) =>
    typeof node.type !== 'string' && node.props.accessibilityLabel === t('invoice.form.nextItems') && 'onPress' in node.props);
  await act(async () => { await next.props.onPress(); });
};
const screenText = () => JSON.stringify(tree.toJSON());
const wentOn = () =>
  [router.push, router.navigate].some((go) => jest.mocked(go).mock.calls.some(([to]) => String(to).includes('step2')));

describe('the invoice number field of a new invoice', () => {
  it('takes 8 digits at most: a ninth typed digit is not kept', async () => {
    expect(numberField().props.maxLength).toBe(8);

    await type('123456789');

    expect(mockStore.getState().invoiceForm.header.inv_no).toBe(12345678);
    expect(numberField().props.value).toBe('12345678');
  });

  it('refuses 100000000 on Next with the range message under the field, and stays', async () => {
    // A number above the ceiling that reached the form (pasted before the cap, or kept from before it).
    await act(async () => { mockStore.dispatch(updateHeader({ inv_no: 100000000, inv_no_typed: true })); });

    await pressNext();

    expect(screenText()).toContain(RANGE);
    expect(showAlert).toHaveBeenCalledWith('Check the invoice', expect.stringContaining(RANGE));
    expect(wentOn()).toBe(false);
  });

  it('accepts 99999999, the largest number, and goes on', async () => {
    await type('99999999');

    await pressNext();

    expect(screenText()).not.toContain(RANGE);
    expect(wentOn()).toBe(true);
  });

  it('says it in Gujarati in a Gujarati app', async () => {
    setLanguage('gu');
    await act(async () => { mockStore.dispatch(updateHeader({ inv_no: 100000000, inv_no_typed: true })); });

    await pressNext();

    expect(screenText()).toContain('ઇન્વૉઇસ નંબર ૧ થી ૯૯૯૯૯૯૯૯ સુધીનો હોવો જોઈએ');
  });
});

describe('the ceiling outside a new invoice', () => {
  it('does not stop an edit of an invoice saved before it with a larger number (the server allows that)', async () => {
    const header = mockStore.getState().invoiceForm.header;

    const result = await validateStep1({ ...header, inv_no: 2147483647 });

    expect(result.errors.inv_no).toBeUndefined();
  });
});
