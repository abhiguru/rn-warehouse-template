/** Orders tab card: a deactivated business gets a neutral "Deactivated" tag (backend migration 82 field customer.active). */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { MemoizedOrderItem } from '../list-items/MemoizedOrderItem';
import type { Order } from '@/types/order.types';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'fictional-user' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const orderWith = (customer: Record<string, unknown>) => ({
  id: 'fictional-order', customer_id: 'fictional-customer', status: 'OPEN',
  customer: { id: 'fictional-customer', name: 'Fictional Traders', city: 'Fictional Town', ...customer },
  item_count: 3, quantity_sum: 120, updated_at: new Date().toISOString(),
} as unknown as Order);

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
const label = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.accessibilityLabel === 'string')[0].props.accessibilityLabel as string;

async function render(order: Order) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<MemoizedOrderItem order={order} onPress={jest.fn()} />); });
  return tree;
}

describe('Orders tab card of a deactivated business', () => {
  it('shows Deactivated and says so in the accessibility label', async () => {
    const tree = await render(orderWith({ active: false }));
    expect(texts(tree)).toContain('Deactivated');
    // An open order with items has no status tag (owner, 2026-10-17).
    expect(texts(tree)).not.toContain('Open');
    expect(label(tree).endsWith(', deactivated')).toBe(true);
  });

  it.each([['an active business', { active: true }], ['an older backend without the field', {}]])('shows no tag for %s', async (_n, customer) => {
    const tree = await render(orderWith(customer));
    expect(texts(tree)).not.toContain('Deactivated');
    expect(label(tree)).not.toContain('deactivated');
  });

  it('draws again when only customer.active changes on the same order', async () => {
    const onPress = jest.fn();
    const base = orderWith({ active: true });
    const tree = await (async () => {
      let r!: ReactTestRenderer;
      await act(async () => { r = create(<MemoizedOrderItem order={base} onPress={onPress} />); });
      return r;
    })();
    expect(texts(tree)).not.toContain('Deactivated');
    const next = { ...base, customer: { ...base.customer!, active: false } } as Order;
    expect(next.updated_at).toBe(base.updated_at);
    await act(async () => { tree.update(<MemoizedOrderItem order={next} onPress={onPress} />); });
    expect(texts(tree)).toContain('Deactivated');
  });
});

/**
 * Orders polish (owner, 2026-10-17): the units total is the main value on the right with its status tag under it
 * only when the tag says something, and TalkBack reads what the card shows, in card order.
 */
describe('Orders tab card: value column and TalkBack label', () => {
  const at = new Date(2026, 9, 16, 10, 30).toISOString();
  const order = (extra: Record<string, unknown>) => ({ ...orderWith({}), updated_at: at, ...extra } as unknown as Order);
  const value = (tree: ReactTestRenderer) => {
    const column = tree.root.findAll(node => node.props.testID === 'order-card-value' && (node.type as unknown) === 'View')[0];
    return column.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
  };

  it('shows the units total over its unit word, with no tag, for an open order with items', async () => {
    const tree = await render(order({}));
    expect(value(tree)).toEqual(['120', 'units']);
    expect(texts(tree)).toContain('3 items');
  });

  it('shows the tag under the value for a dispatched order, and only the tag for an order with no items', async () => {
    expect(value(await render(order({ status: 'DISPATCHED' })))).toEqual(['120', 'units', 'Dispatched']);
    expect(value(await render(order({ item_count: 0, quantity_sum: 0 })))).toEqual(['Empty']);
  });

  it('reads the card in order: customer, items and units, city, date; the status only when its tag shows', async () => {
    const date = texts(await render(order({}))).find(text => text.startsWith('Fictional Town · '))!.slice('Fictional Town · '.length);
    expect(label(await render(order({})))).toBe(`Order for Fictional Traders, 3 items · 120 units, Location: Fictional Town, ${date}`);
    expect(label(await render(order({ status: 'DISPATCHED' }))))
      .toBe(`Order for Fictional Traders, 3 items · 120 units, Dispatched, Location: Fictional Town, ${date}`);
  });

  it('reads why a search found the order, worded as on the Dispatch card', async () => {
    const items = [{ grn_items_item_name: 'Fictional Garlic', grn_items_package_mark: 'FG-1', grns_gr_no: null }];
    const tree = await (async () => {
      let r!: ReactTestRenderer;
      await act(async () => { r = create(<MemoizedOrderItem order={order({ items })} onPress={jest.fn()} words={['garlic']} />); });
      return r;
    })();
    expect(label(tree).endsWith(', Matched Fictional Garlic')).toBe(true);
  });
});
