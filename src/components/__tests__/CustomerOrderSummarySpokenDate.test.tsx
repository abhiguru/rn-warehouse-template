/** The order toolbar's saved time: after a day it is a date, written DD/MM/YY on screen and in words for a screen reader. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import CustomerOrderSummary from '../CustomerOrderSummary';
import type { Order } from '@/types/order.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));

it('reads the saved date in words ("9 Oct 2020"), while the toolbar shows 09/10/20', async () => {
  const order = { id: 'o1', updated_at: '2020-10-09T08:00:00.000Z', created_at: '2020-10-09T08:00:00.000Z', items: [] } as unknown as Order;
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<CustomerOrderSummary order={order} />); });
  const toolbar = tree.root.find(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessible === true);
  expect(toolbar.props.accessibilityLabel).toContain('9 Oct 2020');
  expect(toolbar.props.accessibilityLabel).not.toMatch(/\d\d\/\d\d\/\d\d/);
  const shown = tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat(Infinity).join(''));
  expect(shown.join('|')).toContain('09/10/20');
  await act(async () => { tree.unmount(); });
});
