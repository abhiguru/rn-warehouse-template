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
import { Platform } from 'react-native';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
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
// The real component drops `behavior` and `keyboardVerticalOffset` before the native view; this stand-in shows them to the test.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: (props: object) => <View testID="keyboard-avoiding" {...props} /> };
});

const onConfirm = jest.fn(async () => undefined);
const onDismiss = jest.fn();
const onViewJobs = jest.fn();

const renderDialog = () =>
  render(
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

// The Modal is the root host element; below it come the keyboard-avoiding view, the overlay (scrim, then the card) and
// the card, whose first child is the scrolling body. None of them has a role or a name.
type Host = ReturnType<typeof screen.getByRole>;
const modal = () => screen.root as unknown as Host;
const overlay = () => screen.getByTestId('keyboard-avoiding').children[0] as Host;
const card = () => overlay().children[1] as Host;
const scrollBody = () => card().children[0] as Host;

const originalOS = Platform.OS;
beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
});

describe('PrintRangeDialog above the keyboard', () => {
  it('draws the Modal behind both system bars', async () => {
    await renderDialog();
    expect(modal()).toHaveProp('statusBarTranslucent', true);
    expect(modal()).toHaveProp('navigationBarTranslucent', true);
  });

  it.each(['ios', 'android'])('pads by the keyboard on %s, offset by minus the bottom inset', async (os) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    await renderDialog();
    const avoiding = screen.getByTestId('keyboard-avoiding');
    expect(avoiding).toHaveProp('behavior', 'padding');
    expect(avoiding).toHaveProp('keyboardVerticalOffset', -24);
    // The overlay pads for both system bars itself, so the inset is never counted twice.
    expect(overlay()).toHaveStyle({ paddingTop: 24 + 16, paddingBottom: 24 + 16 });
  });

  it('scrolls both fields and keeps Cancel and Print outside the scrolling part', async () => {
    await renderDialog();
    const scroll = within(scrollBody());
    expect(scrollBody()).toHaveProp('keyboardShouldPersistTaps', 'handled');
    expect(scroll.getByPlaceholderText('Start GRN number')).toBeOnTheScreen();
    expect(scroll.getByPlaceholderText('End GRN number')).toBeOnTheScreen();
    expect(screen.getAllByPlaceholderText(/GRN number/)).toHaveLength(2);
    expect(scroll.getByRole('button', { name: 'View print jobs' })).toBeOnTheScreen(); // WH-219: Print jobs sits in the body
    expect(scroll.queryByRole('button', { name: 'Cancel' })).not.toBeOnTheScreen();
    expect(scroll.queryByRole('button', { name: 'Print' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Print' })).toBeOnTheScreen();
    // The dialog never grows past the space left above the keyboard.
    expect(card()).toHaveStyle({ maxHeight: '100%', flexShrink: 1 });
  });

  it('keeps the fields, validation and buttons: both numbers prefilled, an empty field is refused, Print sends the range', async () => {
    const user = userEvent.setup({ delay: 0 });
    await renderDialog();
    const from = screen.getByPlaceholderText('Start GRN number');
    const to = screen.getByPlaceholderText('End GRN number');
    expect(from).toHaveDisplayValue('311');
    expect(to).toHaveDisplayValue('311');

    await user.clear(from);
    await user.type(from, '  ');
    await user.press(screen.getByRole('button', { name: 'Print' }));
    expect(onConfirm).not.toHaveBeenCalled();
    // The strip is a plain View with the alert role (not an accessible element), so it is found by its text.
    expect(screen.getByText('Enter both a start and an end number.').parent).toHaveProp('accessibilityRole', 'alert');

    await user.clear(from);
    await user.type(from, ' 305 ');
    await user.type(to, '', { submitEditing: true });
    expect(onConfirm).toHaveBeenCalledWith('305', '311');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('Back and the scrim close it', async () => {
    const user = userEvent.setup({ delay: 0 });
    await renderDialog();
    // Android back has no control on the screen: the Modal's own handler is called.
    await act(async () => { (modal().props as { onRequestClose: () => void }).onRequestClose(); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
