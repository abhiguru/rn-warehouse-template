import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { GRNDispatchesTab } from '@/components/grn-details/GRNDispatchesTab';
import { GRNItemsTab } from '@/components/grn-details/GRNItemsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ theme: { preference: 'dark', brand: 'orange' } }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ theme: { preference: 'dark', brand: 'orange' } }),
}));

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const item = {
  id: 'line-a',
  item_name: 'Example Potatoes',
  qty: 100,
  stock: 80,
};

it('shows a retryable error instead of an empty-success dispatch state', async () => {
  const retry = jest.fn();
  await render(
    <GRNDispatchesTab
      items={[item]}
      dispatchesByItem={{}}
      error="Customer access denied"
      onRetry={retry}
    />
  );

  expect(screen.getByText("Couldn't load dispatches")).toBeOnTheScreen();
  expect(screen.getByText('Customer access denied')).toBeOnTheScreen();

  await userEvent.press(screen.getByRole('button', { name: 'Retry loading dispatches' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it('derives a safe dispatched total from quantity and stock while history loads', async () => {
  await render(<GRNItemsTab items={[item]} />);

  // Open the row: its details say how many bags were dispatched.
  await userEvent.press(screen.getByTestId('grn-item-row-line-a'));
  expect(screen.getByText('Dispatched 20 bags')).toBeOnTheScreen();
});
