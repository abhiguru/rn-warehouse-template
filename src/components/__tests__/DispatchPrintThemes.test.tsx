/**
 * Renders the dispatch cards, print dialogs and GRN dispatch views in all four
 * themes (brand × mode) and checks that they take their surfaces from tokens.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { DocumentSuccessDialog } from '@/components/DocumentSuccessDialog';
import { GRNDispatchesTab } from '@/components/grn-details/GRNDispatchesTab';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
// PrintRangeDialog pads its overlay by the safe-area insets (keyboard-safe layout).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@/config/demoCapabilities', () => ({
  DEMO_CAPABILITIES: { printing: true, sensors: false, realtime: true, customerDocuments: false },
}));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

async function renderIn(brand: string, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  await render(element);
}

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };

// The open row's accent bar (table.accent) is the one brand-coloured fill a table may draw.
// A fill has no role or text: every host element of the rendered tree is read for its background.
function backgrounds(): string[] {
  const out: string[] = [];
  const walk = (node: Json | string | null | (Json | string)[]) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.props.testID !== 'table-open-bar') {
      const color = StyleSheet.flatten(node.props.style as never)?.backgroundColor;
      if (typeof color === 'string') out.push(color);
    }
    node.children?.forEach(walk);
  };
  walk(screen.toJSON() as unknown as Json | Json[] | null);
  return out;
}

const dispatchItem = {
  id: 1,
  disp_quantity: 4,
  grnItems_item_name: 'Potatoes',
  grnItems_rack: 'B-14',
  grnItems_package_mark: 'PM',
  grnItems_weight: 50,
  grnItems_quantity: 10,
  grns_gr_no: '311',
};

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders PrintRangeDialog as a token dialog', async () => {
    await renderIn(
      brand,
      mode,
      <PrintRangeDialog
        visible
        onDismiss={jest.fn()}
        onConfirm={jest.fn()}
        title="Print dispatches"
        defaultNumber="42"
        label="Dispatch"
        onViewJobs={jest.fn()}
      />
    );
    const bgs = backgrounds();
    expect(bgs).toContain(t.overlay.scrim);
    expect(bgs).toContain(t.surface.sheet);
    expect(bgs).toContain(t.brand.fill);
  });

  it('renders DocumentSuccessDialog with one primary action and a positive icon', async () => {
    await renderIn(
      brand,
      mode,
      <DocumentSuccessDialog
        isVisible
        documentType="Dispatch"
        documentData={{ documentNo: '42', customerName: 'Patel', itemCount: 2, totalAmount: 1234.5 }}
        onCreateAnother={jest.fn()}
        onViewList={jest.fn()}
        onPrint={jest.fn()}
        onSharePDF={jest.fn()}
      />
    );
    const bgs = backgrounds();
    expect(bgs.filter(c => c === t.brand.fill)).toHaveLength(1);
    expect(bgs).toContain(t.status.positive.background);
    expect(screen.getByText('Dispatch created')).toBeOnTheScreen();
  });

  it('renders GRN dispatch table', async () => {
    await renderIn(
      brand,
      mode,
      <GRNDispatchesTab
        items={[{ id: 'a', item_name: 'Potatoes', qty: 10, stock: 7 }]}
        dispatchesByItem={{
          a: [{ id: 'r1', dispatch_id: 'd1', disp_no: '42', disp_date: '2026-10-09', disp_quantity: 3 } as any],
        }}
      />
    );
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expect(backgrounds()).not.toContain(t.brand.fill);
  });
});
