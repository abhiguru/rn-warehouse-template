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
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet } from 'react-native';
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

const button = (label: string) => screen.getByRole('button', { name: label });
type Node = NonNullable<typeof screen.root>;
// The Modal, the keyboard-avoiding view, the scrolling part, the dialog card and the scrim have no role or text a query
// can reach, so they are found by walking the rendered tree for the host element that carries their props.
function findHosts(from: Node, match: (props: Record<string, unknown>, type: string) => boolean): Node[] {
  const found: Node[] = [];
  const walk = (node: Node) => {
    if (typeof node.type === 'string' && match(node.props as Record<string, unknown>, node.type)) found.push(node);
    for (const child of node.children) if (typeof child !== 'string') walk(child as Node);
  };
  walk(from);
  return found;
}
function findHost(match: (props: Record<string, unknown>, type: string) => boolean, from: Node = screen.root as Node): Node {
  const [first] = findHosts(from, match);
  if (!first) throw new Error('not on the screen');
  return first;
}
const findModal = () => findHost((_p, type) => type === 'Modal');
const findScroll = () => findHost(p => p.keyboardShouldPersistTaps === 'handled');
const findScrim = () => findHost(p => p.importantForAccessibility === 'no' && typeof p.onClick === 'function');
const setup = () => userEvent.setup({ delay: 0 });

const originalOS = Platform.OS;
beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
});

describe('ConfirmInputDialog above the keyboard', () => {
  it('draws the Modal behind both system bars', async () => {
    await render(<ConfirmInputDialog {...props()} />);
    const modal = findModal();
    expect(modal).toHaveProp('statusBarTranslucent', true);
    expect(modal).toHaveProp('navigationBarTranslucent', true);
  });

  it.each(['ios', 'android'])('pads by the keyboard on %s, offset by minus the bottom inset', async os => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    // The keyboard is native: its events are caught here so the test can raise it.
    const handlers: Record<string, (event?: unknown) => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
      handlers[name] = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    await render(<ConfirmInputDialog {...props()} />);
    // The view that avoids the keyboard is the first one inside the Modal that is told its size.
    const avoiding = findHost(p => typeof p.onLayout === 'function', findModal());
    await fireEvent(avoiding, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 800 } }, persist: () => undefined });
    // A keyboard whose top edge is at 500 would cover 300 of the 800; the offset of minus the 24 bottom inset makes it 276
    // (padding, not height or position).
    await act(async () => {
      handlers[os === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow']({ endCoordinates: { screenY: 500, height: 300 } });
    });
    expect(avoiding).toHaveStyle({ paddingBottom: 800 - (500 + 24) });
    // The overlay pads for both system bars itself, so the inset is never counted twice.
    const overlay = findHosts(avoiding, p => StyleSheet.flatten(p.style as never)?.paddingTop !== undefined)[0];
    expect(overlay).toHaveStyle({ paddingTop: 24 + 16, paddingBottom: 24 + 16 });
  });

  it('scrolls the body and keeps Cancel and the action outside the scrolling part', async () => {
    await render(<ConfirmInputDialog {...props()} />);
    const scroll = findScroll();
    expect(scroll).toHaveProp('keyboardShouldPersistTaps', 'handled');
    expect(within(scroll).getByLabelText('Mobile number')).toBeOnTheScreen();
    expect(within(scroll).queryByRole('button', { name: 'Cancel' })).not.toBeOnTheScreen();
    expect(within(scroll).queryByRole('button', { name: 'Delete account' })).not.toBeOnTheScreen();
    expect(button('Cancel')).toBeOnTheScreen();
    expect(button('Delete account')).toBeOnTheScreen();
    // The dialog never grows past the space left above the keyboard.
    let dialog = scroll.parent;
    while (dialog && StyleSheet.flatten(dialog.props.style)?.maxHeight === undefined) dialog = dialog.parent;
    expect(dialog).toHaveStyle({ maxHeight: '100%', flexShrink: 1, maxWidth: 420 });
  });

  it('closing the keyboard does not confirm: the field has no submit handler', async () => {
    await render(<ConfirmInputDialog {...props()} />);
    const input = screen.getByLabelText('Mobile number');
    expect(input.props.onSubmitEditing).toBeUndefined();
    expect(input).toHaveProp('returnKeyType', 'done');
    expect(input).toHaveProp('keyboardType', 'phone-pad');
    await setup().paste(input, '9000000001');
    expect(onChangeText).toHaveBeenCalledWith('9000000001');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('reads out an error under the field, inside the scrolling part, and keeps both buttons', async () => {
    await render(<ConfirmInputDialog {...props({ field: { ...props().field!, error: "This number doesn't match your account." } })} />);
    const live = findHost(p => p.accessibilityLiveRegion === 'polite');
    expect(within(live).getByText("This number doesn't match your account.")).toBeOnTheScreen();
    expect(findHosts(findScroll(), p => p.accessibilityLiveRegion === 'polite')).toHaveLength(1);
    expect(button('Cancel').props.accessibilityState).toEqual({ disabled: false, busy: false });
    expect(button('Delete account').props.accessibilityState).toEqual({ disabled: false, busy: false });
  });

  it('without a field it is a scrolling confirmation with the message aligned as asked', async () => {
    await render(<ConfirmInputDialog {...props({ field: undefined, messageAlign: 'left', message: 'Line one\n• two' })} />);
    expect(screen.queryByLabelText('Mobile number')).not.toBeOnTheScreen();
    const message = screen.getByText(/Line one/);
    expect(message).toHaveTextContent('Line one\n• two');
    expect(message).toHaveStyle({ textAlign: 'left' });
  });

  it('Back and the scrim cancel while idle', async () => {
    await render(<ConfirmInputDialog {...props()} />);
    await act(async () => { (findModal().props.onRequestClose as () => void)(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    await setup().press(findScrim());
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('while busy: a spinner in the action, both buttons and the field disabled, Back and the scrim do nothing', async () => {
    await render(<ConfirmInputDialog {...props({ busy: true })} />);
    const confirm = button('Delete account');
    expect(confirm).toBeDisabled();
    expect(confirm.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(findHosts(confirm, (_p, type) => type === 'ActivityIndicator')).toHaveLength(1);
    expect(button('Cancel')).toBeDisabled();
    expect(screen.getByLabelText('Mobile number')).toHaveProp('editable', false);
    await act(async () => { (findModal().props.onRequestClose as () => void)(); });
    await setup().press(findScrim());
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
    expect(confirm).toBeDisabled();
    expect(confirm.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(findHosts(confirm, (_p, type) => type === 'ActivityIndicator')).toHaveLength(1);
    expect(button('Cancel')).toBeDisabled();
    await act(async () => { (findModal().props.onRequestClose as () => void)(); });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels with Back when idle', async () => {
    await render(dialog(false));
    expect(button('Sign out').props.accessibilityState).toEqual({ disabled: false, busy: false });
    await act(async () => { (findModal().props.onRequestClose as () => void)(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
