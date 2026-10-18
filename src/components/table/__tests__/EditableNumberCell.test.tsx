/**
 * The cell of an editable table. A touch that starts over a cell without the focus is the list's
 * (so a vertical swipe over a column of cells scrolls the page, P2a-7); a tap focuses the cell.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { EditableNumberCell } from '../EditableNumberCell';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

async function render(props: Partial<React.ComponentProps<typeof EditableNumberCell>> = {}) {
  let tree!: ReactTestRenderer;
  const ref = React.createRef<TextInput>();
  await act(async () => {
    tree = create(<EditableNumberCell ref={ref} value="5.00" onChangeText={() => {}} label="Charge, dispatch I0001" width={92} testID="cell" {...props} />);
  });
  const input = () => tree.root.findByType(TextInput);
  const tap = () => tree.root.find((node) => node.props.testID === 'cell-tap' && typeof node.props.onPress === 'function');
  // The view around the input decides whether it takes touches (Android's text input ignores its own pointerEvents).
  const touch = () => tree.root.find((node) => node.props.testID === 'cell-touch' && node.props.pointerEvents !== undefined);
  return { tree, ref, input, tap, touch };
}

describe('a cell without the focus', () => {
  it('lets touches through to the list: the view around the input takes none, and the cell around it is a Pressable', async () => {
    const { input, tap, touch } = await render();
    expect(touch().props.pointerEvents).toBe('none');
    // Not on the input itself: Android's native text input would take the touch anyway.
    expect(input().props.pointerEvents).toBeUndefined();
    expect(tap()).toBeDefined();
  });

  it('is focused by a tap on the Pressable, after the start callback; the wrapper never takes touches, focused or not', async () => {
    const onStart = jest.fn();
    const { input, tap, ref, touch } = await render({ onStart });
    const focus = jest.fn();
    Object.assign(input().instance as object, { focus, isFocused: () => false, setSelection: jest.fn() });
    await act(async () => { tap().props.onPress(); });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    // the caller's ref got the same input
    expect(ref.current).toBe(input().instance);
    expect(touch().props.pointerEvents).toBe('none');
    await act(async () => { input().props.onFocus({}); });
    expect(touch().props.pointerEvents).toBe('none');
    await act(async () => { input().props.onBlur({}); });
    expect(touch().props.pointerEvents).toBe('none');
  });

  it('selects all its text on a second tap instead of focusing again', async () => {
    const { input, tap } = await render({ value: '12.5' });
    const focus = jest.fn();
    const setSelection = jest.fn();
    let focused = false;
    Object.assign(input().instance as object, { focus, setSelection, isFocused: () => focused });
    await act(async () => { tap().props.onPress(); });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(setSelection).not.toHaveBeenCalled();
    focused = true;
    await act(async () => { input().props.onFocus({}); });
    await act(async () => { tap().props.onPress(); });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(setSelection).toHaveBeenCalledWith(0, 4);
    // what is typed counts, not the value it started from
    await act(async () => { input().props.onChangeText('125'); });
    await act(async () => { tap().props.onPress(); });
    expect(setSelection).toHaveBeenLastCalledWith(0, 3);
  });

  it('tells the caller when it is pressed and let go', async () => {
    const onHold = jest.fn();
    const { tap } = await render({ onHold });
    await act(async () => { tap().props.onPressIn(); });
    expect(onHold).toHaveBeenLastCalledWith(true);
    await act(async () => { tap().props.onPressOut(); });
    expect(onHold).toHaveBeenLastCalledWith(false);
  });

  it('keeps its spoken label, the error in the hint and its key rules', async () => {
    const { input } = await render({ error: 'Enter a charge from 0 to 999999.', returnKeyType: 'done' });
    expect(input().props).toMatchObject({
      accessibilityLabel: 'Charge, dispatch I0001',
      accessibilityHint: 'Enter a charge from 0 to 999999.',
      returnKeyType: 'done',
      keyboardType: 'decimal-pad',
      selectTextOnFocus: true,
    });
  });

  it('takes no tap when it is not editable', async () => {
    const { tap } = await render({ editable: false });
    expect(tap().props.disabled).toBe(true);
  });
});

describe('a cell with the focus keeps its own text (phone P2: "5" showed "5.00")', () => {
  const rerenderWith = async (tree: ReactTestRenderer, value: string) => {
    await act(async () => {
      tree.update(<EditableNumberCell value={value} onChangeText={() => {}} label="Charge, dispatch I0001" width={92} testID="cell" />);
    });
  };

  it('shows what is typed while a new value arrives, and the value again after the blur', async () => {
    const onChangeText = jest.fn();
    const { tree, input } = await render({ onChangeText });
    await act(async () => { input().props.onFocus({}); });
    expect(input().props.value).toBe('5.00');
    await act(async () => { input().props.onChangeText('5'); });
    expect(input().props.value).toBe('5');
    expect(onChangeText).toHaveBeenLastCalledWith('5');
    // the form reformats the stored value on the key: the field does not follow it
    await rerenderWith(tree, '5.00');
    expect(input().props.value).toBe('5');
    await act(async () => { input().props.onChangeText('5.'); });
    await rerenderWith(tree, '');
    expect(input().props.value).toBe('5.');
    await act(async () => { input().props.onBlur({}); });
    expect(input().props.value).toBe('');
    await rerenderWith(tree, '7.00');
    expect(input().props.value).toBe('7.00');
  });

  it('lets go of the native focus when it unmounts focused (a recycled row carries no ring)', async () => {
    const { tree, input } = await render();
    const blur = jest.fn();
    Object.assign(input().instance as object, { blur, isFocused: () => true });
    await act(async () => { tree.unmount(); });
    expect(blur).toHaveBeenCalledTimes(1);
  });
});
