import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';
import OrderItemCard from '../OrderItemCard';
import type { OrderItem } from '@/types/order.types';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('../StockIndicator', () => 'StockIndicator');
jest.mock('@/hooks/useListColors', () => ({ useListColors: () => require('@/theme/listColors').listColors }));

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
const press = (tree: ReturnType<typeof create>, label: string) =>
  tree.root.findAllByType(TouchableOpacity)
    .find(node => node.findAllByType(Text).some(t => t.props.children === label))!.props.onPress();

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('shows SAVED only after the server confirms the quantity', async () => {
  const save = deferred<boolean>();
  const onQuantityChange = jest.fn(() => save.promise);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={item} onQuantityChange={onQuantityChange} onRemove={jest.fn()} />); });
  await act(async () => { press(tree, '+'); });
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(onQuantityChange).toHaveBeenCalledWith(4);
  expect(texts(tree)).toContain('SAVING...');
  expect(texts(tree)).not.toContain('SAVED');
  await act(async () => { save.resolve(true); await save.promise; });
  expect(texts(tree)).toContain('SAVED');
  expect(texts(tree)).toContain('4');
  await act(async () => { tree.unmount(); });
});

it('reverts to the stored quantity when the server refuses the change', async () => {
  const onQuantityChange = jest.fn(() => Promise.resolve(false));
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<OrderItemCard item={item} onQuantityChange={onQuantityChange} onRemove={jest.fn()} />); });
  await act(async () => { press(tree, '+'); });
  expect(texts(tree)).toContain('4');
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(onQuantityChange).toHaveBeenCalledWith(4);
  expect(texts(tree)).toContain('3');
  expect(texts(tree)).not.toContain('4');
  expect(texts(tree)).not.toContain('SAVED');
  await act(async () => { tree.unmount(); });
});
