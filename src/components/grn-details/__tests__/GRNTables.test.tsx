/**
 * The GRN page's Items and Dispatches tables: rows, tags, expansion, links, totals,
 * large text and the old loading, failure and empty states.
 */
import React from 'react';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import { GRNItemsTab, type GRNItem } from '../GRNItemsTab';
import { GRNDispatchesTab } from '../GRNDispatchesTab';
import { GRNInvoicesTab } from '../GRNInvoicesTab';
import type { InvoiceTable } from '@/components/common/invoiceTable';
import type { DispatchRecord } from '@/services/grn-detail-service';
import { setLanguage } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
let mockFontScale = 1;
let mockWidth = 360;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const lot = (over: Partial<GRNItem> & { id: string }): GRNItem => ({
  item_name: 'Potatoes',
  qty: 100,
  stock: 80,
  weight: 50,
  package_mark: 'PM',
  rack: 'B-14',
  packaging: 'Jute bag',
  ...over,
});
const potatoes = lot({ id: 'p' });
const onions = lot({ id: 'o', item_name: 'Onions', qty: 60, stock: 5, weight: 0, package_mark: null, rack: null, packaging: null });
const garlic = lot({ id: 'g', item_name: 'Garlic', qty: 10, stock: 0, package_mark: 'G1', weight: null });
const potatoesLot2 = lot({ id: 'p2', package_mark: 'PM2', qty: 40, stock: 40 });

const record = (id: string, dispatchId: string, no: string, date: string, qty: number): DispatchRecord => ({
  id, dispatch_id: dispatchId, disp_no: no, disp_date: date, disp_quantity: qty, customer_name: '', registration: '', supervisor_name: '',
});

afterEach(() => {
  mockFontScale = 1;
  mockWidth = 360;
  setLanguage('en');
});

type Node = Parameters<typeof within>[0];
/** The texts drawn inside an element (or on the whole screen), joined by "|". */
const textOf = (node?: Node): string =>
  // A no-break space keeps a number with its unit on screen; read it as a space here.
  (node ? within(node) : screen)
    .queryAllByText(/[\s\S]*/)
    .map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' '))
    .join('|');
// Rows, tables and totals have no role: they are found by test id.
const byTestId = (id: string) => screen.getByTestId(id);
const has = (id: string) => screen.queryByTestId(id) !== null;
const press = (id: string) => userEvent.press(byTestId(id));

describe('GRN Items table', () => {
  it('heads Item, Received, In stock and shows one row per lot, two lots of one item apart', async () => {
    await render(<GRNItemsTab items={[potatoes, potatoesLot2, onions, garlic]} />);

    expect(textOf(byTestId('grn-items-table'))).toMatch(/^Item\|Received\|In stock\|/);
    expect(textOf(byTestId('grn-item-row-p'))).toBe('Potatoes|PM · 50 kg each|100|80');
    expect(textOf(byTestId('grn-item-row-p2'))).toBe('Potatoes|PM2 · 50 kg each|40|40');
  });

  it('tags only Low stock, and shows no weight line for a lot without mark or weight', async () => {
    await render(<GRNItemsTab items={[potatoes, onions, garlic]} />);

    expect(textOf(byTestId('grn-item-row-o'))).toBe('Onions|Low stock|60|5');
    // Nothing left: the In stock column says 0, no tag repeats it.
    expect(textOf(byTestId('grn-item-row-g'))).toBe('Garlic|G1|10|0');
    expect(textOf(byTestId('grn-item-row-p'))).not.toMatch(/In stock/);
    expect(byTestId('grn-item-row-o')).toHaveAccessibleName('Onions, 60 received, 5 in stock, Low stock');
  });

  it('opens a row to the bags dispatched, rack and packaging, and View dispatches', async () => {
    const onViewItemDispatches = jest.fn();
    await render(<GRNItemsTab items={[potatoes]} onViewItemDispatches={onViewItemDispatches} />);

    expect(has('grn-item-details-p')).toBe(false);
    await press('grn-item-row-p');
    expect(textOf(byTestId('grn-item-details-p'))).toBe('Dispatched 20 Jute bag|B-14|Packaging Jute bag|View dispatches');
    expect(byTestId('grn-item-row-p')).toBeExpanded();
    await press('grn-item-dispatches-p');
    expect(onViewItemDispatches).toHaveBeenCalledWith(potatoes);
  });

  it('counts a Box lot in boxes, a Crate lot in crates, and any other packaging as its own word, as in Unit (D18, WH-41)', async () => {
    const box = lot({ id: 'bx', stock: 77, packaging: 'Box' });
    const crate = lot({ id: 'cr', stock: 97, packaging: 'Crates' });
    const unit = lot({ id: 'un', stock: 99, packaging: 'Unit' });
    await render(<GRNItemsTab items={[box, crate, unit]} onViewItemDispatches={jest.fn()} />);
    await press('grn-item-row-bx');
    await press('grn-item-row-cr');
    await press('grn-item-row-un');

    expect(textOf(byTestId('grn-item-details-bx'))).toMatch(/^Dispatched 23 boxes\|/);
    expect(textOf(byTestId('grn-item-details-cr'))).toMatch(/^Dispatched 3 crates\|/);
    expect(textOf(byTestId('grn-item-details-un'))).toMatch(/^Dispatched 1 Unit\|/);
  });

  it('uses the dispatch summary when it is there, and offers no View dispatches for a lot not dispatched', async () => {
    await render(<GRNItemsTab items={[lot({ id: 'x', stock: 100, dispatch_summary: { total_dispatched: 0 } }), lot({ id: 'y', stock: 70, dispatch_summary: { total_dispatched: 25 } })]} onViewItemDispatches={jest.fn()} />);

    await press('grn-item-row-x');
    expect(textOf(byTestId('grn-item-details-x'))).toBe('Dispatched 0 Jute bag|B-14|Packaging Jute bag');
    await press('grn-item-row-y');
    expect(textOf(byTestId('grn-item-details-y'))).toMatch(/^Dispatched 25 Jute bag\|/);
  });

  it('totals the lots, the bags received and the bags in stock', async () => {
    await render(<GRNItemsTab items={[potatoes, onions, garlic]} />);

    expect(textOf(byTestId('grn-items-total'))).toBe('Total|3 item lines|170|85');
    expect(byTestId('grn-items-total')).toHaveAccessibleName('Total: 3 item lines, 170 received, 85 in stock');
  });

  it('moves Received under the item at large text', async () => {
    mockFontScale = 2;
    await render(<GRNItemsTab items={[potatoes]} />);

    expect(textOf(byTestId('grn-items-table'))).toMatch(/^Item\|In stock\|/);
    expect(textOf(byTestId('grn-item-row-p'))).toBe('Potatoes|PM · 50 kg each|100 received|80');
    expect(textOf(byTestId('grn-items-total'))).toBe('Total|1 item line · 100 received|80');
  });

  it('keeps the empty and loading states', async () => {
    await render(<GRNItemsTab items={[]} />);
    expect(textOf()).toMatch(/^No items/);
    await screen.unmount();
    await render(<GRNItemsTab items={[]} loading />);
    expect(textOf()).toBe('Loading items…');
  });
});

describe('GRN Dispatches table', () => {
  const byItem = {
    p: [record('r1', 'd1', 'DD0041', '2026-10-09', 12), record('r2', 'd2', 'DD0042', '2026-10-11', 8)],
    g: [record('r3', 'd2', 'DD0042', '2026-10-11', 10)],
  };

  it('shows the Dispatches column on a wide screen', async () => {
    mockWidth = 700;
    await render(<GRNDispatchesTab items={[onions, potatoes, garlic]} dispatchesByItem={byItem} />);

    expect(textOf(byTestId('grn-dispatches-table'))).toMatch(/^Item\|Dispatches\|Units dispatched\|/);
    expect(textOf(byTestId('grn-dispatch-row-p'))).toBe('Potatoes|PM · 50 kg each|100 received|2|20');
  });

  it('summarises each lot in the server order; the first with dispatches starts open', async () => {
    await render(<GRNDispatchesTab items={[onions, potatoes, garlic]} dispatchesByItem={byItem} />);

    // On a phone the count goes under the item: the "Dispatches" heading is wider than its counts.
    expect(textOf(byTestId('grn-dispatches-table'))).toMatch(/^Item\|Units dispatched\|/);
    expect(textOf(byTestId('grn-dispatch-row-o'))).toBe('Onions|60 received · 0 dispatches|0');
    expect(textOf(byTestId('grn-dispatch-row-p'))).toBe('Potatoes|PM · 50 kg each|100 received · 2 dispatches|20');
    expect(textOf(byTestId('grn-dispatch-row-g'))).toBe('Garlic|G1|10 received · 1 dispatch|10');
    expect(textOf(byTestId('grn-dispatch-lines-p'))).toBe('Dispatch|Date|Jute bag|DD0041|09/10/26|12|DD0042|11/10/26|8');
    expect(has('grn-dispatch-lines-g')).toBe(false);
  });

  it('does not open a lot that has no dispatches', async () => {
    await render(<GRNDispatchesTab items={[onions, potatoes]} dispatchesByItem={byItem} />);
    expect(byTestId('grn-dispatch-row-o')).toBeDisabled();
    expect(byTestId('grn-dispatch-row-o')).not.toBeExpanded();
    expect(byTestId('grn-dispatch-row-o')).not.toBeCollapsed();
  });

  it('reads the dispatch date in words for a screen reader', async () => {
    await render(<GRNDispatchesTab items={[potatoes, garlic]} dispatchesByItem={byItem} />);
    await press('grn-dispatch-row-g');
    const line = byTestId('grn-dispatch-line-r3');
    expect(line).toHaveAccessibleName(/\d{1,2} [A-Z][a-z]{2} 20\d\d/);
    expect(line).not.toHaveAccessibleName(/\d\d\/\d\d\/\d\d/);
  });

  it('opens and closes rows on tap and opens a dispatch by its id', async () => {
    const onViewDispatch = jest.fn();
    await render(<GRNDispatchesTab items={[potatoes, garlic]} dispatchesByItem={byItem} onViewDispatch={onViewDispatch} />);

    await press('grn-dispatch-row-g');
    expect(has('grn-dispatch-lines-g')).toBe(true);
    await press('grn-dispatch-line-r3');
    expect(onViewDispatch).toHaveBeenCalledWith('d2');
    await press('grn-dispatch-row-p');
    expect(has('grn-dispatch-lines-p')).toBe(false);
  });

  it('totals the bags and counts each dispatch once, even when it took several lots', async () => {
    await render(<GRNDispatchesTab items={[potatoes, garlic]} dispatchesByItem={byItem} />);

    expect(textOf(byTestId('grn-dispatches-total'))).toBe('Total|2 dispatches|30');
    expect(byTestId('grn-dispatches-total')).toHaveAccessibleName('Total: 2 dispatches, 30 Jute bag dispatched');
  });

  it('moves the count under the item and the date under the number at large text', async () => {
    mockFontScale = 2;
    await render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={byItem} />);

    expect(textOf(byTestId('grn-dispatches-table'))).toMatch(/^Item\|Jute bag dispatched\|/);
    expect(textOf(byTestId('grn-dispatch-row-p'))).toBe('Potatoes|PM · 50 kg each|100 received · 2 dispatches|20');
    expect(textOf(byTestId('grn-dispatch-lines-p'))).toBe('Dispatch|Jute bag|DD0041|09/10/26|12|DD0042|11/10/26|8');
  });

  it('counts in the packaging of the lot instead of fixed bags', async () => {
    const boxes = lot({ id: 'p', packaging: 'Box' });
    await render(<GRNDispatchesTab items={[boxes]} dispatchesByItem={{ p: byItem.p }} />);

    expect(textOf(byTestId('grn-dispatches-table'))).toMatch(/^Item\|Boxes dispatched\|/);
    expect(textOf(byTestId('grn-dispatch-lines-p'))).toMatch(/^Dispatch\|Date\|Boxes\|/);
    expect(byTestId('grn-dispatches-total')).toHaveAccessibleName('Total: 2 dispatches, 20 boxes dispatched');
    expect(byTestId('grn-dispatch-line-r1')).toHaveAccessibleName(/, 12 boxes$/);
    expect(byTestId('grn-dispatch-row-p')).toHaveAccessibleName(
      'Potatoes, PM · 50 kg each, 2 dispatches, 20 of 100 boxes dispatched'
    );
  });

  it('says units when the lots are counted in different things', async () => {
    await render(<GRNDispatchesTab items={[lot({ id: 'p', packaging: 'Box' }), garlic]} dispatchesByItem={byItem} />);

    expect(textOf(byTestId('grn-dispatches-table'))).toMatch(/^Item\|Units dispatched\|/);
    expect(byTestId('grn-dispatches-total')).toHaveAccessibleName('Total: 2 dispatches, 30 units dispatched');
  });

  it('writes the packaging in Gujarati', async () => {
    setLanguage('gu');
    await render(<GRNDispatchesTab items={[lot({ id: 'p', packaging: 'Crate' })]} dispatchesByItem={{ p: byItem.p }} />);

    expect(textOf(byTestId('grn-dispatches-table'))).toContain('જાવકના ક્રેટ');
    expect(textOf(byTestId('grn-dispatch-lines-p'))).toContain('ક્રેટ');
    expect(byTestId('grn-dispatches-total')).toHaveAccessibleName('કુલ: ૨ જાવક, ૨૦ ક્રેટ જાવક થઈ');
    expect(byTestId('grn-dispatch-row-p')).toHaveAccessibleName(new RegExp('૧૦૦ માંથી ૨૦ ક્રેટની જાવક થઈ'));
  });

  it('keeps the loading, failure and empty states', async () => {
    await render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={{}} loading />);
    expect(textOf()).toBe('Loading dispatches…');
    await screen.unmount();
    const onRetry = jest.fn();
    await render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={{}} error="Customer access denied" onRetry={onRetry} />);
    expect(textOf()).toBe("Couldn't load dispatches|Customer access denied|Try again");
    await screen.unmount();
    await render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={{ p: [] }} />);
    expect(textOf()).toBe('No dispatches yet|Dispatches of items from this GRN appear here.');
  });
});

/** The ids of the rows with this test id prefix, in the order they are drawn. */
const rowIds = (prefix: string): string[] => [
  ...new Set(
    screen
      .queryAllByTestId(new RegExp(`^${prefix}`))
      .map((n) => n.props.testID.slice(prefix.length) as string)
  ),
];
const sortLabel = (id: string) => byTestId(id);

describe('GRN Items table, sorting', () => {
  // Drawn in this order: p (100 received, 80 in stock), o (60, 5), g (10, 0), p2 (40, 40). Potatoes twice, so a
  // tie keeps the server's order. By Received: g, p2, o, p. By In stock: g, o, p2, p. By Item: Garlic, Onions, Potatoes, Potatoes.
  const lots = [potatoes, onions, garlic, potatoesLot2];

  it('sorts a column not sorted → ascending → descending → not sorted, one column at a time', async () => {
    await render(<GRNItemsTab items={lots} />);
    const table = 'grn-items-table';
    expect(rowIds('grn-item-row-')).toEqual(['p', 'o', 'g', 'p2']);
    expect(sortLabel(`${table}-sort-received`)).toHaveAccessibleName('Sort by Received, not sorted');

    await press(`${table}-sort-received`);
    expect(rowIds('grn-item-row-')).toEqual(['g', 'p2', 'o', 'p']);
    expect(sortLabel(`${table}-sort-received`)).toHaveAccessibleName('Sort by Received, sorted ascending');
    await press(`${table}-sort-received`);
    expect(rowIds('grn-item-row-')).toEqual(['p', 'o', 'p2', 'g']);
    expect(sortLabel(`${table}-sort-received`)).toHaveAccessibleName('Sort by Received, sorted descending');
    await press(`${table}-sort-received`);
    expect(rowIds('grn-item-row-')).toEqual(['p', 'o', 'g', 'p2']);
    expect(sortLabel(`${table}-sort-received`)).toHaveAccessibleName('Sort by Received, not sorted');

    // Another column replaces the sort: In stock ascending, Received back to not sorted.
    await press(`${table}-sort-received`);
    await press(`${table}-sort-stock`);
    expect(rowIds('grn-item-row-')).toEqual(['g', 'o', 'p2', 'p']);
    expect(sortLabel(`${table}-sort-stock`)).toHaveAccessibleName('Sort by In stock, sorted ascending');
    expect(sortLabel(`${table}-sort-received`)).toHaveAccessibleName('Sort by Received, not sorted');
  });

  it('sorts the Item column by name, equal names in the server order', async () => {
    await render(<GRNItemsTab items={lots} />);
    await press('grn-items-table-sort-item');
    expect(rowIds('grn-item-row-')).toEqual(['g', 'o', 'p', 'p2']);
    expect(sortLabel('grn-items-table-sort-item')).toHaveAccessibleName('Sort by Item, sorted ascending');
    await press('grn-items-table-sort-item');
    expect(rowIds('grn-item-row-')).toEqual(['p', 'p2', 'o', 'g']);
    expect(sortLabel('grn-items-table-sort-item')).toHaveAccessibleName('Sort by Item, sorted descending');
  });

  it('keeps the totals the sums of every line, and an open row open, while sorted', async () => {
    await render(<GRNItemsTab items={lots} />);
    expect(textOf(byTestId('grn-items-total'))).toBe('Total|4 item lines|210|125');
    await press('grn-item-row-o');
    await press('grn-items-table-sort-received');
    await press('grn-items-table-sort-received');
    expect(rowIds('grn-item-row-')).toEqual(['p', 'o', 'p2', 'g']);
    expect(textOf(byTestId('grn-items-total'))).toBe('Total|4 item lines|210|125');
    expect(has('grn-item-details-o')).toBe(true);
    expect(byTestId('grn-item-row-o')).toBeExpanded();
  });

  it('does not sort Received when it is stacked under the item at large text', async () => {
    mockFontScale = 2;
    await render(<GRNItemsTab items={lots} />);
    expect(has('grn-items-table-sort-received')).toBe(false);
    expect(has('grn-items-table-sort-item')).toBe(true);
    expect(has('grn-items-table-sort-stock')).toBe(true);
    await press('grn-items-table-sort-stock');
    expect(rowIds('grn-item-row-')).toEqual(['g', 'o', 'p2', 'p']);
  });

  it('does not sort the Dispatches table', async () => {
    await render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={{ p: [record('r1', 'd1', 'DD0041', '2026-10-09', 12)] }} />);
    expect(screen.queryAllByTestId(/-sort-/)).toEqual([]);
  });
});

describe('GRN Invoices table, sorting', () => {
  // Drawn in this order: A (no. 9, 10/10/26, ₹900), B (no. 10, 05/10/26, ₹100), C (no. 2, 20/10/26, ₹500).
  const invoices: InvoiceTable = {
    detailed: true,
    count: 3,
    total: 1500,
    rows: [
      { key: 'a', invoice_id: 'a', invoice_no: 9, invoice_date: '2026-10-10', total: 900 },
      { key: 'b', invoice_id: 'b', invoice_no: 10, invoice_date: '2026-10-05', total: 100 },
      { key: 'c', invoice_id: 'c', invoice_no: 2, invoice_date: '2026-10-20', total: 500 },
    ],
  };

  it('sorts Invoice, Date and Invoice total from their headings, and keeps the summary total', async () => {
    mockWidth = 800;
    await render(<GRNInvoicesTab invoices={invoices} />);
    const table = 'grn-invoices-table';
    expect(rowIds('grn-invoice-row-')).toEqual(['a', 'b', 'c']);
    expect(sortLabel(`${table}-sort-invoice`)).toHaveAccessibleName('Sort by Invoice, not sorted');
    expect(sortLabel(`${table}-sort-date`)).toHaveAccessibleName('Sort by Date, not sorted');
    expect(sortLabel(`${table}-sort-total`)).toHaveAccessibleName('Sort by Invoice total, not sorted');

    // 2, 9, 10: by number, not by text.
    await press(`${table}-sort-invoice`);
    expect(rowIds('grn-invoice-row-')).toEqual(['c', 'a', 'b']);
    expect(sortLabel(`${table}-sort-invoice`)).toHaveAccessibleName('Sort by Invoice, sorted ascending');
    await press(`${table}-sort-invoice`);
    expect(rowIds('grn-invoice-row-')).toEqual(['b', 'a', 'c']);

    await press(`${table}-sort-date`);
    expect(rowIds('grn-invoice-row-')).toEqual(['b', 'a', 'c']);
    expect(sortLabel(`${table}-sort-date`)).toHaveAccessibleName('Sort by Date, sorted ascending');
    expect(sortLabel(`${table}-sort-invoice`)).toHaveAccessibleName('Sort by Invoice, not sorted');
    await press(`${table}-sort-date`);
    expect(rowIds('grn-invoice-row-')).toEqual(['c', 'a', 'b']);
    expect(sortLabel(`${table}-sort-date`)).toHaveAccessibleName('Sort by Date, sorted descending');

    await press(`${table}-sort-total`);
    expect(rowIds('grn-invoice-row-')).toEqual(['b', 'c', 'a']);
    expect(sortLabel(`${table}-sort-total`)).toHaveAccessibleName('Sort by Invoice total, sorted ascending');
    await press(`${table}-sort-total`);
    expect(rowIds('grn-invoice-row-')).toEqual(['a', 'c', 'b']);
    await press(`${table}-sort-total`);
    expect(rowIds('grn-invoice-row-')).toEqual(['a', 'b', 'c']);

    // The total row is the summary's, whatever the order.
    expect(textOf(byTestId('grn-invoices-total'))).toBe('Total|3 invoices|₹1,500.00');
  });

  it('has no Date heading to sort on a phone, where the date is under the number', async () => {
    await render(<GRNInvoicesTab invoices={invoices} />);
    expect(has('grn-invoices-table-sort-date')).toBe(false);
    await press('grn-invoices-table-sort-invoice');
    expect(rowIds('grn-invoice-row-')).toEqual(['c', 'a', 'b']);
  });
});
