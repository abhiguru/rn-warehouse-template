/** Closing the keyboard blurs the input react-native says has the focus. */
import React from 'react';
import { Keyboard, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
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
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<Probe />); });
    expect(focused.blur).not.toHaveBeenCalled();
    act(() => handlers.keyboardDidHide());
    expect(focused.blur).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no input has the focus', async () => {
    const handlers: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      handlers[event] = handler;
      return { remove: jest.fn() };
    }) as never);
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(null as never);
    await act(async () => { create(<Probe />); });
    expect(() => act(() => handlers.keyboardDidHide())).not.toThrow();
  });
});
