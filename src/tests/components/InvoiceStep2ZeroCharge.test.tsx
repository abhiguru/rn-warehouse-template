/**
 * Invoice items step, new invoice: a line with a charge of 0 goes on
 * to the review (owner decision 3 of 2026-10-11); a line with a duration of 0
 * does not, and the message speaks of the duration only. The edit form's
 * items step is in InvoiceEditItemsStep.test.tsx.
 */
import React from 'react';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import type { InvoiceItemData } from '@/types/invoice.types';
import InvoiceFormStep2 from '../../../app/invoice-form/step2';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({ invoiceForm: { items: mockItems, editedItems: {}, bulkPricing: {}, header: {} } }), subscribe: () => () => undefined, dispatch: jest.fn() }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
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
    invoiceId: null,
    updateItemPricing: jest.fn(),
    applyGroupPricing: jest.fn(),
    navigateToStep: mockNavigateToStep,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismiss: jest.fn(), dismissTo: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: 'KeyboardAwareScrollView',
  // The items table (a stand-in here) is a keyboard-aware FlashList.
  listenToKeyboardEvents: () => (component: unknown) => component,
}));
// A stand-in: an open dialog is an alert with its title and message.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message?: string }) => {
    const { Text, View } = require('react-native');
    return props.visible ? (
      <View accessible accessibilityRole="alert">
        <Text>{props.title}</Text>
        <Text>{props.message}</Text>
      </View>
    ) : null;
  },
}));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/items/InvoiceItemsEditor', () => ({ InvoiceItemsEditor: () => null }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));

const pressNext = async () => {
  await userEvent.setup({ delay: 0 }).press(screen.getByLabelText('Review'));
};
// A check that no dialog is open must also see one that is mounted but hidden.
const shown = (hidden = false) => screen.queryAllByRole('alert', { includeHiddenElements: hidden });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('new invoice, items step', () => {
  it('goes on to the review with a line whose charge is 0', async () => {
    mockItems = [line('aaaaaaaa', { charge: 0, amount: 0 }), line('bbbbbbbb')];
    await render(<InvoiceFormStep2 />);

    await pressNext();

    expect(shown(true)).toHaveLength(0);
    expect(mockNavigateToStep).toHaveBeenCalledWith(3);
  });

  it('goes on when every line has a charge of 0', async () => {
    mockItems = [line('aaaaaaaa', { charge: 0, amount: 0 }), line('bbbbbbbb', { charge: 0, amount: 0 })];
    await render(<InvoiceFormStep2 />);

    await pressNext();

    expect(mockNavigateToStep).toHaveBeenCalledWith(3);
  });

  it.each([
    [1, '1 item has a duration of 0. The duration must be greater than 0.'],
    [2, '2 items have a duration of 0. The duration must be greater than 0.'],
  ])('stops for %d line(s) with a duration of 0 and speaks of the duration only', async (count, message) => {
    mockItems = [line('aaaaaaaa', { duration: 0 }), line('bbbbbbbb', count === 2 ? { duration: 0 } : {}), line('cccccccc', { charge: 0 })];
    await render(<InvoiceFormStep2 />);

    await pressNext();

    expect(shown()).toHaveLength(1);
    expect(within(shown()[0]).getByText('Check the item prices')).toBeOnTheScreen();
    expect(within(shown()[0]).getByText(message)).toBeOnTheScreen();
    expect(within(shown()[0]).queryByText(/charge/i, { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(mockNavigateToStep).not.toHaveBeenCalled();
  });
});
