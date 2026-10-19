/**
 * Invoice edit, step 1: looking at the GRN and coming back must leave the
 * invoice as it was loaded. The screen used to reload the GRN through the
 * new-invoice path on every return, which replaced the saved line rates with
 * today's price list and forgot the stored discount and its reason.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import invoiceFormReducer, { loadInvoiceEditData } from '@/store/slices/invoiceFormSlice';
import { loadInvoiceFormData } from '@/features/invoice/services/invoiceFormService';
import { discountNeedsReason } from '@/utils/invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import InvoiceEditStep1 from '../../../app/invoice-edit/[id]/step1';

const mockStore = configureStore({
  reducer: {
    invoiceForm: invoiceFormReducer,
    theme: () => ({ preference: 'light', brand: 'orange' }),
  },
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockStore.dispatch,
  useAppStore: () => mockStore,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockStore.getState()),
}));

// Every screen-focus callback the screen registers, so the test can bring the screen back into focus.
const mockFocusCallbacks: Array<() => void> = [];
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismiss: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    mockFocusCallbacks.push(callback);
  },
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({ loadInvoiceFormData: jest.fn() }));

const savedLine: InvoiceItemData = {
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
  // The rate this invoice was saved with; the price list has since moved to 7.
  charge: 5.5,
  labour_rate: 2,
  tax: 5,
  amount: 550,
  labour_amount: 200,
  tax_amount: 37.5,
  item_total: 787.5,
};

it('keeps the saved lines, discount and reason after the GRN was viewed', async () => {
  mockStore.dispatch(
    loadInvoiceEditData({
      invoiceId: 'inv-42',
      grId: savedLine.grn_id,
      header: {
        inv_date: '2026-10-05',
        inv_fin_year: '2026-27',
        inv_no: 42,
        customer_id: '22222222-3333-4444-8555-666666666666',
        customer_name: 'Example Traders',
        gr_id: savedLine.grn_id,
        gr_no: 'A0010',
        one_time_charge: false,
        discount: 100,
        discount_reason: 'Damaged bags',
        labour: 200,
        tax_amount: 38,
        total: 688,
      },
      items: [savedLine],
    })
  );
  // What the new-invoice preview would answer for this GRN today.
  jest.mocked(loadInvoiceFormData).mockResolvedValue({
    success: true,
    data: {
      header: { customer_id: '22222222-3333-4444-8555-666666666666', customer_name: 'Example Traders', gr_id: savedLine.grn_id, gr_no: 'A0010' },
      items: [{ ...savedLine, temp_id: 'temp_9_0', charge: 7, amount: 700, item_total: 945 }],
    },
  });

  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceEditStep1 />);
  });
  // First focus is the screen opening; the second is the return from the GRN screen.
  await act(async () => { mockFocusCallbacks.forEach((callback) => callback()); });
  await act(async () => { mockFocusCallbacks.forEach((callback) => callback()); });

  const { header, items } = mockStore.getState().invoiceForm;
  expect(loadInvoiceFormData).not.toHaveBeenCalled();
  expect(items).toEqual([savedLine]);
  expect(header.saved_discount).toBe(100);
  expect(header.discount_reason).toBe('Damaged bags');
  expect(discountNeedsReason(header, 'staff')).toBe(false);
  await act(async () => { tree.unmount(); });
});
