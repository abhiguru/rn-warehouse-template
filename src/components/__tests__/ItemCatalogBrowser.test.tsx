import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import ItemCatalogBrowser from '../ItemCatalogBrowser';
import { OrderService } from '@/services/order-service';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-community/slider', () => 'Slider');
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return React.createElement('BottomSheet', null, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetFlatList: (props: any) => React.createElement('CatalogList', { onEndReached: props.onEndReached, contentContainerStyle: props.contentContainerStyle },
      props.ListHeaderComponent, props.data.length ? props.data.map((item: any) =>
        React.createElement('CatalogItem', { key: item.id, testID: `catalog-item-${item.id}` }, props.renderItem({ item }))) : props.ListEmptyComponent),
  };
});
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

const catalogItem = (id: string, name: string) => ({
  id, name, packaging: 'Bag', package_mark: '', current_stock: 5, original_quantity: 10,
  catalog_id: null, catalog: null, rack: '', weight: 10, gr_id: 'fictional-grn', grn_number: 'FXG001',
  grn_date: '2026-09-30', image_url: null, pricing_mode: 'MONTHLY', created_at: '', updated_at: '',
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

const listedItemIds = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType('CatalogItem' as never).map(node => String(node.props.testID).replace('catalog-item-', ''));

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockState = { theme: { preference: 'light', brand: 'orange' } }; });
afterEach(() => { jest.useRealTimers(); });

it('exposes catalog search and runs one remote search for the final text after rapid edits', async () => {
  const add = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<ItemCatalogBrowser isVisible currentOrderItems={emptyOrderItems} customerId="customer-a" onClose={jest.fn()} onAddItems={add} />); });
  try {
    const input = tree.root.findByType(TextInput);
    expect(input.props.accessibilityLabel).toBe('Search stock items');
    await act(async () => { input.props.onChangeText('FXC7'); });
    await act(async () => { input.props.onChangeText('FXC70'); });
    await act(async () => { input.props.onChangeText('FXC701'); });
    await act(async () => { jest.advanceTimersByTime(249); });
    expect(OrderService.searchCustomerItemsForOrder).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(OrderService.searchCustomerItemsForOrder).toHaveBeenCalledTimes(1);
    expect(OrderService.searchCustomerItemsForOrder).toHaveBeenLastCalledWith(expect.objectContaining({
      customer_id: 'customer-a', search_query: 'FXC701', search_type: 'auto', stock_filter_min: 1,
    }));
    expect(tree.root.findByType(TextInput).props.value).toBe('FXC701');
    expect(add).not.toHaveBeenCalled();
  } finally { await act(async () => { tree.unmount(); }); }
});

it('ignores a stale deferred search response that arrives after a newer search', async () => {
  const first = deferred<{ success: boolean; data: ReturnType<typeof catalogItem>[] }>();
  const second = deferred<{ success: boolean; data: ReturnType<typeof catalogItem>[] }>();
  jest.mocked(OrderService.searchCustomerItemsForOrder)
    .mockReturnValueOnce(first.promise as never)
    .mockReturnValueOnce(second.promise as never);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<ItemCatalogBrowser isVisible currentOrderItems={emptyOrderItems} customerId="customer-a" onClose={jest.fn()} onAddItems={jest.fn()} />); });
  try {
    await act(async () => { tree.root.findByType(TextInput).props.onChangeText('FXC7'); });
    await act(async () => { jest.advanceTimersByTime(250); });
    await act(async () => { tree.root.findByType(TextInput).props.onChangeText('FXC701'); });
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(OrderService.searchCustomerItemsForOrder).toHaveBeenCalledTimes(2);

    await act(async () => { second.resolve({ success: true, data: [catalogItem('newer', 'FXC701 Potatoes')] }); await second.promise; });
    expect(listedItemIds(tree)).toEqual(['newer']);

    await act(async () => { first.resolve({ success: true, data: [catalogItem('stale', 'FXC7 Onions')] }); await first.promise; });
    expect(listedItemIds(tree)).toEqual(['newer']);
    expect(JSON.stringify(tree.toJSON())).not.toContain('FXC7 Onions');
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

const catalogList = (tree: ReturnType<typeof create>) => tree.root.findByType('CatalogList' as never);

it('loads the next browse page when the list reaches its end', async () => {
  const page = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => catalogItem(`lot-${from + i}`, `Fictional lot ${from + i}`));
  jest.mocked(OrderService.getAvailableItems)
    .mockResolvedValueOnce({ success: true, message: '', data: page(0, 50), metadata: { has_more: true } } as never)
    .mockResolvedValueOnce({ success: true, message: '', data: page(50, 3), metadata: { has_more: false } } as never);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<ItemCatalogBrowser isVisible currentOrderItems={emptyOrderItems} customerId="customer-a" onClose={jest.fn()} onAddItems={jest.fn()} />); });
  try {
    expect(OrderService.getAvailableItems).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, page_size: 50 }));
    await act(async () => { await catalogList(tree).props.onEndReached(); });
    expect(OrderService.getAvailableItems).toHaveBeenLastCalledWith(expect.objectContaining({ customer_id: 'customer-a', offset: 50 }));
    expect(listedItemIds(tree)).toHaveLength(53);
    await act(async () => { await catalogList(tree).props.onEndReached(); });
    expect(OrderService.getAvailableItems).toHaveBeenCalledTimes(2);
  } finally { await act(async () => { tree.unmount(); }); }
});

it('loads the next search page from the current result count', async () => {
  const hits = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => catalogItem(`hit-${from + i}`, `Fictional onion ${from + i}`));
  jest.mocked(OrderService.searchCustomerItemsForOrder)
    .mockResolvedValueOnce({ success: true, message: '', data: hits(0, 50), metadata: { has_more: true } } as never)
    .mockResolvedValueOnce({ success: true, message: '', data: hits(50, 2), metadata: { has_more: false } } as never);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<ItemCatalogBrowser isVisible currentOrderItems={emptyOrderItems} customerId="customer-a" onClose={jest.fn()} onAddItems={jest.fn()} />); });
  try {
    await act(async () => { tree.root.findByType(TextInput).props.onChangeText('onion'); });
    await act(async () => { jest.advanceTimersByTime(250); });
    expect(listedItemIds(tree)).toHaveLength(50);
    await act(async () => { await catalogList(tree).props.onEndReached(); });
    expect(OrderService.searchCustomerItemsForOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({ search_query: 'onion', offset: 50, page_size: 50 }));
    expect(listedItemIds(tree)).toHaveLength(52);
  } finally { await act(async () => { tree.unmount(); }); }
});

const MODES: Mode[] = ['light', 'dark'];

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('in %s %s', (brand, mode) => {
  it('renders item cells with theme tokens and a status word beside the colour', async () => {
    mockState = { theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    jest.mocked(OrderService.getAvailableItems).mockResolvedValueOnce({
      success: true, message: '', data: [{ ...catalogItem('lot-a', 'Fictional potatoes'), current_stock: 1 }, { ...catalogItem('lot-b', 'Fictional onions'), current_stock: 0 }],
    } as never);
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<ItemCatalogBrowser isVisible currentOrderItems={emptyOrderItems} customerId="customer-a" onClose={jest.fn()} onAddItems={jest.fn()} />); });
    try {
      const json = JSON.stringify(tree.toJSON());
      expect(catalogList(tree).props.contentContainerStyle).toEqual(expect.objectContaining({ backgroundColor: t.background.base }));
      expect(json).toContain(t.surface.card);
      expect(json).toContain('Low stock');
      expect(json).toContain('Out of stock');
      expect(json).toContain(t.status.critical.text);
      expect(json).toContain(t.status.negative.text);
      expect(json).not.toMatch(/OUT|LOW/);
      const input = tree.root.findByType(TextInput);
      expect(input.props.placeholderTextColor).toBe(t.text.placeholder);
    } finally { await act(async () => { tree.unmount(); }); }
  });
});
