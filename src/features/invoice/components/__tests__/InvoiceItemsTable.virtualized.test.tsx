/**
 * The invoice items table is a virtualized list (review finding P2F-UI-1).
 * It mapped every group, and every line of an open group, into one view
 * inside the page's scroll view; a key press drew the whole table again.
 *
 * Now: one FlashList row per group and one per open table; an open table draws
 * 50 lines and 50 more on "Show more"; rows are memoized, so a key press draws
 * only what it changes; a cell that the list takes off the screen keeps its
 * typed text, cursor and error when it comes back.
 *
 * The FlashList stand-in draws a window of rows that the test sets (with the
 * window open it draws every row, like flashListMock). formatWeightEach (one
 * call per group drawn: the group's "50 kg each"; every group here has lots of
 * one weight) and formatDate (one call per line drawn) are the probes.
 * formatWeightEach is the export the table calls;
 * it reaches formatWeight inside the module, where a mock of that export is
 * not seen.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { InvoiceItemsTable } from '../InvoiceItemsTable';
import { formatDate, formatWeightEach } from '@/utils/formatters';
import { resetFlashListWindow, setFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import type { InvoiceItemData } from '@/types/invoice.types';

const mockInvoiceForm: { bulkPricing: Record<string, Partial<{ charge: number; labour_rate: number; tax: number }>> } = { bulkPricing: {} };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, invoiceForm: mockInvoiceForm }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/fiori', () => ({ InlineValidation: 'InlineValidation' }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('@/utils/formatters', () => {
  const actual = jest.requireActual('@/utils/formatters');
  return { ...actual, formatWeightEach: jest.fn(actual.formatWeightEach), formatDate: jest.fn(actual.formatDate) };
});

/** Day n after 1 Jan 2025 as YYYY-MM-DD: every line gets its own date. */
const day = (n: number) => {
  const date = new Date(Date.UTC(2025, 0, 1 + n));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

let lineNo = 0;
/** Group g: its own item, mark and weight. */
const line = (g: number, overrides: Partial<InvoiceItemData> = {}): InvoiceItemData => {
  const n = lineNo++;
  return {
    temp_id: `t${n}`, disp_trl_id: `dt${n}`, grn_item_id: `gi${g}`, item_id: `item-${g}`, item_name: `Fictional item ${g}`, qty: 10,
    grn_original_qty: 500, package_mark: `M${g}`, rack: 'A1', weight: 30 + g, dispatch_id: `d${n}`, dispatch_no: `D${String(n).padStart(4, '0')}`,
    dispatch_date: day(n), grn_id: 'g', grn_no: 'FX1', grn_date: '2025-01-01', duration: 1, no_of_days: 30,
    charge: 5, labour_rate: 2, tax: 5, amount: 50, labour_amount: 20, tax_amount: 3.5, item_total: 73.5,
    ...overrides,
  };
};
/** 40 groups of 10 lines, then group 40 with 100 lines: 500 lines, 41 groups. */
function fixture() {
  lineNo = 0;
  const items: InvoiceItemData[] = [];
  for (let g = 0; g < 40; g += 1) for (let i = 0; i < 10; i += 1) items.push(line(g));
  for (let i = 0; i < 100; i += 1) items.push(line(40));
  return items;
}
const BIG = 'item-40:::M40';

const list = (tree: ReactTestRenderer) => tree.root.findByType('FlashList' as never);
const rows = (tree: ReactTestRenderer) => list(tree).props.data as Array<{ type: string; key: string; groupKey: string }>;
const groupHeader = (tree: ReactTestRenderer, g: number) =>
  tree.root.find((node) => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button' &&
    String(node.props.accessibilityLabel ?? '').startsWith(`Fictional item ${g}, mark M${g},`));
const field = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label);
const shownErrors = (tree: ReactTestRenderer) =>
  tree.root.findAllByType('InlineValidation' as never).filter((node) => node.props.visible && node.props.message).map((node) => node.props.message);
const datesDrawn = () => jest.mocked(formatDate).mock.calls.map(([date]) => date);
const weightsDrawn = () => jest.mocked(formatWeightEach).mock.calls.map(([weight]) => weight);

async function render(items: InvoiceItemData[], props: Partial<React.ComponentProps<typeof InvoiceItemsTable>> = {}) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceItemsTable items={items} onItemUpdate={jest.fn()} onBulkEdit={jest.fn()} {...props} />);
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoiceForm.bulkPricing = {};
  resetFlashListWindow();
});

describe('the invoice items table as a list', () => {
  it('gives the list one row per group and draws no line while every group is closed', async () => {
    const tree = await render(fixture());

    const data = rows(tree);
    expect(data).toHaveLength(41);
    expect(data.every((row) => row.type === 'group')).toBe(true);
    const keys = data.map((row, index) => list(tree).props.keyExtractor(row, index));
    expect(new Set(keys).size).toBe(41);
    expect(data.map((row, index) => list(tree).props.getItemType(row, index))).toEqual(Array(41).fill('group'));
    expect(formatDate).not.toHaveBeenCalled();
    // Each group was drawn once: 41 group weights.
    expect(new Set(weightsDrawn()).size).toBe(41);
  });

  it('opens a group as one more row with 50 lines, and "Show more" adds the next 50', async () => {
    const tree = await render(fixture());
    jest.mocked(formatWeightEach).mockClear();

    await act(async () => { groupHeader(tree, 40).props.onPress(); });

    expect(rows(tree)).toHaveLength(42);
    expect(rows(tree)[41]).toMatchObject({ type: 'table', groupKey: BIG });
    expect(list(tree).props.getItemType(rows(tree)[41], 41)).toBe('table');
    expect(new Set(datesDrawn()).size).toBe(50);
    expect(datesDrawn()).toHaveLength(50);
    // The other groups were not drawn again.
    expect(weightsDrawn().filter((weight) => weight !== 70)).toEqual([]);

    const more = tree.root.find((node) => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button' &&
      node.findAllByType('Text' as never).some((text) => text.props.children === 'Show more'));
    jest.mocked(formatDate).mockClear();
    await act(async () => { more.props.onPress(); });

    // Only the 50 new lines are drawn; the first 50 are not drawn again.
    expect(datesDrawn()).toHaveLength(50);
    expect(tree.root.findAll((node) => node.props.accessibilityHint === 'Edits the value' && typeof node.props.onPress === 'function'))
      .toHaveLength(100 * 3);
    // All 100 lines are drawn now: no "Show more" left.
    expect(tree.root.findAll((node) => node.props.children === 'Show more')).toHaveLength(0);
  });

  it('a group rate key press, and the lines it changes, draw that group alone again', async () => {
    const items = fixture();
    const onBulkEdit = jest.fn();
    const tree = await render(items, { onBulkEdit });
    jest.mocked(formatWeightEach).mockClear();

    await act(async () => { field(tree, 'Storage charge for Fictional item 7')!.props.onChangeText('6'); });
    expect(onBulkEdit).toHaveBeenLastCalledWith('item-7:::M7', { charge: 6 });

    // The form applies it: group 7's lines are new objects, every other line is the same object.
    mockInvoiceForm.bulkPricing = { 'item-7:::M7': { charge: 6 } };
    const next = items.map((item) => (item.item_id === 'item-7' ? { ...item, charge: 6, amount: 60, item_total: 83.5 } : item));
    await act(async () => {
      tree.update(<InvoiceItemsTable items={next} onItemUpdate={jest.fn()} onBulkEdit={onBulkEdit} />);
    });

    expect(weightsDrawn().length).toBeGreaterThan(0);
    expect(new Set(weightsDrawn())).toEqual(new Set([37]));
    expect(formatDate).not.toHaveBeenCalled();
    expect(field(tree, 'Storage charge for Fictional item 7')!.props.value).toBe('6');
  });

  it('a cell that scrolls off and back keeps its refused text, its cursor and its error', async () => {
    const onInputErrorChange = jest.fn();
    const tree = await render(fixture(), { onInputErrorChange });
    const CELL = 'Charge, dispatch D0000';

    await act(async () => { groupHeader(tree, 0).props.onPress(); });
    await act(async () => {
      tree.root.find((node) => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel ?? '').startsWith(CELL)).props.onPress();
    });
    expect(field(tree, CELL)!.props.autoFocus).toBe(true);
    await act(async () => { field(tree, CELL)!.props.onFocus?.(); });
    await act(async () => { field(tree, CELL)!.props.onChangeText('12.3.4'); });
    await act(async () => { field(tree, CELL)!.props.onSelectionChange({ nativeEvent: { selection: { start: 3, end: 3 } } }); });
    expect(onInputErrorChange).toHaveBeenLastCalledWith(true);
    const errorShown = shownErrors(tree);
    expect(errorShown).toHaveLength(1);
    const callsBefore = onInputErrorChange.mock.calls.length;

    // Scroll so that only group 0's own row is drawn: its table (and the cell) unmount.
    await act(async () => { setFlashListWindow(0, 1); });
    expect(field(tree, CELL)).toBeUndefined();
    // And back.
    await act(async () => { setFlashListWindow(); });

    const cell = field(tree, CELL)!;
    expect(cell.props.value).toBe('12.3.4');
    expect(cell.props.selection).toEqual({ start: 3, end: 3 });
    // It had the focus once; drawn again it does not take it again.
    expect(cell.props.autoFocus).toBe(false);
    expect(shownErrors(tree)).toEqual(errorShown);
    // The step was held the whole time.
    expect(onInputErrorChange.mock.calls.slice(callsBefore).some(([hasError]) => hasError === false)).toBe(false);
    expect(onInputErrorChange).toHaveBeenLastCalledWith(true);

    // Leaving the cell ends the text and the error, as before.
    await act(async () => { field(tree, CELL)!.props.onBlur(); });
    expect(shownErrors(tree)).toEqual([]);
    expect(onInputErrorChange).toHaveBeenLastCalledWith(false);
  });

  it('a line that leaves the invoice takes its refused text and error with it', async () => {
    const onInputErrorChange = jest.fn();
    const items = fixture();
    const tree = await render(items, { onInputErrorChange });
    const CELL = 'Charge, dispatch D0000';
    await act(async () => { groupHeader(tree, 0).props.onPress(); });
    await act(async () => {
      tree.root.find((node) => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel ?? '').startsWith(CELL)).props.onPress();
    });
    await act(async () => { field(tree, CELL)!.props.onChangeText('-5'); });
    expect(onInputErrorChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      tree.update(<InvoiceItemsTable items={items.slice(1)} onItemUpdate={jest.fn()} onBulkEdit={jest.fn()} onInputErrorChange={onInputErrorChange} />);
    });

    expect(onInputErrorChange).toHaveBeenLastCalledWith(false);
    expect(shownErrors(tree)).toEqual([]);
  });

  it('puts the screen content above and below the groups, and the empty state when there is no line', async () => {
    const header = <TextInput accessibilityLabel="fixture header" />;
    const footer = <TextInput accessibilityLabel="fixture footer" />;
    const tree = await render(fixture(), { ListHeaderComponent: header, ListFooterComponent: footer, contentContainerStyle: { padding: 8, gap: 16 } });
    expect(field(tree, 'fixture header')).toBeDefined();
    expect(field(tree, 'fixture footer')).toBeDefined();
    // The page's gap is left out of the list's content (the list spaces its rows itself).
    expect(list(tree).props.contentContainerStyle).toEqual({ padding: 8 });
    expect(list(tree).props).toMatchObject({ keyboardShouldPersistTaps: 'handled', extraScrollHeight: 120, enableAutomaticScroll: true });

    const empty = await render([]);
    expect(empty.root.findAll((node) => node.props.children === 'Nothing to invoice' || node.props.children === 'Items from the selected dispatches appear here.').length).toBeGreaterThan(0);
  });
});
