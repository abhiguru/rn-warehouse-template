/**
 * The invoice's Items tab as one table: a row per GRN lot (Item | Bags | Amount) with its
 * rates, opening to its dispatch lines; totals that add the rows; links; large text; states.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { resetScreenReaderKnown } from '@/hooks/useScreenReader';
import { InvoiceLineItemsTab, type InvoiceLineItem } from '../InvoiceLineItemsTab';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({ invoiceForm: { items: [], editedItems: {}, bulkPricing: {}, header: {} } }), subscribe: () => () => undefined, dispatch: jest.fn() }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
let mockFontScale = 1;
let mockWidth = 360;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const line = (over: Partial<InvoiceLineItem> & { id: string }): InvoiceLineItem => ({
  item_name: 'Cumin Seed',
  charge: 9,
  charge_per_unit: 9,
  labour_rate: 3,
  tax: 5,
  grn_id: 'grn-1',
  gr_no: 'BIG001',
  grn_item_id: 'lot-cumin',
  package_mark: 'CS/1',
  weight: 50,
  dispatch_id: `d-${over.id}`,
  dispatch_no: `BDG0${over.id}`,
  dispatch_date: '2026-05-10',
  dispatch_qty: 10,
  no_of_days: 35,
  duration: '1.5',
  // The server's amounts: base 9 × 10 × 1.5 + 3 × 10 = 165, tax 8.25.
  server_tax_amount: 8.25,
  server_total_amount: 173.25,
  ...over,
});

const cumin1 = line({ id: '01' });
const cumin2 = line({ id: '02', dispatch_qty: 20, dispatch_date: '2026-06-01', no_of_days: 57, duration: '2', server_tax_amount: 21, server_total_amount: 441 });
const pepper = line({ id: '03', item_name: 'Black Pepper', grn_item_id: 'lot-pepper', package_mark: '', weight: 25, charge: 12, charge_per_unit: 12, labour_rate: 0, tax: 0, dispatch_qty: 5, server_tax_amount: 0, server_total_amount: 90 });

const draw = (element: React.ReactElement) => render(<GestureHandlerRootView>{element}</GestureHandlerRootView>);
beforeEach(() => {
  resetScreenReaderKnown();
  // No screen reader unless a test turns one on.
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => {
  mockFontScale = 1;
  mockWidth = 360;
  setLanguage('en');
  resetScreenReaderKnown();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

type Node = Parameters<typeof within>[0];
/** The texts drawn inside an element (or on the whole screen), joined by "|". */
const textOf = (node?: Node): string =>
  // A no-break space keeps a number with its unit on screen; read it as a space here.
  (node ? within(node) : screen)
    .queryAllByText(/[\s\S]*/, { includeHiddenElements: true })
    .map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' '))
    .join('|');
// Rows, tables and totals have no role: they are found by test id.
const byTestId = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });
const has = (id: string) => screen.queryByTestId(id, { includeHiddenElements: true }) !== null;
const press = (id: string) => userEvent.press(byTestId(id));
/** The width of the column a cell is in: the column's view (the cell itself, in a totals row). */
const columnWidth = (node: Node): number | undefined => {
  for (let n: Node | null = node; n; n = n.parent) {
    const width = (StyleSheet.flatten(n.props.style) as { width?: unknown } | undefined)?.width;
    if (typeof width === 'number') return width;
  }
  return undefined;
};

describe('invoice Items table', () => {
  it('heads Item, Bags, Amount and shows one row per lot with its mark, weight and rates', async () => {
    await draw(<InvoiceLineItemsTab items={[cumin1, pepper, cumin2]} />);

    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Bags\|Amount\|/);
    expect(textOf(byTestId('invoice-group-row-lot-cumin'))).toBe('Cumin Seed|CS/1 · 50 kg each|Rate ₹9.00 · Labour ₹3.00 · Tax 5%|30|₹614.25');
    // No labour and no tax: only the rate.
    expect(textOf(byTestId('invoice-group-row-lot-pepper'))).toBe('Black Pepper|25 kg each|Rate ₹12.00|5|₹90.00');
  });

  it('starts closed with several lots and opens a lot to its dispatch lines', async () => {
    await draw(<InvoiceLineItemsTab items={[cumin1, pepper, cumin2]} />);

    expect(has('invoice-group-lines-lot-cumin')).toBe(false);
    await press('invoice-group-row-lot-cumin');
    expect(textOf(byTestId('invoice-group-lines-lot-cumin'))).toBe(
      // The lines are the Items step's sideways table without editing: the headings and the swipe hint, the pinned
      // Dispatch column, then one row of Date | Months | Days | Qty | Charge | Labour | Tax | Amount per line.
      'Dispatch|Date|Months|Days|Qty|Charge (₹)|Labour (₹)|Tax (%)|Amount|◂|▸|Swipe the table sideways to see more|BDG001|BDG002|10/05/26|1.5|35|10|9.00|3.00|5|₹173.25|01/06/26|2|57|20|9.00|3.00|5|₹441.00|◂|▸|Before tax ₹585.00 · Tax ₹29.25'
    );
    expect(byTestId('invoice-group-row-lot-cumin')).toBeExpanded();
  });

  it('starts open when the invoice has one lot', async () => {
    await draw(<InvoiceLineItemsTab items={[cumin1, cumin2]} />);
    expect(has('invoice-group-lines-lot-cumin')).toBe(true);
  });

  it('opens a dispatch by its id, and the GRN by its id', async () => {
    const onDispatch = jest.fn();
    const onGrn = jest.fn();
    await draw(<InvoiceLineItemsTab items={[cumin1, cumin2]} on_view_dispatch={onDispatch} on_view_grn={onGrn} />);

    await press('invoice-line-link-02');
    expect(onDispatch).toHaveBeenCalledWith('d-02');
    await press('invoice-lines-view-grn');
    expect(onGrn).toHaveBeenCalledWith('grn-1');
    expect(textOf(byTestId('invoice-lines-view-grn'))).toBe('View GRN BIG001');
  });

  it('does not link a line without a dispatch id', async () => {
    await draw(<InvoiceLineItemsTab items={[line({ id: '09', dispatch_id: undefined })]} on_view_dispatch={jest.fn()} />);
    expect(byTestId('invoice-line-link-09')).toBeDisabled();
  });

  it('shows the rate and labour of a lot only when every line of it agrees', async () => {
    const cheaper = line({ id: '02', charge: 8, charge_per_unit: 8, labour_rate: 2 });
    await draw(<InvoiceLineItemsTab items={[cumin1, cheaper, pepper]} />);

    // The two cumin lines differ in charge and labour: no Rate, no Labour (the first line's figures would be wrong).
    expect(textOf(byTestId('invoice-group-row-lot-cumin'))).toBe('Cumin Seed|CS/1 · 50 kg each|Tax 5%|20|₹346.50');
    // The pepper lot has one line: its rate shows.
    expect(textOf(byTestId('invoice-group-row-lot-pepper'))).toBe('Black Pepper|25 kg each|Rate ₹12.00|5|₹90.00');
  });

  it('draws a long lot in steps until every line is there', async () => {
    jest.useFakeTimers();
    const many = Array.from({ length: 130 }, (_, i) => line({ id: String(100 + i) }));
    await draw(<InvoiceLineItemsTab items={many} />);

    const count = () => screen.queryAllByTestId(/^invoice-line-link-/).length;
    expect(count()).toBe(40);
    for (let i = 0; i < 4 && count() < 130; i += 1) await act(async () => { jest.advanceTimersByTime(50); });
    expect(count()).toBe(130);
  });

  it('keeps the height of a long lot while its rows are still being drawn', async () => {
    jest.useFakeTimers();
    const many = Array.from({ length: 130 }, (_, i) => line({ id: String(100 + i) }));
    await draw(<InvoiceLineItemsTab items={many} />);

    // Before any timer runs: 40 rows drawn, the other 90 are a spacer of the same total height.
    const rowHeight = StyleSheet.flatten(byTestId('invoice-line-100').props.style).height as number;
    const spacer = StyleSheet.flatten(byTestId('invoice-lines-spacer-lot-cumin').props.style).height as number;
    const rows = screen.queryAllByTestId(/^invoice-line-\d+$/).length;
    expect(rows).toBe(40);
    expect(rows * rowHeight + spacer).toBe(130 * rowHeight);
    for (let i = 0; i < 4; i += 1) await act(async () => { jest.advanceTimersByTime(50); });
    expect(has('invoice-lines-spacer-lot-cumin')).toBe(false);
  });

  it('with a screen reader on, a line without a dispatch id is an accessible view, not a disabled link', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await draw(<InvoiceLineItemsTab items={[line({ id: '09', dispatch_id: undefined })]} on_view_dispatch={jest.fn()} />);
    const overlay = byTestId('invoice-line-overlay-09');
    expect(overlay).toHaveProp('accessible', true);
    expect(overlay).toHaveAccessibleName(/BDG009/);
    expect(screen.queryByRole('link', { name: /BDG009/ })).not.toBeOnTheScreen();
    expect(overlay).toBeEnabled();
  });

  it('shows no Labour on the summary of a one-time lot', async () => {
    await draw(<InvoiceLineItemsTab items={[line({ id: '01', one_time: true })]} />);
    expect(textOf(byTestId('invoice-group-row-lot-cumin'))).toBe('Cumin Seed|CS/1 · 50 kg each|Rate ₹9.00 · Tax 5%|10|₹173.25');
  });

  it('shows the Rate but no Labour when the charge agrees and the labour differs', async () => {
    await draw(<InvoiceLineItemsTab items={[cumin1, line({ id: '02', labour_rate: 2 })]} />);
    const summary = textOf(byTestId('invoice-group-row-lot-cumin'));
    expect(summary).toContain('Rate ₹9.00');
    expect(summary).not.toContain('Labour');
  });

  it('with a screen reader on, puts a Pressable link over each line that opens the dispatch', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const onDispatch = jest.fn();
    await draw(<InvoiceLineItemsTab items={[cumin1, cumin2]} on_view_dispatch={onDispatch} />);

    const overlay = byTestId('invoice-line-overlay-02');
    expect(screen.getByRole('link', { name: /BDG002/ })).toBe(overlay);
    expect(overlay).toHaveAccessibleName(/BDG002/);
    // It takes touches (a view that ignores them gets no hover events on Android).
    expect(overlay.props.pointerEvents).toBeUndefined();
    await userEvent.press(overlay);
    expect(onDispatch).toHaveBeenCalledWith('d-02');
  });

  it('has no overlay when no screen reader is on', async () => {
    await draw(<InvoiceLineItemsTab items={[cumin1, cumin2]} />);
    expect(has('invoice-line-overlay-01')).toBe(false);
  });

  it('keeps two lots of one item apart and lines without a lot id each on their own', async () => {
    const otherLot = line({ id: '04', grn_item_id: 'lot-cumin-2', package_mark: 'CS/2' });
    const loose1 = line({ id: '05', grn_item_id: undefined });
    const loose2 = line({ id: '06', grn_item_id: undefined });
    await draw(<InvoiceLineItemsTab items={[cumin1, otherLot, loose1, loose2]} />);

    expect(has('invoice-group-row-lot-cumin')).toBe(true);
    expect(has('invoice-group-row-lot-cumin-2')).toBe(true);
    expect(has('invoice-group-row-line:05')).toBe(true);
    expect(has('invoice-group-row-line:06')).toBe(true);
  });

  it('totals the rows: items, dispatch lines, bags and amount, with the note about the invoice total', async () => {
    await draw(<InvoiceLineItemsTab items={[cumin1, pepper, cumin2]} />);

    expect(textOf(byTestId('invoice-lines-total'))).toBe('Total|2 items · 3 dispatch lines|35|₹704.25');
    expect(byTestId('invoice-lines-total')).toHaveAccessibleName('Total: 2 items, 3 dispatch lines, 35 bags, ₹704.25');
    expect(screen.getByText(/^Line totals with tax, before the invoice's rounding and discount/)).toBeOnTheScreen();
    expect(byTestId('invoice-lines-note')).toHaveTextContent(/^Line totals with tax, before the invoice's rounding and discount/);
  });

  it('keeps one width per column, so Bags and Amount line up from row to row and with their headings', async () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    await draw(<InvoiceLineItemsTab items={[cumin1, pepper, cumin2]} />);

    const widthOf = (id: string, text: string) =>
      columnWidth(within(byTestId(id)).getAllByText(text)[0]);
    expect(widthOf('invoice-group-row-lot-pepper', '₹90.00')).toEqual(expect.any(Number));
    expect(widthOf('invoice-group-row-lot-cumin', '₹614.25')).toBe(widthOf('invoice-group-row-lot-pepper', '₹90.00'));
    expect(widthOf('invoice-lines-total', '₹704.25')).toBe(widthOf('invoice-group-row-lot-pepper', '₹90.00'));
    expect(widthOf('invoice-group-row-lot-cumin', '30')).toBe(widthOf('invoice-lines-total', '35'));
  });

  it('keeps three columns at the design edge, ₹99,999.00 and 9,999 bags, at font scale 1.3 on a 411 dp phone', async () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    const rai = (id: string, qty: number, total: number) =>
      line({ id, item_name: 'Rai', grn_item_id: 'lot-rai', package_mark: '', charge: 4.3, charge_per_unit: 4.3, labour_rate: 1.65, tax: 0, dispatch_qty: qty, server_tax_amount: 0, server_total_amount: total });
    await draw(<InvoiceLineItemsTab items={[rai('1', 5000, 49999.5), rai('2', 4999, 49999.49)]} />);

    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Bags\|Amount\|/);
    expect(textOf(byTestId('invoice-lines-total'))).toBe('Total|1 item · 2 dispatch lines|9,999|₹99,998.99');
    // The amount column keeps the width it has for the design edge (84 dp × 1.3): nothing widens it.
    const total = within(byTestId('invoice-lines-total')).getByText('₹99,998.99');
    expect(StyleSheet.flatten(total.props.style).width).toBe(Math.ceil(84 * 1.3));
  });

  it('beyond the design range (₹12 crore), keeps the item rows as they are and the lines in the same sideways table', async () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    const onion = (id: string, qty: number, total: number, tax: number) =>
      line({ id, item_name: 'Big Qty Onion', grn_item_id: 'lot-onion', package_mark: 'BQ-1', dispatch_no: `WWDG880${id}`, dispatch_qty: qty, server_total_amount: total, server_tax_amount: tax });
    await draw(<InvoiceLineItemsTab items={[onion('1', 50000, 61917550, 9445050), onion('2', 49999, 63389807.18, 9669631.6)]} />);

    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Amount\|/);
    expect(textOf(byTestId('invoice-lines-total'))).toBe('Total|1 item · 2 dispatch lines|99,999 bags|₹12,53,07,357.18');
    // The lines do not stack: each column is as wide as its widest text, and the table scrolls sideways.
    expect(textOf(byTestId('invoice-group-lines-lot-onion'))).toMatch(
      /^Dispatch\|Date\|Months\|Days\|Qty\|Charge \(₹\)\|Labour \(₹\)\|Tax \(%\)\|Amount\|◂\|▸\|Swipe the table sideways to see more\|WWDG8801\|WWDG8802\|10\/05\/26\|1.5\|35\|50,000\|9.00\|3.00\|5\|₹6,19,17,550.00\|/
    );
    const number = within(byTestId('invoice-group-lines-lot-onion')).getByText('WWDG8801');
    expect(number.props.numberOfLines).toBe(1);
  });

  it('beyond the design range at font scale 2.0, puts the amount of the item on its own line, right-aligned; the lines keep their table', async () => {
    mockFontScale = 2;
    mockWidth = 411;
    const onion = (id: string, qty: number, total: number, tax: number) =>
      line({ id, item_name: 'Big Qty Onion', grn_item_id: 'lot-onion', package_mark: 'BQ-1', dispatch_no: `WWDG880${id}`, dispatch_qty: qty, server_total_amount: total, server_tax_amount: tax });
    await draw(<InvoiceLineItemsTab items={[onion('1', 50000, 3548260, 541260), onion('2', 49999, 2782583.08, 424461.83)]} />);

    const row = byTestId('invoice-group-row-lot-onion');
    const amount = within(row).getByText('₹63,30,843.08');
    // In the item's column (no fixed width), right-aligned like the other numbers.
    expect(StyleSheet.flatten(amount.props.style)).toMatchObject({ textAlign: 'right' });
    expect(StyleSheet.flatten(amount.props.style).width).toBeUndefined();
    expect(textOf(byTestId('invoice-group-lines-lot-onion'))).toMatch(
      /^Dispatch\|Date\|Months\|Days\|Qty\|Charge \(₹\)\|Labour \(₹\)\|Tax \(%\)\|Amount\|◂\|▸\|Swipe the table sideways to see more\|WWDG8801\|WWDG8802\|10\/05\/26\|1.5\|35\|50,000\|9.00\|3.00\|5\|₹35,48,260.00\|/
    );
  });

  it('moves the bags under the item at large text; the lines keep their table', async () => {
    mockFontScale = 2;
    await draw(<InvoiceLineItemsTab items={[cumin1, cumin2]} />);

    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Amount\|/);
    expect(textOf(byTestId('invoice-group-row-lot-cumin'))).toBe('Cumin Seed|CS/1 · 50 kg each|Rate ₹9.00 · Labour ₹3.00 · Tax 5% · 30 bags|₹614.25');
    expect(textOf(byTestId('invoice-group-lines-lot-cumin'))).toMatch(/^Dispatch\|Date\|Months\|Days\|Qty\|Charge \(₹\)\|Labour \(₹\)\|Tax \(%\)\|Amount\|◂\|▸\|Swipe the table sideways to see more\|BDG001\|BDG002\|10\/05\/26\|1.5\|35\|10\|9.00\|3.00\|5\|₹173.25\|/);
  });

  it('writes the totals in Gujarati', async () => {
    setLanguage('gu');
    await draw(<InvoiceLineItemsTab items={[cumin1, cumin2]} />);
    expect(textOf(byTestId('invoice-lines-total'))).toBe('કુલ|૧ આઇટમ · જાવકની ૨ નોંધ|૩૦|₹૬૧૪.૨૫');
  });

  it('keeps the empty and loading states', async () => {
    await draw(<InvoiceLineItemsTab items={[]} />);
    expect(textOf()).toMatch(/^No line items\|/);
    await screen.unmount();
    await draw(<InvoiceLineItemsTab items={[]} loading />);
    expect(textOf()).toBe('Loading items…');
  });
});

describe('invoice Items table counts in the lots\' packaging (D18)', () => {
  const boxed = line({ id: '04', item_name: 'Fresh Figs', grn_item_id: 'lot-figs', packaging: 'Box', dispatch_qty: 3 });

  it('a Box invoice heads the column Boxes and reads "boxes" in the total and the row label', async () => {
    await draw(<InvoiceLineItemsTab items={[boxed]} />);

    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Boxes\|Amount\|/);
    expect(byTestId('invoice-group-row-lot-figs')).toHaveAccessibleName(new RegExp('3 boxes'));
    expect(byTestId('invoice-lines-total')).toHaveAccessibleName(new RegExp('3 boxes'));
  });

  it('lots counted in different things are "units"; plain bag lots stay bags', async () => {
    await draw(<InvoiceLineItemsTab items={[boxed, cumin1]} />);
    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Units\|Amount\|/);
    expect(byTestId('invoice-lines-total')).toHaveAccessibleName(new RegExp('13 units'));
    await screen.unmount();

    await draw(<InvoiceLineItemsTab items={[cumin1]} />);
    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Bags\|Amount\|/);
    expect(byTestId('invoice-lines-total')).toHaveAccessibleName(new RegExp('10 bags'));
  });
});
