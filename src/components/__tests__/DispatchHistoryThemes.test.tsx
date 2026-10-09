/**
 * Renders the dispatch history card, summary and filter overlay in all four
 * themes (brand × mode) and checks their surfaces come from tokens.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import DispatchHistoryCard from '@/components/DispatchHistoryCard';
import DispatchHistorySummary from '@/components/DispatchHistorySummary';
import DispatchFilterOverlay from '@/components/DispatchFilterOverlay';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));

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

const dispatch = {
  id: 1,
  dispatch_id: 'd1',
  disp_no: '42',
  disp_date: '2026-10-01',
  disp_quantity: 1,
  grnItems_item_name: 'Potatoes',
  grnItems_rack: 'B-14',
  grnItems_weight: 50,
  grns_gr_no: '311',
  registration: 'GJ-01-AB-1234',
  note: 'Handle with care',
};

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders DispatchHistoryCard as an object cell on surface.card', () => {
    const tree = renderIn(brand, mode, <DispatchHistoryCard dispatch={dispatch as any} />);
    expect(backgrounds(tree)).toContain(t.surface.card);
    expect(
      tree.root.findByProps({ accessibilityLabel: 'Dispatch 42, Potatoes, 1 bag, 1 Oct 2026' })
    ).toBeTruthy();
  });

  it('renders DispatchHistorySummary with neutral tiles', () => {
    const tree = renderIn(
      brand,
      mode,
      <DispatchHistorySummary totalDispatches={3} totalQuantity={1200} totalWeight={50} initialQuantity={2000} />
    );
    const bgs = backgrounds(tree);
    expect(bgs).toContain(t.surface.card);
    expect(bgs).toContain(t.background.base);
  });

  it('renders DispatchFilterOverlay with one primary action', () => {
    const tree = renderIn(
      brand,
      mode,
      <DispatchFilterOverlay
        visible
        onClose={jest.fn()}
        onApply={jest.fn()}
        currentFilters={{ selectedItems: [{ type: 'item', id: '1', label: 'Potatoes', value: 'Potatoes' }] }}
        activeFilterCount={1}
      />
    );
    const bgs = backgrounds(tree);
    expect(bgs).toContain(t.background.base);
    expect(bgs.filter(c => c === t.brand.fill)).toHaveLength(1);
  });
});
