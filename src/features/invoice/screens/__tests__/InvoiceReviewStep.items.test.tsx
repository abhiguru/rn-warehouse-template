/**
 * Invoice Review step, ITEMS: one row per item group (Item | Qty | Amount) and a Total row that is the sum of the
 * rows. The edge-case shapes of the Dev test GRNs (seed/manifest.md): 125 lines in one group, groups of one item with
 * different marks, two lots of one item and mark as one group, a ₹99,999.00 line and 9,999 bags.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { act, render, screen, within } from '@testing-library/react-native';
import { InvoiceReviewItemsTable } from '@/features/invoice/components/review/InvoiceReviewItemsTable';
import { groupLines, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const before = Dimensions.get('window');
const setWindow = (width: number, fontScale: number) => act(() => { Dimensions.set({ window: { width, height: 850, scale: 2.75, fontScale } }); });

const table = (items: InvoiceItemData[]) => <InvoiceReviewItemsTable items={items} />;
// A group row is an accessible View with a long spoken label, so the rows are found by their test ID (the table gives
// each group row `invoice-review-group-<key>` and has no role a query could use for them).
const rows = () => screen.queryAllByTestId(/^invoice-review-group-/);
const total = () => screen.getByTestId('invoice-review-items-total');
const ANY_TEXT = /[\s\S]*/;
afterEach(async () => {
  await setWindow(before.width, before.fontScale);
});

describe('the ITEMS table of the Review step', () => {
  it('has one row per item group, with the lines of a group counted into its row', async () => {
    await setWindow(411, 1);
    // WMIV0102 shape: the same item with different marks are groups; two lots of one item and mark are one group.
    const lines = [
      ...groupLines(4, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'SAME-MARK', qty: 10 }),
      ...groupLines(2, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'OTHER', qty: 5 }).map((l, n) => ({ ...l, temp_id: `o${n}`, disp_trl_id: `o${n}` })),
      invoiceLine({ item_id: 'onion', item_name: 'Example Onion', package_mark: '', qty: 7 }, 9),
    ];
    await render(table(lines));
    expect(rows()).toHaveLength(3);
    expect(within(rows()[0]).getByText('40')).toBeOnTheScreen();
    expect(within(rows()[1]).getByText('10')).toBeOnTheScreen();
    expect(within(rows()[2]).getByText('7')).toBeOnTheScreen();
  });

  it('puts the bags total in the Total row and no money total: the one money total is in CHARGES', async () => {
    await setWindow(411, 1);
    const lines = [invoiceLine({ qty: 10, item_id: 'a', item_name: 'Example A' }, 0), invoiceLine({ qty: 20, item_id: 'b', item_name: 'Example B' }, 1)];
    await render(table(lines));
    expect(within(total()).getByText('30')).toBeOnTheScreen();
    expect(within(total()).queryByText(/₹/)).not.toBeOnTheScreen();
    expect(total()).toHaveAccessibleName(/30 bags/);
    expect(total()).not.toHaveAccessibleName(/₹/);
    // The rows keep their own amounts: each line's own amount is in its row (the old check looked for one digit of the
    // sum only, which any figure on the screen could satisfy).
    expect(within(rows()[0]).getByText(formatInvoiceAmount(lines[0].item_total))).toBeOnTheScreen();
    expect(within(rows()[1]).getByText(formatInvoiceAmount(lines[1].item_total))).toBeOnTheScreen();
    expect(screen.getAllByText(/^₹/)).toHaveLength(2);
  });

  it('counts a Box lot in boxes, a mixed total in units, and an older server\'s lot (no packaging) in bags', async () => {
    await setWindow(411, 1);
    const { rerender } = await render(table([invoiceLine({ qty: 12, item_id: 'a', item_name: 'Example A', packaging: 'Box' }, 0)]));
    expect(rows()[0]).toHaveAccessibleName(/12 boxes/);
    expect(total()).toHaveAccessibleName(/12 boxes/);

    await rerender(table([invoiceLine({ qty: 12, item_id: 'a', item_name: 'Example A', packaging: 'Box' }, 0), invoiceLine({ qty: 3, item_id: 'b', item_name: 'Example B', packaging: 'Bag' }, 1)]));
    expect(rows()[0]).toHaveAccessibleName(/12 boxes/);
    expect(rows()[1]).toHaveAccessibleName(/3 bags/);
    expect(total()).toHaveAccessibleName(/15 units/);

    await rerender(table([invoiceLine({ qty: 1, item_id: 'a', item_name: 'Example A' }, 0)]));
    expect(total()).toHaveAccessibleName(/1 bag/);
  });

  it('counts 125 lines of one group as one row', async () => {
    await setWindow(411, 1);
    await render(table([...groupLines(125, { item_name: 'Example Rai', package_mark: 'BULK-125', qty: 12 }), invoiceLine({ item_id: 'o', item_name: 'Example Onion' }, 200)]));
    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]).getByText('1,500')).toBeOnTheScreen();
  });

  it('stacks at font scale 1.5: the quantity goes under the item and the Qty column goes', async () => {
    await setWindow(411, 1);
    const { rerender } = await render(table([invoiceLine({ qty: 120 })]));
    expect(screen.getByText('Qty')).toBeOnTheScreen();

    await setWindow(411, 1.5);
    await rerender(table([invoiceLine({ qty: 120 })]));
    expect(screen.queryByText('Qty')).not.toBeOnTheScreen();
    expect(within(rows()[0]).getByText(/120/)).toBeOnTheScreen();
    expect(screen.getAllByText(/^120.bags?$/).length).toBeGreaterThan(0);
  });

  it('holds ₹99,999.00 and 9,999 bags on one line each at 411 dp and font scale 1.3, never shrunk', async () => {
    await setWindow(411, 1.3);
    // 9,999 bags at ₹10: 99,990 + tax 0 -> a line near the design edge.
    const line = invoiceLine({ qty: 9999, charge: 10, labour_rate: 0, tax: 0, duration: 1, item_name: 'Example Kashmiri' });
    await render(table([{ ...line, item_total: 99999 }]));
    const figures = [...screen.queryAllByText('9,999'), ...screen.queryAllByText('₹99,999.00')];
    // The row holds both figures and the Total row the bags: one line at the normal size, in a column sized to fit.
    expect(figures.length).toBeGreaterThanOrEqual(3);
    figures.forEach((text) => {
      expect(text).toHaveProp('numberOfLines', 1);
      expect(text.props.adjustsFontSizeToFit).toBeFalsy();
      expect(text.props.minimumFontScale).toBeUndefined();
    });
  });

  it('uses no shrink-to-fit anywhere in the table, at any font scale', async () => {
    const lines = [invoiceLine({ qty: 9999, item_name: 'Example Kashmiri' }), invoiceLine({ qty: 5, item_id: 'b', item_name: 'Example B' }, 1)];
    await setWindow(411, 1);
    const { rerender } = await render(table(lines));
    for (const scale of [1, 1.3, 2]) {
      await setWindow(411, scale);
      await rerender(table(lines));
      // The rows and the Total row (the shared table's headings are not this file's).
      const parts = [...rows(), total()];
      expect(parts).toHaveLength(3);
      parts.forEach((part) => {
        const texts = within(part).getAllByText(ANY_TEXT);
        expect(texts.length).toBeGreaterThan(0);
        texts.forEach((text) => expect(text.props.adjustsFontSizeToFit).toBeFalsy());
      });
    }
  });

  it('is a table with the headings Item, Qty and Amount', async () => {
    await setWindow(411, 1);
    await render(table([invoiceLine()]));
    ['Item', 'Qty', 'Amount', 'Total'].forEach((heading) => expect(screen.getByText(heading)).toBeOnTheScreen());
  });
});
