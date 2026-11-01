/**
 * The card of a recently dispatched order: its total counts in what the lines are counted in (boxes, crates),
 * bags when the lines differ or the backend does not say, and the opened lines have no second fade of their own.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { RecentDispatchedOrderCard } from '../RecentDispatchedOrderCard';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const line = (packaging?: string) => ({
  item_name: 'Tamarind', disp_qty: 2, rack: null, package_mark: null, gr_no: 'DV0102', weight: 30, grn_qty: 188, grn_id: 'g1', ...(packaging ? { packaging } : {}),
});
const dispatchOf = (packagings: Array<string | undefined>): RecentDispatchedOrder =>
  ({
    dispatch_id: 'd1', disp_no: 'D1', disp_date: '2026-10-21', customer_id: 'c1', customer_name: 'Green Valley Traders',
    order_id: 'o1', order_no: 'O1', item_count: packagings.length, total_qty: 2 * packagings.length, registration: null,
    created_by_name: 'Ravi Example', items: packagings.map(line),
  }) as unknown as RecentDispatchedOrder;

let tree: ReactTestRenderer;
const texts = () =>
  tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat(Infinity).join(''));
const show = (packagings: Array<string | undefined>) => {
  act(() => { tree = create(<RecentDispatchedOrderCard dispatch={dispatchOf(packagings)} onPress={jest.fn()} />); });
};
afterEach(() => act(() => tree?.unmount()));

describe('RecentDispatchedOrderCard total', () => {
  it('counts in boxes when every line is a Box lot', () => {
    show(['Box', 'Box']);
    expect(texts().some((t) => /^4\s+boxes$/.test(t.replace(/\u00A0/g, ' ')))).toBe(true);
  });

  it('counts in units when the lines differ, and in bags when the backend names no packaging', () => {
    show(['Box', 'Bag']);
    expect(texts().some((t) => /^4\s+units$/.test(t.replace(/\u00A0/g, ' ')))).toBe(true);
    act(() => tree.unmount());
    show([undefined]);
    expect(texts().some((t) => /^2\s+bags$/.test(t.replace(/\u00A0/g, ' ')))).toBe(true);
  });

  it('opens its lines without an animation of their own', () => {
    show(['Box']);
    act(() => tree.root.findAll((n) => n.props.accessibilityState?.expanded === false && typeof n.props.onPress === 'function' && typeof n.type !== 'string')[0].props.onPress());
    const section = tree.root.findByProps({ testID: 'recent-dispatch-lines-d1' });
    expect(section).toBeTruthy();
    expect(tree.root.findAll((n) => n.props.entering !== undefined)).toHaveLength(0);
  });
});
