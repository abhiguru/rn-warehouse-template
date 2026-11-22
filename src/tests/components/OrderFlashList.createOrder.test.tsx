/**
 * Create order on the Orders tab (phone review 2026-10-14, PW-01). A customer
 * account with two businesses and no order yet got a four-second snackbar,
 * "Select an existing assigned-customer order.", and could not start. Now it
 * chooses among its own businesses in a bottom sheet, with or without orders in
 * the list; an account with one business goes straight in; the staff roles keep
 * their customer search; an account with no business is told so in the sheet.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import OrderFlashList from '@/components/lists/OrderFlashList';
import { OrderService } from '@/services/order-service';
import type { OwnBusiness } from '@/features/customer/ownBusinesses';
import type { Order, OrderServiceResponse } from '@/types/order.types';
import { resetScreenFocus } from './focusHarness';

// The lists say when their rows were loaded while offline (useIsOffline); online here.
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false, useNetworkStatus: () => ({ isConnected: true }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: require('./focusHarness').useFocusEffect,
}));
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));
jest.mock('react-native-paper', () => Object.fromEntries(
  ['ActivityIndicator', 'Badge', 'IconButton', 'Portal', 'Snackbar', 'Surface'].map(name => [name, name])
));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useOrderLiveUpdates', () => ({ useOrderLiveUpdates: () => {} }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
jest.mock('@/features/filters/configs', () => ({ ORDER_FILTERS: { listKey: 'order-list' } }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: () => null,
  filteredEmptyProps: () => ({ activeFilterCount: 0 }),
}));
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => ({ request: {}, values: {} }) }));
let mockProfile: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: mockProfile } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/skeletons', () => ({ ListSkeleton: () => null }));
jest.mock('@/components/list-items', () => ({ MemoizedOrderItem: () => null }));
// The staff customer search: only whether Create order opens it matters here.
const mockSearchSheet = { open: jest.fn(), close: jest.fn() };
jest.mock('@/components/CustomerSearchBottomSheet', () => {
  const { forwardRef, useImperativeHandle } = require('react');
  return {
    CustomerSearchBottomSheet: forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      useImperativeHandle(ref, () => mockSearchSheet);
      return null;
    }),
  };
});
jest.mock('@/services/order-service', () => ({ OrderService: { getOrdersList: jest.fn() } }));
// The facility's answer to "which businesses are this account's own".
const mockReadOwnBusinesses = jest.fn<Promise<OwnBusiness[]>, []>();
// No clear answer about the account's access (an older facility): the guidance for an empty list stays.
jest.mock('@/features/customer/ownBusinesses', () => ({ readOwnBusinesses: () => mockReadOwnBusinesses(), readAccessStatus: async () => null }));

const AMBER: OwnBusiness = { id: 'business-amber', name: 'Amber Field Traders', city: 'Northgate' };
const BIRCH: OwnBusiness = { id: 'business-birch', name: 'Birchwood Produce', city: 'Southmere' };
const customerWith = (...assignedCustomerIds: string[]) => ({ id: 'profile-fictional', role: 'customer', name: 'Fictional Grower', assignedCustomerIds });

const getOrdersList = jest.mocked(OrderService.getOrdersList);
const push = jest.mocked(router.push);
const answer = (orders: Partial<Order>[]) => ({ success: true, message: '', data: orders, metadata: { has_more: false } } as OrderServiceResponse<Order[]>);
const NO_ORDERS = answer([]);
const ORDERS_FOR_BOTH = answer([
  { id: 'order-amber', customer_id: AMBER.id, status: 'OPEN', item_count: 2 },
  { id: 'order-birch', customer_id: BIRCH.id, status: 'OPEN', item_count: 1 },
]);

const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
beforeEach(() => {
  resetScreenFocus();
  getOrdersList.mockReset().mockResolvedValue(NO_ORDERS);
  mockReadOwnBusinesses.mockReset().mockResolvedValue([AMBER, BIRCH]);
  mockSearchSheet.open.mockClear();
  push.mockClear();
});

async function renderList(profile: Record<string, unknown>) {
  mockProfile = profile;
  await render(<OrderFlashList />);
}
const pressable = (label: string) => screen.getByRole('button', { name: label });
const tapCreateOrder = () => user.press(pressable('Create order'));
const has = (text: string) => expect(screen.getByText(text)).toBeOnTheScreen();
const lacks = (text: string | RegExp) => expect(screen.queryByText(text, hidden)).not.toBeOnTheScreen();
const businessRows = (all = false) => screen.queryAllByTestId(/^order-business-business-/, all ? hidden : undefined);
// The list draws no snackbar at all now: load errors are inline (§13.9). The stand-in is a host element with no role or text.
const snackbars = () => (screen.root ? [screen.root, ...screen.root.queryAll(() => true)] : []).filter(node => (node.type as unknown) === 'Snackbar');
const chooserIsOpen = (open: boolean) => (open ? has('Choose a business') : lacks('Choose a business'));

describe('a customer account with two businesses', () => {
  it('chooses one in a sheet when it has no order yet, and opens that business\'s order', async () => {
    await renderList(customerWith(AMBER.id, BIRCH.id));
    // Before the tap: the empty list, no chooser, nothing asked of the facility.
    has('No orders yet');
    chooserIsOpen(false);
    expect(mockReadOwnBusinesses).not.toHaveBeenCalled();

    await tapCreateOrder();
    chooserIsOpen(true);
    expect(businessRows().map(row => row.props.testID)).toEqual(['order-business-business-amber', 'order-business-business-birch']);
    expect(businessRows().map(row => row.queryAll(node => (node.type as unknown) === 'Text').map(node => node.props.children).slice(1)))
      .toEqual([['Amber Field Traders', 'Northgate'], ['Birchwood Produce', 'Southmere']]);
    expect(push).not.toHaveBeenCalled();
    // The dead end this replaces was a snackbar.
    expect(snackbars()).toHaveLength(0);
    lacks(/Select an existing|No assigned customer/);

    await user.press(businessRows()[1]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/orders/business-birch');
    chooserIsOpen(false);
    expect(snackbars()).toHaveLength(0);
    expect(mockSearchSheet.open).not.toHaveBeenCalled();
  });

  it('chooses in the same sheet when both businesses already have orders', async () => {
    getOrdersList.mockResolvedValue(ORDERS_FOR_BOTH);
    await renderList(customerWith(AMBER.id, BIRCH.id));
    lacks('No orders yet');

    await tapCreateOrder();
    chooserIsOpen(true);
    expect(businessRows()).toHaveLength(2);
    await user.press(businessRows()[0]);
    expect(push).toHaveBeenCalledWith('/orders/business-amber');
    expect(snackbars()).toHaveLength(0);
  });

  it('stays on the list when the sheet is closed with the X', async () => {
    await renderList(customerWith(AMBER.id, BIRCH.id));
    await tapCreateOrder();
    chooserIsOpen(true);
    await user.press(pressable('Close'));
    chooserIsOpen(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('offers no rows when the businesses cannot be read, and lists them after Try again', async () => {
    mockReadOwnBusinesses.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([AMBER, BIRCH]);
    await renderList(customerWith(AMBER.id, BIRCH.id));
    await tapCreateOrder();
    for (const text of ['Choose a business', "Couldn't load your businesses", 'Check your connection and try again.']) has(text);
    expect(businessRows(true)).toHaveLength(0);
    expect(snackbars()).toHaveLength(0);

    await user.press(pressable('Try again'));
    expect(mockReadOwnBusinesses).toHaveBeenCalledTimes(2);
    lacks("Couldn't load your businesses");
    expect(businessRows().map(row => row.props.accessibilityLabel)).toEqual(['Amber Field Traders, Northgate', 'Birchwood Produce, Southmere']);
    await user.press(businessRows()[1]);
    expect(push).toHaveBeenCalledWith('/orders/business-birch');
  });
});

describe('a customer account with one business', () => {
  it('goes straight to its order without asking the facility for a list', async () => {
    await renderList(customerWith(BIRCH.id));
    await tapCreateOrder();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/orders/business-birch');
    expect(mockReadOwnBusinesses).not.toHaveBeenCalled();
    chooserIsOpen(false);
    expect(mockSearchSheet.open).not.toHaveBeenCalled();
  });
});

describe('a customer account with no business on the phone', () => {
  it('is told that no business is linked when the facility lists none', async () => {
    mockReadOwnBusinesses.mockResolvedValue([]);
    await renderList(customerWith());
    await tapCreateOrder();
    expect(mockReadOwnBusinesses).toHaveBeenCalledTimes(1);
    for (const text of ['No business linked', 'No business is linked to your account. Ask your facility to link one.']) has(text);
    expect(businessRows(true)).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
    expect(snackbars()).toHaveLength(0);
    expect(mockSearchSheet.open).not.toHaveBeenCalled();
  });

  it('still chooses when the facility does list businesses: the phone holding none is not proof', async () => {
    // A sign-in whose lookup failed stores a profile with no list of customers.
    await renderList({ id: 'profile-fictional', role: 'customer', name: 'Fictional Grower' });
    await tapCreateOrder();
    expect(businessRows()).toHaveLength(2);
    lacks('No business linked');
    await user.press(businessRows()[0]);
    expect(push).toHaveBeenCalledWith('/orders/business-amber');
  });
});

describe('the staff roles', () => {
  it.each(['admin', 'supervisor', 'staff'])('%s keeps the customer search sheet and gets no chooser', async role => {
    await renderList({ id: 'profile-fictional', role, name: 'Fictional Employee' });
    await tapCreateOrder();
    expect(mockSearchSheet.open).toHaveBeenCalledTimes(1);
    chooserIsOpen(false);
    expect(mockReadOwnBusinesses).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
