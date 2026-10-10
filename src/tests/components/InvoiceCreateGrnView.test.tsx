/**
 * New invoice, step 1: coming back to this screen (from the GRN screen or from
 * a later step) must not load the GRN again. The reload replaced the lines
 * with the price list's rates, so rates typed on step 2 were lost. The edit
 * form had the same fault (InvoiceEditGrnView.test.tsx).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';

const mockLoadGRNData = jest.fn(async () => ({ success: true, itemCount: 1 }));
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: {
      inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 43,
      customer_id: '22222222-3333-4444-8555-666666666666', customer_name: 'Example Traders',
      gr_id: '11111111-2222-4333-8444-555555555555', gr_no: 'A0010',
    },
    // A line whose rate was typed on step 2.
    items: [{ temp_id: 'temp_1_0', item_name: 'Example Potatoes', qty: 100, charge: 6.25 }],
    isLoading: false,
    isLoadingItems: false,
    nextNumberFailed: false,
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

it('does not load the GRN again when the screen comes back into focus', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceFormStep1 />);
  });
  // First focus is the screen opening; the later ones are returns to it.
  for (let focus = 0; focus < 3; focus++)
    await act(async () => { mockFocusCallbacks.forEach((callback) => callback()); });

  expect(mockLoadGRNData).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});
