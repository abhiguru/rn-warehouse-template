/**
 * ui/Input: selectTextOnFocus is off unless asked for, and the caller's ref does not take the
 * field's own ref away (the clear button still refocuses).
 */
import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { getTokens } from '@/theme/tokens';
import { Input } from '../ui/Input';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

it('selects nothing on focus by default, and the whole value when asked', async () => {
  const plain = await render(<Input label="Rent" value="11.00" onChangeText={() => {}} />);
  // No query or matcher reads selectTextOnFocus: it is a prop of the native field.
  expect(screen.getByDisplayValue('11.00')).toHaveProp('selectTextOnFocus', false);
  await plain.unmount();
  await render(<Input label="Rent" value="11.00" onChangeText={() => {}} selectTextOnFocus />);
  expect(screen.getByDisplayValue('11.00')).toHaveProp('selectTextOnFocus', true);
});

it('a read-only field still selects on focus', async () => {
  await render(<Input label="Rent" value="11.00" readOnly />);
  expect(screen.getByDisplayValue('11.00')).toHaveProp('selectTextOnFocus', true);
});

it('the caller gets the TextInput and the clear button focuses it', async () => {
  const user = userEvent.setup({ delay: 0 });
  const callerRef = jest.fn();
  await render(<Input label="Rent" value="11.00" onChangeText={() => {}} ref={callerRef} />);
  const given = callerRef.mock.calls.map(call => call[0]).filter(Boolean).pop();
  expect(given).toBeTruthy();
  const focus = jest.spyOn(given, 'focus').mockImplementation(() => {});
  // userEvent.press does not focus a TextInput here, so the focus event is sent directly.
  await fireEvent(screen.getByLabelText('Rent'), 'focus', {});
  await user.press(screen.getByRole('button', { name: 'Clear rent' }));
  expect(focus).toHaveBeenCalledTimes(1);
});

it('CR-67: re-rendering does not detach and re-attach the caller\'s ref', async () => {
  const callerRef = jest.fn();
  const { rerender } = await render(<Input label="Rent" value="11.00" onChangeText={() => {}} ref={callerRef} />);
  expect(callerRef).toHaveBeenCalledTimes(1);
  await rerender(<Input label="Rent" value="12.00" onChangeText={() => {}} ref={callerRef} />);
  await rerender(<Input label="Rent" value="13.00" onChangeText={() => {}} ref={callerRef} />);
  // Once, with the node: never null in between.
  expect(callerRef).toHaveBeenCalledTimes(1);
  expect(callerRef.mock.calls[0][0]).toBeTruthy();
});

it('invalid draws the error outline with no message under the field; the caller hint carries the reason', async () => {
  const error = getTokens('orange', 'light').status.negative.border;
  const { rerender } = await render(
    <Input label="Up to (kg)" value="10" onChangeText={() => undefined} invalid accessibilityHint="Must include 12 kg" />
  );
  expect(screen.queryByText(/Must include/)).not.toBeOnTheScreen();
  const field = screen.getByLabelText('Up to (kg)');
  expect(field).toHaveProp('accessibilityHint', 'Must include 12 kg');
  expect(screen.getByHintText('Must include 12 kg')).toBe(field);
  // The outline is on the view around the field.
  expect(field.parent).toHaveStyle({ borderWidth: 2, borderColor: error });
  await rerender(<Input label="Up to (kg)" value="10" onChangeText={() => undefined} />);
  expect(screen.getByLabelText('Up to (kg)').parent).not.toHaveStyle({ borderWidth: 2 });
});
