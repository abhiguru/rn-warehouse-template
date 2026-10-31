/**
 * The GRN page's Items and Dispatches tables: rows, tags, expansion, links, totals,
 * large text and the old loading, failure and empty states.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { GRNItemsTab, type GRNItem } from '../GRNItemsTab';
import { GRNDispatchesTab } from '../GRNDispatchesTab';
import { GRNInvoicesTab } from '../GRNInvoicesTab';
import type { InvoiceTable } from '@/components/common/invoiceTable';
import type { DispatchRecord } from '@/services/grn-detail-service';

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
});

const textOf = (node: ReactTestInstance): string =>
  // A no-break space keeps a number with its unit on screen; read it as a space here.
  node.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' ')).join('|');
const byTestId = (id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string')[0];
const has = (id: string) => tree.root.findAll((n) => n.props.testID === id).length > 0;
const press = (id: string) => act(() => byTestId(id).props.onPress());

describe('GRN Items table', () => {
  it('heads Item, Received, In stock and shows one row per lot, two lots of one item apart', () => {
    render(<GRNItemsTab items={[potatoes, potatoesLot2, onions, garlic]} />);

    expect(textOf(byTestId('grn-items-table'))).toMatch(/^Item\|Received\|In stock\|/);
    expect(textOf(byTestId('grn-item-row-p'))).toBe('Potatoes|PM · 50 kg each|100|80');
    expect(textOf(byTestId('grn-item-row-p2'))).toBe('Potatoes|PM2 · 50 kg each|40|40');
  });

  it('tags only Low stock, and shows no weight line for a lot without mark or weight', () => {
    render(<GRNItemsTab items={[potatoes, onions, garlic]} />);

    expect(textOf(byTestId('grn-item-row-o'))).toBe('Onions|Low stock|60|5');
    // Nothing left: the In stock column says 0, no tag repeats it.
    expect(textOf(byTestId('grn-item-row-g'))).toBe('Garlic|G1|10|0');
    expect(textOf(byTestId('grn-item-row-p'))).not.toMatch(/In stock/);
    expect(byTestId('grn-item-row-o').props.accessibilityLabel).toBe('Onions, 60 received, 5 in stock, Low stock');
  });

  it('opens a row to the bags dispatched, rack and packaging, and View dispatches', () => {
    const onViewItemDispatches = jest.fn();
    render(<GRNItemsTab items={[potatoes]} onViewItemDispatches={onViewItemDispatches} />);

    expect(has('grn-item-details-p')).toBe(false);
    press('grn-item-row-p');
    expect(textOf(byTestId('grn-item-details-p'))).toBe('Dispatched 20 bags|B-14|Packaging Jute bag|View dispatches');
    expect(byTestId('grn-item-row-p').props.accessibilityState).toEqual({ expanded: true });
    press('grn-item-dispatches-p');
    expect(onViewItemDispatches).toHaveBeenCalledWith(potatoes);
  });

  it('uses the dispatch summary when it is there, and offers no View dispatches for a lot not dispatched', () => {
    render(<GRNItemsTab items={[lot({ id: 'x', stock: 100, dispatch_summary: { total_dispatched: 0 } }), lot({ id: 'y', stock: 70, dispatch_summary: { total_dispatched: 25 } })]} onViewItemDispatches={jest.fn()} />);

    press('grn-item-row-x');
    expect(textOf(byTestId('grn-item-details-x'))).toBe('Dispatched 0 bags|B-14|Packaging Jute bag');
    press('grn-item-row-y');
    expect(textOf(byTestId('grn-item-details-y'))).toMatch(/^Dispatched 25 bags\|/);
  });

  it('totals the lots, the bags received and the bags in stock', () => {
    render(<GRNItemsTab items={[potatoes, onions, garlic]} />);

    expect(textOf(byTestId('grn-items-total'))).toBe('Total|3 item lines|170|85');
    expect(byTestId('grn-items-total').props.accessibilityLabel).toBe('Total: 3 item lines, 170 received, 85 in stock');
  });

  it('moves Received under the item at large text', () => {
    mockFontScale = 2;
    render(<GRNItemsTab items={[potatoes]} />);

    expect(textOf(byTestId('grn-items-table'))).toMatch(/^Item\|In stock\|/);
    expect(textOf(byTestId('grn-item-row-p'))).toBe('Potatoes|PM · 50 kg each|100 received|80');
    expect(textOf(byTestId('grn-items-total'))).toBe('Total|1 item line · 100 received|80');
  });

  it('keeps the empty and loading states', () => {
    render(<GRNItemsTab items={[]} />);
    expect(textOf(tree.root)).toMatch(/^No items/);
    act(() => tree.unmount());
    render(<GRNItemsTab items={[]} loading />);
    expect(textOf(tree.root)).toBe('Loading items…');
  });
});

describe('GRN Dispatches table', () => {
  const byItem = {
    p: [record('r1', 'd1', 'DD0041', '2026-10-09', 12), record('r2', 'd2', 'DD0042', '2026-10-11', 8)],
    g: [record('r3', 'd2', 'DD0042', '2026-10-11', 10)],
  };

  it('shows the Dispatches column on a wide screen', () => {
    mockWidth = 700;
    render(<GRNDispatchesTab items={[onions, potatoes, garlic]} dispatchesByItem={byItem} />);

    expect(textOf(byTestId('grn-dispatches-table'))).toMatch(/^Item\|Dispatches\|Bags dispatched\|/);
    expect(textOf(byTestId('grn-dispatch-row-p'))).toBe('Potatoes|PM · 50 kg each|100 received|2|20');
  });

  it('summarises each lot in the server order; the first with dispatches starts open', () => {
    render(<GRNDispatchesTab items={[onions, potatoes, garlic]} dispatchesByItem={byItem} />);

    // On a phone the count goes under the item: the "Dispatches" heading is wider than its counts.
    expect(textOf(byTestId('grn-dispatches-table'))).toMatch(/^Item\|Bags dispatched\|/);
    expect(textOf(byTestId('grn-dispatch-row-o'))).toBe('Onions|60 received · 0 dispatches|0');
    expect(textOf(byTestId('grn-dispatch-row-p'))).toBe('Potatoes|PM · 50 kg each|100 received · 2 dispatches|20');
    expect(textOf(byTestId('grn-dispatch-row-g'))).toBe('Garlic|G1|10 received · 1 dispatch|10');
    expect(textOf(byTestId('grn-dispatch-lines-p'))).toBe('Dispatch|Date|Bags|DD0041|9 Oct|12|DD0042|11 Oct|8');
    expect(has('grn-dispatch-lines-g')).toBe(false);
  });

  it('does not open a lot that has no dispatches', () => {
    render(<GRNDispatchesTab items={[onions, potatoes]} dispatchesByItem={byItem} />);
    expect(byTestId('grn-dispatch-row-o').props.disabled).toBe(true);
    expect(byTestId('grn-dispatch-row-o').props.accessibilityState).toBeUndefined();
  });

  it('opens and closes rows on tap and opens a dispatch by its id', () => {
    const onViewDispatch = jest.fn();
    render(<GRNDispatchesTab items={[potatoes, garlic]} dispatchesByItem={byItem} onViewDispatch={onViewDispatch} />);

    press('grn-dispatch-row-g');
    expect(has('grn-dispatch-lines-g')).toBe(true);
    press('grn-dispatch-line-r3');
    expect(onViewDispatch).toHaveBeenCalledWith('d2');
    press('grn-dispatch-row-p');
    expect(has('grn-dispatch-lines-p')).toBe(false);
  });

  it('totals the bags and counts each dispatch once, even when it took several lots', () => {
    render(<GRNDispatchesTab items={[potatoes, garlic]} dispatchesByItem={byItem} />);

    expect(textOf(byTestId('grn-dispatches-total'))).toBe('Total|2 dispatches|30');
    expect(byTestId('grn-dispatches-total').props.accessibilityLabel).toBe('Total: 2 dispatches, 30 bags dispatched');
  });

  it('moves the count under the item and the date under the number at large text', () => {
    mockFontScale = 2;
    render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={byItem} />);

    expect(textOf(byTestId('grn-dispatches-table'))).toMatch(/^Item\|Bags dispatched\|/);
    expect(textOf(byTestId('grn-dispatch-row-p'))).toBe('Potatoes|PM · 50 kg each|100 received · 2 dispatches|20');
    expect(textOf(byTestId('grn-dispatch-lines-p'))).toBe('Dispatch|Bags|DD0041|9 Oct|12|DD0042|11 Oct|8');
  });

  it('keeps the loading, failure and empty states', () => {
    render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={{}} loading />);
    expect(textOf(tree.root)).toBe('Loading dispatches…');
    act(() => tree.unmount());
    const onRetry = jest.fn();
    render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={{}} error="Customer access denied" onRetry={onRetry} />);
    expect(textOf(tree.root)).toBe("Couldn't load dispatches|Customer access denied|Try again");
    act(() => tree.unmount());
    render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={{ p: [] }} />);
    expect(textOf(tree.root)).toBe('No dispatches yet|Dispatches of items from this GRN appear here.');
  });
});

/** The ids of the rows with this test id prefix, in the order they are drawn. */
const rowIds = (prefix: string): string[] => [
  ...new Set(
    tree.root
      .findAll((n) => typeof n.type !== 'string' && typeof n.props.testID === 'string' && n.props.testID.startsWith(prefix))
      .map((n) => n.props.testID.slice(prefix.length) as string)
  ),
];
const sortLabel = (id: string): string => byTestId(id).props.accessibilityLabel;

describe('GRN Items table, sorting', () => {
  // Drawn in this order: p (100 received, 80 in stock), o (60, 5), g (10, 0), p2 (40, 40). Potatoes twice, so a
  // tie keeps the server's order. By Received: g, p2, o, p. By In stock: g, o, p2, p. By Item: Garlic, Onions, Potatoes, Potatoes.
  const lots = [potatoes, onions, garlic, potatoesLot2];

  it('sorts a column not sorted → ascending → descending → not sorted, one column at a time', () => {
    render(<GRNItemsTab items={lots} />);
    const table = 'grn-items-table';
    expect(rowIds('grn-item-row-')).toEqual(['p', 'o', 'g', 'p2']);
    expect(sortLabel(`${table}-sort-received`)).toBe('Sort by Received, not sorted');

    press(`${table}-sort-received`);
    expect(rowIds('grn-item-row-')).toEqual(['g', 'p2', 'o', 'p']);
    expect(sortLabel(`${table}-sort-received`)).toBe('Sort by Received, sorted ascending');
    press(`${table}-sort-received`);
    expect(rowIds('grn-item-row-')).toEqual(['p', 'o', 'p2', 'g']);
    expect(sortLabel(`${table}-sort-received`)).toBe('Sort by Received, sorted descending');
    press(`${table}-sort-received`);
    expect(rowIds('grn-item-row-')).toEqual(['p', 'o', 'g', 'p2']);
    expect(sortLabel(`${table}-sort-received`)).toBe('Sort by Received, not sorted');

    // Another column replaces the sort: In stock ascending, Received back to not sorted.
    press(`${table}-sort-received`);
    press(`${table}-sort-stock`);
    expect(rowIds('grn-item-row-')).toEqual(['g', 'o', 'p2', 'p']);
    expect(sortLabel(`${table}-sort-stock`)).toBe('Sort by In stock, sorted ascending');
    expect(sortLabel(`${table}-sort-received`)).toBe('Sort by Received, not sorted');
  });

  it('sorts the Item column by name, equal names in the server order', () => {
    render(<GRNItemsTab items={lots} />);
    press('grn-items-table-sort-item');
    expect(rowIds('grn-item-row-')).toEqual(['g', 'o', 'p', 'p2']);
    expect(sortLabel('grn-items-table-sort-item')).toBe('Sort by Item, sorted ascending');
    press('grn-items-table-sort-item');
    expect(rowIds('grn-item-row-')).toEqual(['p', 'p2', 'o', 'g']);
    expect(sortLabel('grn-items-table-sort-item')).toBe('Sort by Item, sorted descending');
  });

  it('keeps the totals the sums of every line, and an open row open, while sorted', () => {
    render(<GRNItemsTab items={lots} />);
    expect(textOf(byTestId('grn-items-total'))).toBe('Total|4 item lines|210|125');
    press('grn-item-row-o');
    press('grn-items-table-sort-received');
    press('grn-items-table-sort-received');
    expect(rowIds('grn-item-row-')).toEqual(['p', 'o', 'p2', 'g']);
    expect(textOf(byTestId('grn-items-total'))).toBe('Total|4 item lines|210|125');
    expect(has('grn-item-details-o')).toBe(true);
    expect(byTestId('grn-item-row-o').props.accessibilityState).toEqual({ expanded: true });
  });

  it('does not sort Received when it is stacked under the item at large text', () => {
    mockFontScale = 2;
    render(<GRNItemsTab items={lots} />);
    expect(has('grn-items-table-sort-received')).toBe(false);
    expect(has('grn-items-table-sort-item')).toBe(true);
    expect(has('grn-items-table-sort-stock')).toBe(true);
    press('grn-items-table-sort-stock');
    expect(rowIds('grn-item-row-')).toEqual(['g', 'o', 'p2', 'p']);
  });

  it('does not sort the Dispatches table', () => {
    render(<GRNDispatchesTab items={[potatoes]} dispatchesByItem={{ p: [record('r1', 'd1', 'DD0041', '2026-10-09', 12)] }} />);
    expect(tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.includes('-sort-'))).toEqual([]);
  });
});

describe('GRN Invoices table, sorting', () => {
  // Drawn in this order: A (no. 9, 10 Oct, ₹900), B (no. 10, 5 Oct, ₹100), C (no. 2, 20 Oct, ₹500).
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

  it('sorts Invoice, Date and Invoice total from their headings, and keeps the summary total', () => {
    mockWidth = 800;
    render(<GRNInvoicesTab invoices={invoices} />);
    const table = 'grn-invoices-table';
    expect(rowIds('grn-invoice-row-')).toEqual(['a', 'b', 'c']);
    expect(sortLabel(`${table}-sort-invoice`)).toBe('Sort by Invoice, not sorted');
    expect(sortLabel(`${table}-sort-date`)).toBe('Sort by Date, not sorted');
    expect(sortLabel(`${table}-sort-total`)).toBe('Sort by Invoice total, not sorted');

    // 2, 9, 10: by number, not by text.
    press(`${table}-sort-invoice`);
    expect(rowIds('grn-invoice-row-')).toEqual(['c', 'a', 'b']);
    expect(sortLabel(`${table}-sort-invoice`)).toBe('Sort by Invoice, sorted ascending');
    press(`${table}-sort-invoice`);
    expect(rowIds('grn-invoice-row-')).toEqual(['b', 'a', 'c']);

    press(`${table}-sort-date`);
    expect(rowIds('grn-invoice-row-')).toEqual(['b', 'a', 'c']);
    expect(sortLabel(`${table}-sort-date`)).toBe('Sort by Date, sorted ascending');
    expect(sortLabel(`${table}-sort-invoice`)).toBe('Sort by Invoice, not sorted');
    press(`${table}-sort-date`);
    expect(rowIds('grn-invoice-row-')).toEqual(['c', 'a', 'b']);
    expect(sortLabel(`${table}-sort-date`)).toBe('Sort by Date, sorted descending');

    press(`${table}-sort-total`);
    expect(rowIds('grn-invoice-row-')).toEqual(['b', 'c', 'a']);
    expect(sortLabel(`${table}-sort-total`)).toBe('Sort by Invoice total, sorted ascending');
    press(`${table}-sort-total`);
    expect(rowIds('grn-invoice-row-')).toEqual(['a', 'c', 'b']);
    press(`${table}-sort-total`);
    expect(rowIds('grn-invoice-row-')).toEqual(['a', 'b', 'c']);

    // The total row is the summary's, whatever the order.
    expect(textOf(byTestId('grn-invoices-total'))).toBe('Total|3 invoices|₹1,500.00');
  });

  it('has no Date heading to sort on a phone, where the date is under the number', () => {
    render(<GRNInvoicesTab invoices={invoices} />);
    expect(has('grn-invoices-table-sort-date')).toBe(false);
    press('grn-invoices-table-sort-invoice');
    expect(rowIds('grn-invoice-row-')).toEqual(['c', 'a', 'b']);
  });
});
