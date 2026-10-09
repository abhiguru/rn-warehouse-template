/**
 * Renders the dispatch cards, print dialogs and GRN dispatch views in all four
 * themes (brand × mode) and checks that they take their surfaces from tokens.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import DispatchGroupCard from '@/components/DispatchGroupCard';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { DocumentSuccessDialog } from '@/components/DocumentSuccessDialog';
import { GRNItemDispatchTable } from '@/components/grn-details/GRNItemDispatchTable';
import { GRNDispatchTimeline } from '@/components/grn-details/GRNDispatchTimeline';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/config/demoCapabilities', () => ({
  DEMO_CAPABILITIES: { printing: true, sensors: false, realtime: true, customerDocuments: false },
}));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function renderIn(brand: string, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function backgrounds(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => typeof node.type === 'string')
    .map(node => StyleSheet.flatten(node.props.style)?.backgroundColor)
    .filter((c): c is string => typeof c === 'string');
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

  it('renders DispatchGroupCard on surface.card with no brand-filled header', () => {
    const tree = renderIn(
      brand,
      mode,
      <DispatchGroupCard
        dispatch={{ dispatchId: 'd1', dispNo: '42', dispDate: '2026-10-09', customerName: 'Patel', note: 'Fragile' }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items={[dispatchItem as any]}
      />
    );
    const bgs = backgrounds(tree);
    expect(bgs).toContain(t.surface.card);
    expect(bgs).not.toContain(t.brand.fill);
  });

  it('renders PrintRangeDialog as a token dialog', () => {
    const tree = renderIn(
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
    const bgs = backgrounds(tree);
    expect(bgs).toContain(t.overlay.scrim);
    expect(bgs).toContain(t.surface.sheet);
    expect(bgs).toContain(t.brand.fill);
  });

  it('renders DocumentSuccessDialog with one primary action and a positive icon', () => {
    const tree = renderIn(
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
    const bgs = backgrounds(tree);
    expect(bgs.filter(c => c === t.brand.fill)).toHaveLength(1);
    expect(bgs).toContain(t.status.positive.background);
    expect(tree.root.findByProps({ children: 'Dispatch created' })).toBeTruthy();
  });

  it('renders GRN dispatch table and timeline', () => {
    const table = renderIn(
      brand,
      mode,
      <GRNItemDispatchTable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        item={{ id: 'a', item_name: 'Potatoes', qty: 10 } as any}
        dispatches={[
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: 'r1', dispatch_id: 'd1', disp_no: '42', disp_date: '2026-10-09', disp_quantity: 3 } as any,
        ]}
        defaultExpanded
      />
    );
    expect(backgrounds(table)).toContain(t.background.base);

    const timeline = renderIn(
      brand,
      mode,
      <GRNDispatchTimeline
        dispatches={[{ id: 'r1', dispatchId: 'd1', dispNo: '42', dispDate: '2026-10-09', dispQuantity: 1 }]}
      />
    );
    expect(backgrounds(timeline)).toContain(t.surface.card);
  });
});
