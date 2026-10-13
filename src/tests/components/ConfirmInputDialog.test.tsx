/**
 * SR-15: a confirmation with a field stays usable above the phone keyboard.
 *
 * The dialog's Modal draws behind both system bars, pads by the keyboard on
 * both platforms with an offset of minus the bottom inset (the overlay pads for
 * that inset itself), scrolls its body, and keeps Cancel and the action outside
 * the scrolling part. Closing the keyboard never confirms. While busy, nothing
 * but the running action is possible. ConfirmDialog gets the same busy rule.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput } from 'react-native';
import { ConfirmInputDialog, type ConfirmInputDialogProps } from '@/components/ConfirmInputDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useTheme', () => {
  const tokens = jest.requireActual('@/theme/tokens').getTokens('orange', 'light');
  return { useTokens: () => tokens, useThemedStyles: (factory: (t: unknown) => unknown) => factory(tokens) };
});

const onConfirm = jest.fn();
const onCancel = jest.fn();
const onChangeText = jest.fn();

function props(overrides: Partial<ConfirmInputDialogProps> = {}): ConfirmInputDialogProps {
  return {
    visible: true,
    title: 'Confirm deletion',
    message: 'Enter the mobile number on your account to delete it.',
    confirmText: 'Delete account',
    variant: 'danger',
    onConfirm,
    onCancel,
    field: {
      value: '',
      onChangeText,
      placeholder: '10-digit mobile number',
      accessibilityLabel: 'Mobile number',
      keyboardType: 'phone-pad',
      autoComplete: 'tel',
      textContentType: 'telephoneNumber',
    },
    ...overrides,
  };
}

let tree: ReactTestRenderer;
async function render(element: React.ReactElement) {
  await act(async () => {
    tree = create(element);
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

describe('ConfirmInputDialog above the keyboard', () => {
  it('draws the Modal behind both system bars', async () => {
    await render(<ConfirmInputDialog {...props()} />);
    const modal = tree.root.findByType(Modal);
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
  });

  it.each(['ios', 'android'])('pads by the keyboard on %s, offset by minus the bottom inset', async os => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    await render(<ConfirmInputDialog {...props()} />);
    const avoiding = tree.root.findByType(KeyboardAvoidingView);
    expect(avoiding.props.behavior).toBe('padding');
    expect(avoiding.props.keyboardVerticalOffset).toBe(-24);
    // The overlay pads for both system bars itself, so the inset is never counted twice.
    const overlay = avoiding.findAll(node => typeof node.type === 'string' && flatStyle(node.props.style).paddingTop !== undefined)[0];
    expect(flatStyle(overlay.props.style)).toMatchObject({ paddingTop: 24 + 16, paddingBottom: 24 + 16 });
  });

  it('scrolls the body and keeps Cancel and the action outside the scrolling part', async () => {
    await render(<ConfirmInputDialog {...props()} />);
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(isInside(tree.root.findByType(TextInput), scroll)).toBe(true);
    expect(isInside(button('Cancel'), scroll)).toBe(false);
    expect(isInside(button('Delete account'), scroll)).toBe(false);
    // The dialog never grows past the space left above the keyboard.
    const dialog = scroll.parent!;
    expect(flatStyle(dialog.props.style)).toMatchObject({ maxHeight: '100%', flexShrink: 1, maxWidth: 420 });
  });

  it('closing the keyboard does not confirm: the field has no submit handler', async () => {
    await render(<ConfirmInputDialog {...props()} />);
    const input = tree.root.findByType(TextInput);
    expect(input.props.onSubmitEditing).toBeUndefined();
    expect(input.props.returnKeyType).toBe('done');
    expect(input.props.keyboardType).toBe('phone-pad');
    await act(async () => input.props.onChangeText('9000000001'));
    expect(onChangeText).toHaveBeenCalledWith('9000000001');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('reads out an error under the field, inside the scrolling part, and keeps both buttons', async () => {
    await render(<ConfirmInputDialog {...props({ field: { ...props().field!, error: "This number doesn't match your account." } })} />);
    const live = tree.root.find(node => node.props.accessibilityLiveRegion === 'polite');
    expect(live.findAll(node => node.props.children === "This number doesn't match your account.").length).toBeGreaterThan(0);
    expect(isInside(live, tree.root.findByType(ScrollView))).toBe(true);
    expect(button('Cancel').props.disabled).toBe(false);
    expect(button('Delete account').props.disabled).toBe(false);
  });

  it('without a field it is a scrolling confirmation with the message aligned as asked', async () => {
    await render(<ConfirmInputDialog {...props({ field: undefined, messageAlign: 'left', message: 'Line one\n• two' })} />);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    const message = tree.root.find(node => node.props.children === 'Line one\n• two' && typeof node.type !== 'string');
    expect(flatStyle(message.props.style).textAlign).toBe('left');
  });

  it('Back and the scrim cancel while idle', async () => {
    await render(<ConfirmInputDialog {...props()} />);
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    expect(onCancel).toHaveBeenCalledTimes(1);
    const scrim = tree.root.find(node => node.props.importantForAccessibility === 'no' && typeof node.props.onPress === 'function');
    act(() => scrim.props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('while busy: a spinner in the action, both buttons and the field disabled, Back and the scrim do nothing', async () => {
    await render(<ConfirmInputDialog {...props({ busy: true })} />);
    const confirm = button('Delete account');
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(confirm.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(button('Cancel').props.disabled).toBe(true);
    expect(tree.root.findByType(TextInput).props.editable).toBe(false);
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    const scrim = tree.root.find(node => node.props.importantForAccessibility === 'no' && typeof node.props.onPress === 'function');
    act(() => scrim.props.onPress());
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog busy', () => {
  const dialog = (busy: boolean) => (
    <ConfirmDialog visible title="Sign out?" message="Text" confirmText="Sign out" variant="danger" onConfirm={onConfirm} onCancel={onCancel} busy={busy} />
  );

  it('shows a spinner, disables both buttons and ignores Back while busy', async () => {
    await render(dialog(true));
    const confirm = button('Sign out');
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(confirm.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(button('Cancel').props.disabled).toBe(true);
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels with Back when idle', async () => {
    await render(dialog(false));
    expect(button('Sign out').props.disabled).toBe(false);
    act(() => tree.root.findByType(Modal).props.onRequestClose());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
