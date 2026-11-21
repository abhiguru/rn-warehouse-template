/** The order toolbar's saved time: after a day it is a date, written DD/MM/YY on screen and in words for a screen reader. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
  await render(<CustomerOrderSummary order={order} />);
  expect(screen.getByLabelText(/9 Oct 2020/)).toBeOnTheScreen();
  expect(screen.queryByLabelText(/\d\d\/\d\d\/\d\d/)).not.toBeOnTheScreen();
  expect(screen.getByText(/09\/10\/20/)).toBeOnTheScreen();
});
