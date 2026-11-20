/**
 * Order list rows, the order summary bar, quick-add chips and the customer search sheet render in all four themes with token colours.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import { MemoizedOrderItem } from '../list-items/MemoizedOrderItem';
import CustomerOrderSummary from '../CustomerOrderSummary';
import RecentItemsQuickAdd from '../RecentItemsQuickAdd';
import { CustomerSearchBottomSheet } from '../CustomerSearchBottomSheet';
import type { Order } from '@/types/order.types';

let mockState = { theme: { preference: 'light' as Mode, brand: 'orange' as Brand }, auth: { userProfile: { id: 'fictional-user' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

async function renderIn(element: React.ReactElement, brand: Brand, mode: Mode) {
  mockState = { ...mockState, theme: { preference: mode, brand } };
  await render(element);
}

type HostNode = NonNullable<typeof screen.root>;
/**
 * Icons are drawn as a bare 'Icon' host with no role or text (the vector-icons mock), so they can only be
 * found by walking the rendered tree.
 */
const iconsNamed = (name: string): HostNode[] => {
  const found: HostNode[] = [];
  const walk = (node: HostNode) => {
    if ((node.type as unknown) === 'Icon' && node.props.name === name) found.push(node);
    for (const child of node.children) if (typeof child !== 'string') walk(child as HostNode);
  };
  walk(screen.root as HostNode);
  return found;
};

describe.each(THEMES)('order components in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('order row shows a positive Dispatched tag with its icon', async () => {
    await renderIn(<MemoizedOrderItem order={dispatchedOrder} onPress={jest.fn()} />, brand, mode);
    expect(screen.getByText('Dispatched')).toBeOnTheScreen();
    expect(screen.getByLabelText('Dispatched')).toHaveStyle({ backgroundColor: t.status.positive.background });
    const icons = iconsNamed('check-circle');
    expect(icons).toHaveLength(1);
    expect(icons[0].props.color).toBe(t.status.positive.text);
    expect(screen.getByRole('button')).toHaveStyle({ backgroundColor: t.surface.card });
  });

  it('summary bar names its numbers and sits on a card surface', async () => {
    await renderIn(<CustomerOrderSummary order={openOrder} />, brand, mode);
    expect(screen.getByText('1 item')).toBeOnTheScreen();
    expect(screen.getByText('1 unit')).toBeOnTheScreen();
    expect(screen.root).toHaveStyle({ backgroundColor: t.surface.card });
  });

  it('quick-add chips use brand.subtle with brand.tint text and mark the selection', async () => {
    await renderIn(
      <RecentItemsQuickAdd customerId="fictional-customer" onItemSelected={jest.fn()} selectedItemName="Onions"
        allItems={[{ id: 'i-1', name: 'Onions' }, { id: 'i-2', name: 'Potatoes' }]} />,
      brand, mode,
    );
    // The chip that is not selected has the plain subtle fill; the selected one the stronger fill and the check.
    expect(screen.getByRole('button', { name: /Potatoes/ })).toHaveStyle({ backgroundColor: t.brand.subtle });
    expect(screen.getByRole('button', { name: /Onions/ })).toHaveStyle({ backgroundColor: t.brand.subtleStrong });
    expect(screen.getByText('Potatoes · Bag')).toHaveStyle({ color: t.brand.tint });
    expect(screen.getByRole('button', { name: /Onions/, selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Potatoes/, selected: false })).toBeOnTheScreen();
    expect(iconsNamed('check')).toHaveLength(1);
  });

  it('customer search sheet uses the sheet surface and a labelled close button', async () => {
    await renderIn(<CustomerSearchBottomSheet onSelect={jest.fn()} />, brand, mode);
    expect(screen.getByTestId('sheet')).toHaveStyle({ backgroundColor: t.surface.sheet });
    expect(screen.getByText('Select customer')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Close').length).toBeGreaterThan(0);
  });
});
