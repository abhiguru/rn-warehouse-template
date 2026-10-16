/**
 * The open group of the invoice items table (review 2026-10-16, A8, A9, A15, B10, B17): the
 * scroll-edge fades, the mark chip, the straight accent bar, first-line alignment, the copy.
 * Names and numbers are fictional.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { getTokens } from '@/theme/tokens';
import { OPEN_ACCENT, TABLE_OUTLINE } from '@/components/common/DetailTable';
import { InvoiceItemsTable } from '../InvoiceItemsTable';
import type { InvoiceItemData } from '@/types/invoice.types';

const mockInvoiceForm = { bulkPricing: {} };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, invoiceForm: mockInvoiceForm }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/fiori', () => ({ InlineValidation: 'InlineValidation' }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));

const line = (id: string, over: Partial<InvoiceItemData> = {}): InvoiceItemData => ({
  temp_id: id, disp_trl_id: `d-${id}`, grn_item_id: 'gi', item_id: 'item', item_name: 'Fictional potatoes', qty: 4,
  grn_original_qty: 200, package_mark: 'K-FOR-WRAP-TEST/VERY-LONG-FICTIONAL-MARK-0000000000', rack: 'A1', weight: 50, dispatch_id: `disp-${id}`,
  dispatch_no: `I000${id}`, dispatch_date: '2026-10-01', grn_id: 'g', grn_no: 'FX1', grn_date: '2026-04-01', duration: 1, no_of_days: 30,
  charge: 5, labour_rate: 2, tax: 5, amount: 20, labour_amount: 8, tax_amount: 1.4, item_total: 29.4, ...over,
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  setLanguage('en');
});

async function render(items: InvoiceItemData[], open = true) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceItemsTable items={items} onItemUpdate={jest.fn()} onBulkEdit={jest.fn()} />);
  });
  mounted.push(tree);
  if (open) {
    const header = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityState?.expanded === false)[0];
    await act(async () => header.props.onPress());
  }
  return tree;
}
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const scroller = (tree: ReactTestRenderer) => tree.root.findAll(n => n.props.horizontal === true && typeof n.props.onScroll === 'function')[0];
const t = getTokens('orange', 'light');

describe('the open group of the invoice items table', () => {
  it('shows the right fade while columns are to the right, the left one once scrolled, each hidden at its end', async () => {
    const tree = await render([line('1')]);
    // Before any layout nothing is known: no fade.
    expect(byId(tree, 'scroll-fade-right')).toHaveLength(0);
    await act(async () => {
      scroller(tree).props.onLayout({ nativeEvent: { layout: { width: 400 } } });
      scroller(tree).props.onContentSizeChange(700, 100);
    });
    expect(byId(tree, 'scroll-fade-right')).toHaveLength(1);
    expect(byId(tree, 'scroll-fade-left')).toHaveLength(0);
    const scrollTo = (x: number) =>
      act(async () => scroller(tree).props.onScroll({ nativeEvent: { contentOffset: { x }, layoutMeasurement: { width: 400 }, contentSize: { width: 700 } } }));
    await scrollTo(150);
    expect(byId(tree, 'scroll-fade-right')).toHaveLength(1);
    expect(byId(tree, 'scroll-fade-left')).toHaveLength(1);
    await scrollTo(300); // 300 + 400 = 700: the end
    expect(byId(tree, 'scroll-fade-right')).toHaveLength(0);
    expect(byId(tree, 'scroll-fade-left')).toHaveLength(1);
    await scrollTo(0);
    expect(byId(tree, 'scroll-fade-left')).toHaveLength(0);
    expect(byId(tree, 'scroll-fade-right')).toHaveLength(1);
  });

  it('draws the fade from the card colour, fainter inward, and lets touches through', async () => {
    const tree = await render([line('1')]);
    await act(async () => {
      scroller(tree).props.onLayout({ nativeEvent: { layout: { width: 400 } } });
      scroller(tree).props.onContentSizeChange(700, 100);
    });
    const [fade] = byId(tree, 'scroll-fade-right');
    expect(fade.props.pointerEvents).toBe('none');
    const strips = fade.props.children.map((c: { props: { style: unknown } }) => StyleSheet.flatten(c.props.style));
    expect(strips.length).toBeGreaterThan(2);
    strips.forEach((s: { backgroundColor: string }) => expect(s.backgroundColor).toBe(t!.surface.card));
    const opacities = strips.map((s: { opacity: number }) => s.opacity);
    expect(opacities[opacities.length - 1]).toBeGreaterThan(opacities[0]); // opaque at the right edge
  });

  it('keeps the mark chip to one line, cut with an ellipsis, inside the content column', async () => {
    const tree = await render([line('1')]);
    const mark = tree.root.findAll(n => (n.type as unknown) === 'Text' && String(n.props.children).startsWith('K-FOR-WRAP'))[0];
    expect(mark.props.numberOfLines).toBe(1);
    expect(mark.props.ellipsizeMode).toBe('tail');
    expect(StyleSheet.flatten(mark.props.style).flexShrink).toBe(1);
    const chip = tree.root.findAll(n => (n.type as unknown) === 'View' && n.findAll(i => i === mark).length > 0 && StyleSheet.flatten(n.props.style)?.maxWidth === '100%')[0];
    expect(StyleSheet.flatten(chip.props.style).flexShrink).toBe(1);
    const column = tree.root.findAll(n => (n.type as unknown) === 'View' && StyleSheet.flatten(n.props.style)?.flex === 1 && n.findAll(i => i === chip).length > 0)[0];
    expect(StyleSheet.flatten(column.props.style).minWidth).toBe(0);
  });

  it('outlines the chips on the open fill, and not on a closed group', async () => {
    const open = await render([line('1')]);
    const chipsOf = (tree: ReactTestRenderer) =>
      tree.root.findAll(n => (n.type as unknown) === 'View' && StyleSheet.flatten(n.props.style)?.backgroundColor === t!.status.neutral.background && StyleSheet.flatten(n.props.style)?.maxWidth === '100%');
    expect(chipsOf(open).length).toBeGreaterThan(0);
    chipsOf(open).forEach(c => {
      const s = StyleSheet.flatten(c.props.style);
      expect(s.borderWidth).toBe(TABLE_OUTLINE);
      expect(s.borderColor).toBe(t!.table.outline);
    });
    expect(t!.table.outline).not.toBe(t!.status.neutral.background);
    const closed = await render([line('1')], false);
    chipsOf(closed).forEach(c => expect(StyleSheet.flatten(c.props.style).borderWidth).toBeUndefined());
  });

  it('draws the accent bar as its own straight element in each card, not as a left border', async () => {
    const tree = await render([line('1')]);
    const bars = byId(tree, 'accent-bar');
    expect(bars).toHaveLength(2); // the group card and the table card
    bars.forEach(bar => {
      const s = StyleSheet.flatten(bar.props.style);
      expect(s).toMatchObject({ position: 'absolute', top: 0, bottom: 0, left: 0, width: OPEN_ACCENT, backgroundColor: t!.table.accent });
    });
    const cards = tree.root.findAll(n => (n.type as unknown) === 'View' && n.findAll(i => bars.includes(i)).length > 0 && StyleSheet.flatten(n.props.style)?.overflow === 'hidden');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    cards.forEach(c => expect(StyleSheet.flatten(c.props.style).borderLeftWidth).toBeUndefined());
  });

  it('has no accent bar while the group is closed', async () => {
    expect(byId(await render([line('1')], false), 'accent-bar')).toHaveLength(0);
  });

  it('puts the chevron and the quantity on the first text line', async () => {
    const tree = await render([line('1')]);
    const [chevron] = byId(tree, 'group-chevron');
    expect(StyleSheet.flatten(chevron.props.style).height).toBeGreaterThan(0);
    const header = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityState?.expanded === true)[0];
    expect(StyleSheet.flatten(header.props.style({ pressed: false })).alignItems).toBe('flex-start');
    const qty = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === '4')[0];
    let cell = qty.parent!;
    while (!StyleSheet.flatten(cell.props.style)?.paddingHorizontal) cell = cell.parent!;
    expect(StyleSheet.flatten(cell.props.style).justifyContent).toBe('flex-start');
  });

  it('says "Applies to this line" for one line and "Applies to all 2 lines" for two', async () => {
    const texts = (tree: ReactTestRenderer) => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
    expect(texts(await render([line('1')]))).toContain('Applies to this line');
    expect(texts(await render([line('1'), line('2')]))).toContain('Applies to all 2 lines');
  });
});
