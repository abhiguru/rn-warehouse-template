/**
 * Invoice items step, new invoice and edit: a line with a charge of 0 goes on
 * to the review (owner decision 3 of 2026-10-11); a line with a duration of 0
 * does not, and the message speaks of the duration only.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import invoiceFormReducer, { loadInvoiceEditData, resetForm } from '@/store/slices/invoiceFormSlice';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n/language';
import type { InvoiceItemData } from '@/types/invoice.types';
import InvoiceFormStep2 from '../../../app/invoice-form/step2';
import InvoiceEditStep2 from '../../../app/invoice-edit/[id]/step2';

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

const line = (id: string, overrides: Partial<InvoiceItemData> = {}): InvoiceItemData => ({
  temp_id: `edit_${id}_0`,
  disp_trl_id: `${id}-2222-4333-8444-555555555555`,
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
  ...overrides,
});

let mockItems: InvoiceItemData[] = [];
const mockNavigateToStep = jest.fn();
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: { customer_id: 'c1', customer_name: 'Example Traders', one_time_charge: false, inv_no: 12 },
    items: mockItems,
    itemOverrides: {},
    updateItemPricing: jest.fn(),
    applyGroupPricing: jest.fn(),
    navigateToStep: mockNavigateToStep,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismiss: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceItemsTable', () => ({ InvoiceItemsTable: 'InvoiceItemsTable' }));
jest.mock('@/features/invoice/components/InvoiceItemCard', () => ({ InvoiceItemCard: 'InvoiceItemCard' }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

async function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
}
const pressNext = async (tree: ReactTestRenderer) => {
  const next = tree.root.find(
    (node) => typeof node.type !== 'string' && node.props.accessibilityLabel === 'Next: review' && typeof node.props.onPress === 'function'
  );
  await act(async () => { await next.props.onPress(); });
};
const shown = (tree: ReactTestRenderer) =>
  tree.root.findAllByType('ConfirmDialog' as unknown as React.ElementType).filter((dialog) => dialog.props.visible);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('new invoice, items step', () => {
  it('goes on to the review with a line whose charge is 0', async () => {
    mockItems = [line('aaaaaaaa', { charge: 0, amount: 0 }), line('bbbbbbbb')];
    const tree = await render(<InvoiceFormStep2 />);

    await pressNext(tree);

    expect(shown(tree)).toHaveLength(0);
    expect(mockNavigateToStep).toHaveBeenCalledWith(3);
    await act(async () => { tree.unmount(); });
  });

  it('goes on when every line has a charge of 0', async () => {
    mockItems = [line('aaaaaaaa', { charge: 0, amount: 0 }), line('bbbbbbbb', { charge: 0, amount: 0 })];
    const tree = await render(<InvoiceFormStep2 />);

    await pressNext(tree);

    expect(mockNavigateToStep).toHaveBeenCalledWith(3);
    await act(async () => { tree.unmount(); });
  });

  it.each([
    [1, '1 item has a duration of 0. The duration must be greater than 0.'],
    [2, '2 items have a duration of 0. The duration must be greater than 0.'],
  ])('stops for %d line(s) with a duration of 0 and speaks of the duration only', async (count, message) => {
    mockItems = [line('aaaaaaaa', { duration: 0 }), line('bbbbbbbb', count === 2 ? { duration: 0 } : {}), line('cccccccc', { charge: 0 })];
    const tree = await render(<InvoiceFormStep2 />);

    await pressNext(tree);

    expect(shown(tree)).toHaveLength(1);
    expect(shown(tree)[0].props.title).toBe('Check the item prices');
    expect(shown(tree)[0].props.message).toBe(message);
    expect(shown(tree)[0].props.message).not.toMatch(/charge/i);
    expect(mockNavigateToStep).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});

describe('invoice edit, items step', () => {
  const load = (items: InvoiceItemData[]) => {
    mockStore.dispatch(resetForm());
    mockStore.dispatch(loadInvoiceEditData({
      invoiceId: 'inv-42',
      grId: '11111111-2222-4333-8444-555555555555',
      header: {
        inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 42, customer_id: 'c1', customer_name: 'Example Traders',
        gr_id: '11111111-2222-4333-8444-555555555555', gr_no: 'A0010', one_time_charge: false, discount: 0, labour: 400, tax_amount: 45, total: 945,
      },
      items,
    }));
  };

  it('goes on to the review with a line whose charge is 0', async () => {
    load([line('aaaaaaaa', { charge: 0, amount: 0 }), line('bbbbbbbb')]);
    const tree = await render(<InvoiceEditStep2 />);

    await pressNext(tree);

    expect(showAlert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/invoice-edit/inv-42/step3');
    await act(async () => { tree.unmount(); });
  });

  it('stops for a line with a duration of 0 and speaks of the duration only', async () => {
    load([line('aaaaaaaa', { duration: 0 }), line('bbbbbbbb', { charge: 0 })]);
    const tree = await render(<InvoiceEditStep2 />);

    await pressNext(tree);

    expect(showAlert).toHaveBeenCalledTimes(1);
    // The same sentence as in a new invoice, with the number of lines.
    expect(showAlert).toHaveBeenCalledWith('Check the item prices', '1 item has a duration of 0. The duration must be greater than 0.');
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  // Every other failure of the items check used to be answered with "Every
  // item needs a duration greater than 0.", a rule the line already met.
  it.each([
    ['a duration under half a month', { duration: 0.3 }, 'Duration must be at least 0.5 months'],
    ['days below 0', { no_of_days: -1 }, 'Days cannot be negative'],
    ['a tax above 100%', { tax: 150 }, 'Tax cannot exceed 100%'],
    ['a charge out of range', { charge: 1000000 }, 'Charge is too large'],
  ])('stops for %s and says what is wrong with it', async (_what, overrides, message) => {
    load([line('aaaaaaaa', overrides), line('bbbbbbbb')]);
    const tree = await render(<InvoiceEditStep2 />);

    await pressNext(tree);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Check the item prices', message);
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('names each kind of failure once when several lines fail', async () => {
    load([line('aaaaaaaa', { duration: 0.3 }), line('bbbbbbbb', { duration: 0.2, tax: 150 }), line('cccccccc')]);
    const tree = await render(<InvoiceEditStep2 />);

    await pressNext(tree);

    expect(showAlert).toHaveBeenCalledWith('Check the item prices', 'Duration must be at least 0.5 months\nTax cannot exceed 100%');
    await act(async () => { tree.unmount(); });
  });

  it('says it in Gujarati', async () => {
    load([line('aaaaaaaa', { duration: 0.3 })]);
    const tree = await render(<InvoiceEditStep2 />);

    // The message is worded when Next is pressed, in the language of that moment.
    setLanguage('gu');
    await pressNext(tree);

    expect(showAlert).toHaveBeenCalledWith('આઇટમના દર તપાસો', 'મુદત ઓછામાં ઓછી ૦.૫ મહિના હોવી જોઈએ');
    await act(async () => { tree.unmount(); });
    setLanguage('en');
  });
});
