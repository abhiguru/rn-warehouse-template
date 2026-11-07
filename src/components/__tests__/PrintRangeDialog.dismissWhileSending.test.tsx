/**
 * WH-109 review: while a print is being sent the dialog stays open. The backdrop, the X, Cancel and Android back are
 * ignored, so a failure is seen in the dialog. Once the send is over they close it again.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal } from 'react-native';
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
let tree: ReactTestRenderer;
let failJob: (error: Error) => void;
let finishJob: () => void;
const onConfirm = jest.fn(() => new Promise<void>((resolve, reject) => { finishJob = resolve; failJob = reject; }));

async function render() {
  await act(async () => {
    tree = create(
      <PrintRangeDialog visible onDismiss={onDismiss} onConfirm={onConfirm} title="Print invoices" defaultNumber="2555" entity="invoice" />
    );
  });
}
const byLabel = (label: string) =>
  tree.root.find((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const closers = () => [
  () => byLabel('Cancel printing').props.onPress(),
  () => byLabel('Close print dialog').props.onPress(),
  () => byLabel('Cancel').props.onPress(),
  () => tree.root.findByType(Modal).props.onRequestClose(),
];

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => tree?.unmount()); });

describe('closing the print dialog', () => {
  it('is ignored by the backdrop, the X, Cancel and Android back while a print is being sent', async () => {
    await render();
    await act(async () => { byLabel('Print').props.onPress(); });
    for (const close of closers()) {
      await act(async () => { close(); });
    }
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => { finishJob(); });
  });

  it('shows the failure of the send in the dialog, which was not closed', async () => {
    await render();
    await act(async () => { byLabel('Print').props.onPress(); });
    await act(async () => { closers()[0](); });
    await act(async () => { failJob(new Error("Couldn't reach the print server. Check your connection and try again.")); });
    const texts = tree.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join(''));
    expect(texts).toContain("Couldn't reach the print server. Check your connection and try again.");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('closes again once nothing is being sent', async () => {
    await render();
    for (const close of closers()) {
      await act(async () => { close(); });
    }
    expect(onDismiss).toHaveBeenCalledTimes(4);
  });
});
