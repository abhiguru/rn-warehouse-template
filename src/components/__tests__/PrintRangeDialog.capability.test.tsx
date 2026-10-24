/**
 * The print dialog follows the facility's own `printing` capability, not the demo default.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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

const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <PrintRangeDialog visible onDismiss={jest.fn()} onConfirm={jest.fn(async () => undefined)} title="Print GRNs" defaultNumber="311" entity="grn" />
    );
  });
  return tree;
}

it('offers the print form where the facility has printing on', async () => {
  mockPrinting = true;
  const tree = await render();
  expect(texts(tree).some(x => x.includes('Printing unavailable'))).toBe(false);
  act(() => tree.unmount());
});

it('says printing is unavailable where the facility has it off', async () => {
  mockPrinting = false;
  const tree = await render();
  expect(texts(tree).some(x => x.includes('Printing unavailable'))).toBe(true);
  act(() => tree.unmount());
});
