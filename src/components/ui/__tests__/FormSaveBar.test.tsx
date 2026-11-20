/**
 * The shared Save bar of forms and settings screens (WH-218, STYLE_GUIDE §14.4): one full-width primary button,
 * a busy state, an optional helper line, and the bottom inset on iOS only. Real FormSaveBar and Button.
 */
import React from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { act, render, screen, userEvent, type RenderResult } from '@testing-library/react-native';
import { FormSaveBar, type FormSaveBarProps } from '../FormSaveBar';
import { space } from '@/theme/tokens';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));

let mounted: RenderResult | undefined;
const originalOS = Platform.OS;
afterEach(() => {
  mounted = undefined;
  Platform.OS = originalOS;
});

/** Mounts the bar (a bar already mounted by this test goes first); the result is the Save press handler. */
const show = async (props: Partial<FormSaveBarProps> = {}) => {
  const onPress = jest.fn();
  await mounted?.unmount();
  mounted = await render(<FormSaveBar label="Save customer" onPress={onPress} testID="bar" {...props} />);
  return onPress;
};
const button = () => screen.getByRole('button', { name: 'Save customer' });
// The bar is a plain View with no role or text of its own: its place and padding are asserted on its testID.
const bar = () => screen.getByTestId('bar');
/** Every text on screen, in order. */
const texts = () => screen.queryAllByText(/./, { includeHiddenElements: true }).map(n => [n.props.children].flat().join(''));
const shown = (screenY = 1350) => ({ endCoordinates: { screenY, height: 800 } });
const marginBottom = () => (StyleSheet.flatten(bar().props.style) as { marginBottom?: number }).marginBottom ?? 0;
// Mounts with a bar that reports its place in the window (there are no native views here): bottom edge `bottom()`.
// The jest stand-in of a View keeps measureInWindow on a shared prototype; the spy is undone by restoreAllMocks.
const showMeasured = async (bottom: () => number) => {
  jest.spyOn(View.prototype as unknown as { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void }, 'measureInWindow')
    .mockImplementation(cb => cb(0, bottom() - 126, 1080, 126));
  await show();
};
const paddingBottom = () => (StyleSheet.flatten(bar().props.style) as { paddingBottom: number }).paddingBottom;

describe('FormSaveBar', () => {
  it('shows the label, speaks it, and presses through', async () => {
    const onPress = await show();
    expect(screen.getByText('Save customer')).toBeOnTheScreen();
    expect(button()).toHaveAccessibleName('Save customer');
    await userEvent.setup({ delay: 0 }).press(button());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is switched off when disabled (a form with nothing changed)', async () => {
    await show({ disabled: true });
    expect(button()).toBeDisabled();
    expect(button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await show({ disabled: false });
    expect(button()).toBeEnabled();
    expect(button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it('is busy and switched off while loading, with the loading text', async () => {
    await show({ loading: true, loadingText: 'Saving…' });
    const saving = screen.getByRole('button', { name: /Saving/ });
    expect(saving).toBeDisabled();
    expect(saving).toBeBusy();
    expect(saving.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, busy: true }));
    expect(screen.getByText('Saving…')).toBeOnTheScreen();
  });

  it('draws a helper line only when given one', async () => {
    await show({ helper: 'Saving applies to every customer.' });
    expect(screen.getByText('Saving applies to every customer.')).toBeOnTheScreen();
    await show();
    expect(texts()).toEqual(['Save customer']);
  });

  it('adds the bottom inset on iOS only', async () => {
    Platform.OS = 'ios';
    await show();
    const ios = paddingBottom();
    Platform.OS = 'android';
    await show();
    expect(ios - paddingBottom()).toBe(34);
  });

  describe('keyboard (WH-227)', () => {
    // There is no keyboard here: record the listeners the bar registers and call them.
    let listeners: Record<string, (event?: unknown) => void>;
    let removes: jest.Mock[];
    beforeEach(() => {
      listeners = {};
      removes = [];
      jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
        listeners[name] = handler;
        const remove = jest.fn();
        removes.push(remove);
        return { remove };
      }) as never);
    });
    afterEach(() => jest.restoreAllMocks());

    it('on iOS keeps the inset with no keyboard and drops it while the keyboard is up', async () => {
      Platform.OS = 'ios';
      await show();
      expect(paddingBottom()).toBe(34 + space.md);
      await act(async () => { listeners.keyboardDidShow(shown()); });
      expect(paddingBottom()).toBe(space.md);
      await act(async () => { listeners.keyboardDidHide(); });
      expect(paddingBottom()).toBe(34 + space.md);
    });

    it('on Android is the same with and without the keyboard', async () => {
      Platform.OS = 'android';
      await show();
      expect(paddingBottom()).toBe(space.md);
      await act(async () => { listeners.keyboardDidShow(shown()); });
      expect(paddingBottom()).toBe(space.md);
      await act(async () => { listeners.keyboardDidHide(); });
      expect(paddingBottom()).toBe(space.md);
    });

    it('on Android lifts the bar by the part the keyboard covers, and puts it back when the keyboard hides (WH-228)', async () => {
      Platform.OS = 'android';
      await showMeasured(() => 1500); // bar bottom 1500, keyboard top 1350: 150 covered
      expect(marginBottom()).toBe(0);
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      expect(marginBottom()).toBe(150);
      await act(async () => { listeners.keyboardDidHide(); });
      expect(marginBottom()).toBe(0);
    });

    it('does not lift when the window already shrinks for the keyboard (nothing is covered)', async () => {
      Platform.OS = 'android';
      await showMeasured(() => 1350);
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      expect(marginBottom()).toBe(0);
    });

    it('keeps the lift when the keyboard event repeats and the bar is already clear of it', async () => {
      Platform.OS = 'android';
      let bottom = 1500;
      await showMeasured(() => bottom);
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      bottom = 1350; // measured again after the lift
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      expect(marginBottom()).toBe(150);
    });

    it('on iOS also lifts by the covered part and still drops the inset', async () => {
      Platform.OS = 'ios';
      await showMeasured(() => 1500);
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      expect(marginBottom()).toBe(150);
      expect(paddingBottom()).toBe(space.md);
      await act(async () => { listeners.keyboardDidHide(); });
      expect(marginBottom()).toBe(0);
      expect(paddingBottom()).toBe(34 + space.md);
    });

    it('removes its keyboard listeners when it unmounts', async () => {
      await show();
      expect(removes.length).toBe(3); // keyboardDidShow, keyboardDidChangeFrame, keyboardDidHide (WH-228)
      await mounted!.unmount();
      removes.forEach(remove => expect(remove).toHaveBeenCalledTimes(1));
    });
  });
});
