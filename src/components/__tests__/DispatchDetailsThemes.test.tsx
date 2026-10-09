/**
 * Renders the dispatch object page parts in all four themes (brand × mode)
 * and checks that they take their surfaces from tokens, never a brand fill.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { DispatchHeroHeader } from '@/components/dispatch-details/DispatchHeroHeader';
import { DispatchItemCard } from '@/components/dispatch-details/DispatchItemCard';
import { DispatchGRNsTab } from '@/components/dispatch-details/DispatchGRNsTab';
import { DispatchItemsTab } from '@/components/dispatch-details/DispatchItemsTab';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

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

const item = {
  item_name: 'Potatoes',
  dispatch_quantity: 4,
  grn_no: '311',
  grn_date: '2026-10-09',
  grn_id: 'g1',
  original_quantity: 10,
  weight: 50,
  package_mark: 'PM',
};

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders DispatchHeroHeader on surface.card with the number as header', () => {
    const tree = renderIn(
      brand,
      mode,
      <DispatchHeroHeader disp_no="D42" date="2026-10-09" total_items={2} total_quantity={7} customer_name="Patel" />
    );
    const bgs = backgrounds(tree);
    expect(bgs).toContain(t.surface.card);
    expect(bgs).not.toContain(t.brand.fill);
    expect(tree.root.findByProps({ accessibilityRole: 'header' }).props.children).toBe('D42');
  });

  it('renders DispatchItemCard as a token object cell', () => {
    const tree = renderIn(brand, mode, <DispatchItemCard {...item} onViewGRN={jest.fn()} />);
    const bgs = backgrounds(tree);
    expect(bgs).toContain(t.surface.card);
    expect(bgs).toContain(t.status.neutral.background);
    expect(bgs).not.toContain(t.brand.fill);
  });

  it('renders the items and GRNs tabs on background.base', () => {
    const items = renderIn(brand, mode, <DispatchItemsTab items={[{ id: 'i1', ...item }]} />);
    expect(backgrounds(items)).toContain(t.background.base);

    const grns = renderIn(
      brand,
      mode,
      <DispatchGRNsTab
        grns={[{ grn_id: 'g1', grn_no: '311', grn_date: '2026-10-09', items: [item] }]}
        onViewGRN={jest.fn()}
      />
    );
    expect(backgrounds(grns)).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));

    const empty = renderIn(brand, mode, <DispatchGRNsTab grns={[]} />);
    expect(empty.root.findByProps({ children: 'No GRNs for this dispatch' })).toBeTruthy();
  });
});
