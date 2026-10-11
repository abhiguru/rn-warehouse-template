/**
 * New invoice, step 1: the hint under "Invoice number". When the next number
 * could not be fetched the user types one, and the hint must not then claim
 * that "The next number is filled in".
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';

const mockLoadGRNData = jest.fn(async () => ({ success: true, itemCount: 1 }));
let mockInvNo: number | '' = '';
let mockNextNumberFailed = false;
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: {
      inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: mockInvNo,
      customer_id: '', customer_name: '', gr_id: '', gr_no: '',
    },
    items: [],
    isLoading: false,
    isLoadingItems: false,
    nextNumberFailed: mockNextNumberFailed,
    validationErrors: {},
    updateHeaderField: jest.fn(),
    updateHeaderFields: jest.fn(),
    loadGRNData: mockLoadGRNData,
    clearFieldValidationError: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
  }),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

// Every screen-focus callback the screen registers, so the test can bring the screen back into focus.
const mockFocusCallbacks: Array<() => void> = [];
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismiss: jest.fn(), replace: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    mockFocusCallbacks.push(callback);
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));

const FILLED = 'The next number is filled in. You can change it.';
const UNAVAILABLE = "Couldn't get the next number. Type the invoice number.";

async function hints(invNo: number | '', failed: boolean) {
  mockInvNo = invNo;
  mockNextNumberFailed = failed;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceFormStep1 />);
  });
  const text = JSON.stringify(tree.toJSON());
  await act(async () => { tree.unmount(); });
  return { filled: text.includes(FILLED), unavailable: text.includes(UNAVAILABLE) };
}

describe('the hint under the invoice number', () => {
  it('says the number is filled in when the server gave one', async () => {
    expect(await hints(43, false)).toEqual({ filled: true, unavailable: false });
  });

  it('asks for a number when the server gave none', async () => {
    expect(await hints('', true)).toEqual({ filled: false, unavailable: true });
  });

  it('does not claim the number was filled in once the user has typed one', async () => {
    expect(await hints(7301, true)).toEqual({ filled: false, unavailable: true });
  });
});
