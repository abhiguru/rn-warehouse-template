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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

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
  it('shows Deactivated next to the status tag and says so in the accessibility label', async () => {
    const tree = await render(orderWith({ active: false }));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Deactivated', 'Open']));
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
