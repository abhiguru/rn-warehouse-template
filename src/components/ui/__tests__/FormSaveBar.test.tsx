/**
 * The shared Save bar of forms and settings screens (WH-218, STYLE_GUIDE §14.4): one full-width primary button,
 * a busy state, an optional helper line, and the bottom inset on iOS only. Real FormSaveBar and Button.
 */
import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { FormSaveBar, type FormSaveBarProps } from '../FormSaveBar';

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
});
