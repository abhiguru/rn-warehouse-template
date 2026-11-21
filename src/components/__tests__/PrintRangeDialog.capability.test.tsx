/**
 * The print dialog follows the facility's own `printing` capability, not the demo default.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useTheme', () => {
  const tokens = jest.requireActual('@/theme/tokens').getTokens('orange', 'light');
  return { useTokens: () => tokens, useThemedStyles: (factory: (t: unknown) => unknown) => factory(tokens) };
});
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// The demo default says printing is off.
jest.mock('@/config/demoCapabilities', () => ({
  DEMO_CAPABILITIES: { printing: false, sensors: false, realtime: true, customerDocuments: false },
}));
let mockPrinting = true;
jest.mock('@/hooks/useCapability', () => ({ useCapability: () => mockPrinting }));

const renderDialog = () =>
  render(
    <PrintRangeDialog visible onDismiss={jest.fn()} onConfirm={jest.fn(async () => undefined)} title="Print GRNs" defaultNumber="311" entity="grn" />
  );

it('offers the print form where the facility has printing on', async () => {
  mockPrinting = true;
  await renderDialog();
  expect(screen.getByText('Print GRNs')).toBeOnTheScreen();
  expect(screen.queryByText(/Printing unavailable/)).not.toBeOnTheScreen();
});

it('says printing is unavailable where the facility has it off', async () => {
  mockPrinting = false;
  await renderDialog();
  expect(screen.getByText(/Printing unavailable/)).toBeOnTheScreen();
});
