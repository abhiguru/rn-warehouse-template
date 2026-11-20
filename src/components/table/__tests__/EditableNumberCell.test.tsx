/**
 * The cell of an editable table. A touch that starts over a cell without the focus is the list's
 * (so a vertical swipe over a column of cells scrolls the page, P2a-7); a tap focuses the cell.
 */
import React from 'react';
import type { TextInputRef } from '@/types/nativeRefs';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { EditableNumberCell } from '../EditableNumberCell';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const LABEL = 'Charge, dispatch I0001';

async function renderCell(props: Partial<React.ComponentProps<typeof EditableNumberCell>> = {}) {
  const user = userEvent.setup({ delay: 0 });
  const ref = React.createRef<TextInputRef>();
  const element = (extra: Partial<React.ComponentProps<typeof EditableNumberCell>> = {}) => (
    <EditableNumberCell ref={ref} value="5.00" onChangeText={() => {}} label={LABEL} width={92} testID="cell" {...props} {...extra} />
  );
  await render(element());
  const input = () => screen.getByLabelText(LABEL);
  // The cell around the input is the Pressable; the view between decides whether the input takes touches
  // (Android's text input ignores its own pointerEvents). Neither has a role or a text, so they are found by testID.
  const tap = () => screen.getByTestId('cell-tap');
  const touch = () => screen.getByTestId('cell-touch');
  const rerender = async (value: string) => {
    await screen.rerender(<EditableNumberCell value={value} onChangeText={() => {}} label={LABEL} width={92} testID="cell" />);
  };
  return { user, ref, input, tap, touch, rerender };
}

describe('a cell without the focus', () => {
  it('lets touches through to the list: the view around the input takes none, and the cell around it is a Pressable', async () => {
    const { input, tap, touch } = await renderCell();
    expect(touch()).toHaveProp('pointerEvents', 'none');
    // Not on the input itself: Android's native text input would take the touch anyway.
    expect(input().props.pointerEvents).toBeUndefined();
    expect(tap()).toBeOnTheScreen();
  });

  it('is focused by a tap on the Pressable, after the start callback; the wrapper never takes touches, focused or not', async () => {
    const onStart = jest.fn();
    const { user, input, tap, ref, touch } = await renderCell({ onStart });
    const focus = jest.fn();
    Object.assign(ref.current as object, { focus, isFocused: () => false, setSelection: jest.fn() });
    await user.press(tap());
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(onStart.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
    // the caller's ref got the same input: the focus put on it is the one the tap called
    expect(ref.current).toHaveProperty('focus', focus);
    expect(touch()).toHaveProp('pointerEvents', 'none');
    await fireEvent(input(), 'focus', {});
    expect(touch()).toHaveProp('pointerEvents', 'none');
    await fireEvent(input(), 'blur', {});
    expect(touch()).toHaveProp('pointerEvents', 'none');
  });

  it('selects all its text on a second tap instead of focusing again', async () => {
    const { user, input, tap, ref } = await renderCell({ value: '12.5' });
    const focus = jest.fn();
    const setSelection = jest.fn();
    let focused = false;
    Object.assign(ref.current as object, { focus, setSelection, isFocused: () => focused });
    await user.press(tap());
    expect(focus).toHaveBeenCalledTimes(1);
    expect(setSelection).not.toHaveBeenCalled();
    focused = true;
    await fireEvent(input(), 'focus', {});
    await user.press(tap());
    expect(focus).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith(0, 4);
    // what is typed counts, not the value it started from
    await fireEvent.changeText(input(), '125');
    await user.press(tap());
    expect(setSelection).toHaveBeenLastCalledWith(0, 3);
  });

  it('tells the caller when it is pressed and let go', async () => {
    const onHold = jest.fn();
    const { user, tap } = await renderCell({ onHold });
    await user.press(tap());
    expect(onHold.mock.calls).toEqual([[true], [false]]);
  });

  it('keeps its spoken label, the error in the hint and its key rules', async () => {
    const { input } = await renderCell({ error: 'Enter a charge from 0 to 999999.', returnKeyType: 'done' });
    expect(input()).toHaveAccessibleName(LABEL);
    expect(input()).toHaveProp('accessibilityHint', 'Enter a charge from 0 to 999999.');
    expect(input().props).toMatchObject({
      returnKeyType: 'done',
      keyboardType: 'decimal-pad',
      selectTextOnFocus: true,
    });
  });

  it('takes no tap when it is not editable', async () => {
    const onStart = jest.fn();
    const { user, tap, ref } = await renderCell({ editable: false, onStart });
    const focus = jest.fn();
    Object.assign(ref.current as object, { focus, isFocused: () => false });
    expect(tap()).toBeDisabled();
    await user.press(tap());
    expect(onStart).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe('a cell with the focus keeps its own text (phone P2: "5" showed "5.00")', () => {
  it('shows what is typed while a new value arrives, and the value again after the blur', async () => {
    const onChangeText = jest.fn();
    const { user, input, rerender } = await renderCell({ onChangeText });
    await fireEvent(input(), 'focus', {});
    expect(input()).toHaveDisplayValue('5.00');
    await fireEvent.changeText(input(), '5');
    expect(input()).toHaveDisplayValue('5');
    expect(onChangeText).toHaveBeenLastCalledWith('5');
    // the form reformats the stored value on the key: the field does not follow it
    await rerender('5.00');
    expect(input()).toHaveDisplayValue('5');
    await fireEvent.changeText(input(), '5.');
    await rerender('');
    expect(input()).toHaveDisplayValue('5.');
    await fireEvent(input(), 'blur', {});
    expect(input()).toHaveDisplayValue('');
    await rerender('7.00');
    expect(input()).toHaveDisplayValue('7.00');
  });

  it('lets go of the native focus when it unmounts focused (a recycled row carries no ring)', async () => {
    const { ref } = await renderCell();
    const blur = jest.fn();
    Object.assign(ref.current as object, { blur, isFocused: () => true });
    await screen.unmount();
    expect(blur).toHaveBeenCalledTimes(1);
  });
});
