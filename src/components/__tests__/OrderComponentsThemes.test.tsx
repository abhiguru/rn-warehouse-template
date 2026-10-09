/**
 * Order list rows, the order summary bar, quick-add chips, the customer list and
 * the customer search sheet render in all four themes with token colours.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { MemoizedOrderItem } from '../list-items/MemoizedOrderItem';
import CustomerOrderSummary from '../CustomerOrderSummary';
import RecentItemsQuickAdd from '../RecentItemsQuickAdd';
import { CustomerList } from '../CustomerList';
import { CustomerSearchBottomSheet } from '../CustomerSearchBottomSheet';
import type { Order } from '@/types/order.types';
import type { CustomerListItem } from '@/types/customer.types';

let mockState = { theme: { preference: 'light' as Mode, brand: 'orange' as Brand }, auth: { userProfile: { id: 'fictional-user' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-gesture-handler', () => ({ ScrollView: require('react-native').ScrollView }));
jest.mock('@/services/recent-items-service', () => ({
  RecentItemsService: { getRecentItemsForCustomer: jest.fn(() => Promise.resolve([])) },
}));
jest.mock('@/services/recent-customers-service', () => ({
  RecentCustomersService: { getRecentCustomers: jest.fn(() => Promise.resolve([])), addRecentCustomer: jest.fn() },
}));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn(() => Promise.resolve([])) } }));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { FlatList, TextInput, View } = require('react-native');
  const BottomSheet = React.forwardRef(({ children, backgroundStyle }: { children: React.ReactNode; backgroundStyle: object }, _ref: unknown) =>
    React.createElement(View, { style: backgroundStyle, testID: 'sheet' }, children));
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetTextInput: React.forwardRef((props: object, ref: unknown) => React.createElement(TextInput, { ...props, ref })),
    BottomSheetFlatList: FlatList,
  };
});

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

const dispatchedOrder = {
  id: 'fictional-order', customer_id: 'fictional-customer', status: 'DISPATCHED',
  customer: { id: 'fictional-customer', name: 'Fictional Traders', city: 'Fictional Town' },
  item_count: 3, quantity_sum: 120, updated_at: new Date().toISOString(),
} as unknown as Order;

const openOrder = {
  ...dispatchedOrder,
  status: 'OPEN',
  created_at: new Date().toISOString(),
  items: [{ id: 'line-1', requested_quantity: 1, item_status: 'pending' }],
} as unknown as Order;

const customers = [
  { id: 'c-1', name: 'Fictional Traders', mobile: '9876543210', city: 'Fictional Town', active: true },
  { id: 'c-2', name: 'Retired Fictional Co', active: false },
] as unknown as CustomerListItem[];

async function renderIn(element: React.ReactElement, brand: Brand, mode: Mode) {
  mockState = { ...mockState, theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
}

const allText = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));

const styleList = (style: unknown) => [style].flat(4).filter(Boolean) as Array<Record<string, unknown>>;
const hasStyle = (tree: ReactTestRenderer, key: string, value: string) =>
  tree.root.findAll(node => styleList(node.props.style).some(s => s[key] === value)).length > 0;

describe.each(THEMES)('order components in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('order row shows a positive Dispatched tag with its icon', async () => {
    const tree = await renderIn(<MemoizedOrderItem order={dispatchedOrder} onPress={jest.fn()} />, brand, mode);
    expect(allText(tree)).toContain('Dispatched');
    expect(hasStyle(tree, 'backgroundColor', t.status.positive.background)).toBe(true);
    expect(tree.root.findAll(node => node.props.name === 'check-circle' && node.props.color === t.status.positive.text).length).toBe(1);
    expect(hasStyle(tree, 'backgroundColor', t.surface.card)).toBe(true);
    await act(async () => tree.unmount());
  });

  it('summary bar names its numbers and sits on a card surface', async () => {
    const tree = await renderIn(<CustomerOrderSummary order={openOrder} />, brand, mode);
    const text = allText(tree);
    expect(text).toContain('1 item');
    expect(text).toContain('1 unit');
    expect(hasStyle(tree, 'backgroundColor', t.surface.card)).toBe(true);
    await act(async () => tree.unmount());
  });

  it('quick-add chips use brand.subtle with brand.tint text and mark the selection', async () => {
    const tree = await renderIn(
      <RecentItemsQuickAdd customerId="fictional-customer" onItemSelected={jest.fn()} selectedItemName="Onions"
        allItems={[{ id: 'i-1', name: 'Onions' }, { id: 'i-2', name: 'Potatoes' }]} />,
      brand, mode,
    );
    expect(hasStyle(tree, 'backgroundColor', t.brand.subtle)).toBe(true);
    expect(hasStyle(tree, 'color', t.brand.tint)).toBe(true);
    expect(tree.root.findAll(node => node.props.name === 'check').length).toBe(1);
    await act(async () => tree.unmount());
  });

  it('customer list formats mobiles and tags inactive customers', async () => {
    const tree = await renderIn(
      <CustomerList customers={customers} loading={false} refreshing={false} onRefresh={jest.fn()}
        onEditCustomer={jest.fn()} onInactivateCustomer={jest.fn()} />,
      brand, mode,
    );
    const text = allText(tree);
    expect(text).toContain('+91 98765 43210');
    expect(text).toContain('Inactive');
    expect(hasStyle(tree, 'backgroundColor', t.status.neutral.background)).toBe(true);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Edit Fictional Traders').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  it('customer list empty state offers to add a customer', async () => {
    const tree = await renderIn(
      <CustomerList customers={[]} loading={false} refreshing={false} onRefresh={jest.fn()}
        onEditCustomer={jest.fn()} onInactivateCustomer={jest.fn()} />,
      brand, mode,
    );
    const text = allText(tree);
    expect(text).toContain('No customers yet');
    expect(text).toContain('Add customer');
    await act(async () => tree.unmount());
  });

  it('customer search sheet uses the sheet surface and a labelled close button', async () => {
    const tree = await renderIn(<CustomerSearchBottomSheet onSelect={jest.fn()} />, brand, mode);
    expect(hasStyle(tree, 'backgroundColor', t.surface.sheet)).toBe(true);
    expect(allText(tree)).toContain('Select customer');
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Close customer search').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });
});
