/**
 * New invoice, review step: while the discount field shows text that was not
 * accepted, the invoice still holds the previous discount, so Save is held.
 *
 * RF-13: this wiring (the summary's onDiscountErrorChange into the step) was
 * only tested on the edit screen; removing it from the create step left every
 * test green.
 */
import React from 'react';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import InvoiceFormStep3 from '../../../app/invoice-form/step3';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'supervisor' } } }),
}));

const mockSubmitForm = jest.fn();
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: {
      inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 12, customer_id: 'c1', customer_name: 'Example Traders',
      gr_id: 'g1', gr_no: 'A0010', one_time_charge: false, discount: 100, discount_reason: 'Damaged bags', labour: 200, tax_amount: 35, total: 635,
    },
    items: [{ temp_id: 't1', item_name: 'Example Potatoes', qty: 100, charge: 5, labour_rate: 2, tax: 5, duration: 1, amount: 500, labour_amount: 200, tax_amount: 35, item_total: 735 }],
    isSaving: false,
    updateDiscountAmount: jest.fn(),
    updateHeaderField: jest.fn(),
    navigateToStep: jest.fn(),
    submitForm: mockSubmitForm,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
// Stand-ins: an open dialog is an alert with its message and its confirm button (the real props are called), and the
// summary draws two buttons that report the discount field's state to the step, as the real field does.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; message?: string; confirmText?: string; onConfirm: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    return props.visible ? (
      <View accessible accessibilityRole="alert">
        <Text>{props.message}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={props.confirmText} onPress={props.onConfirm}>
          <Text>{props.confirmText}</Text>
        </Pressable>
      </View>
    ) : null;
  },
}));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({
  InvoiceCalculationSummary: (props: { onDiscountErrorChange: (error: string | null) => void }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel="Type a discount that is too high" onPress={() => props.onDiscountErrorChange('Discount cannot be more than the invoice amount')}>
          <Text>Type a discount that is too high</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Type an accepted discount" onPress={() => props.onDiscountErrorChange(null)}>
          <Text>Type an accepted discount</Text>
        </Pressable>
      </View>
    );
  },
}));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const user = () => userEvent.setup({ delay: 0 });
const shown = () => screen.queryAllByRole('alert');
// The page's own Save is the first button of that name (a dialog's confirm of the same name is drawn after it).
const pressSave = async () => { await user().press(screen.getAllByRole('button', { name: 'Create invoice' })[0]); };

beforeEach(() => jest.clearAllMocks());

it('holds Save while the discount field shows text that was not accepted, and names the discount that would be saved', async () => {
  await render(<InvoiceFormStep3 />);

  await user().press(screen.getByRole('button', { name: 'Type a discount that is too high' }));
  await pressSave();

  expect(shown()).toHaveLength(1);
  expect(within(shown()[0]).getByText(/Discount cannot be more than the invoice amount/)).toBeOnTheScreen();
  expect(within(shown()[0]).getByText(/100/)).toBeOnTheScreen();
  expect(within(shown()[0]).getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  expect(mockSubmitForm).not.toHaveBeenCalled();

  // Once the field holds an accepted amount again, Save asks its question and saves.
  await user().press(within(shown()[0]).getByRole('button', { name: 'Close' }));
  await user().press(screen.getByRole('button', { name: 'Type an accepted discount' }));
  await pressSave();
  expect(shown()).toHaveLength(1);
  const confirmSave = within(shown()[0]).getByRole('button', { name: 'Create invoice' });
  mockSubmitForm.mockResolvedValue({ success: false });
  await user().press(confirmSave);
  expect(mockSubmitForm).toHaveBeenCalledTimes(1);
});
