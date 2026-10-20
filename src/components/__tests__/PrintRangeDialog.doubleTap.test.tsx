/**
 * J3 (review 2026-10-20): a double tap on Print, or Return and then Print, sends one print job. The guard is a ref set
 * before the first await: the dialog's `loading` state is only seen after the next render, too late for a second press.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useTheme', () => {
  const tokens = jest.requireActual('@/theme/tokens').getTokens('orange', 'light');
  return { useTokens: () => tokens, useThemedStyles: (factory: (t: unknown) => unknown) => factory(tokens) };
});
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/config/demoCapabilities', () => ({
  DEMO_CAPABILITIES: { printing: true, sensors: false, realtime: true, customerDocuments: false },
}));

const onDismiss = jest.fn();

let tree: ReactTestRenderer;
let finishJob: () => void;
const onConfirm = jest.fn(() => new Promise<void>((resolve) => { finishJob = resolve; }));

async function render() {
  await act(async () => {
    tree = create(
      <PrintRangeDialog visible onDismiss={onDismiss} onConfirm={onConfirm} title="Print invoices" defaultNumber="2555" entity="invoice" />
    );
  });
}
const printButton = () =>
  tree.root.find((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Print' && typeof node.props.onPress === 'function');

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => tree?.unmount()); });

describe('PrintRangeDialog presses', () => {
  it('sends one job for two presses of Print before the dialog has drawn again', async () => {
    await render();
    const press = printButton().props.onPress;

    await act(async () => { press(); press(); });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { finishJob(); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('sends one job for Return in a field and then Print', async () => {
    await render();
    const press = printButton().props.onPress;
    const submit = tree.root.findAllByType(TextInput)[1].props.onSubmitEditing;

    await act(async () => { submit(); press(); });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { finishJob(); });
  });

  it('takes a new press once the first job is over', async () => {
    await render();
    await act(async () => { printButton().props.onPress(); });
    await act(async () => { finishJob(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await act(async () => { printButton().props.onPress(); });

    expect(onConfirm).toHaveBeenCalledTimes(2);
    await act(async () => { finishJob(); });
  });
});
