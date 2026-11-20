/** Closing the keyboard blurs the input react-native says has the focus. */
import React from 'react';
import { Keyboard, TextInput } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useBlurOnKeyboardHide } from '../useBlurOnKeyboardHide';

function Probe() {
  useBlurOnKeyboardHide();
  return null;
}

describe('useBlurOnKeyboardHide', () => {
  afterEach(() => jest.restoreAllMocks());

  it('blurs the focused input on keyboardDidHide, and not before', async () => {
    const handlers: Record<string, () => void> = {};
    const remove = jest.fn();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      handlers[event] = handler;
      return { remove };
    }) as never);
    const focused = { blur: jest.fn() };
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(focused as never);
    const { unmount } = await render(<Probe />);
    expect(focused.blur).not.toHaveBeenCalled();
    await act(() => handlers.keyboardDidHide());
    expect(focused.blur).toHaveBeenCalledTimes(1);
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no input has the focus', async () => {
    const handlers: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      handlers[event] = handler;
      return { remove: jest.fn() };
    }) as never);
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(null as never);
    await render(<Probe />);
    await act(() => handlers.keyboardDidHide());
  });
});
