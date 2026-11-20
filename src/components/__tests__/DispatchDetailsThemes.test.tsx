/**
 * Renders the dispatch object page parts in all four themes (brand × mode)
 * and checks that they take their surfaces from tokens, never a brand fill.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { DispatchHeroHeader } from '@/components/dispatch-details/DispatchHeroHeader';
import { DispatchGRNsTab } from '@/components/dispatch-details/DispatchGRNsTab';
import { DispatchItemsTab } from '@/components/dispatch-details/DispatchItemsTab';
import { DispatchInvoicesTab } from '@/components/dispatch-details/DispatchInvoicesTab';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
// Font scale 1: from 1.5 the header hides its number, which the title bar already shows.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 891, scale: 2.6, fontScale: 1 }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

// One tree is on screen at a time: the one before is taken down when the next is drawn.
let current: { unmount: () => Promise<void> | void } | undefined;
async function renderIn(brand: string, mode: Mode, element: React.ReactElement) {
  await current?.unmount();
  mockState = { theme: { preference: mode, brand } };
  current = await render(element);
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

const item = {
  id: 'i1',
  item_name: 'Potatoes',
  dispatch_quantity: 4,
  grn_no: '311',
  grn_date: '2026-10-09',
  grn_id: 'g1',
  original_quantity: 10,
  weight: 50,
  package_mark: 'PM',
};

afterEach(() => {
  current = undefined;
});

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders DispatchHeroHeader on surface.card with the number as header', async () => {
    await renderIn(
      brand,
      mode,
      <DispatchHeroHeader disp_no="D42" date="2026-10-09" total_items={2} total_quantity={7} customer_name="Patel" />
    );
    const bgs = backgrounds();
    expect(bgs).toContain(t.surface.card);
    expect(bgs).not.toContain(t.brand.fill);
    expect(screen.getByRole('header')).toHaveTextContent('D42');
  });

  it('renders the three tables as token cards on background.base, with the link in brand.tint', async () => {
    await renderIn(brand, mode, <DispatchItemsTab items={[item]} onViewGRN={jest.fn()} />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expect(backgrounds()).not.toContain(t.brand.fill);
    expect(StyleSheet.flatten(screen.getByText('311/10', { includeHiddenElements: true }).props.style).color).toBe(t.brand.tint);

    await renderIn(brand, mode, <DispatchGRNsTab items={[item]} onViewGRN={jest.fn()} />);
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expect(backgrounds()).not.toContain(t.brand.fill);

    await renderIn(
      brand,
      mode,
      <DispatchInvoicesTab
        invoices={{ detailed: true, count: 1, total: 1906, rows: [{ key: 'v1', invoice_id: 'v1', invoice_no: 42, invoice_date: '2026-10-09', total: 1906 }] }}
      />
    );
    expect(backgrounds()).toEqual(expect.arrayContaining([t.background.base, t.surface.card]));
    expect(backgrounds()).not.toContain(t.brand.fill);

    await renderIn(brand, mode, <DispatchGRNsTab items={[]} />);
    expect(screen.getByText('No GRNs for this dispatch')).toBeOnTheScreen();
  });
});
