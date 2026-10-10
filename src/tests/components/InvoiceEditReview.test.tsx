/**
 * Invoice edit, review step: what is saved and what the person is shown.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import invoiceFormReducer, { loadInvoiceEditData, resetForm } from '@/store/slices/invoiceFormSlice';
import { updateInvoice } from '@/features/invoice/services/invoiceFormService';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import type { InvoiceItemData } from '@/types/invoice.types';
import InvoiceEditStep3 from '../../../app/invoice-edit/[id]/step3';

const mockStore = configureStore({
  reducer: {
    invoiceForm: invoiceFormReducer,
    theme: () => ({ preference: 'light', brand: 'orange' }),
    auth: () => ({ userProfile: { role: 'staff' } }),
  },
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockStore.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockStore.getState()),
}));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), dismiss: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
// Stand-ins that keep their props, so the test can read what they are given and call back.
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: 'InvoiceCalculationSummary' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: 'InvoiceSuccessDialog' }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  ...jest.requireActual('@/features/invoice/services/invoiceFormService'),
  updateInvoice: jest.fn(),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

const line: InvoiceItemData = {
  temp_id: 'edit_1_0',
  disp_trl_id: 'aaaaaaaa-2222-4333-8444-555555555555',
  grn_item_id: 'g1',
  item_id: 'i1',
  item_name: 'Example Potatoes',
  qty: 100,
  grn_original_qty: 100,
  package_mark: 'M1',
  rack: '',
  weight: 50,
  dispatch_id: 'd1',
  dispatch_no: 'I0001',
  dispatch_date: '2026-10-01',
  grn_id: '11111111-2222-4333-8444-555555555555',
  grn_no: 'A0010',
  grn_date: '2026-09-01',
  duration: 1,
  no_of_days: 30,
  charge: 5,
  labour_rate: 2,
  tax: 5,
  amount: 500,
  labour_amount: 200,
  tax_amount: 35,
  item_total: 735,
};

function loadInvoice() {
  mockStore.dispatch(resetForm());
  mockStore.dispatch(
    loadInvoiceEditData({
      invoiceId: 'inv-42',
      grId: line.grn_id,
      header: {
        inv_date: '2026-10-05',
        inv_fin_year: '2026-27',
        inv_no: 42,
        customer_id: '22222222-3333-4444-8555-666666666666',
        customer_name: 'Example Traders',
        gr_id: line.grn_id,
        gr_no: 'A0010',
        one_time_charge: false,
        discount: 400,
        discount_reason: 'Damaged bags',
        labour: 200,
        tax_amount: 35,
        total: 335,
      },
      items: [line],
    })
  );
}

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceEditStep3 />); });
  return tree;
}
const standIn = (tree: ReactTestRenderer, name: string) => tree.root.findByType(name as unknown as React.ElementType);
const pressUpdate = async (tree: ReactTestRenderer) => {
  const button = tree.root.find(
    (node) => node.props.accessibilityLabel === t('invoice.review.updateInvoice') && typeof node.props.onPress === 'function'
  );
  await act(async () => { await button.props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  loadInvoice();
});
afterEach(() => jest.restoreAllMocks());

describe('a discount the field did not accept', () => {
  it('holds the update and says which discount the invoice still has', async () => {
    const tree = await render();
    // Staff typed 5000 over an invoice of 735: the field keeps the text, the invoice keeps 400.
    const rejected = t('invoice.summary.discountTooLarge', { amount: '₹735.00' });
    await act(async () => { standIn(tree, 'InvoiceCalculationSummary').props.onDiscountErrorChange(rejected); });

    await pressUpdate(tree);

    expect(showAlert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe(t('invoice.review.discountCheckTitle'));
    expect(message).toContain(rejected);
    expect(message).toContain('₹400.00');
    // No "Update invoice" button to press: the dialog only informs.
    expect(buttons).toBeUndefined();
    expect(updateInvoice).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('lets the update go on to its confirmation once the field is corrected', async () => {
    const tree = await render();
    await act(async () => { standIn(tree, 'InvoiceCalculationSummary').props.onDiscountErrorChange('x'); });
    await act(async () => { standIn(tree, 'InvoiceCalculationSummary').props.onDiscountErrorChange(null); });

    await pressUpdate(tree);

    const [title] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe(t('invoice.review.updateTitle', { number: '42' }));
    await act(async () => { tree.unmount(); });
  });
});
