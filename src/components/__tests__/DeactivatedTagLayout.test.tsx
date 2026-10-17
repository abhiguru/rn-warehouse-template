/**
 * Layout pins for the "Deactivated" tag (phone run at system font scale 2.0: tags beside the name
 * crushed it to a column of one or two letters). The tags sit in the flex:1 text column, in a
 * wrapping row, and the chevron is the only thing left beside the column.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { MemoizedOrderItem } from '../list-items/MemoizedOrderItem';
import { CustomerOrderGroupCard } from '../list-items/CustomerOrderGroupCard';
import { CustomerChoiceRows } from '../common/CustomerChoiceRows';
import type { Order } from '@/types/order.types';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'fictional-user' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrderWithItems: jest.fn() } }));

const order = {
  id: 'fictional-order', customer_id: 'fictional-customer', status: 'OPEN',
  customer: { id: 'fictional-customer', name: 'Fictional Traders', city: 'Fictional Town', active: false },
  item_count: 3, quantity_sum: 120, updated_at: '2026-10-10T08:00:00Z',
} as unknown as Order;

const flat = (node: ReactTestInstance) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const hostWithTestId = (tree: ReactTestRenderer, id: string) =>
  tree.root.findAll(node => (node.type as unknown) === 'View' && node.props.testID === id)[0];
const texts = (node: ReactTestInstance) =>
  node.findAll(n => (n.type as unknown) === 'Text').map(n => [].concat(n.props.children).join(''));
const ancestors = (node: ReactTestInstance) => {
  const list: ReactTestInstance[] = [];
  for (let p = node.parent; p; p = p.parent) list.push(p);
  return list;
};

async function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
}

function expectTagsInTextColumn(tree: ReactTestRenderer, id: string, name: string, expectedTags: string[]) {
  const tags = hostWithTestId(tree, id);
  expect(tags).toBeDefined();
  // A wrapping row, so two tags at a large text size go on two lines.
  expect(flat(tags)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  expect(texts(tags)).toEqual(expectedTags);
  // Its nearest flex:1 ancestor (the text column) also holds the name; so the name keeps the full width.
  const column = ancestors(tags).find(node => flat(node).flex === 1);
  expect(column).toBeDefined();
  expect(texts(column!)).toContain(name);
}

it('Orders list card: the tags are under the name in the text column and wrap', async () => {
  const tree = await mount(<MemoizedOrderItem order={order} onPress={jest.fn()} />);
  // An open order's status is no longer a tag (owner, 2026-10-17): the tag row holds Deactivated only.
  expectTagsInTextColumn(tree, 'order-card-tags', 'Fictional Traders', ['Deactivated']);
});

it('Queue card: the tags are under the counts in the text column and wrap', async () => {
  const tree = await mount(<CustomerOrderGroupCard order={order} isExpanded={false} onToggleExpand={jest.fn()} />);
  expectTagsInTextColumn(tree, 'queue-card-tags', 'Fictional Traders', ['Deactivated']);
});

it('Business chooser row: the tag is under the name in the text column and wraps', async () => {
  const tree = await mount(
    <CustomerChoiceRows
      customers={[{ id: 'b1', name: 'Fictional Traders', detail: 'Fictional Town', tag: 'Deactivated' }]}
      onPick={jest.fn()} hint="hint" testIDPrefix="order-business-" unnamedLabel="Customer"
    />,
  );
  expectTagsInTextColumn(tree, 'order-business-b1-tags', 'Fictional Traders', ['Deactivated']);
});
