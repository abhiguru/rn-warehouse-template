/**
 * J3 (review 2026-10-20): a double tap on Print, or Return and then Print, sends one print job. The guard is a ref set
 * before the first await: the dialog's `loading` state is only seen after the next render, too late for a second press.
 */
import React from 'react';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useTheme', () => {
  const tokens = jest.requireActual('@/theme/tokens').getTokens('orange', 'light');
  return { useTokens: () => tokens, useThemedStyles: (factory: (t: unknown) => unknown) => factory(tokens) };
});
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/config/demoCapabilities', () => ({
  DEMO_CAPABILITIES: { printing: true, sensors: false, realtime: true, customerDocuments: false },
}));

const onDismiss = jest.fn();

let finishJob: (() => void) | undefined;
const onConfirm = jest.fn(() => new Promise<void>((resolve) => { finishJob = resolve; }));

const renderDialog = () =>
  render(<PrintRangeDialog visible onDismiss={onDismiss} onConfirm={onConfirm} title="Print invoices" defaultNumber="2555" entity="invoice" />);
const printButton = () => screen.getByRole('button', { name: 'Print' });

// A second press that arrives before React has drawn the first one again. fireEvent and userEvent wait for the held print
// job (and a second one would overlap its act scope), so the second press is the screen reader's click on the button,
// sent while the first press is still being handled.
const secondPress = (button: ReturnType<typeof printButton>) => {
  const target = {};
  (button.props as { onClick: (event: unknown) => void }).onClick({ nativeEvent: {}, currentTarget: target, target, stopPropagation: () => undefined });
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  // Release a job still held, so a failing test does not leave it pending.
  finishJob?.();
  finishJob = undefined;
});

describe('PrintRangeDialog presses', () => {
  it('sends one job for two presses of Print before the dialog has drawn again', async () => {
    await renderDialog();
    const button = printButton();

    const first = fireEvent.press(button);
    secondPress(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    finishJob?.();
    await first;
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('sends one job for Return in a field and then Print', async () => {
    await renderDialog();

    const first = fireEvent(screen.getByPlaceholderText('End invoice number'), 'submitEditing');
    secondPress(printButton());
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    finishJob?.();
    await first;
  });

  it('takes a new press once the first job is over', async () => {
    const user = userEvent.setup({ delay: 0 });
    await renderDialog();
    await user.press(printButton());
    finishJob?.();
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.press(await screen.findByRole('button', { name: 'Print' }));

    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
