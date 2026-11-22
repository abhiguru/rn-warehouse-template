/**
 * WH-228: Invoice step 1. The Invoice number box with its error is one view marked FIELD_BLOCK_ID (the wizard bar
 * keeps that block above itself). Harness as in InvoiceDetailsStep.test.tsx.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getNextInvoiceNumber } from '@/features/invoice/services/invoiceFormService';
import { updateHeader } from '@/store/slices/invoiceFormSlice';
import { fillNewInvoice, invoiceLine, makeInvoiceStore, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { blockOf, inputsIn, wordsIn } from '@/tests/helpers/fieldBlock';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: 'DatePickerModal' }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: 'GRNAutocomplete' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));

const numberField = () => screen.getByLabelText('Invoice number');

beforeEach(async () => {
  jest.clearAllMocks();
  mockStore = makeInvoiceStore();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(getNextInvoiceNumber).mockResolvedValue({ success: true, data: { next_invoice_number: 55, financial_year: '2026-27' } } as never);
  fillNewInvoice(mockStore, [invoiceLine()]);
  mockStore.dispatch(updateHeader({ inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 42, inv_no_typed: true }));
  await render(<InvoiceFormStep1 />);
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('Invoice number: the block holds the box and its error line, and no other field', async () => {
  await act(async () => { mockStore.dispatch(updateHeader({ inv_no: 100000000, inv_no_typed: true })); });
  await fireEvent(numberField(), 'blur');
  const block = blockOf(numberField());
  expect(block).not.toBeNull();
  expect(inputsIn(block!)).toBe(1);
  expect(wordsIn(block!).join(' ')).toContain('Invoice number must be between 1 and 99999999');
});

it('Invoice number: the helper line "The next number is filled in. You can change it." is inside the block (WH-235)', async () => {
  await act(async () => { mockStore.dispatch(updateHeader({ inv_no: 55, inv_no_typed: false })); });
  const block = blockOf(numberField());
  expect(block).not.toBeNull();
  expect(inputsIn(block!)).toBe(1);
  expect(wordsIn(block!)).toContain('The next number is filled in. You can change it.');
});
