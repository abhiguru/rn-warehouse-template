import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import ItemCatalogBrowser from '../ItemCatalogBrowser';
import { OrderService } from '@/services/order-service';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return React.createElement('BottomSheet', null, props.children);
    }),
    BottomSheetFlatList: (props: any) => React.createElement('CatalogList', null,
      props.ListHeaderComponent, props.data.length ? props.data.map((item: any) =>
        React.createElement('CatalogItem', { key: item.id }, props.renderItem({ item }))) : props.ListEmptyComponent),
  };
});
jest.mock('@/hooks/useListColors', () => ({ useListColors: () => require('@/theme/listColors').listColors }));
jest.mock('@/services/order-service', () => ({ OrderService: {
  getAvailableItems: jest.fn(() => Promise.resolve({ success: true, data: [] })),
  searchCustomerItemsForOrder: jest.fn(() => Promise.resolve({ success: true, data: [] })),
} }));
jest.mock('@/services/stock-service', () => ({ StockService: {
  getCustomerGRNItems: jest.fn(() => Promise.resolve({ success: true, data: [] })),
} }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: {
  loadRecentlyAddedItems: jest.fn(() => Promise.resolve([])),
  cleanupExpiredItems: jest.fn(() => Promise.resolve()),
} }));
jest.mock('../StockIndicator', () => 'StockIndicator');
jest.mock('../RecentItemsQuickAdd', () => 'RecentItemsQuickAdd');

const emptyOrderItems: NonNullable<React.ComponentProps<typeof ItemCatalogBrowser>['currentOrderItems']> = [];

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

it('exposes catalog search and keeps rapid edits within the assigned customer without submitting', async () => {
  const add = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<ItemCatalogBrowser isVisible currentOrderItems={emptyOrderItems} customerId="customer-a" onClose={jest.fn()} onAddItems={add} />); });
  try {
    const input = tree.root.findByType(TextInput);
    expect(input.props.accessibilityLabel).toBe('Search stock items');
    await act(async () => { input.props.onChangeText('FXC7'); });
    await act(async () => { input.props.onChangeText('FXC701'); });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(OrderService.searchCustomerItemsForOrder).toHaveBeenCalledTimes(2);
    expect(OrderService.searchCustomerItemsForOrder).toHaveBeenLastCalledWith(expect.objectContaining({
      customer_id: 'customer-a', search_query: 'FXC701', search_type: 'auto', stock_filter_min: 1,
    }));
    expect(tree.root.findByType(TextInput).props.value).toBe('FXC701');
    expect(add).not.toHaveBeenCalled();
  } finally { await act(async () => { tree.unmount(); }); }
});

it('shows an empty search result and clearing search does not submit an order', async () => {
  const add = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<ItemCatalogBrowser isVisible currentOrderItems={emptyOrderItems} customerId="customer-a" onClose={jest.fn()} onAddItems={add} />); });
  try {
    await act(async () => { tree.root.findByType(TextInput).props.onChangeText('FXC702'); });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(JSON.stringify(tree.toJSON())).toContain('No stock available for');
    expect(OrderService.searchCustomerItemsForOrder).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'customer-a', search_query: 'FXC702' }));
    await act(async () => { tree.root.findByType(TextInput).props.onChangeText(''); });
    expect(tree.root.findByType(TextInput).props.value).toBe('');
    expect(OrderService.searchCustomerItemsForOrder).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  } finally { await act(async () => { tree.unmount(); }); }
});
