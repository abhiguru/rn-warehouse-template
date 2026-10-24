/**
 * New invoice, review step: while the discount field shows text that was not
 * accepted, the invoice still holds the previous discount, so Save is held.
 *
 * RF-13: this wiring (the summary's onDiscountErrorChange into the step) was
 * only tested on the edit screen; removing it from the create step left every
 * test green.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: 'InvoiceCalculationSummary' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const summary = (tree: ReactTestRenderer) => tree.root.findByType('InvoiceCalculationSummary' as unknown as React.ElementType);
const dialogs = (tree: ReactTestRenderer) => tree.root.findAllByType('ConfirmDialog' as unknown as React.ElementType);
const shown = (tree: ReactTestRenderer) => dialogs(tree).filter((dialog) => dialog.props.visible);
const pressSave = async (tree: ReactTestRenderer) => {
  const save = tree.root.findAll((node) => typeof node.type !== 'string' && node.props.accessibilityLabel === 'Save invoice' && typeof node.props.onPress === 'function')[0];
  await act(async () => { await save.props.onPress(); });
};

beforeEach(() => jest.clearAllMocks());

it('holds Save while the discount field shows text that was not accepted, and names the discount that would be saved', async () => {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceFormStep3 />); });

  await act(async () => { summary(tree).props.onDiscountErrorChange('Discount cannot be more than the invoice amount'); });
  await pressSave(tree);

  expect(shown(tree)).toHaveLength(1);
  expect(shown(tree)[0].props.message).toContain('Discount cannot be more than the invoice amount');
  expect(shown(tree)[0].props.message).toContain('100');
  expect(shown(tree)[0].props.confirmText).toBe('Close');
  expect(mockSubmitForm).not.toHaveBeenCalled();

  // Once the field holds an accepted amount again, Save asks its question and saves.
  await act(async () => { shown(tree)[0].props.onConfirm(); });
  await act(async () => { summary(tree).props.onDiscountErrorChange(null); });
  await pressSave(tree);
  expect(shown(tree)).toHaveLength(1);
  expect(shown(tree)[0].props.confirmText).toBe('Save invoice');
  mockSubmitForm.mockResolvedValue({ success: false });
  await act(async () => { await shown(tree)[0].props.onConfirm(); });
  expect(mockSubmitForm).toHaveBeenCalledTimes(1);
  await act(async () => { tree.unmount(); });
});
