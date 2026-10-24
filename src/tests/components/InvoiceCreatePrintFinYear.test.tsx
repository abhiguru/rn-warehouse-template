/**
 * New invoice, review step: printing sends the invoice's own financial year, so an invoice of
 * an earlier year is never confused with the same number of the current year.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { printInvoiceRange } from '@/services/print-service';
import InvoiceFormStep3 from '../../../app/invoice-form/step3';

let mockRole = 'staff';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } } }),
}));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));

const mockSubmitForm = jest.fn();
const mockUpdateHeaderField = jest.fn();
const line = (id: string, charge: number) => ({
  temp_id: id, disp_trl_id: id, item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1', qty: 100, grn_original_qty: 100,
  charge, labour_rate: 2, tax: 5, duration: 1, amount: charge * 100, labour_amount: 200, tax_amount: 10, item_total: charge * 100 + 210,
});
let mockItems = [line('free', 0), line('paid', 5)];
let mockReason: Record<string, unknown> = {};
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: {
      inv_date: '2026-10-09', inv_fin_year: '2025-26', inv_no: 12, customer_id: 'c1', customer_name: 'Example Traders',
      gr_id: 'g1', gr_no: 'A0010', one_time_charge: false, discount: 0, labour: 400, tax_amount: 45, total: 945,
      ...mockReason,
    },
    items: mockItems,
    isSaving: false,
    updateDiscountAmount: jest.fn(),
    updateHeaderField: mockUpdateHeaderField,
    navigateToStep: jest.fn(),
    submitForm: mockSubmitForm,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
let mockDialogProps: { onConfirm: (s: string, e: string) => Promise<void> } | undefined;
jest.mock('@/components/PrintRangeDialog', () => ({
  PrintRangeDialog: (props: { onConfirm: (s: string, e: string) => Promise<void> }) => { mockDialogProps = props; return null; },
}));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: 'InvoiceCalculationSummary' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));


it('prints with the financial year of the invoice (2025-26 -> 2025)', async () => {
  jest.mocked(printInvoiceRange).mockResolvedValue({ success: true } as never);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceFormStep3 />); });

  await act(async () => { await mockDialogProps!.onConfirm('412', '412'); });

  expect(printInvoiceRange).toHaveBeenCalledWith('412', '412', 2025);
  await act(async () => { tree.unmount(); });
});
