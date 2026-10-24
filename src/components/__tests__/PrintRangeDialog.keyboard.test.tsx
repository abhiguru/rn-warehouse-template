/**
 * SR-15 follow-up: the print range dialog stays usable above the phone keyboard,
 * built like ConfirmInputDialog.
 *
 * The Modal draws behind both system bars, pads by the keyboard on both
 * platforms with an offset of minus the bottom inset (the overlay pads for the
 * insets itself), scrolls its body with both fields, and keeps the actions row
 * (View jobs, Cancel, Print) outside the scrolling part. The two fields, the
 * validation and the buttons are unchanged.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput } from 'react-native';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useTheme', () => {
  const tokens = jest.requireActual('@/theme/tokens').getTokens('orange', 'light');
  return { useTokens: () => tokens, useThemedStyles: (factory: (t: unknown) => unknown) => factory(tokens) };
});
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/config/demoCapabilities', () => ({
  DEMO_CAPABILITIES: { printing: true, sensors: false, realtime: true, customerDocuments: false },
}));

const onConfirm = jest.fn(async () => undefined);
const onDismiss = jest.fn();
const onViewJobs = jest.fn();

let tree: ReactTestRenderer;
async function render() {
  await act(async () => {
    tree = create(
      <PrintRangeDialog
        visible
        onDismiss={onDismiss}
        onConfirm={onConfirm}
        onViewJobs={onViewJobs}
        title="Print GRNs"
        defaultNumber="311"
        entity="grn"
      />
    );
  });
}
const button = (label: string) =>
  tree.root.find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const isInside = (node: ReactTestInstance, ancestor: ReactTestInstance) => {
  for (let parent = node.parent; parent; parent = parent.parent) if (parent === ancestor) return true;
  return false;
};
const flatStyle = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const originalOS = Platform.OS;
beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
  act(() => tree?.unmount());
});

describe('PrintRangeDialog above the keyboard', () => {
  it('draws the Modal behind both system bars', async () => {
    await render();
    const modal = tree.root.findByType(Modal);
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
  });

  it.each(['ios', 'android'])('pads by the keyboard on %s, offset by minus the bottom inset', async os => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    await render();
    const avoiding = tree.root.findByType(KeyboardAvoidingView);
    expect(avoiding.props.behavior).toBe('padding');
    expect(avoiding.props.keyboardVerticalOffset).toBe(-24);
    // The overlay pads for both system bars itself, so the inset is never counted twice.
    const overlay = avoiding.findAll(node => typeof node.type === 'string' && flatStyle(node.props.style).paddingTop !== undefined)[0];
    expect(flatStyle(overlay.props.style)).toMatchObject({ paddingTop: 24 + 16, paddingBottom: 24 + 16 });
  });

  it('scrolls both fields and keeps View jobs, Cancel and Print outside the scrolling part', async () => {
    await render();
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    const inputs = tree.root.findAllByType(TextInput);
    expect(inputs).toHaveLength(2);
    inputs.forEach(input => expect(isInside(input, scroll)).toBe(true));
    expect(isInside(button('View print jobs'), scroll)).toBe(false);
    expect(isInside(button('Cancel'), scroll)).toBe(false);
    expect(isInside(button('Print'), scroll)).toBe(false);
    // The dialog never grows past the space left above the keyboard.
    const dialog = tree.root.find(node => node.props.accessibilityViewIsModal === true && typeof node.type === 'string');
    expect(flatStyle(dialog.props.style)).toMatchObject({ maxHeight: '100%', flexShrink: 1 });
  });

  it('keeps the fields, validation and buttons: both numbers prefilled, an empty field is refused, Print sends the range', async () => {
    await render();
    const [from, to] = tree.root.findAllByType(TextInput);
    expect(from.props.value).toBe('311');
    expect(to.props.value).toBe('311');

    await act(async () => from.props.onChangeText('  '));
    await act(async () => button('Print').props.onPress());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(tree.root.find(node => node.props.accessibilityRole === 'alert')).toBeTruthy();

    await act(async () => tree.root.findAllByType(TextInput)[0].props.onChangeText(' 305 '));
    await act(async () => tree.root.findAllByType(TextInput)[1].props.onSubmitEditing());
    expect(onConfirm).toHaveBeenCalledWith('305', '311');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('Back and the scrim close it', async () => {
    await render();
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    act(() => button('Cancel printing').props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
