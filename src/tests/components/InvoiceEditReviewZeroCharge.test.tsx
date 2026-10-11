/**
 * Invoice edit, review step: the reason for a zero charge (owner decision 3 of
 * 2026-10-11). Staff need one whenever a line has a charge of 0; the stored
 * reason counts while the same lines are free.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import invoiceFormReducer, { loadInvoiceEditData, resetForm, updateEditedItem } from '@/store/slices/invoiceFormSlice';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import type { InvoiceItemData } from '@/types/invoice.types';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import InvoiceEditStep3 from '../../../app/invoice-edit/[id]/step3';

let mockRole = 'staff';
const mockStore = configureStore({
  reducer: {
    invoiceForm: invoiceFormReducer,
    theme: () => ({ preference: 'light', brand: 'orange' }),
    auth: () => ({ userProfile: { role: 'staff' } }),
  },
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockStore.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    require('react').useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
}));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), dismiss: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: 'InvoiceCalculationSummary' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: 'InvoiceSuccessDialog' }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
// The real service, so that the request the server would get can be read.
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

const FREE = 'aaaaaaaa-2222-4333-8444-555555555555';
const PAID = 'bbbbbbbb-2222-4333-8444-555555555555';
const line = (dispatchLine: string, charge: number): InvoiceItemData => ({
  temp_id: `edit_${dispatchLine}_0`,
  disp_trl_id: dispatchLine,
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
  charge,
  labour_rate: 2,
  tax: 5,
  amount: charge * 100,
  labour_amount: 200,
  tax_amount: 10,
  item_total: charge * 100 + 210,
});

/** An invoice saved with one free and one paid line. */
function loadInvoice(storedReason: string | undefined) {
  mockStore.dispatch(resetForm());
  mockStore.dispatch(
    loadInvoiceEditData({
      invoiceId: 'inv-42',
      grId: '11111111-2222-4333-8444-555555555555',
      header: {
        inv_date: '2026-10-05',
        inv_fin_year: '2026-27',
        inv_no: 42,
        customer_id: '22222222-3333-4444-8555-666666666666',
        customer_name: 'Example Traders',
        gr_id: '11111111-2222-4333-8444-555555555555',
        gr_no: 'A0010',
        one_time_charge: false,
        discount: 0,
        zero_charge_reason: storedReason,
        labour: 400,
        tax_amount: 45,
        total: 945,
      },
      items: [line(FREE, 0), line(PAID, 5)],
    })
  );
}

let rpc: jest.Mock;
async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceEditStep3 />); });
  return tree;
}
const summary = (tree: ReactTestRenderer) => tree.root.findByType('InvoiceCalculationSummary' as unknown as React.ElementType);
const pressUpdate = async (tree: ReactTestRenderer) => {
  const button = tree.root.find(
    (node) => node.props.accessibilityLabel === t('invoice.review.updateInvoice') && typeof node.props.onPress === 'function'
  );
  await act(async () => { await button.props.onPress(); });
};
/** Press Update and answer its question with "Update invoice"; the header that went to the server. */
const update = async (tree: ReactTestRenderer) => {
  await pressUpdate(tree);
  const [title, , buttons] = jest.mocked(showAlert).mock.calls[0];
  expect(title).toBe(t('invoice.review.updateTitle', { number: '42' }));
  await act(async () => { await buttons!.find((button) => button.text === t('invoice.review.updateInvoice'))!.onPress!(); });
  return rpc.mock.calls.find(([name]) => name === 'update_invoice')![1].p_invoice_data;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'staff';
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  rpc = jest.fn(async (name: string) =>
    name === 'update_invoice'
      ? { data: { success: true, invoice_id: 'inv-42', invoice_number: 42 }, error: null }
      : { data: { success: true, invoice: { id: 'inv-42', total: 945 }, items: [] }, error: null });
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
});
afterEach(() => jest.restoreAllMocks());

describe('staff updating an invoice that has a zero-charge line', () => {
  it('send the stored reason again when nothing about the free lines changed', async () => {
    loadInvoice('Sample lot');
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);

    const sent = await update(tree);

    expect(sent.zero_charge_reason).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });

  it('are stopped when the invoice was stored without a reason', async () => {
    loadInvoice(undefined);
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(true);

    await pressUpdate(tree);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(
      'Enter a reason for the zero charge',
      'An item has a charge of 0. Enter the reason before updating the invoice.'
    );
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('are stopped when another line became free: the stored reason was for the lines as saved', async () => {
    loadInvoice('Sample lot');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: `edit_${PAID}_0`, values: { charge: 0 } })); });
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(true);

    await pressUpdate(tree);

    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Enter a reason for the zero charge');
    expect(rpc).not.toHaveBeenCalled();

    // The reason written now is the one that is saved.
    jest.mocked(showAlert).mockClear();
    await act(async () => { summary(tree).props.onZeroChargeReasonChange('Agreed with the owner'); });
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);
    const sent = await update(tree);
    expect(sent.zero_charge_reason).toBe('Agreed with the owner');
    await act(async () => { tree.unmount(); });
  });

  it('are stopped after erasing the stored reason', async () => {
    loadInvoice('Sample lot');
    const tree = await render();
    await act(async () => { summary(tree).props.onZeroChargeReasonChange(''); });

    await pressUpdate(tree);

    expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('Enter a reason for the zero charge');
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('need no reason once every line has a charge, and none is sent', async () => {
    loadInvoice('Sample lot');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: `edit_${FREE}_0`, values: { charge: 3 } })); });
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);

    const sent = await update(tree);

    expect(sent).not.toHaveProperty('zero_charge_reason');
    await act(async () => { tree.unmount(); });
  });
});

describe.each(['admin', 'supervisor'])('%s updating an invoice that has a zero-charge line', (role) => {
  it('may leave the reason empty; null is sent', async () => {
    mockRole = role;
    loadInvoice(undefined);
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);

    const sent = await update(tree);

    expect(sent).toHaveProperty('zero_charge_reason', null);
    await act(async () => { tree.unmount(); });
  });

  it('may write one, and it is sent', async () => {
    mockRole = role;
    loadInvoice(undefined);
    const tree = await render();
    await act(async () => { summary(tree).props.onZeroChargeReasonChange('Sample lot'); });

    const sent = await update(tree);

    expect(sent.zero_charge_reason).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });
});
