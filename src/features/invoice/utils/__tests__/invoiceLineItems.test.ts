import type { InvoiceDetailsResponse, InvoiceItemDetailed } from '@/services/invoice-service';
import { groupItemsByGrnItem } from '@/components/invoice-details/InvoiceLineItemsTab';
import { buildInvoiceLineItems, relatedDispatchDocuments } from '../invoiceLineItems';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: { preference: 'light', brand: 'orange' } }),
}));

type Details = NonNullable<InvoiceDetailsResponse['data']>;

const DISPATCH_1 = 'dddddddd-1111-4333-8444-555555555555';
const DISPATCH_2 = 'dddddddd-2222-4333-8444-555555555555';

/** A line as get_invoice_data returns it: rates, no amounts. */
const dataLine = (id: string, qty: number, dispatchId: string, dispatchNo: string, pricingMode = 'MONTHLY') => ({
  item_id: id,
  charge: 5,
  tax: 5,
  duration: 1.5,
  no_of_days: 31,
  labour_rate: 2,
  catalog: { id: 'c1', name: 'Example Potatoes', packaging: 'Bag', description: '', active: true },
  grn_item: { id: 'grn-item-1', name: 'Example Potatoes', rack: 'R1', weight: 50, packaging: 'Bag', package_mark: 'M1', pricing_mode: pricingMode, current_stock: 0, original_quantity: 100 },
  dispatch: { id: `dl-${id}`, quantity: qty, gr_id: 'grn-1', disp_id: dispatchId, gr_trl_id: 'grn-item-1', disp_no: dispatchNo, disp_date: '2026-10-01' },
});

/** The same line as get_invoice_items_detailed returns it: with the server's amounts. */
const detailedLine = (id: string, qty: number, dispatchId: string, dispatchNo: string, taxAmount: number, totalAmount: number): InvoiceItemDetailed => ({
  id, duration: '1.5', noOfDays: 31, charge: 5, tax: 5, taxAmount, totalAmount, dispatchQty: qty, grnQuantity: 100,
  itemName: 'Example Potatoes', grNo: 'A0010', dispatchId, dispatchNo, dispatchDate: '2026-10-01', packageMark: 'M1',
  rack: 'R1', weight: 50, packaging: 'Bag', labourRate: 2, grnItemId: 'grn-item-1',
});

const invoice = { gr_no: 'A0010', grn: { id: 'grn-1', number: 'A0010', date: '2026-09-01' } } as unknown as Details['header'];

describe('the lines shown on an invoice', () => {
  it('use the server\'s line amounts for a one-time GRN, so the groups add up to the invoice', () => {
    // 100 bags at 5 with labour 2, 1.5 periods, tax 5 %. One-time: 100 + 400 storage, tax 5 + 20.
    const lines = buildInvoiceLineItems(
      invoice,
      [dataLine('l1', 20, DISPATCH_1, 'I0001', 'ONE_TIME'), dataLine('l2', 80, DISPATCH_2, 'I0002', 'ONE_TIME')] as Details['items'],
      [detailedLine('l1', 20, DISPATCH_1, 'I0001', 5, 105), detailedLine('l2', 80, DISPATCH_2, 'I0002', 20, 420)]
    );

    const [group] = groupItemsByGrnItem(lines);

    expect(group.dispatch_items.map((line) => [line.line_item_amount, line.tax])).toEqual([[100, 5], [400, 20]]);
    expect(group).toMatchObject({ total_base_amount: 500, total_tax_amount: 25, total_amount: 525 });
  });

  it('work the amounts out by the GRN pricing mode when the server amounts did not load', () => {
    const oneTime = groupItemsByGrnItem(
      buildInvoiceLineItems(invoice, [dataLine('l1', 100, DISPATCH_1, 'I0001', 'ONE_TIME')] as Details['items'], [])
    );
    const monthly = groupItemsByGrnItem(
      buildInvoiceLineItems(invoice, [dataLine('l1', 100, DISPATCH_1, 'I0001', 'MONTHLY')] as Details['items'], [])
    );

    expect(oneTime[0]).toMatchObject({ total_base_amount: 500, total_tax_amount: 25, total_amount: 525 });
    expect(monthly[0]).toMatchObject({ total_base_amount: 950, total_tax_amount: 47.5, total_amount: 997.5 });
  });

  it('are built from the detailed lines alone when the invoice data has none', () => {
    const lines = buildInvoiceLineItems(invoice, [], [detailedLine('l1', 100, DISPATCH_1, 'I0001', 25, 525)]);

    expect(lines[0]).toMatchObject({ dispatch_id: DISPATCH_1, dispatch_no: 'I0001', grn_item_id: 'grn-item-1' });
    expect(groupItemsByGrnItem(lines)[0]).toMatchObject({ total_base_amount: 500, total_tax_amount: 25, total_amount: 525 });
  });
});

describe('lines without a GRN item id', () => {
  it('are not merged because their names and received quantities match', () => {
    // Two lots of the same item, both received as 100 bags, at different rates.
    const lines = [
      { id: 'l1', item_name: 'Example Potatoes', grn_quantity: 100, dispatch_qty: 100, duration: '1', charge: 5, tax: 5, gr_no: 'A0010', grn_item_id: '' },
      { id: 'l2', item_name: 'Example Potatoes', grn_quantity: 100, dispatch_qty: 50, duration: '1', charge: 8, tax: 5, gr_no: 'A0010', grn_item_id: '' },
    ];

    const groups = groupItemsByGrnItem(lines);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => [group.total_dispatch_qty, group.charge_per_unit])).toEqual([[100, 5], [50, 8]]);
    expect(new Set(groups.map((group) => group.grn_item_id)).size).toBe(2);
  });
});

describe('the dispatches listed with an invoice', () => {
  it('are opened by dispatch id and labelled with the dispatch number, once each', () => {
    const lines = buildInvoiceLineItems(
      invoice,
      [dataLine('l1', 20, DISPATCH_1, 'I2660'), dataLine('l2', 30, DISPATCH_1, 'I2660'), dataLine('l3', 50, DISPATCH_2, 'I2661')] as Details['items'],
      []
    );

    expect(relatedDispatchDocuments(lines)).toEqual([
      { id: DISPATCH_1, number: 'I2660', type: 'dispatch' },
      { id: DISPATCH_2, number: 'I2661', type: 'dispatch' },
    ]);
  });

  it('leave out a dispatch whose id is not known: a number cannot be opened', () => {
    const lines = [{ id: 'l1', item_name: 'x', charge: 5, tax: 5, dispatch_no: 'I2660', dispatch_id: '' }];

    expect(relatedDispatchDocuments(lines)).toEqual([]);
  });
});
