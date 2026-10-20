/**
 * Invoice edit, review step: what is saved and what the person is shown.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { updateInvoice } from '@/features/invoice/services/invoiceFormService';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { makeInvoiceStore, openForEdit, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import InvoiceEditStep3 from '../../../app/invoice-edit/[id]/step3';

const mockStore = makeInvoiceStore({ role: 'staff' });
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismiss: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
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

const line = invoiceLine({ qty: 100 }, 0);

function loadInvoice() {
  openForEdit(mockStore, [line], {
    discount: 400,
    discount_reason: 'Damaged bags',
    labour: 200,
    tax_amount: 35,
    total: 335,
  });
}

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceEditStep3 />); });
  return tree;
}
const standIn = (tree: ReactTestRenderer, name: string) => tree.root.findByType(name as unknown as React.ElementType);
// The dialogs that are open (the stand-in keeps the props of ConfirmDialog).
const shown = (tree: ReactTestRenderer) =>
  tree.root.findAllByType('ConfirmDialog' as unknown as React.ElementType).filter((dialog) => dialog.props.visible);
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

    expect(shown(tree)).toHaveLength(1);
    const dialog = shown(tree)[0];
    expect(dialog.props.title).toBe(t('invoice.review.discountCheckTitle'));
    expect(dialog.props.message).toContain(rejected);
    expect(dialog.props.message).toContain('₹400.00');
    // The dialog only informs: its one button closes it and nothing is saved.
    expect(dialog.props.confirmText).toBe(t('common.close'));
    await act(async () => { dialog.props.onConfirm(); });
    expect(updateInvoice).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('lets the update go on to its confirmation once the field is corrected', async () => {
    const tree = await render();
    await act(async () => { standIn(tree, 'InvoiceCalculationSummary').props.onDiscountErrorChange('x'); });
    await act(async () => { standIn(tree, 'InvoiceCalculationSummary').props.onDiscountErrorChange(null); });

    await pressUpdate(tree);

    expect(shown(tree)).toHaveLength(1);
    expect(shown(tree)[0].props.title).toBe(t('invoice.review.updateTitle', { number: '42' }));
    expect(showAlert).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});

describe('the total of an updated invoice', () => {
  const confirmUpdate = async (tree: ReactTestRenderer) => {
    await pressUpdate(tree);
    const dialog = shown(tree)[0];
    expect(dialog.props.confirmText).toBe(t('invoice.review.updateInvoice'));
    await act(async () => { await dialog.props.onConfirm(); });
    // The invoice dialog opens once the question has finished closing.
    await act(async () => { dialog.props.onDismissed(); });
    return dialog.props.message as string;
  };

  it('is checked by the server and shown as the server stored it', async () => {
    // The form holds 335 (735 less the discount of 400). The server counts 1.5 periods and stores 598.
    jest.mocked(updateInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 598 } });
    const tree = await render();

    const message = await confirmUpdate(tree);

    expect(message).toContain('Total ₹335.00');
    const dialog = standIn(tree, 'InvoiceSuccessDialog');
    expect(dialog.props.isVisible).toBe(true);
    expect(dialog.props.isEditMode).toBe(true);
    expect(dialog.props.invoiceData).toMatchObject({ invoice_no: 42, total: 598, estimated_total: 335 });
    // The question is closed once the save is over.
    expect(shown(tree)).toHaveLength(0);
    await act(async () => { tree.unmount(); });
  });

  it('is left unknown when the server total could not be read back', async () => {
    jest.mocked(updateInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: null } });
    const tree = await render();

    await confirmUpdate(tree);

    expect(standIn(tree, 'InvoiceSuccessDialog').props.invoiceData).toMatchObject({ total: null, estimated_total: 335 });
    await act(async () => { tree.unmount(); });
  });
});
