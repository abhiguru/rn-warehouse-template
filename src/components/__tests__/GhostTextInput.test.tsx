import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { GhostTextInput } from '../GhostTextInput';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const suggestionName = /^Use suggestion/;

// testvm2 known issue 5: an empty dispatch form showed a registration from an
// earlier session's dispatch as if it had been typed into the field.
it('shows no suggestion in an empty field and completes what the user types', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const getSuggestion = jest.fn(async () => 'GJ01TEST0001');
  const onChangeText = jest.fn();
  const props = { getSuggestion, onChangeText, suggestionContext: 'customer-a', placeholder: 'Vehicle registration', debounceMs: 100 };
  const { rerender } = await render(<GhostTextInput {...props} value="" />);
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(getSuggestion).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: suggestionName })).not.toBeOnTheScreen();
  expect(JSON.stringify(screen.toJSON())).not.toContain('GJ01TEST0001');

  await rerender(<GhostTextInput {...props} value="GJ" />);
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(getSuggestion).toHaveBeenLastCalledWith('GJ', 'customer-a');
  const accept = screen.getByRole('button', { name: suggestionName });
  expect(accept).toBeOnTheScreen();
  await user.press(accept);
  expect(onChangeText).toHaveBeenCalledWith('GJ01TEST0001');

  await rerender(<GhostTextInput {...props} value="" />);
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(screen.queryByRole('button', { name: suggestionName })).not.toBeOnTheScreen();
});
