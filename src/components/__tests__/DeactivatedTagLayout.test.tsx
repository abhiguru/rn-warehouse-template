/**
 * Layout pins for the "Deactivated" tag (phone run at system font scale 2.0: tags beside the name
 * crushed it to a column of one or two letters). The tags sit in the flex:1 text column, in a
 * wrapping row, and the chevron is the only thing left beside the column.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { MemoizedOrderItem } from '../list-items/MemoizedOrderItem';
import { CustomerOrderGroupCard } from '../list-items/CustomerOrderGroupCard';
import { CustomerChoiceRows } from '../common/CustomerChoiceRows';
import type { Order } from '@/types/order.types';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'fictional-user' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock('@/services/order-service', () => ({ OrderService: { getOrderWithItems: jest.fn() } }));

const order = {
  id: 'fictional-order', customer_id: 'fictional-customer', status: 'OPEN',
  customer: { id: 'fictional-customer', name: 'Fictional Traders', city: 'Fictional Town', active: false },
  item_count: 3, quantity_sum: 120, updated_at: '2026-10-10T08:00:00Z',
} as unknown as Order;

type Host = ReturnType<typeof screen.getByTestId>;
const flat = (node: Host) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const ancestors = (node: Host) => {
  const list: Host[] = [];
  for (let p = node.parent as Host | null; p; p = p.parent as Host | null) list.push(p);
  return list;
};

function expectTagsInTextColumn(id: string, name: string, expectedTags: string[]) {
  // The tag row has no role or text of its own: it is found by its test id.
  const tags = screen.getByTestId(id);
  // A wrapping row, so two tags at a large text size go on two lines.
  expect(flat(tags)).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
  const shown = within(tags).getAllByText(/.+/);
  expect(shown).toHaveLength(expectedTags.length);
  expectedTags.forEach((tag, i) => expect(shown[i]).toHaveTextContent(tag));
  // Its nearest flex:1 ancestor (the text column) also holds the name; so the name keeps the full width.
  const column = ancestors(tags).find(node => flat(node).flex === 1);
  expect(column).toBeDefined();
  expect(within(column!).getByText(name)).toBeOnTheScreen();
}

it('Orders list card: the tags are under the name in the text column and wrap', async () => {
  await render(<MemoizedOrderItem order={order} onPress={jest.fn()} />);
  // An open order's status is no longer a tag (owner, 2026-10-17): the tag row holds Deactivated only.
  expectTagsInTextColumn('order-card-tags', 'Fictional Traders', ['Deactivated']);
});

it('Queue card: the tags are under the counts in the text column and wrap', async () => {
  await render(<CustomerOrderGroupCard order={order} isExpanded={false} onToggleExpand={jest.fn()} />);
  expectTagsInTextColumn('queue-card-tags', 'Fictional Traders', ['Deactivated']);
});

it('Business chooser row: the tag is under the name in the text column and wraps', async () => {
  await render(
    <CustomerChoiceRows
      customers={[{ id: 'b1', name: 'Fictional Traders', detail: 'Fictional Town', tag: 'Deactivated' }]}
      onPick={jest.fn()} hint="hint" testIDPrefix="order-business-" unnamedLabel="Customer"
    />,
  );
  expectTagsInTextColumn('order-business-b1-tags', 'Fictional Traders', ['Deactivated']);
});
