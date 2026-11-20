/**
 * The card of a recently dispatched order: its total counts in what the lines are counted in (boxes, crates),
 * bags when the lines differ or the backend does not say, and the opened lines have no second fade of their own.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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

/** Whether any element of the rendered tree carries an `entering` animation prop. */
const hasEntering = (json: ReturnType<typeof screen.toJSON>): boolean =>
  [json ?? []].flat().some((node) => typeof node !== 'string' && (node.props.entering !== undefined || hasEntering((node.children ?? []) as never)));

const show = (packagings: Array<string | undefined>) => render(<RecentDispatchedOrderCard dispatch={dispatchOf(packagings)} onPress={jest.fn()} />);

describe('RecentDispatchedOrderCard total', () => {
  it('counts in boxes when every line is a Box lot', async () => {
    await show(['Box', 'Box']);
    expect(screen.getByText(/^4\s+boxes$/)).toBeOnTheScreen();
  });

  it('counts in units when the lines differ, and in bags when the backend names no packaging', async () => {
    const { unmount } = await show(['Box', 'Bag']);
    expect(screen.getByText(/^4\s+units$/)).toBeOnTheScreen();
    await unmount();
    await show([undefined]);
    expect(screen.getByText(/^2\s+bags$/)).toBeOnTheScreen();
  });

  it('opens its lines without an animation of their own', async () => {
    await show(['Box']);
    await userEvent.press(screen.getByRole('button', { expanded: false }));
    const section = screen.getByTestId('recent-dispatch-lines-d1');
    expect(section).toBeOnTheScreen();
    expect(hasEntering(screen.toJSON())).toBe(false);
  });
});
