/**
 * The totals row of the data table for a screen reader (docs/STYLE_GUIDE.md
 * §11.3: "a row reads as one element"). Like a data row it is one element: the
 * half that carries the label names every column with its total, built from the
 * column labels as a data row's label is, and the other half is hidden, so no
 * figure is read bare. Checked in both layouts and on all three import paths.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { getTokens } from '@/theme/tokens';
import { FioriDataTable as RootTable, type FioriDataTableColumn } from '../FioriDataTable';
import { FioriDataTable as FioriPathTable } from '../fiori/FioriDataTable';
import { FioriDataTable as ReportsPathTable } from '../reports/FioriDataTable';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const t = getTokens('orange', 'light');
type AnyRow = Record<string, any>;

// The monthly table of Invoice history, the screen that draws a totals row: figures already formatted.
const MONTH_COLUMNS: FioriDataTableColumn<AnyRow>[] = [
  { key: 'month', label: 'Month' },
  { key: 'invoices', label: 'Invoices', dataType: 'number', width: 104 },
  { key: 'amount', label: 'Amount', dataType: 'number', width: 120 },
  { key: 'paid', label: 'Paid', dataType: 'number', width: 120 },
  { key: 'pending', label: 'Pending', dataType: 'number', width: 120 },
];
const MONTHS = [
  { id: '2026-10', month: 'Oct 2026', invoices: '3', amount: '₹39,500', paid: '₹18,000', pending: '₹21,500' },
  { id: '2026-09', month: 'Sep 2026', invoices: '2', amount: '₹9,150', paid: '₹0', pending: '₹7,350' },
];
const MONTH_TOTALS = { month: 'Total', invoices: '5', amount: '₹48,650', paid: '₹18,000', pending: '₹28,850' };
const MONTH_TOTALS_LABEL = 'Month Total, Invoices 5, Amount ₹48,650, Paid ₹18,000, Pending ₹28,850';

// Plain values: the table formats each total by its column's type, on screen and in the label alike.
const ITEM_COLUMNS: FioriDataTableColumn<AnyRow>[] = [
  { key: 'name', label: 'Item' },
  { key: 'bags', label: 'Bags', dataType: 'number' },
  { key: 'amount', label: 'Amount', dataType: 'currency' },
  { key: 'rack', label: 'Rack' },
];
const ITEMS = [
  { id: 'a', name: 'Potato', bags: 1200, amount: 123456.5, rack: 'B-14' },
  { id: 'b', name: 'Onion', bags: 40, amount: 980, rack: 'C-2' },
];
const rowKey = (row: AnyRow) => String(row.id);

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => mounted.splice(0).forEach(tree => tree.unmount())));

function draw(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  const flat = (node: ReactTestInstance) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
  const textOf = (node: ReactTestInstance) => ([] as unknown[]).concat(node.props.children).join('');
  const hostViews = () => tree.root.findAll(node => (node.type as unknown) === 'View');
  /** The halves of the totals row (pinned, then scrolling), told apart from data rows by the separator above them. */
  const totalsParts = () => hostViews().filter(node => flat(node).borderTopWidth === 1 && flat(node).borderTopColor === t.border.separator);
  return {
    tree,
    hostViews,
    totalsParts,
    /** What a screen reader is offered in the table: every element that is one spoken unit, with its label. */
    spoken: () => hostViews().filter(node => node.props.accessible === true).map(node => node.props.accessibilityLabel as string),
    hidden: () => hostViews().filter(node => node.props.accessible === false && node.props.importantForAccessibility === 'no-hide-descendants'),
    cells: (part: ReactTestInstance) => part.findAll(node => (node.type as unknown) === 'Text').map(textOf),
  };
}

// The hidden half is hidden on both platforms: Android reads importantForAccessibility, iOS reads
// accessibilityElementsHidden (VoiceOver would otherwise reach the bare figures inside it).
const a11yOf = (node: ReactTestInstance) => ({
  accessible: node.props.accessible,
  accessibilityLabel: node.props.accessibilityLabel,
  importantForAccessibility: node.props.importantForAccessibility,
  accessibilityElementsHidden: node.props.accessibilityElementsHidden,
});
const CARRIES = (label: string) => ({ accessible: true, accessibilityLabel: label, importantForAccessibility: undefined, accessibilityElementsHidden: undefined });
const HIDDEN = { accessible: false, accessibilityLabel: undefined, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true };
const UNGROUPED = { accessible: undefined, accessibilityLabel: undefined, importantForAccessibility: undefined, accessibilityElementsHidden: undefined };

describe('data table, the totals row for a screen reader', () => {
  it.each<[string, boolean]>([
    ['taking the height of its rows', false],
    ['filling its parent', true],
  ])('with the first column pinned, %s: the pinned half names every column with its total and the scrolling half is hidden', (_layout, fillHeight) => {
    const table = draw(<RootTable columns={MONTH_COLUMNS} data={MONTHS} keyExtractor={rowKey} totals={MONTH_TOTALS} fillHeight={fillHeight} />);
    const [pinned, scrolling, ...more] = table.totalsParts();
    expect(more).toEqual([]);
    // What is drawn is what it was: the name of the row in the pinned column, the figures in the others.
    expect(table.cells(pinned)).toEqual(['Total']);
    expect(table.cells(scrolling)).toEqual(['5', '₹48,650', '₹18,000', '₹28,850']);

    expect(a11yOf(pinned)).toEqual(CARRIES(MONTH_TOTALS_LABEL));
    expect(a11yOf(scrolling)).toEqual(HIDDEN);
    // The totals are read once, after the months, each of which is read as before.
    expect(table.spoken()).toEqual([
      'Month Oct 2026, Invoices 3, Amount ₹39,500, Paid ₹18,000, Pending ₹21,500',
      'Month Sep 2026, Invoices 2, Amount ₹9,150, Paid ₹0, Pending ₹7,350',
      MONTH_TOTALS_LABEL,
    ]);
    // One hidden half for each row, the totals row among them.
    expect(table.hidden()).toHaveLength(MONTHS.length + 1);
    expect(table.hidden()).toContain(scrolling);
  });

  it('hides the scrolling half of each data row from iOS as well, with the pinned half carrying the label', () => {
    const table = draw(<RootTable columns={MONTH_COLUMNS} data={MONTHS} keyExtractor={rowKey} totals={MONTH_TOTALS} fillHeight={false} />);
    const [, totalsScrolling] = table.totalsParts();
    const rowHalves = table.hidden().filter(node => node !== totalsScrolling);
    expect(rowHalves.map(table.cells)).toEqual([['3', '₹39,500', '₹18,000', '₹21,500'], ['2', '₹9,150', '₹0', '₹7,350']]);
    // Without accessibilityElementsHidden the figures stay reachable by VoiceOver after the row's label.
    expect(rowHalves.map(a11yOf)).toEqual([HIDDEN, HIDDEN]);
    expect(rowHalves.map(node => node.props.accessibilityElementsHidden)).toEqual([true, true]);
    // The half that carries a row's label is not hidden from either platform.
    const carriers = table.hostViews().filter(node => node.props.accessible === true);
    expect(carriers).toHaveLength(MONTHS.length + 1);
    expect(carriers.map(node => node.props.accessibilityElementsHidden)).toEqual([undefined, undefined, undefined]);
    expect(carriers.map(node => node.props.importantForAccessibility)).toEqual([undefined, undefined, undefined]);
  });

  it('hides the fade at the table\'s edge from both platforms too', () => {
    const table = draw(<RootTable columns={MONTH_COLUMNS} data={MONTHS} keyExtractor={rowKey} totals={MONTH_TOTALS} fillHeight={false} />);
    const fades = () => table.hostViews().filter(node => node.props.pointerEvents === 'none' && node.props.accessible === false);
    expect(fades()).toEqual([]);
    // The table is narrower than its columns: the scroll view says so, and the fade is drawn.
    act(() => {
      const scroller = table.tree.root.findAll(node => typeof node.props.onContentSizeChange === 'function')[0];
      scroller.props.onLayout({ nativeEvent: { layout: { width: 200, height: 100, x: 0, y: 0 } } });
      scroller.props.onContentSizeChange(600, 100);
    });
    expect(fades()).toHaveLength(1);
    expect(fades().map(node => [node.props.accessible, node.props.importantForAccessibility, node.props.accessibilityElementsHidden])).toEqual([[false, 'no-hide-descendants', true]]);
  });

  it('builds the label as a data row builds its own: column label, then the total in the column\'s format; a column with no total is left out', () => {
    const table = draw(<RootTable columns={ITEM_COLUMNS} data={ITEMS} keyExtractor={rowKey} totals={{ name: 'Total', bags: 1240, amount: 124436.5 }} fillHeight={false} />);
    const [pinned, scrolling] = table.totalsParts();
    expect(table.cells(scrolling)).toEqual(['1,240', '₹1,24,436.50']);
    expect(pinned.props.accessibilityLabel).toBe('Item Total, Bags 1,240, Amount ₹1,24,436.50');
    expect(table.spoken()).toEqual([
      'Item Potato, Bags 1,200, Amount ₹1,23,456.50, Rack B-14',
      'Item Onion, Bags 40, Amount ₹980.00, Rack C-2',
      'Item Total, Bags 1,240, Amount ₹1,24,436.50',
    ]);
  });

  it('with no pinned column the one row carries the label, and nothing of it is hidden', () => {
    const table = draw(<RootTable columns={MONTH_COLUMNS} data={MONTHS} keyExtractor={rowKey} totals={MONTH_TOTALS} stickyFirstColumn={false} fillHeight={false} />);
    const parts = table.totalsParts();
    expect(parts).toHaveLength(1);
    expect(table.cells(parts[0])).toEqual(['Total', '5', '₹48,650', '₹18,000', '₹28,850']);
    expect(a11yOf(parts[0])).toEqual(CARRIES(MONTH_TOTALS_LABEL));
    expect(table.hidden()).toEqual([]);
  });

  it('reads the same on the three import paths, each in its own layout', () => {
    // components/: first column pinned. fiori/: none pinned. reports/: first column pinned, in a frame.
    const root = draw(<RootTable columns={MONTH_COLUMNS} data={MONTHS} keyExtractor={rowKey} totals={MONTH_TOTALS} />);
    expect(root.totalsParts().map(a11yOf)).toEqual([CARRIES(MONTH_TOTALS_LABEL), HIDDEN]);
    const fiori = draw(<FioriPathTable columns={MONTH_COLUMNS} data={MONTHS} keyExtractor={rowKey} totals={MONTH_TOTALS} />);
    expect(fiori.totalsParts().map(a11yOf)).toEqual([CARRIES(MONTH_TOTALS_LABEL)]);
    // As Invoice history draws its monthly table.
    const reports = draw(<ReportsPathTable columns={MONTH_COLUMNS} data={MONTHS} keyExtractor={rowKey} totals={MONTH_TOTALS} compact accessibilityLabel="Monthly breakdown" />);
    expect(reports.totalsParts().map(a11yOf)).toEqual([CARRIES(MONTH_TOTALS_LABEL), HIDDEN]);
  });

  it('leaves totals that are all custom content as they are drawn: nothing to name, so nothing grouped or hidden', () => {
    const custom = { name: <Text>All items</Text>, bags: <Text>1,240 bags</Text> };
    const table = draw(<RootTable columns={ITEM_COLUMNS} data={ITEMS} keyExtractor={rowKey} totals={custom} fillHeight={false} />);
    const parts = table.totalsParts();
    expect(parts.map(part => table.cells(part))).toEqual([['All items'], ['1,240 bags']]);
    expect(parts.map(a11yOf)).toEqual([UNGROUPED, UNGROUPED]);
    // The data rows are still one element each.
    expect(table.spoken()).toHaveLength(ITEMS.length);
    expect(table.hidden()).toHaveLength(ITEMS.length);
  });

  it('draws no totals row, and offers none, when the table has no totals', () => {
    const table = draw(<RootTable columns={ITEM_COLUMNS} data={ITEMS} keyExtractor={rowKey} fillHeight={false} />);
    expect(table.totalsParts()).toEqual([]);
    expect(table.spoken()).toEqual(['Item Potato, Bags 1,200, Amount ₹1,23,456.50, Rack B-14', 'Item Onion, Bags 40, Amount ₹980.00, Rack C-2']);
  });
});
