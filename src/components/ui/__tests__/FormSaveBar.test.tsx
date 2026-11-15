/**
 * The shared Save bar of forms and settings screens (WH-218, STYLE_GUIDE §14.4): one full-width primary button,
 * a busy state, an optional helper line, and the bottom inset on iOS only. Real FormSaveBar and Button.
 */
import React from 'react';
import { Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { FormSaveBar, type FormSaveBarProps } from '../FormSaveBar';
import { space } from '@/theme/tokens';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));

let tree: ReactTestRenderer | undefined;
const originalOS = Platform.OS;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  Platform.OS = originalOS;
});

const render = async (props: Partial<FormSaveBarProps> = {}) => {
  const onPress = jest.fn();
  await act(async () => {
    tree = create(<FormSaveBar label="Save customer" onPress={onPress} testID="bar" buttonTestID="save" {...props} />);
  });
  return onPress;
};
const button = (): ReactTestInstance => tree!.root.find(n => n.props.testID === 'save' && n.props.accessibilityState !== undefined);
const bar = () => tree!.root.find(n => n.props.testID === 'bar' && (n.type as unknown) === 'View');
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
const shown = (screenY = 1350) => ({ endCoordinates: { screenY, height: 800 } });
const marginBottom = () => (StyleSheet.flatten(bar().props.style) as { marginBottom?: number }).marginBottom ?? 0;
// Mounts with a bar that reports its place in the window (the test renderer has no native views): bottom edge `bottom()`.
const renderMeasured = async (bottom: () => number) => {
  await render();
  // The jest stand-in of a View keeps its methods on a shared prototype: give the bar its own.
  (tree!.root.find(n => n.props.testID === 'bar' && n.instance != null) as unknown as { instance: { measureInWindow: unknown } }).instance.measureInWindow =
    (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, bottom() - 126, 1080, 126);
};
const paddingBottom = () => (StyleSheet.flatten(bar().props.style) as { paddingBottom: number }).paddingBottom;

describe('FormSaveBar', () => {
  it('shows the label, speaks it, and presses through', async () => {
    const onPress = await render();
    expect(texts()).toContain('Save customer');
    expect(button().props.accessibilityLabel).toBe('Save customer');
    await act(async () => { button().props.onPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is switched off when disabled (a form with nothing changed)', async () => {
    await render({ disabled: true });
    expect(button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await render({ disabled: false });
    expect(button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it('is busy and switched off while loading, with the loading text', async () => {
    await render({ loading: true, loadingText: 'Saving…' });
    expect(button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, busy: true }));
    expect(texts()).toContain('Saving…');
  });

  it('draws a helper line only when given one', async () => {
    await render({ helper: 'Saving applies to every customer.' });
    expect(texts()).toContain('Saving applies to every customer.');
    await act(async () => { tree!.unmount(); });
    await render();
    expect(texts()).toEqual(['Save customer']);
  });

  it('adds the bottom inset on iOS only', async () => {
    Platform.OS = 'ios';
    await render();
    const ios = paddingBottom();
    await act(async () => { tree!.unmount(); });
    Platform.OS = 'android';
    await render();
    expect(ios - paddingBottom()).toBe(34);
  });

  describe('keyboard (WH-227)', () => {
    // The test renderer has no keyboard: record the listeners the bar registers and call them.
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
      await render();
      expect(paddingBottom()).toBe(34 + space.md);
      await act(async () => { listeners.keyboardDidShow(shown()); });
      expect(paddingBottom()).toBe(space.md);
      await act(async () => { listeners.keyboardDidHide(); });
      expect(paddingBottom()).toBe(34 + space.md);
    });

    it('on Android is the same with and without the keyboard', async () => {
      Platform.OS = 'android';
      await render();
      expect(paddingBottom()).toBe(space.md);
      await act(async () => { listeners.keyboardDidShow(shown()); });
      expect(paddingBottom()).toBe(space.md);
      await act(async () => { listeners.keyboardDidHide(); });
      expect(paddingBottom()).toBe(space.md);
    });

    it('on Android lifts the bar by the part the keyboard covers, and puts it back when the keyboard hides (WH-228)', async () => {
      Platform.OS = 'android';
      await renderMeasured(() => 1500); // bar bottom 1500, keyboard top 1350: 150 covered
      expect(marginBottom()).toBe(0);
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      expect(marginBottom()).toBe(150);
      await act(async () => { listeners.keyboardDidHide(); });
      expect(marginBottom()).toBe(0);
    });

    it('does not lift when the window already shrinks for the keyboard (nothing is covered)', async () => {
      Platform.OS = 'android';
      await renderMeasured(() => 1350);
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      expect(marginBottom()).toBe(0);
    });

    it('keeps the lift when the keyboard event repeats and the bar is already clear of it', async () => {
      Platform.OS = 'android';
      let bottom = 1500;
      await renderMeasured(() => bottom);
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      bottom = 1350; // measured again after the lift
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      expect(marginBottom()).toBe(150);
    });

    it('on iOS also lifts by the covered part and still drops the inset', async () => {
      Platform.OS = 'ios';
      await renderMeasured(() => 1500);
      await act(async () => { listeners.keyboardDidShow(shown(1350)); });
      expect(marginBottom()).toBe(150);
      expect(paddingBottom()).toBe(space.md);
      await act(async () => { listeners.keyboardDidHide(); });
      expect(marginBottom()).toBe(0);
      expect(paddingBottom()).toBe(34 + space.md);
    });

    it('removes its keyboard listeners when it unmounts', async () => {
      await render();
      expect(removes.length).toBe(3); // keyboardDidShow, keyboardDidChangeFrame, keyboardDidHide (WH-228)
      await act(async () => { tree!.unmount(); });
      removes.forEach(remove => expect(remove).toHaveBeenCalledTimes(1));
    });
  });
});
