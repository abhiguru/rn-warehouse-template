/**
 * The dispatch page's Items, GRNs and Invoices tables: rows, links only with an id,
 * expansion, totals, the invoice fallback, narrow and wide screens and large text.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { DispatchItemsTab } from '../DispatchItemsTab';
import { DispatchGRNsTab } from '../DispatchGRNsTab';
import { DispatchInvoicesTab } from '../DispatchInvoicesTab';
import type { DispatchItem, InvoiceTable } from '../dispatchDetailsModel';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
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
  setLanguage('en');
});

const textOf = (node: ReactTestInstance): string =>
  node.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join('')).join('|');
const byTestId = (id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string')[0];
const has = (id: string) => tree.root.findAll((n) => n.props.testID === id).length > 0;
const press = (id: string) => act(() => byTestId(id).props.onPress());

describe('Items table', () => {
  it('shows one row per line with the mark and weight under the item and the GRN date under its number', () => {
    render(<DispatchItemsTab items={[rice, wheat, item({ id: 'r2', package_mark: 'B2', dispatch_quantity: 5 })]} />);

    expect(textOf(byTestId('dispatch-item-row-r'))).toBe('Basmati Rice|PM · 50 kg each|0161|15 Oct|25');
    // Two lots of one item stay two rows.
    expect(textOf(byTestId('dispatch-item-row-r2'))).toBe('Basmati Rice|B2 · 50 kg each|0161|15 Oct|5');
    // No mark and no weight: no line under the item.
    expect(textOf(byTestId('dispatch-item-row-w'))).toBe('Wheat|0161|15 Oct|40');
  });

  it('heads the columns Item, Source GRN, Bags dispatched', () => {
    render(<DispatchItemsTab items={[rice]} />);
    expect(textOf(tree.root.findByProps({ testID: 'dispatch-items-table' }))).toMatch(/^Item\|Source GRN\|Bags dispatched\|/);
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

  it('shows "—" for a missing GRN number and date, never today', () => {
    render(<DispatchItemsTab items={[item({ id: 'x', grn_id: null, grn_no: null, grn_date: null })]} />);

    expect(textOf(byTestId('dispatch-item-row-x'))).toBe('Basmati Rice|PM · 50 kg each|—|—|25');
    expect(byTestId('dispatch-item-row-x').props.accessibilityLabel).toBe('Basmati Rice, PM · 50 kg each, from GRN not available, 25 bags dispatched');
  });

  it('expands a row to the bags received on the lot, and a row without them does not expand', () => {
    render(<DispatchItemsTab items={[rice, wheat]} />);

    expect(has('dispatch-item-details-r')).toBe(false);
    expect(byTestId('dispatch-item-row-r').props.accessibilityState).toEqual({ expanded: false });
    press('dispatch-item-row-r');
    expect(textOf(byTestId('dispatch-item-details-r'))).toBe('Received 100 bags');
    expect(byTestId('dispatch-item-row-r').props.accessibilityState).toEqual({ expanded: true });
    press('dispatch-item-row-r');
    expect(has('dispatch-item-details-r')).toBe(false);

    expect(byTestId('dispatch-item-row-w').props.disabled).toBe(true);
    expect(byTestId('dispatch-item-row-w').props.accessibilityState).toBeUndefined();
  });

  it('moves the GRN under the item at large text, so the bags column keeps its width', () => {
    mockFontScale = 2;
    render(<DispatchItemsTab items={[rice]} />);

    expect(textOf(tree.root.findByProps({ testID: 'dispatch-items-table' }))).toMatch(/^Item\|Bags dispatched\|/);
    expect(textOf(byTestId('dispatch-item-row-r'))).toBe('Basmati Rice|PM · 50 kg each|0161|15 Oct|25');
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
    expect(bagsText.props.numberOfLines).toBeUndefined();
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
  it('summarises each source GRN, newest first, collapsed when there are several', () => {
    render(<DispatchGRNsTab items={[older, rice, wheat]} />);

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
