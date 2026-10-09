import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import OrderItemCard from '../OrderItemCard';
import type { OrderItem } from '@/types/order.types';
import { getTokens, type Brand, type Mode } from '@/theme/tokens';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('../StockIndicator', () => 'StockIndicator');
let mockTheme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (state: unknown) => unknown) => sel({ theme: mockTheme }),
}));

const item: OrderItem = {
  id: 'line-1', order_id: 'order-1', grn_item_id: 'lot-1', requested_quantity: 3, created_at: '',
  grn_item: {
    id: 'lot-1', name: 'Fictional Onions', packaging: 'Bag', current_stock: 10, original_quantity: 10, gr_id: 'grn-1',
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

const texts = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType(Text).map(node => node.props.children).flat().map(String);
const byLabel = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (tree: ReturnType<typeof create>, label: string) =>
  byLabel(tree, label).props.onPress();

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('shows SAVED only after the server confirms the quantity', async () => {
  const save = deferred<boolean>();
  const onQuantityChange = jest.fn(() => save.promise);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={item} onQuantityChange={onQuantityChange} onRemove={jest.fn()} />); });
  await act(async () => { press(tree, 'Increase Fictional Onions by 1'); });
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(onQuantityChange).toHaveBeenCalledWith(4);
  expect(texts(tree)).toContain('Saving…');
  expect(texts(tree)).not.toContain('Saved');
  await act(async () => { save.resolve(true); await save.promise; });
  expect(texts(tree)).toContain('Saved');
  expect(texts(tree)).toContain('4');
  await act(async () => { tree.unmount(); });
});

it('reverts to the stored quantity when the server refuses the change', async () => {
  const onQuantityChange = jest.fn(() => Promise.resolve(false));
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={item} onQuantityChange={onQuantityChange} onRemove={jest.fn()} />); });
  await act(async () => { press(tree, 'Increase Fictional Onions by 1'); });
  expect(texts(tree)).toContain('4');
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(onQuantityChange).toHaveBeenCalledWith(4);
  expect(texts(tree)).toContain('3');
  expect(texts(tree)).not.toContain('4');
  expect(texts(tree)).not.toContain('Saved');
  await act(async () => { tree.unmount(); });
});

it.each([
  ['orange', 'light'],
  ['orange', 'dark'],
  ['gcsa', 'light'],
  ['gcsa', 'dark'],
] as const)('renders on themed surfaces in %s %s', async (brand, mode) => {
  mockTheme = { preference: mode, brand };
  const tokens = getTokens(brand, mode);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={{ ...item, grn_item: { ...item.grn_item!, weight: 1250.5, grn_date: '2026-10-09' } }} onQuantityChange={jest.fn()} onRemove={jest.fn()} />); });
  const container = tree.root.findAll(node => node.props.style?.backgroundColor === tokens.surface.card);
  expect(container.length).toBeGreaterThan(0);
  expect(texts(tree)).toContain('1,250.5 kg');
  expect(texts(tree)).toContain('9 Oct 2026');
  const remove = byLabel(tree, 'Remove Fictional Onions from order');
  expect(remove.findByProps({ name: 'trash-can-outline' }).props.color).toBe(tokens.status.negative.text);
  await act(async () => { tree.unmount(); });
  mockTheme = { preference: 'light', brand: 'orange' };
});
