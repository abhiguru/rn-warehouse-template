/**
 * Create order on the Orders tab (phone review 2026-10-14, PW-01). A customer
 * account with two businesses and no order yet got a four-second snackbar,
 * "Select an existing assigned-customer order.", and could not start. Now it
 * chooses among its own businesses in a bottom sheet, with or without orders in
 * the list; an account with one business goes straight in; the staff roles keep
 * their customer search; an account with no business is told so in the sheet.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  resetScreenFocus();
  getOrdersList.mockReset().mockResolvedValue(NO_ORDERS);
  mockReadOwnBusinesses.mockReset().mockResolvedValue([AMBER, BIRCH]);
  mockSearchSheet.open.mockClear();
  push.mockClear();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
});

async function renderList(profile: Record<string, unknown>) {
  mockProfile = profile;
  await act(async () => {
    tree = create(<OrderFlashList />);
  });
}
const pressable = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const tapCreateOrder = () => act(async () => pressable('Create order').props.onPress());
const texts = () => tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
const businessRows = () => tree!.root.findAll(node => typeof node.props.testID === 'string' && node.props.testID.startsWith('order-business-business-') && typeof node.props.onPress === 'function');
// The list draws no snackbar at all now: load errors are inline (§13.9).
const snackbar = () => tree!.root.findAll(node => (node.type as unknown) === 'Snackbar')[0];
const chooserIsOpen = () => texts().includes('Choose a business');

describe('a customer account with two businesses', () => {
  it('chooses one in a sheet when it has no order yet, and opens that business\'s order', async () => {
    await renderList(customerWith(AMBER.id, BIRCH.id));
    // Before the tap: the empty list, no chooser, nothing asked of the facility.
    expect(texts()).toContain('No orders yet');
    expect(chooserIsOpen()).toBe(false);
    expect(mockReadOwnBusinesses).not.toHaveBeenCalled();

    await tapCreateOrder();
    expect(chooserIsOpen()).toBe(true);
    expect(businessRows().map(row => row.props.testID)).toEqual(['order-business-business-amber', 'order-business-business-birch']);
    expect(businessRows().map(row => row.findAll(node => (node.type as unknown) === 'Text').map(node => node.props.children).slice(1)))
      .toEqual([['Amber Field Traders', 'Northgate'], ['Birchwood Produce', 'Southmere']]);
    expect(push).not.toHaveBeenCalled();
    // The dead end this replaces was a snackbar.
    expect(snackbar()).toBeUndefined();
    expect(texts().join(' ')).not.toMatch(/Select an existing|No assigned customer/);

    await act(async () => businessRows()[1].props.onPress());
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/orders/business-birch');
    expect(chooserIsOpen()).toBe(false);
    expect(snackbar()).toBeUndefined();
    expect(mockSearchSheet.open).not.toHaveBeenCalled();
  });

  it('chooses in the same sheet when both businesses already have orders', async () => {
    getOrdersList.mockResolvedValue(ORDERS_FOR_BOTH);
    await renderList(customerWith(AMBER.id, BIRCH.id));
    expect(texts()).not.toContain('No orders yet');

    await tapCreateOrder();
    expect(chooserIsOpen()).toBe(true);
    expect(businessRows()).toHaveLength(2);
    await act(async () => businessRows()[0].props.onPress());
    expect(push).toHaveBeenCalledWith('/orders/business-amber');
    expect(snackbar()).toBeUndefined();
  });

  it('stays on the list when the sheet is cancelled', async () => {
    await renderList(customerWith(AMBER.id, BIRCH.id));
    await tapCreateOrder();
    expect(chooserIsOpen()).toBe(true);
    await act(async () => pressable('Cancel').props.onPress());
    expect(chooserIsOpen()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('offers no rows when the businesses cannot be read, and lists them after Try again', async () => {
    mockReadOwnBusinesses.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([AMBER, BIRCH]);
    await renderList(customerWith(AMBER.id, BIRCH.id));
    await tapCreateOrder();
    expect(texts()).toEqual(expect.arrayContaining(['Choose a business', "Couldn't load your businesses", 'Check your connection and try again.']));
    expect(businessRows()).toHaveLength(0);
    expect(snackbar()).toBeUndefined();

    await act(async () => pressable('Try again').props.onPress());
    expect(mockReadOwnBusinesses).toHaveBeenCalledTimes(2);
    expect(texts()).not.toContain("Couldn't load your businesses");
    expect(businessRows().map(row => row.props.accessibilityLabel)).toEqual(['Amber Field Traders, Northgate', 'Birchwood Produce, Southmere']);
    await act(async () => businessRows()[1].props.onPress());
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
    expect(chooserIsOpen()).toBe(false);
    expect(mockSearchSheet.open).not.toHaveBeenCalled();
  });
});

describe('a customer account with no business on the phone', () => {
  it('is told that no business is linked when the facility lists none', async () => {
    mockReadOwnBusinesses.mockResolvedValue([]);
    await renderList(customerWith());
    await tapCreateOrder();
    expect(mockReadOwnBusinesses).toHaveBeenCalledTimes(1);
    expect(texts()).toEqual(expect.arrayContaining(['No business linked', 'No business is linked to your account. Ask your facility to link one.']));
    expect(businessRows()).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
    expect(snackbar()).toBeUndefined();
    expect(mockSearchSheet.open).not.toHaveBeenCalled();
  });

  it('still chooses when the facility does list businesses: the phone holding none is not proof', async () => {
    // A sign-in whose lookup failed stores a profile with no list of customers.
    await renderList({ id: 'profile-fictional', role: 'customer', name: 'Fictional Grower' });
    await tapCreateOrder();
    expect(businessRows()).toHaveLength(2);
    expect(texts()).not.toContain('No business linked');
    await act(async () => businessRows()[0].props.onPress());
    expect(push).toHaveBeenCalledWith('/orders/business-amber');
  });
});

describe('the staff roles', () => {
  it.each(['admin', 'supervisor', 'staff'])('%s keeps the customer search sheet and gets no chooser', async role => {
    await renderList({ id: 'profile-fictional', role, name: 'Fictional Employee' });
    await tapCreateOrder();
    expect(mockSearchSheet.open).toHaveBeenCalledTimes(1);
    expect(chooserIsOpen()).toBe(false);
    expect(mockReadOwnBusinesses).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
