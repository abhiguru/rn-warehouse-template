/** KeyValueCell: a date value is written DD/MM/YY on screen and read in words ("9 Oct 2026") through `spokenValue`. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { KeyValueCell, KeyValueGroup } from '../fiori/KeyValueCell';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

/** The one thing a screen reader lands on for the cell: exactly one element carries a label, and it is this one. */
const expectOnlyLabel = (label: string) => {
  expect(screen.getAllByLabelText(/.+/)).toHaveLength(1);
  expect(screen.getByLabelText(label)).toBeOnTheScreen();
};

it('reads spokenValue in the label and shows value', async () => {
  await render(<KeyValueCell keyLabel="Last dispatch" value="09/10/26" spokenValue="9 Oct 2026" />);
  expectOnlyLabel('Last dispatch, 9 Oct 2026');
  expect(screen.getByText('09/10/26')).toBeOnTheScreen();
});

it('reads the value itself when there is no spokenValue, and a pressable cell too', async () => {
  await render(<KeyValueCell keyLabel="Mark" value="A1" />);
  expectOnlyLabel('Mark, A1');
  await screen.unmount();
  await render(<KeyValueCell keyLabel="Date" value="09/10/26" spokenValue="9 Oct 2026" actionable onPress={jest.fn()} />);
  expectOnlyLabel('Date, 9 Oct 2026');
  expect(screen.getByRole('button', { name: 'Date, 9 Oct 2026' })).toBeOnTheScreen();
});

it('a group passes spokenValue through', async () => {
  await render(<KeyValueGroup items={[{ key: 'Date', value: '09/10/26', spokenValue: '9 Oct 2026' }]} />);
  expectOnlyLabel('Date, 9 Oct 2026');
});
