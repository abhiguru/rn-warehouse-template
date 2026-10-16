/**
 * The dispatch page's Items, GRNs and Invoices tables: rows, links only with an id,
 * expansion, totals, the invoice fallback, narrow and wide screens and large text.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

let tree: ReactTestRenderer;
const render = (element: React.ReactElement) => {
  act(() => {
    tree = create(element);
  });
  return tree;
};
afterEach(() => {
  act(() => tree?.unmount());
  mockFontScale = 1;
  mockWidth = 360;
  mockTheme = { preference: 'light', brand: 'orange' };
  setLanguage('en');
});

const textOf = (node: ReactTestInstance): string =>
  // A no-break space keeps a number with its unit on screen; read it as a space here.
  node.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' ')).join('|');
const byTestId = (id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string')[0];
const has = (id: string) => tree.root.findAll((n) => n.props.testID === id).length > 0;
const press = (id: string) => act(() => byTestId(id).props.onPress());

describe('Items table', () => {
  it('shows one row per line: the weight under the item, "GRN/received" with the mark under it', () => {
    render(<DispatchItemsTab items={[rice, wheat, item({ id: 'r2', package_mark: 'B2', dispatch_quantity: 5, original_quantity: 60 })]} />);

    expect(textOf(byTestId('dispatch-item-row-r'))).toBe('Basmati Rice|50 kg each|0161/100|PM|25');
    // Two lots of one item stay two rows, each with its own received and mark.
    expect(textOf(byTestId('dispatch-item-row-r2'))).toBe('Basmati Rice|50 kg each|0161/60|B2|5');
    // No mark, no weight, no received quantity: the GRN number alone.
    expect(textOf(byTestId('dispatch-item-row-w'))).toBe('Wheat|0161|40');
    // The GRN date is on the GRNs tab, not here.
    expect(textOf(byTestId('dispatch-items-table'))).not.toMatch(/15 Oct/);
  });

  it('heads the columns Item, GRN/Received, Bags dispatched, the middle heading on one line', () => {
    render(<DispatchItemsTab items={[rice]} />);
    expect(textOf(tree.root.findByProps({ testID: 'dispatch-items-table' }))).toMatch(/^Item\|GRN\/Received\|Bags dispatched\|/);
    const heading = tree.root.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === 'GRN/Received')[0];
    expect(heading.props.numberOfLines).toBe(1);
  });

  it('totals the bags, item lines and distinct source GRNs in the footer', () => {
    render(<DispatchItemsTab items={[rice, wheat, older]} />);

    const footer = byTestId('dispatch-items-total');
    expect(textOf(footer)).toBe('Total|3 item lines|2 GRNs|115');
    expect(footer.props.accessibilityLabel).toBe('Total: 3 item lines from 2 GRNs, 115 bags dispatched');
  });

  it('opens the GRN from its number only when the line has a GRN id', () => {
    const onViewGRN = jest.fn();
    render(<DispatchItemsTab items={[rice, item({ id: 'x', grn_id: null })]} onViewGRN={onViewGRN} />);

    press('dispatch-item-grn-r');
    expect(onViewGRN).toHaveBeenCalledWith('grn-161');
    expect(byTestId('dispatch-item-grn-x').props.disabled).toBe(true);
    expect(byTestId('dispatch-item-row-x').props.accessibilityActions).toBeUndefined();
    expect(byTestId('dispatch-item-row-r').props.accessibilityActions).toEqual([{ name: 'openGrn', label: 'Open GRN 0161' }]);
  });

  it('says the GRN, the bags received and the mark, and shows "—" for a missing GRN number', () => {
    render(<DispatchItemsTab items={[rice, item({ id: 'x', grn_id: null, grn_no: null, grn_date: null })]} />);

    expect(byTestId('dispatch-item-row-r').props.accessibilityLabel).toBe(
      'Basmati Rice, 50 kg each, from GRN 0161, Received 100 bags, Mark PM, 25 bags dispatched'
    );
    expect(textOf(byTestId('dispatch-item-row-x'))).toBe('Basmati Rice|50 kg each|—/100|PM|25');
    expect(byTestId('dispatch-item-row-x').props.accessibilityLabel).toBe(
      'Basmati Rice, 50 kg each, from GRN not available, Received 100 bags, Mark PM, 25 bags dispatched'
    );
  });

  it('has rows that do not open: everything is in the row', () => {
    render(<DispatchItemsTab items={[rice, wheat]} />);

    expect(byTestId('dispatch-item-row-r').props.onPress).toBeUndefined();
    expect(byTestId('dispatch-item-row-r').props.accessibilityState).toBeUndefined();
    expect(tree.root.findAll((n) => (n.type as unknown) === 'Icon' && /^chevron/.test(n.props.name))).toEqual([]);
  });

  it('moves the GRN under the item at large text, so the bags column keeps its width', () => {
    mockFontScale = 2;
    render(<DispatchItemsTab items={[rice]} />);

    expect(textOf(tree.root.findByProps({ testID: 'dispatch-items-table' }))).toMatch(/^Item\|Bags dispatched\|/);
    expect(textOf(byTestId('dispatch-item-row-r'))).toBe('Basmati Rice|50 kg each|0161/100|PM|25');
    expect(textOf(byTestId('dispatch-items-total'))).toBe('Total|1 item line · 1 GRN|25');
  });

  it('wraps a long item name in full and widens the bags column with the text size', () => {
    const name = 'Extra Long Basmati Rice Premium Aged Sella Golden Export Grade 1121';
    mockFontScale = 1.3;
    render(<DispatchItemsTab items={[item({ id: 'l', item_name: name, dispatch_quantity: 12500 })]} />);

    const nameText = byTestId('dispatch-item-row-l').findAll((n) => (n.type as unknown) === 'Text' && n.props.children === name)[0];
    expect(nameText.props.numberOfLines).toBeUndefined();
    const bagsText = byTestId('dispatch-item-row-l').findAll((n) => (n.type as unknown) === 'Text' && n.props.children === '12,500')[0];
    expect(StyleSheet.flatten(bagsText.props.style).width).toBe(Math.ceil(76 * 1.3));
    // A number stays on one line: its column is sized to fit it.
    expect(bagsText.props.numberOfLines).toBe(1);
  });

  it('sizes the GRN/Received column to its longest text, so "DV0010/110" stays on one line', () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    const longLot = item({ id: 'l', grn_no: 'DV0010', original_quantity: 110, package_mark: null });
    render(<DispatchItemsTab items={[rice, longLot]} />);

    const cell = byTestId('dispatch-item-grn-l');
    const source = cell.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === 'DV0010/110')[0];
    // One line, shrinking a little rather than wrapping.
    expect(source.props.numberOfLines).toBe(1);
    expect(source.props.adjustsFontSizeToFit).toBe(true);
    // The column takes the width its longest text needs at font scale 1.3: the larger of "DV0010/110"
    // (10 × 15 × 0.62) and the heading "GRN/Received" (12 × 13 × 0.6), × 1.3, plus 4.
    let column = cell.parent!;
    while (typeof column.type !== 'string') column = column.parent!;
    expect(StyleSheet.flatten(column.props.style).width).toBe(Math.ceil(Math.max(10 * 15 * 0.62, 12 * 13 * 0.6) * 1.3) + 4);
    // A mark is cut with "…" at the normal size, never shrunk (Android ignores minimumFontScale).
    const mark = byTestId('dispatch-item-grn-r').findAll((n) => (n.type as unknown) === 'Text' && n.props.children === 'PM')[0];
    expect(mark.props.numberOfLines).toBe(1);
    expect(mark.props.ellipsizeMode).toBe('tail');
    expect(mark.props.adjustsFontSizeToFit).toBeUndefined();
  });

  it('sizes the column to the GRN/received text, the footer and the heading, not to the mark', () => {
    const table = { scale: 1 };
    const base = sourceColumnWidth([{ grn_no: 'Z0004', original_quantity: 1 }], table);
    expect(base).toBe(Math.ceil(7 * 15 * 0.62) + 4);
    expect(sourceColumnWidth([{ grn_no: 'Z0004', original_quantity: 1 }], table, ['12 GRNs'])).toBe(base);
    expect(sourceColumnWidth([{ grn_no: 'Z0004', original_quantity: 1 }], table, ['123 GRNs'])).toBe(Math.ceil(8 * 15 * 0.62) + 4);
    // The heading counts too: "GRN/Received" is wider than "Z0004/1".
    expect(sourceColumnWidth([{ grn_no: 'Z0004', original_quantity: 1 }], table, [], 'GRN/Received')).toBe(Math.ceil(12 * 13 * 0.6) + 4);
  });

  it('moves the GRN cell under the item when a long GRN/received would squeeze the item names, and cuts a long mark', () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    const mark = 'BL/STRETCH-LOT-0001/LONG-PACKAGE-MARK-FOR-WRAP-TEST/ABCDEFG';
    render(<DispatchItemsTab items={[item({ id: 'b', grn_no: 'WMWM8881', original_quantity: 9999, dispatch_quantity: 5000, package_mark: mark })]} />);

    // "WMWM8881/9,999" (an 8-character GRN number, the longest allowed) needs about 173 dp: the item
    // column would keep under 5 em at font scale 1.3.
    expect(textOf(tree.root.findByProps({ testID: 'dispatch-items-table' }))).toMatch(/^Item\|Bags dispatched\|/);
    expect(textOf(byTestId('dispatch-item-row-b'))).toBe(`Basmati Rice|50 kg each|WMWM8881/9,999|${mark}|5,000`);
    const markText = byTestId('dispatch-item-row-b').findAll((n) => (n.type as unknown) === 'Text' && n.props.children === mark)[0];
    expect(markText.props).toMatchObject({ numberOfLines: 1, ellipsizeMode: 'tail' });
  });

  it('keeps three columns for an ordinary lot at font scale 1.3 on a 411 dp phone', () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    render(<DispatchItemsTab items={[item({ id: 'z', grn_no: 'Z0004', original_quantity: 100 })]} />);
    expect(textOf(tree.root.findByProps({ testID: 'dispatch-items-table' }))).toMatch(/^Item\|GRN\/Received\|Bags dispatched\|/);
  });

  it('keeps the empty and loading states', () => {
    render(<DispatchItemsTab items={[]} />);
    expect(textOf(tree.root)).toBe('No items in this dispatch|Items added to this dispatch appear here.');
    act(() => tree.unmount());
    render(<DispatchItemsTab items={[]} loading />);
    expect(textOf(tree.root)).toBe('Loading items…');
  });
});

describe('GRNs table', () => {
  it('summarises each source GRN in the order its lines came, collapsed when there are several', () => {
    render(<DispatchGRNsTab items={[rice, older, wheat]} />);
    const rows = tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('dispatch-grn-row-') && typeof n.type !== 'string');
    expect([...new Set(rows.map((n) => n.props.testID))]).toEqual(['dispatch-grn-row-grn-161', 'dispatch-grn-row-grn-159']);

    expect(textOf(byTestId('dispatch-grn-row-grn-161'))).toBe('0161|15 Oct|2|65');
    expect(textOf(byTestId('dispatch-grn-row-grn-159'))).toBe('0159|14 Oct|1|50');
    expect(has('dispatch-grn-lines-grn-161')).toBe(false);
    expect(has('dispatch-grn-lines-grn-159')).toBe(false);
    expect(textOf(byTestId('dispatch-grns-total'))).toBe('Total|2 GRNs|3|115');
  });

  it('starts expanded when there is one source GRN, with Item / Mark / Bags dispatched lines', () => {
    render(<DispatchGRNsTab items={[rice, wheat]} />);

    const lines = byTestId('dispatch-grn-lines-grn-161');
    expect(textOf(lines)).toBe('Item|Mark|Bags dispatched|Basmati Rice|50 kg each|PM|25|Wheat|—|40');
    expect(byTestId('dispatch-grn-row-grn-161').props.accessibilityState).toEqual({ expanded: true });
  });

  describe.each(BRANDS.flatMap((brand) => (['light', 'dark'] as Mode[]).map((mode) => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('draws the card outlined and an open row with its lines as one panel with an accent bar', () => {
      mockTheme = { preference: mode, brand };
      const t = getTokens(brand, mode);
      render(<DispatchGRNsTab items={[older, rice]} />);
      // The nearest drawn view around a row: the panel when the row is open.
      const panelOf = (id: string) => {
        let node = byTestId(id).parent;
        while (node && typeof node.type !== 'string') node = node.parent;
        return (StyleSheet.flatten(node?.props.style) ?? {}) as Record<string, unknown>;
      };
      const chevronOf = (id: string) => byTestId(id).findAll((n) => (n.type as unknown) === 'Icon')[0].props;
      const flat = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style) as Record<string, unknown>;

      // The card is drawn in parts, so its end scrolls into view: the list content has padding only
      // (Android leaves a content container's margins out of the scroll range).
      const list = tree.root.findAll((n) => n.props.contentContainerStyle !== undefined)[0];
      const content = StyleSheet.flatten(list.props.contentContainerStyle) as Record<string, unknown>;
      expect(content).toMatchObject({ paddingTop: expect.any(Number), paddingBottom: expect.any(Number) });
      expect(content.marginTop ?? content.marginBottom ?? content.borderWidth).toBeUndefined();
      const outlined = (n: ReactTestInstance) => typeof n.type === 'string' && flat(n)?.borderColor === t.table.outline;
      const top = tree.root.findAll((n) => outlined(n) && flat(n).borderTopLeftRadius !== undefined)[0];
      expect(flat(top)).toMatchObject({ borderWidth: TABLE_OUTLINE, borderBottomWidth: 0 });
      const bottom = tree.root.findAll((n) => outlined(n) && flat(n).borderBottomLeftRadius !== undefined)[0];
      expect(flat(bottom)).toMatchObject({ borderWidth: TABLE_OUTLINE, borderTopWidth: 0 });
      // A closed row carries the card's sides and no panel.
      expect(panelOf('dispatch-grn-row-grn-159')).toMatchObject({ borderLeftWidth: TABLE_OUTLINE, borderRightWidth: TABLE_OUTLINE, borderColor: t.table.outline });
      expect(panelOf('dispatch-grn-row-grn-159').backgroundColor).toBeUndefined();
      expect(chevronOf('dispatch-grn-row-grn-159')).toMatchObject({ name: 'chevron-right', color: t.icon.secondary });

      press('dispatch-grn-row-grn-159');
      expect(panelOf('dispatch-grn-row-grn-159')).toMatchObject({
        backgroundColor: t.table.insetFill,
        borderLeftWidth: TABLE_OUTLINE,
        borderBottomColor: t.table.separator,
      });
      // The bar is its own view laid over the panel's start (as a 3 dp border it drew as two lines).
      const bar = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'table-open-bar');
      expect(bar).toHaveLength(1);
      expect(flat(bar[0])).toMatchObject({ position: 'absolute', left: 0, top: 0, bottom: 0, width: OPEN_ACCENT, backgroundColor: t.table.accent });
      expect(chevronOf('dispatch-grn-row-grn-159')).toMatchObject({ name: 'chevron-down', color: t.table.accent });
      // The lines are a small table of their own: rows on the card colour, a heading on the heading fill.
      const lines = byTestId('dispatch-grn-lines-grn-159');
      const nested = lines.findAll((n) => typeof n.type === 'string' && flat(n)?.borderColor === t.table.outline)[0];
      expect(flat(nested)).toMatchObject({ backgroundColor: t.surface.card, borderWidth: TABLE_OUTLINE });
      expect(nested.findAll((n) => typeof n.type === 'string' && flat(n)?.backgroundColor === t.table.headerFill).length).toBeGreaterThan(0);
      expect(panelOf('dispatch-grn-row-grn-161').backgroundColor).toBeUndefined();
    });
  });

  it('expands and collapses a row on tap and opens the GRN only from View GRN', () => {
    const onViewGRN = jest.fn();
    render(<DispatchGRNsTab items={[older, rice]} onViewGRN={onViewGRN} />);

    press('dispatch-grn-row-grn-159');
    expect(onViewGRN).not.toHaveBeenCalled();
    expect(has('dispatch-grn-lines-grn-159')).toBe(true);
    press('dispatch-grn-view-grn-159');
    expect(onViewGRN).toHaveBeenCalledWith('grn-159');
    press('dispatch-grn-row-grn-159');
    expect(has('dispatch-grn-lines-grn-159')).toBe(false);
  });

  it('keeps lines without a GRN id apart and offers no View GRN for them', () => {
    const a = item({ id: 'a', grn_id: null, grn_no: '0161', grn_date: null });
    const b = item({ id: 'b', grn_id: null, grn_no: '0161', grn_date: null });
    render(<DispatchGRNsTab items={[a, b]} onViewGRN={jest.fn()} />);

    expect(has('dispatch-grn-row-line:a')).toBe(true);
    expect(has('dispatch-grn-row-line:b')).toBe(true);
    press('dispatch-grn-row-line:a');
    expect(has('dispatch-grn-view-line:a')).toBe(false);
    expect(textOf(byTestId('dispatch-grn-row-line:a'))).toBe('0161|—|1|25');
  });

  it('counts two lots of one item as two item lines', () => {
    render(<DispatchGRNsTab items={[rice, item({ id: 'r2', package_mark: 'B2', dispatch_quantity: 5 })]} />);
    expect(textOf(byTestId('dispatch-grn-row-grn-161'))).toBe('0161|15 Oct|2|30');
    expect(byTestId('dispatch-grn-row-grn-161').props.accessibilityLabel).toBe('GRN 0161, 15 Oct, 2 item lines, 30 bags dispatched');
  });

  it('puts the line count and the mark under the first column at large text', () => {
    mockFontScale = 2;
    render(<DispatchGRNsTab items={[rice]} />);

    expect(textOf(byTestId('dispatch-grn-row-grn-161'))).toBe('0161|15 Oct|1 item line|25');
    expect(textOf(byTestId('dispatch-grn-lines-grn-161'))).toBe('Item|Bags dispatched|Basmati Rice|PM · 50 kg each|25');
  });

  it('keeps the empty state', () => {
    render(<DispatchGRNsTab items={[]} />);
    expect(textOf(tree.root)).toBe('No GRNs for this dispatch|GRNs whose items are in this dispatch appear here.');
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

  it('shows the count, each invoice with its date under the number and two-decimal totals, and the total', () => {
    render(<DispatchInvoicesTab invoices={detailed} />);

    expect(textOf(byTestId('dispatch-invoices-count'))).toBe('2 invoices');
    expect(textOf(byTestId('dispatch-invoice-row-inv-241'))).toBe('241|15 Oct|₹12,450.00');
    // A missing date is shown as unavailable, not as today.
    expect(textOf(byTestId('dispatch-invoice-row-inv-242'))).toBe('242|—|₹3,250.00');
    expect(byTestId('dispatch-invoice-row-inv-242').props.accessibilityLabel).toBe('Invoice 242, date not available, invoice total ₹3,250.00');
    expect(textOf(byTestId('dispatch-invoices-total'))).toBe('Total|2 invoices|₹15,700.00');
    expect(textOf(byTestId('dispatch-invoices-note'))).toBe(
      'Each amount is the whole invoice. An invoice bills one GRN and can include lines of other dispatches.'
    );
  });

  it('gives the date its own column on a wide screen', () => {
    mockWidth = 800;
    render(<DispatchInvoicesTab invoices={detailed} />);

    expect(textOf(byTestId('dispatch-invoices-table'))).toMatch(/^Invoice\|Date\|Invoice total\|241\|15 Oct\|₹12,450.00\|/);
  });

  it('opens the invoice page by its id', () => {
    const onViewInvoice = jest.fn();
    render(<DispatchInvoicesTab invoices={detailed} onViewInvoice={onViewInvoice} />);

    press('dispatch-invoice-row-inv-242');
    expect(onViewInvoice).toHaveBeenCalledWith('inv-242');
    expect(byTestId('dispatch-invoice-row-inv-242').props.accessibilityHint).toBe('Opens the invoice');
  });

  it('falls back to invoice numbers with no date, amount or link, and the summary total', () => {
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
    render(<DispatchInvoicesTab invoices={fallback} onViewInvoice={onViewInvoice} />);

    expect(textOf(byTestId('dispatch-invoice-row-number:241:0'))).toBe('241|—');
    expect(byTestId('dispatch-invoice-row-number:241:0').props.disabled).toBe(true);
    expect(byTestId('dispatch-invoice-row-number:241:0').props.accessibilityLabel).toBe('Invoice 241');
    expect(textOf(byTestId('dispatch-invoices-total'))).toBe('Total|2 invoices|₹15,700.00');
    expect(textOf(byTestId('dispatch-invoices-note'))).toBe(
      'Dates and amounts of each invoice are not available here. The total adds the whole linked invoices.'
    );
  });

  it('says "No invoices linked to this dispatch." when there are none', () => {
    render(<DispatchInvoicesTab invoices={{ detailed: false, count: 0, total: 0, rows: [] }} />);
    expect(textOf(tree.root)).toBe('No invoices linked to this dispatch.');
  });

  it('writes the table in Gujarati', () => {
    setLanguage('gu');
    render(<DispatchInvoicesTab invoices={detailed} />);
    expect(textOf(byTestId('dispatch-invoices-total'))).toBe('કુલ|૨ ઇન્વૉઇસ|₹૧૫,૭૦૦.૦૦');
  });
});
