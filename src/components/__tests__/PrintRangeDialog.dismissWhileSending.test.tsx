/**
 * WH-109 review: while a print is being sent the dialog stays open. The backdrop, the X, Cancel and Android back are
 * ignored, so a failure is seen in the dialog. Once the send is over they close it again.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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
let failJob: ((error: Error) => void) | undefined;
let finishJob: (() => void) | undefined;
const onConfirm = jest.fn(() => new Promise<void>((resolve, reject) => { finishJob = resolve; failJob = reject; }));

const renderDialog = () =>
  render(<PrintRangeDialog visible onDismiss={onDismiss} onConfirm={onConfirm} title="Print invoices" defaultNumber="2555" entity="invoice" />);

// The dialog's Modal is the root host element. Its Android back handler and the scrim behind the card have no role or
// name (the scrim is hidden from the screen reader on purpose), so they are reached from the root.
type Host = ReturnType<typeof screen.getByRole>;
const modal = () => screen.root as unknown as Host;
const scrim = () => ((modal().children[0] as Host).children[0] as Host).children[0] as Host;

beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  // Release a send still held, so a failing test does not leave it pending.
  finishJob?.();
  finishJob = undefined;
  failJob = undefined;
});

describe('closing the print dialog', () => {
  it('is ignored by the backdrop, Cancel and Android back (the X is gone, WH-219) while a print is being sent', async () => {
    const user = userEvent.setup({ delay: 0 });
    await renderDialog();
    await user.press(screen.getByRole('button', { name: 'Print' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.press(scrim());
    (modal().props as { onRequestClose: () => void }).onRequestClose();
    // Cancel is disabled while sending, so a press never reaches the handler.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('shows the failure of the send in the dialog, which was not closed', async () => {
    const user = userEvent.setup({ delay: 0 });
    await renderDialog();
    await user.press(screen.getByRole('button', { name: 'Print' }));
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    failJob?.(new Error("Couldn't reach the print server. Check your connection and try again."));
    finishJob = undefined;

    expect(await screen.findByText("Couldn't reach the print server. Check your connection and try again.")).toBeOnTheScreen();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('closes again once nothing is being sent', async () => {
    const user = userEvent.setup({ delay: 0 });
    await renderDialog();

    await user.press(scrim());
    (modal().props as { onRequestClose: () => void }).onRequestClose();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDismiss).toHaveBeenCalledTimes(3);
  });
});
