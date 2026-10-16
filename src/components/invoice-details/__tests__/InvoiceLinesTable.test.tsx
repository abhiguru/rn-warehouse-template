/**
 * The invoice's Items tab as one table: a row per GRN lot (Item | Bags | Amount) with its
 * rates, opening to its dispatch lines; totals that add the rows; links; large text; states.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { InvoiceLineItemsTab, type InvoiceLineItem } from '../InvoiceLineItemsTab';

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
  // A no-break space keeps a number with its unit on screen; read it as a space here.
  node.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' ')).join('|');
const byTestId = (id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string')[0];
const has = (id: string) => tree.root.findAll((n) => n.props.testID === id).length > 0;
const press = (id: string) => act(() => byTestId(id).props.onPress());

describe('invoice Items table', () => {
  it('heads Item, Bags, Amount and shows one row per lot with its mark, weight and rates', () => {
    render(<InvoiceLineItemsTab items={[cumin1, pepper, cumin2]} />);

    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Bags\|Amount\|/);
    expect(textOf(byTestId('invoice-group-row-lot-cumin'))).toBe('Cumin Seed|CS/1 · 50 kg each|Rate ₹9.00 · Labour ₹3.00 · Tax 5%|30|₹614.25');
    // No labour and no tax: only the rate.
    expect(textOf(byTestId('invoice-group-row-lot-pepper'))).toBe('Black Pepper|25 kg each|Rate ₹12.00|5|₹90.00');
  });

  it('starts closed with several lots and opens a lot to its dispatch lines', () => {
    render(<InvoiceLineItemsTab items={[cumin1, pepper, cumin2]} />);

    expect(has('invoice-group-lines-lot-cumin')).toBe(false);
    press('invoice-group-row-lot-cumin');
    expect(textOf(byTestId('invoice-group-lines-lot-cumin'))).toBe(
      // The tax of a line sits under its period, so the amount column holds only amounts.
      'Dispatch|Bags|Amount|BDG001|10 May|35 days · 1.5 months|incl. ₹8.25 tax|10|₹173.25|BDG002|1 Jun|57 days · 2 months|incl. ₹21.00 tax|20|₹441.00|Before tax ₹585.00 · Tax ₹29.25'
    );
    expect(byTestId('invoice-group-row-lot-cumin').props.accessibilityState).toEqual({ expanded: true });
  });

  it('starts open when the invoice has one lot', () => {
    render(<InvoiceLineItemsTab items={[cumin1, cumin2]} />);
    expect(has('invoice-group-lines-lot-cumin')).toBe(true);
  });

  it('opens a dispatch by its id, and the GRN by its id', () => {
    const onDispatch = jest.fn();
    const onGrn = jest.fn();
    render(<InvoiceLineItemsTab items={[cumin1, cumin2]} on_view_dispatch={onDispatch} on_view_grn={onGrn} />);

    press('invoice-line-02');
    expect(onDispatch).toHaveBeenCalledWith('d-02');
    press('invoice-lines-view-grn');
    expect(onGrn).toHaveBeenCalledWith('grn-1');
    expect(textOf(byTestId('invoice-lines-view-grn'))).toBe('View GRN BIG001');
  });

  it('does not link a line without a dispatch id', () => {
    render(<InvoiceLineItemsTab items={[line({ id: '09', dispatch_id: undefined })]} on_view_dispatch={jest.fn()} />);
    expect(byTestId('invoice-line-09').props.disabled).toBe(true);
  });

  it('keeps two lots of one item apart and lines without a lot id each on their own', () => {
    const otherLot = line({ id: '04', grn_item_id: 'lot-cumin-2', package_mark: 'CS/2' });
    const loose1 = line({ id: '05', grn_item_id: undefined });
    const loose2 = line({ id: '06', grn_item_id: undefined });
    render(<InvoiceLineItemsTab items={[cumin1, otherLot, loose1, loose2]} />);

    expect(has('invoice-group-row-lot-cumin')).toBe(true);
    expect(has('invoice-group-row-lot-cumin-2')).toBe(true);
    expect(has('invoice-group-row-line:05')).toBe(true);
    expect(has('invoice-group-row-line:06')).toBe(true);
  });

  it('totals the rows: items, dispatch lines, bags and amount, with the note about the invoice total', () => {
    render(<InvoiceLineItemsTab items={[cumin1, pepper, cumin2]} />);

    expect(textOf(byTestId('invoice-lines-total'))).toBe('Total|2 items · 3 dispatch lines|35|₹704.25');
    expect(byTestId('invoice-lines-total').props.accessibilityLabel).toBe('Total: 2 items, 3 dispatch lines, 35 bags, ₹704.25');
    expect(textOf(byTestId('invoice-lines-note'))).toMatch(/^Line totals with tax, before the invoice's rounding and discount/);
  });

  it('keeps one width per column, so Bags and Amount line up from row to row and with their headings', () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    render(<InvoiceLineItemsTab items={[cumin1, pepper, cumin2]} />);

    const widthOf = (id: string, text: string) =>
      StyleSheet.flatten(byTestId(id).findAll((n) => (n.type as unknown) === 'Text' && n.props.children === text)[0].props.style).width;
    expect(widthOf('invoice-group-row-lot-cumin', '₹614.25')).toBe(widthOf('invoice-group-row-lot-pepper', '₹90.00'));
    expect(widthOf('invoice-lines-total', '₹704.25')).toBe(widthOf('invoice-group-row-lot-pepper', '₹90.00'));
    expect(widthOf('invoice-group-row-lot-cumin', '30')).toBe(widthOf('invoice-lines-total', '35'));
  });

  it('moves the bags under the item when huge amounts would squeeze the item column, and the lines too', () => {
    mockFontScale = 1.3;
    mockWidth = 411;
    const onion = (id: string, qty: number, total: number, tax: number) =>
      line({ id, item_name: 'Big Qty Onion', grn_item_id: 'lot-onion', package_mark: 'BQ-1', dispatch_no: `WWDG880${id}`, dispatch_qty: qty, server_total_amount: total, server_tax_amount: tax });
    render(<InvoiceLineItemsTab items={[onion('1', 500000, 619175500, 94450500), onion('2', 487654, 618258225.76, 94310576.81)]} />);

    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Amount\|/);
    expect(textOf(byTestId('invoice-lines-total'))).toBe('Total|1 item · 2 dispatch lines|9,87,654 bags|₹1,23,74,33,725.76');
    // The lines stack too: the bags join the period, the dispatch number keeps its own line.
    expect(textOf(byTestId('invoice-group-lines-lot-onion'))).toMatch(
      /^Dispatch\|Amount\|WWDG8801\|10 May\|35 days · 1.5 months · 5,00,000 bags\|incl. ₹9,44,50,500.00 tax\|₹61,91,75,500.00\|/
    );
    const number = byTestId('invoice-group-lines-lot-onion').findAll((n) => (n.type as unknown) === 'Text' && n.props.children === 'WWDG8801')[0];
    expect(number.props.numberOfLines).toBe(1);
  });

  it('at font scale 2.0 puts a huge amount on its own line under the item, right-aligned, so the item keeps its words', () => {
    mockFontScale = 2;
    mockWidth = 411;
    const onion = (id: string, qty: number, total: number, tax: number) =>
      line({ id, item_name: 'Big Qty Onion', grn_item_id: 'lot-onion', package_mark: 'BQ-1', dispatch_no: `WWDG880${id}`, dispatch_qty: qty, server_total_amount: total, server_tax_amount: tax });
    render(<InvoiceLineItemsTab items={[onion('1', 500000, 619175500, 94450500), onion('2', 487654, 618258225.76, 94310576.81)]} />);

    const row = byTestId('invoice-group-row-lot-onion');
    const amount = row.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === '₹1,23,74,33,725.76')[0];
    // In the item's column (no fixed width), right-aligned like the other numbers.
    expect(StyleSheet.flatten(amount.props.style)).toMatchObject({ textAlign: 'right' });
    expect(StyleSheet.flatten(amount.props.style).width).toBeUndefined();
    const lineAmount = byTestId('invoice-group-lines-lot-onion').findAll(
      (n) => (n.type as unknown) === 'Text' && n.props.children === '₹61,91,75,500.00'
    )[0];
    expect(StyleSheet.flatten(lineAmount.props.style).width).toBeUndefined();
    expect(textOf(byTestId('invoice-group-lines-lot-onion'))).toMatch(
      /^Dispatch\|Amount\|WWDG8801\|10 May\|35 days · 1.5 months · 5,00,000 bags\|incl. ₹9,44,50,500.00 tax\|₹61,91,75,500.00\|/
    );
  });

  it('moves the bags under the item and the lines at large text', () => {
    mockFontScale = 2;
    render(<InvoiceLineItemsTab items={[cumin1, cumin2]} />);

    expect(textOf(byTestId('invoice-lines-table'))).toMatch(/^Item\|Amount\|/);
    expect(textOf(byTestId('invoice-group-row-lot-cumin'))).toBe('Cumin Seed|CS/1 · 50 kg each|Rate ₹9.00 · Labour ₹3.00 · Tax 5% · 30 bags|₹614.25');
    expect(textOf(byTestId('invoice-group-lines-lot-cumin'))).toMatch(/^Dispatch\|Amount\|BDG001\|10 May\|35 days · 1.5 months · 10 bags\|incl. ₹8.25 tax\|₹173.25\|/);
  });

  it('writes the totals in Gujarati', () => {
    setLanguage('gu');
    render(<InvoiceLineItemsTab items={[cumin1, cumin2]} />);
    expect(textOf(byTestId('invoice-lines-total'))).toBe('કુલ|૧ આઇટમ · જાવકની ૨ નોંધ|૩૦|₹૬૧૪.૨૫');
  });

  it('keeps the empty and loading states', () => {
    render(<InvoiceLineItemsTab items={[]} />);
    expect(textOf(tree.root)).toMatch(/^No line items\|/);
    act(() => tree.unmount());
    render(<InvoiceLineItemsTab items={[]} loading />);
    expect(textOf(tree.root)).toBe('Loading items…');
  });
});
