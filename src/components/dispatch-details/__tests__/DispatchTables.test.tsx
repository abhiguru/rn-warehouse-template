/**
 * The dispatch page's Items, GRNs and Invoices tables: rows, links only with an id,
 * expansion, totals, the invoice fallback, narrow and wide screens and large text.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { configure, render, screen, userEvent, within } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { OPEN_ACCENT, TABLE_OUTLINE } from '@/components/common/DetailTable';
import { DispatchItemsTab, sourceColumnWidth } from '../DispatchItemsTab';
import { DispatchGRNsTab } from '../DispatchGRNsTab';
import { DispatchInvoicesTab } from '../DispatchInvoicesTab';
import type { DispatchItem, InvoiceTable } from '../dispatchDetailsModel';

let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: mockTheme }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
let mockFontScale = 1;
let mockWidth = 360;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const item = (over: Partial<DispatchItem> & { id: string }): DispatchItem => ({
  item_name: 'Basmati Rice',
  dispatch_quantity: 25,
  grn_no: '0161',
  grn_date: '2026-10-15',
  grn_id: 'grn-161',
  original_quantity: 100,
  weight: 50,
  package_mark: 'PM',
  ...over,
});

const rice = item({ id: 'r' });
const wheat = item({ id: 'w', item_name: 'Wheat', dispatch_quantity: 40, package_mark: null, weight: null, original_quantity: undefined });
const older = item({ id: 'o', item_name: 'Sugar', dispatch_quantity: 50, grn_id: 'grn-159', grn_no: '0159', grn_date: '2026-10-14' });

afterEach(() => {
  mockFontScale = 1;
  mockWidth = 360;
  mockTheme = { preference: 'light', brand: 'orange' };
  setLanguage('en');
});
// The row texts a person reads include text kept out of the screen reader's order (the row carries its own label).
beforeAll(() => configure({ defaultIncludeHiddenElements: true }));
afterAll(() => configure({ defaultIncludeHiddenElements: false }));

type Element = ReturnType<typeof screen.getByTestId>;
const textOf = (node?: Element): string =>
  // The node's own text and every text inside it, in the order drawn.
  // A no-break space keeps a number with its unit on screen; read it as a space here.
  [...(node?.type === 'Text' ? [node] : []), ...(node ? within(node) : screen).queryAllByText(/[\s\S]*/)]
    .map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' '))
    .join('|');
const byTestId = (id: string): Element => screen.getByTestId(id);
const has = (id: string) => screen.queryByTestId(id) !== null;
const press = (id: string) => userEvent.press(byTestId(id));

/** The rendered tree as plain objects, for what has no role or text: icon names and the styles of drawn views. */
type Json = { type: string; props: Record<string, unknown>; children: Array<Json | string> | null };
const hostsIn = (node: Json): Json[] => [node, ...(node.children ?? []).flatMap((c) => (typeof c === 'string' ? [] : hostsIn(c)))];
const allHosts = (): Json[] => {
  const json = screen.toJSON() as Json | Json[] | null;
  return ([] as Array<Json | null>).concat(json).flatMap((n) => (n ? hostsIn(n) : []));
};
const hostById = (id: string): Json => allHosts().find((n) => n.props.testID === id)!;
const styleOf = (node: Json) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
const iconsIn = (node: Json) => hostsIn(node).filter((n) => n.type === 'Icon').map((n) => n.props as { name: string; color: string });
/** The width of the column a cell is in: the column's view (the cell itself, in a totals row). */
const columnWidth = (node: Element): number | undefined => {
  for (let n: Element | null = node; n; n = n.parent) {
    const width = (StyleSheet.flatten(n.props.style) as { width?: unknown } | undefined)?.width;
    if (typeof width === 'number') return width;
  }
  return undefined;
};

describe('Items table', () => {
  it('shows one row per line: the weight under the item, "GRN/received" with the mark under it', async () => {
    await render(<DispatchItemsTab items={[rice, wheat, item({ id: 'r2', package_mark: 'B2', dispatch_quantity: 5, original_quantity: 60 })]} />);

    expect(textOf(byTestId('dispatch-item-row-r'))).toBe('Basmati Rice|50 kg each|0161/100|PM|25');
    // Two lots of one item stay two rows, each with its own received and mark.
    expect(textOf(byTestId('dispatch-item-row-r2'))).toBe('Basmati Rice|50 kg each|0161/60|B2|5');
    // No mark, no weight, no received quantity: the GRN number alone.
    expect(textOf(byTestId('dispatch-item-row-w'))).toBe('Wheat|0161|40');
    // The GRN date is on the GRNs tab, not here.
    expect(textOf(byTestId('dispatch-items-table'))).not.toMatch(/15 Oct/);
  });

  it('heads the columns Item, GRN/Received, Bags dispatched, the middle heading on one line', async () => {
    await render(<DispatchItemsTab items={[rice]} />);
    expect(textOf(byTestId('dispatch-items-table'))).toMatch(/^Item\|GRN\/Received\|Bags dispatched\|/);
    const heading = screen.getByText('GRN/Received');
    expect(heading).toHaveProp('numberOfLines', 1);
  });

  it('counts in boxes when every line is a Box lot, and in bags when the lines differ', async () => {
    const box = (id: string, qty: number) => item({ id, packaging: 'Box', dispatch_quantity: qty, original_quantity: 188 });
    const first = await render(<DispatchItemsTab items={[box('b1', 1), box('b2', 4)]} />);
    expect(textOf(byTestId('dispatch-items-table'))).toMatch(/^Item\|GRN\/Received\|Boxes dispatched\|/);
    expect(byTestId('dispatch-items-total').props.accessibilityLabel).toBe('Total: 2 item lines from 1 GRN, 5 boxes dispatched');
    expect(byTestId('dispatch-item-row-b1').props.accessibilityLabel).toContain('Received 188 boxes');
    expect(byTestId('dispatch-item-row-b1').props.accessibilityLabel).toContain('1 box dispatched');
    await first.unmount();
    await render(<DispatchItemsTab items={[box('b1', 1), item({ id: 'g1', packaging: 'Bag', dispatch_quantity: 4 })]} />);
    expect(byTestId('dispatch-items-total').props.accessibilityLabel).toContain('5 units dispatched');
    expect(textOf(byTestId('dispatch-items-table'))).toMatch(/Units dispatched/);
  });

  it('counts a GRN row of Box lots in boxes on the GRNs tab', async () => {
    await render(<DispatchGRNsTab items={[item({ id: 'b1', packaging: 'Box', dispatch_quantity: 3 })]} />);
    expect(byTestId('dispatch-grns-total').props.accessibilityLabel).toContain('3 boxes dispatched');
    expect(byTestId('dispatch-grn-row-grn-161').props.accessibilityLabel).toContain('3 boxes dispatched');
    expect(textOf(byTestId('dispatch-grns-table'))).toMatch(/Boxes dispatched/);
  });

  it('totals the bags, item lines and distinct source GRNs in the footer', async () => {
    await render(<DispatchItemsTab items={[rice, wheat, older]} />);

    const footer = byTestId('dispatch-items-total');
    expect(textOf(footer)).toBe('Total|3 item lines|2 GRNs|115');
    expect(footer.props.accessibilityLabel).toBe('Total: 3 item lines from 2 GRNs, 115 bags dispatched');
  });

  it('opens the GRN from its number only when the line has a GRN id', async () => {
    const onViewGRN = jest.fn();
    await render(<DispatchItemsTab items={[rice, item({ id: 'x', grn_id: null })]} onViewGRN={onViewGRN} />);

    await press('dispatch-item-grn-r');
    expect(onViewGRN).toHaveBeenCalledWith('grn-161');
    expect(byTestId('dispatch-item-grn-x')).toBeDisabled();
    expect(byTestId('dispatch-item-row-x').props.accessibilityActions).toBeUndefined();
    expect(byTestId('dispatch-item-row-r').props.accessibilityActions).toEqual([{ name: 'openGrn', label: 'Open GRN 0161' }]);
  });

  it('says the GRN, the bags received and the mark, and shows "—" for a missing GRN number', async () => {
    await render(<DispatchItemsTab items={[rice, item({ id: 'x', grn_id: null, grn_no: null, grn_date: null })]} />);

    expect(byTestId('dispatch-item-row-r').props.accessibilityLabel).toBe(
      'Basmati Rice, 50 kg each, from GRN 0161, Received 100 bags, Mark PM, 25 bags dispatched'
    );
    expect(textOf(byTestId('dispatch-item-row-x'))).toBe('Basmati Rice|50 kg each|—/100|PM|25');
    expect(byTestId('dispatch-item-row-x').props.accessibilityLabel).toBe(
      'Basmati Rice, 50 kg each, from GRN not available, Received 100 bags, Mark PM, 25 bags dispatched'
    );
  });

  it('has rows that do not open: everything is in the row', async () => {
    await render(<DispatchItemsTab items={[rice, wheat]} />);

    expect(byTestId('dispatch-item-row-r').props.onPress).toBeUndefined();
    expect(byTestId('dispatch-item-row-r').props.accessibilityState).toBeUndefined();
    expect(allHosts().filter((n) => n.type === 'Icon' && /^chevron/.test(String(n.props.name)))).toEqual([]);
  });

  it('moves the GRN under the item at large text, so the bags column keeps its width', async () => {
    mockFontScale = 2;
    await render(<DispatchItemsTab items={[rice]} />);

    expect(textOf(byTestId('dispatch-items-table'))).toMatch(/^Item\|Bags dispatched\|/);
    expect(textOf(byTestId('dispatch-item-row-r'))).toBe('Basmati Rice|50 kg each|0161/100|PM|25');
    expect(textOf(byTestId('dispatch-items-total'))).toBe('Total|1 item line · 1 GRN|25');
  });

  it('wraps a long item name in full and widens the bags column with the text size', async () => {
    const name = 'Extra Long Basmati Rice Premium Aged Sella Golden Export Grade 1121';
    mockFontScale = 1.3;
    await render(<DispatchItemsTab items={[item({ id: 'l', item_name: name, dispatch_quantity: 12500 })]} />);

    const nameText = within(byTestId('dispatch-item-row-l')).getByText(name);
    expect(nameText.props.numberOfLines).toBeUndefined();
    const bagsText = within(byTestId('dispatch-item-row-l')).getByText('12,500');
    expect(columnWidth(bagsText)).toBe(Math.ceil(76 * 1.3));
    // A number stays on one line: its column is sized to fit it.
    expect(bagsText.props.numberOfLines).toBe(1);
  });

  it('sizes the GRN/Received column to its longest text, so "DV0010/110" stays on one line', async () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    const longLot = item({ id: 'l', grn_no: 'DV0010', original_quantity: 110, package_mark: null });
    await render(<DispatchItemsTab items={[rice, longLot]} />);

    const cell = byTestId('dispatch-item-grn-l');
    const source = within(cell).getByText('DV0010/110');
    // One line, shrinking a little rather than wrapping.
    expect(source.props.numberOfLines).toBe(1);
    expect(source.props.adjustsFontSizeToFit).toBe(true);
    // The column takes the width its longest text needs at font scale 1.3: the larger of "DV0010/110"
    // (10 × 15 × 0.62) and the heading "GRN/Received" (12 × 13 × 0.6), × 1.3, plus 4.
    const column = cell.parent!;
    expect(StyleSheet.flatten(column.props.style).width).toBe(Math.ceil(Math.max(10 * 15 * 0.62, 12 * 13 * 0.6) * 1.3) + 4);
    // A mark is cut with "…" at the normal size, never shrunk (Android ignores minimumFontScale).
    const mark = within(byTestId('dispatch-item-grn-r')).getByText('PM');
    expect(mark.props.numberOfLines).toBe(1);
    expect(mark.props.ellipsizeMode).toBe('tail');
    expect(mark.props.adjustsFontSizeToFit).toBeUndefined();
  });

  it('sizes the column to the GRN/received text, the footer and the heading, not to the mark', async () => {
    const table = { scale: 1 };
    const base = sourceColumnWidth([{ grn_no: 'Z0004', original_quantity: 1 }], table);
    expect(base).toBe(Math.ceil(7 * 15 * 0.62) + 4);
    expect(sourceColumnWidth([{ grn_no: 'Z0004', original_quantity: 1 }], table, ['12 GRNs'])).toBe(base);
    expect(sourceColumnWidth([{ grn_no: 'Z0004', original_quantity: 1 }], table, ['123 GRNs'])).toBe(Math.ceil(8 * 15 * 0.62) + 4);
    // The heading counts too: "GRN/Received" is wider than "Z0004/1".
    expect(sourceColumnWidth([{ grn_no: 'Z0004', original_quantity: 1 }], table, [], 'GRN/Received')).toBe(Math.ceil(12 * 13 * 0.6) + 4);
  });

  it('moves the GRN cell under the item when a long GRN/received would squeeze the item names, and cuts a long mark', async () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    const mark = 'BL/STRETCH-LOT-0001/LONG-PACKAGE-MARK-FOR-WRAP-TEST/ABCDEFG';
    await render(<DispatchItemsTab items={[item({ id: 'b', grn_no: 'WMWM8881', original_quantity: 9999, dispatch_quantity: 5000, package_mark: mark })]} />);

    // "WMWM8881/9,999" (an 8-character GRN number, the longest allowed) needs about 173 dp: the item
    // column would keep under 5 em at font scale 1.3.
    expect(textOf(byTestId('dispatch-items-table'))).toMatch(/^Item\|Bags dispatched\|/);
    expect(textOf(byTestId('dispatch-item-row-b'))).toBe(`Basmati Rice|50 kg each|WMWM8881/9,999|${mark}|5,000`);
    const markText = within(byTestId('dispatch-item-row-b')).getByText(mark);
    expect(markText.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' });
  });

  it('keeps three columns for an ordinary lot at font scale 1.3 on a 411 dp phone', async () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    await render(<DispatchItemsTab items={[item({ id: 'z', grn_no: 'Z0004', original_quantity: 100 })]} />);
    expect(textOf(byTestId('dispatch-items-table'))).toMatch(/^Item\|GRN\/Received\|Bags dispatched\|/);
  });

  it('keeps the empty and loading states', async () => {
    const first = await render(<DispatchItemsTab items={[]} />);
    expect(textOf()).toBe('No items in this dispatch|Items added to this dispatch appear here.');
    await first.unmount();
    await render(<DispatchItemsTab items={[]} loading />);
    expect(textOf()).toBe('Loading items…');
  });
});

describe('GRNs table', () => {
  it('summarises each source GRN in the order its lines came, collapsed when there are several', async () => {
    await render(<DispatchGRNsTab items={[rice, older, wheat]} />);
    const rows = screen.queryAllByTestId(/^dispatch-grn-row-/);
    expect([...new Set(rows.map((n) => n.props.testID))]).toEqual(['dispatch-grn-row-grn-161', 'dispatch-grn-row-grn-159']);

    expect(textOf(byTestId('dispatch-grn-row-grn-161'))).toBe('0161|15/10/26|2|65');
    expect(textOf(byTestId('dispatch-grn-row-grn-159'))).toBe('0159|14/10/26|1|50');
    expect(has('dispatch-grn-lines-grn-161')).toBe(false);
    expect(has('dispatch-grn-lines-grn-159')).toBe(false);
    expect(textOf(byTestId('dispatch-grns-total'))).toBe('Total|2 GRNs|3|115');
  });

  it('starts expanded when there is one source GRN, with Item / Mark / Bags dispatched lines', async () => {
    await render(<DispatchGRNsTab items={[rice, wheat]} />);

    const lines = byTestId('dispatch-grn-lines-grn-161');
    expect(textOf(lines)).toBe('Item|Mark|Bags dispatched|Basmati Rice|50 kg each|PM|25|Wheat|—|40');
    expect(byTestId('dispatch-grn-row-grn-161')).toBeExpanded();
  });

  describe.each(BRANDS.flatMap((brand) => (['light', 'dark'] as Mode[]).map((mode) => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('draws the card outlined and an open row with its lines as one panel with an accent bar', async () => {
      mockTheme = { preference: mode, brand };
      const t = getTokens(brand, mode);
      await render(<DispatchGRNsTab items={[older, rice]} />);
      // The nearest drawn view around a row: the panel when the row is open.
      const panelOf = (id: string) => (StyleSheet.flatten(byTestId(id).parent?.props.style) ?? {}) as Record<string, unknown>;
      const chevronOf = (id: string) => iconsIn(hostById(id))[0];
      const flat = styleOf;

      // The card is drawn in parts, so its end scrolls into view: the list content has padding only
      // (Android leaves a content container's margins out of the scroll range).
      const list = allHosts().find((n) => n.props.contentContainerStyle !== undefined)!;
      const content = StyleSheet.flatten(list.props.contentContainerStyle as never) as Record<string, unknown>;
      expect(content).toMatchObject({ paddingTop: expect.any(Number), paddingBottom: expect.any(Number) });
      expect(content.marginTop ?? content.marginBottom ?? content.borderWidth).toBeUndefined();
      const outlined = (n: Json) => flat(n).borderColor === t.table.outline;
      const top = allHosts().find((n) => outlined(n) && flat(n).borderTopLeftRadius !== undefined)!;
      expect(flat(top)).toMatchObject({ borderWidth: TABLE_OUTLINE, borderBottomWidth: 0 });
      const bottom = allHosts().find((n) => outlined(n) && flat(n).borderBottomLeftRadius !== undefined)!;
      expect(flat(bottom)).toMatchObject({ borderWidth: TABLE_OUTLINE, borderTopWidth: 0 });
      // A closed row carries the card's sides and no panel.
      expect(panelOf('dispatch-grn-row-grn-159')).toMatchObject({ borderLeftWidth: TABLE_OUTLINE, borderRightWidth: TABLE_OUTLINE, borderColor: t.table.outline });
      expect(panelOf('dispatch-grn-row-grn-159').backgroundColor).toBeUndefined();
      expect(chevronOf('dispatch-grn-row-grn-159')).toMatchObject({ name: 'chevron-right', color: t.icon.secondary });

      await press('dispatch-grn-row-grn-159');
      expect(panelOf('dispatch-grn-row-grn-159')).toMatchObject({
        backgroundColor: t.table.insetFill,
        borderLeftWidth: TABLE_OUTLINE,
        borderBottomColor: t.table.separator,
      });
      // The bar is its own view laid over the panel's start (as a 3 dp border it drew as two lines).
      const bar = allHosts().filter((n) => n.props.testID === 'table-open-bar');
      expect(bar).toHaveLength(1);
      expect(flat(bar[0])).toMatchObject({ position: 'absolute', left: 0, top: 0, bottom: 0, width: OPEN_ACCENT, backgroundColor: t.table.accent });
      expect(chevronOf('dispatch-grn-row-grn-159')).toMatchObject({ name: 'chevron-down', color: t.table.accent });
      // The lines are a small table of their own: rows on the card colour, a heading on the heading fill.
      const lines = hostById('dispatch-grn-lines-grn-159');
      const nested = hostsIn(lines).find((n) => flat(n).borderColor === t.table.outline)!;
      expect(flat(nested)).toMatchObject({ backgroundColor: t.surface.card, borderWidth: TABLE_OUTLINE });
      expect(hostsIn(nested).filter((n) => flat(n).backgroundColor === t.table.headerFill).length).toBeGreaterThan(0);
      expect(panelOf('dispatch-grn-row-grn-161').backgroundColor).toBeUndefined();
    });
  });

  it('expands and collapses a row on tap and opens the GRN only from View GRN', async () => {
    const onViewGRN = jest.fn();
    await render(<DispatchGRNsTab items={[older, rice]} onViewGRN={onViewGRN} />);

    await press('dispatch-grn-row-grn-159');
    expect(onViewGRN).not.toHaveBeenCalled();
    expect(has('dispatch-grn-lines-grn-159')).toBe(true);
    await press('dispatch-grn-view-grn-159');
    expect(onViewGRN).toHaveBeenCalledWith('grn-159');
    await press('dispatch-grn-row-grn-159');
    expect(has('dispatch-grn-lines-grn-159')).toBe(false);
  });

  it('keeps lines without a GRN id apart and offers no View GRN for them', async () => {
    const a = item({ id: 'a', grn_id: null, grn_no: '0161', grn_date: null });
    const b = item({ id: 'b', grn_id: null, grn_no: '0161', grn_date: null });
    await render(<DispatchGRNsTab items={[a, b]} onViewGRN={jest.fn()} />);

    expect(has('dispatch-grn-row-line:a')).toBe(true);
    expect(has('dispatch-grn-row-line:b')).toBe(true);
    await press('dispatch-grn-row-line:a');
    expect(has('dispatch-grn-view-line:a')).toBe(false);
    expect(textOf(byTestId('dispatch-grn-row-line:a'))).toBe('0161|—|1|25');
  });

  it('counts two lots of one item as two item lines', async () => {
    await render(<DispatchGRNsTab items={[rice, item({ id: 'r2', package_mark: 'B2', dispatch_quantity: 5 })]} />);
    expect(textOf(byTestId('dispatch-grn-row-grn-161'))).toBe('0161|15/10/26|2|30');
    expect(byTestId('dispatch-grn-row-grn-161').props.accessibilityLabel).toBe('GRN 0161, 15 Oct 2026, 2 item lines, 30 bags dispatched');
  });

  it('puts the line count and the mark under the first column at large text', async () => {
    mockFontScale = 2;
    await render(<DispatchGRNsTab items={[rice]} />);

    expect(textOf(byTestId('dispatch-grn-row-grn-161'))).toBe('0161|15/10/26|1 item line|25');
    expect(textOf(byTestId('dispatch-grn-lines-grn-161'))).toBe('Item|Bags dispatched|Basmati Rice|PM · 50 kg each|25');
  });

  it('keeps the empty state', async () => {
    await render(<DispatchGRNsTab items={[]} />);
    expect(textOf()).toBe('No GRNs for this dispatch|GRNs whose items are in this dispatch appear here.');
  });
});

describe('Invoices table', () => {
  const detailed: InvoiceTable = {
    detailed: true,
    count: 2,
    total: 15700,
    rows: [
      { key: 'inv-241', invoice_id: 'inv-241', invoice_no: 241, invoice_date: '2026-10-15', total: 12450 },
      { key: 'inv-242', invoice_id: 'inv-242', invoice_no: 242, invoice_date: null, total: 3250 },
    ],
  };

  it('shows the count, each invoice with its date under the number and two-decimal totals, and the total', async () => {
    await render(<DispatchInvoicesTab invoices={detailed} />);

    expect(textOf(byTestId('dispatch-invoices-count'))).toBe('2 invoices');
    expect(textOf(byTestId('dispatch-invoice-row-inv-241'))).toBe('241|15/10/26|₹12,450.00');
    // A missing date is shown as unavailable, not as today.
    expect(textOf(byTestId('dispatch-invoice-row-inv-242'))).toBe('242|—|₹3,250.00');
    expect(byTestId('dispatch-invoice-row-inv-242').props.accessibilityLabel).toBe('Invoice 242, date not available, invoice total ₹3,250.00');
    expect(textOf(byTestId('dispatch-invoices-total'))).toBe('Total|2 invoices|₹15,700.00');
    expect(textOf(byTestId('dispatch-invoices-note'))).toBe(
      'Each amount is the whole invoice. An invoice bills one GRN and can include lines of other dispatches.'
    );
  });

  it('gives the date its own column on a wide screen', async () => {
    mockWidth = 800;
    await render(<DispatchInvoicesTab invoices={detailed} />);

    expect(textOf(byTestId('dispatch-invoices-table'))).toMatch(/^Invoice\|Date\|Invoice total\|241\|15\/10\/26\|₹12,450.00\|/);
  });

  it('opens the invoice page by its id', async () => {
    const onViewInvoice = jest.fn();
    await render(<DispatchInvoicesTab invoices={detailed} onViewInvoice={onViewInvoice} />);

    await press('dispatch-invoice-row-inv-242');
    expect(onViewInvoice).toHaveBeenCalledWith('inv-242');
    expect(byTestId('dispatch-invoice-row-inv-242').props.accessibilityHint).toBe('Opens the invoice');
  });

  it('falls back to invoice numbers with no date, amount or link, and the summary total', async () => {
    const onViewInvoice = jest.fn();
    const fallback: InvoiceTable = {
      detailed: false,
      count: 2,
      total: 15700,
      rows: [
        { key: 'number:241:0', invoice_id: null, invoice_no: 241, invoice_date: null, total: null },
        { key: 'number:242:1', invoice_id: null, invoice_no: 242, invoice_date: null, total: null },
      ],
    };
    await render(<DispatchInvoicesTab invoices={fallback} onViewInvoice={onViewInvoice} />);

    expect(textOf(byTestId('dispatch-invoice-row-number:241:0'))).toBe('241|—');
    expect(byTestId('dispatch-invoice-row-number:241:0')).toBeDisabled();
    expect(byTestId('dispatch-invoice-row-number:241:0').props.accessibilityLabel).toBe('Invoice 241');
    expect(textOf(byTestId('dispatch-invoices-total'))).toBe('Total|2 invoices|₹15,700.00');
    expect(textOf(byTestId('dispatch-invoices-note'))).toBe(
      'Dates and amounts of each invoice are not available here. The total adds the whole linked invoices.'
    );
  });

  it('says "No invoices linked to this dispatch." when there are none', async () => {
    await render(<DispatchInvoicesTab invoices={{ detailed: false, count: 0, total: 0, rows: [] }} />);
    expect(textOf()).toBe('No invoices linked to this dispatch.');
  });

  it('writes the table in Gujarati', async () => {
    setLanguage('gu');
    await render(<DispatchInvoicesTab invoices={detailed} />);
    expect(textOf(byTestId('dispatch-invoices-total'))).toBe('કુલ|૨ ઇન્વૉઇસ|₹૧૫,૭૦૦.૦૦');
  });
});

/** The ids of the rows with this test id prefix, in the order they are drawn. */
const rowIds = (prefix: string): string[] => [
  ...new Set(screen.queryAllByTestId(new RegExp('^' + prefix)).map((n) => String(n.props.testID).slice(prefix.length))),
];
const sortLabel = (id: string): string => byTestId(id).props.accessibilityLabel;

describe('Items table, sorting', () => {
  // Drawn in this order: wheat (40 bags), rice (25), sugar (50): ascending is rice, wheat, sugar.
  const lines = [wheat, rice, older];

  it('sorts Bags dispatched not sorted → ascending → descending → not sorted, the footer staying the sum of every line', async () => {
    await render(<DispatchItemsTab items={lines} />);
    const sort = 'dispatch-items-table-sort-bags';
    expect(rowIds('dispatch-item-row-')).toEqual(['w', 'r', 'o']);
    expect(sortLabel(sort)).toBe('Sort by Bags dispatched, not sorted');

    await press(sort);
    expect(rowIds('dispatch-item-row-')).toEqual(['r', 'w', 'o']);
    expect(sortLabel(sort)).toBe('Sort by Bags dispatched, sorted ascending');
    expect(textOf(byTestId('dispatch-items-total'))).toBe('Total|3 item lines|2 GRNs|115');
    await press(sort);
    expect(rowIds('dispatch-item-row-')).toEqual(['o', 'w', 'r']);
    expect(sortLabel(sort)).toBe('Sort by Bags dispatched, sorted descending');
    expect(textOf(byTestId('dispatch-items-total'))).toBe('Total|3 item lines|2 GRNs|115');
    await press(sort);
    expect(rowIds('dispatch-item-row-')).toEqual(['w', 'r', 'o']);
    expect(sortLabel(sort)).toBe('Sort by Bags dispatched, not sorted');
  });

  it('sorts only the bags: Item and GRN/Received have no sort heading', async () => {
    await render(<DispatchItemsTab items={lines} />);
    expect(has('dispatch-items-table-sort-bags')).toBe(true);
    expect(has('dispatch-items-table-sort-item')).toBe(false);
    expect(has('dispatch-items-table-sort-grn')).toBe(false);
  });

  it('still opens the GRN of a line after sorting', async () => {
    const onViewGRN = jest.fn();
    await render(<DispatchItemsTab items={lines} onViewGRN={onViewGRN} />);
    await press('dispatch-items-table-sort-bags');
    await press('dispatch-item-grn-o');
    expect(onViewGRN).toHaveBeenCalledWith('grn-159');
  });
});

describe('Invoices table, sorting', () => {
  // Drawn in this order: A (no. 9, 10/10/26, ₹900), B (no. 10, 05/10/26, ₹100), C (no. 2, 20/10/26, ₹500).
  const invoices: InvoiceTable = {
    detailed: true,
    count: 3,
    total: 1500,
    rows: [
      { key: 'a', invoice_id: 'a', invoice_no: 9, invoice_date: '2026-10-10', total: 900 },
      { key: 'b', invoice_id: 'b', invoice_no: 10, invoice_date: '2026-10-05', total: 100 },
      { key: 'c', invoice_id: 'c', invoice_no: 2, invoice_date: null, total: 500 },
    ],
  };

  it('sorts the date with an unknown date last in either direction, and the total row stays the summary', async () => {
    mockWidth = 800;
    await render(<DispatchInvoicesTab invoices={invoices} />);
    const table = 'dispatch-invoices-table';
    await press(`${table}-sort-date`);
    expect(rowIds('dispatch-invoice-row-')).toEqual(['b', 'a', 'c']);
    expect(sortLabel(`${table}-sort-date`)).toBe('Sort by Date, sorted ascending');
    await press(`${table}-sort-date`);
    expect(rowIds('dispatch-invoice-row-')).toEqual(['a', 'b', 'c']);
    expect(sortLabel(`${table}-sort-date`)).toBe('Sort by Date, sorted descending');
    expect(textOf(byTestId('dispatch-invoices-total'))).toBe('Total|3 invoices|₹1,500.00');
  });

  it('sorts the invoice total, and a sorted row still opens its invoice', async () => {
    const onViewInvoice = jest.fn();
    await render(<DispatchInvoicesTab invoices={invoices} onViewInvoice={onViewInvoice} />);
    await press('dispatch-invoices-table-sort-total');
    expect(rowIds('dispatch-invoice-row-')).toEqual(['b', 'c', 'a']);
    expect(sortLabel('dispatch-invoices-table-sort-total')).toBe('Sort by Invoice total, sorted ascending');
    await press('dispatch-invoice-row-b');
    expect(onViewInvoice).toHaveBeenCalledWith('b');
  });

  it('sorts a table of invoice numbers only by Invoice: it has no dates or amounts to order', async () => {
    mockWidth = 800;
    const fallback: InvoiceTable = {
      detailed: false,
      count: 2,
      total: 15700,
      rows: [
        { key: 'number:241:0', invoice_id: null, invoice_no: 241, invoice_date: null, total: null },
        { key: 'number:97:1', invoice_id: null, invoice_no: 97, invoice_date: null, total: null },
      ],
    };
    await render(<DispatchInvoicesTab invoices={fallback} />);
    expect(has('dispatch-invoices-table-sort-date')).toBe(false);
    expect(has('dispatch-invoices-table-sort-total')).toBe(false);
    await press('dispatch-invoices-table-sort-invoice');
    expect(rowIds('dispatch-invoice-row-')).toEqual(['number:97:1', 'number:241:0']);
  });
});
