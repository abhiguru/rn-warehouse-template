/** "Stop this rate": the last-day chips show DD/MM/YY and are read aloud as dates in words. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StopRateForm } from '../components/StopRateForm';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

it('reads Today and the end-of-period chips as dates in words', async () => {
  await render(
    <StopRateForm body="Body" today="2026-10-14" choice="today" day="2026-10-14" onChange={jest.fn()} busy={false} onStop={jest.fn()} onCancel={jest.fn()} />,
  );
  expect(screen.getAllByRole('radio')[0]).toHaveAccessibleName(/14 Oct 2026/);
  expect(screen.getByRole('radio', { name: '31 Oct 2026' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: '31 Mar 2027' })).toBeOnTheScreen();
  expect(screen.queryByRole('radio', { name: /\d\d\/\d\d\/\d\d/ })).not.toBeOnTheScreen();
  expect(screen.getByText('31/10/26')).toBeOnTheScreen();
  expect(screen.getByText('31/03/27')).toBeOnTheScreen();
});
