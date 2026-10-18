/**
 * Invoice Review step, ITEMS: one row per item group (Item | Qty | Amount) and a Total row that is the sum of the
 * rows. The edge-case shapes of the Dev test GRNs (seed/manifest.md): 125 lines in one group, groups of one item with
 * different marks, two lots of one item and mark as one group, a ₹99,999.00 line and 9,999 bags.
 */
import React from 'react';
import { Dimensions, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { InvoiceReviewItemsTable } from '@/features/invoice/components/review/InvoiceReviewItemsTable';
import { groupLines, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import type { InvoiceItemData } from '@/types/invoice.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const before = Dimensions.get('window');
const setWindow = (width: number, fontScale: number) => act(() => Dimensions.set({ window: { width, height: 850, scale: 2.75, fontScale } }));

let tree: ReactTestRenderer;
const render = (items: InvoiceItemData[]) => { act(() => { tree = create(<InvoiceReviewItemsTable items={items} />); }); };
const rows = () => tree.root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('invoice-review-group-') && typeof node.type === 'string');
const textsOf = (node: ReactTestRenderer['root']) => node.findAllByType(Text).map((text) => text.props.children);
const total = () => tree.root.find((node) => node.props.testID === 'invoice-review-items-total' && typeof node.type === 'string');
const allTexts = () => tree.root.findAllByType(Text).map((text) => String(text.props.children));
afterEach(() => {
  act(() => tree.unmount());
  Dimensions.set({ window: before });
});

describe('the ITEMS table of the Review step', () => {
  it('has one row per item group, with the lines of a group counted into its row', () => {
    setWindow(411, 1);
    // WMIV0102 shape: the same item with different marks are groups; two lots of one item and mark are one group.
    const lines = [
      ...groupLines(4, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'SAME-MARK', qty: 10 }),
      ...groupLines(2, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'OTHER', qty: 5 }).map((l, n) => ({ ...l, temp_id: `o${n}`, disp_trl_id: `o${n}` })),
      invoiceLine({ item_id: 'onion', item_name: 'Example Onion', package_mark: '', qty: 7 }, 9),
    ];
    render(lines);
    expect(rows()).toHaveLength(3);
    expect(textsOf(rows()[0])).toContain('40');
    expect(textsOf(rows()[1])).toContain('10');
    expect(textsOf(rows()[2])).toContain('7');
  });

  it('puts the bags total in the Total row and no money total: the one money total is in CHARGES', () => {
    setWindow(411, 1);
    const lines = [invoiceLine({ qty: 10, item_id: 'a', item_name: 'Example A' }, 0), invoiceLine({ qty: 20, item_id: 'b', item_name: 'Example B' }, 1)];
    render(lines);
    const amount = lines.reduce((sum, l) => sum + l.item_total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const texts = textsOf(total());
    expect(texts).toContain('30');
    expect(texts.some((text) => String(text).includes('₹'))).toBe(false);
    expect(total().props.accessibilityLabel).toContain('30 bags');
    expect(total().props.accessibilityLabel).not.toContain('₹');
    // The rows keep their own amounts.
    expect(rows().map((row) => textsOf(row).join(' ')).join(' ')).toContain(amount.split('.')[0].slice(0, 1));
    expect(allTexts().filter((text) => text.startsWith('₹'))).toHaveLength(2);
  });

  it('counts 125 lines of one group as one row', () => {
    setWindow(411, 1);
    render([...groupLines(125, { item_name: 'Example Rai', package_mark: 'BULK-125', qty: 12 }), invoiceLine({ item_id: 'o', item_name: 'Example Onion' }, 200)]);
    expect(rows()).toHaveLength(2);
    expect(textsOf(rows()[0])).toContain('1,500');
  });

  it('stacks at font scale 1.5: the quantity goes under the item and the Qty column goes', () => {
    setWindow(411, 1);
    render([invoiceLine({ qty: 120 })]);
    expect(allTexts()).toContain('Qty');
    act(() => tree.unmount());

    setWindow(411, 1.5);
    render([invoiceLine({ qty: 120 })]);
    expect(allTexts()).not.toContain('Qty');
    expect(rows()[0] && textsOf(rows()[0]).join(' ')).toContain('120');
    expect(allTexts().some((text) => /^120.bags?$/.test(text))).toBe(true);
  });

  it('holds ₹99,999.00 and 9,999 bags on one line each at 411 dp and font scale 1.3, never shrunk', () => {
    setWindow(411, 1.3);
    // 9,999 bags at ₹10: 99,990 + tax 0 -> a line near the design edge.
    const line = invoiceLine({ qty: 9999, charge: 10, labour_rate: 0, tax: 0, duration: 1, item_name: 'Example Kashmiri' });
    render([{ ...line, item_total: 99999 }]);
    const figures = tree.root.findAllByType(Text).filter((text) => ['9,999', '₹99,999.00'].includes(String(text.props.children)));
    // The row holds both figures and the Total row the bags: one line at the normal size, in a column sized to fit.
    expect(figures.length).toBeGreaterThanOrEqual(3);
    figures.forEach((text) => {
      expect(text.props.numberOfLines).toBe(1);
      expect(text.props.adjustsFontSizeToFit).toBeFalsy();
      expect(text.props.minimumFontScale).toBeUndefined();
    });
  });

  it('uses no shrink-to-fit anywhere in the table, at any font scale', () => {
    [1, 1.3, 2].forEach((scale) => {
      setWindow(411, scale);
      render([invoiceLine({ qty: 9999, item_name: 'Example Kashmiri' }), invoiceLine({ qty: 5, item_id: 'b', item_name: 'Example B' }, 1)]);
      // The rows and the Total row (the shared table's headings are not this file's).
      [...rows(), total()].forEach((part) => part.findAllByType(Text).forEach((text) => expect(text.props.adjustsFontSizeToFit).toBeFalsy()));
      act(() => tree.unmount());
    });
    render([invoiceLine()]);
  });

  it('is a table with the headings Item, Qty and Amount', () => {
    setWindow(411, 1);
    render([invoiceLine()]);
    expect(allTexts()).toEqual(expect.arrayContaining(['Item', 'Qty', 'Amount', 'Total']));
  });
});
