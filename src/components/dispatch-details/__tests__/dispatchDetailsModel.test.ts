/**
 * The rows behind the dispatch page's Items, GRNs and Invoices tables (dispatchDetailsModel).
 * The lines have the shape get_dispatch_details sends (checked against the live function).
 */
import {
  buildInvoiceTable,
  groupBySourceGrn,
  itemTotals,
  mapDispatchItems,
} from '../dispatchDetailsModel';
import type { RpcDispatchItemDetails } from '@/types/rpc-canonical.types';

type Over = {
  id?: string;
  qty?: number;
  grn?: { id: string | null; gr_no: string | null; date: string | null } | null;
  topGrnId?: string | null;
  lot?: Partial<NonNullable<RpcDispatchItemDetails['grn_item_details']>> | null;
  itemName?: string | null;
  invoice?: Partial<NonNullable<RpcDispatchItemDetails['invoice_details']>> | null;
};

function line(over: Over = {}): RpcDispatchItemDetails {
  const grn = over.grn === undefined ? { id: 'grn-161', gr_no: '0161', date: '2026-10-15' } : over.grn;
  return {
    id: over.id ?? 'line-1',
    disp_qty: over.qty ?? 25,
    grn_id: over.topGrnId === undefined ? grn?.id ?? null : over.topGrnId,
    grn_item_id: 'lot-1',
    grn_item_details:
      over.lot === null
        ? null
        : { id: 'lot-1', qty: 100, stock: 75, weight: 50, package_mark: 'PM', item_name: 'Basmati Rice (lot)', packaging: null, ...over.lot },
    grn_details: grn === null ? null : ({ ...grn } as RpcDispatchItemDetails['grn_details']),
    item_details: over.itemName === null ? null : ({ id: 'item-1', name: over.itemName ?? 'Basmati Rice' } as RpcDispatchItemDetails['item_details']),
    invoice_details:
      over.invoice === undefined || over.invoice === null
        ? null
        : { invoice_trl_id: `trl-${over.id ?? 'line-1'}`, invoice_id: 'inv-241', invoice_no: 241, invoice_date: '2026-10-15T10:00:00+05:30', total: 12450, ...over.invoice },
  };
}

describe('mapDispatchItems', () => {
  it('keeps one row per dispatch line, so two lots of one item stay two rows with their own ids', () => {
    const rows = mapDispatchItems(
      [line({ id: 'a', qty: 10, lot: { package_mark: 'A1' } }), line({ id: 'b', qty: 15, lot: { package_mark: 'B2' } })],
      'Unknown Item'
    );

    expect(rows.map((r) => [r.id, r.item_name, r.package_mark, r.dispatch_quantity])).toEqual([
      ['a', 'Basmati Rice', 'A1', 10],
      ['b', 'Basmati Rice', 'B2', 15],
    ]);
  });

  it('reads the mark, the weight of one bag and the received quantity from the lot', () => {
    const [row] = mapDispatchItems([line({ lot: { weight: 50, package_mark: ' PM ', qty: 100 } })], 'Unknown Item');

    expect(row).toMatchObject({ weight: 50, package_mark: 'PM', original_quantity: 100, grn_id: 'grn-161', grn_no: '0161', grn_date: '2026-10-15' });
  });

  it('leaves the optional fields empty when the lot has none (no mark, no weight, no lot)', () => {
    const [bare, noLot] = mapDispatchItems(
      [line({ id: 'a', lot: { weight: null, package_mark: '' } }), line({ id: 'b', lot: null, itemName: null })],
      'Unknown Item'
    );

    expect(bare).toMatchObject({ weight: null, package_mark: null, original_quantity: 100 });
    expect(noLot).toMatchObject({ item_name: 'Unknown Item', weight: null, package_mark: null, original_quantity: undefined });
  });

  it('falls back to the lot name when the item master is missing', () => {
    const [row] = mapDispatchItems([line({ itemName: null })], 'Unknown Item');
    expect(row.item_name).toBe('Basmati Rice (lot)');
  });

  it('keeps a missing GRN date missing instead of using today', () => {
    const [row] = mapDispatchItems([line({ grn: { id: 'grn-9', gr_no: '0009', date: null } })], 'Unknown Item');
    expect(row.grn_date).toBeNull();
  });

  it('uses the line GRN id when grn_details is missing, and null when there is none at all', () => {
    const [fromLine, none] = mapDispatchItems(
      [line({ id: 'a', grn: null, topGrnId: 'grn-7' }), line({ id: 'b', grn: null, topGrnId: null })],
      'Unknown Item'
    );

    expect(fromLine).toMatchObject({ grn_id: 'grn-7', grn_no: null, grn_date: null });
    expect(none).toMatchObject({ grn_id: null, grn_no: null });
  });

  it('gives a line without an id a key of its own', () => {
    const rows = mapDispatchItems([line({ id: '' }), line({ id: '' })], 'Unknown Item');
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });
});

describe('groupBySourceGrn', () => {
  const items = mapDispatchItems(
    [
      line({ id: 'w', qty: 40, itemName: 'Wheat' }),
      line({ id: 'old', qty: 50, grn: { id: 'grn-159', gr_no: '0159', date: '2026-10-14' } }),
      line({ id: 'r', qty: 25 }),
    ],
    'Unknown Item'
  );

  it('groups by GRN id in the order the lines came, with item lines and bags of this dispatch', () => {
    const groups = groupBySourceGrn(items);

    expect(groups.map((g) => [g.key, g.grn_no, g.lines.length, g.bags])).toEqual([
      ['grn-161', '0161', 2, 65],
      ['grn-159', '0159', 1, 50],
    ]);
    // Lines keep their ids (the rendering keys) and their order within a GRN.
    expect(groups[0].lines.map((l) => l.id)).toEqual(['w', 'r']);
  });

  it('never merges two GRNs that share a number but not an id', () => {
    const groups = groupBySourceGrn(
      mapDispatchItems(
        [line({ id: 'a', grn: { id: 'g-1', gr_no: '0161', date: '2026-10-15' } }), line({ id: 'b', grn: { id: 'g-2', gr_no: '0161', date: '2026-10-15' } })],
        'Unknown Item'
      )
    );
    expect(groups.map((g) => g.key).sort()).toEqual(['g-1', 'g-2']);
  });

  it('puts each line without a GRN id in a group of its own, never with another', () => {
    const groups = groupBySourceGrn(
      mapDispatchItems(
        [line({ id: 'a', grn: { id: null, gr_no: '0161', date: null }, topGrnId: null }), line({ id: 'b', grn: { id: null, gr_no: '0161', date: null }, topGrnId: null })],
        'Unknown Item'
      )
    );
    expect(groups.map((g) => [g.key, g.grn_id, g.lines.length])).toEqual([
      ['line:a', null, 1],
      ['line:b', null, 1],
    ]);
  });
});

describe('itemTotals', () => {
  it('adds the bags and counts lines and distinct source GRNs (a line without an id on its own)', () => {
    const items = mapDispatchItems(
      [
        line({ id: 'a', qty: 25 }),
        line({ id: 'b', qty: 40 }),
        line({ id: 'c', qty: 50, grn: { id: 'grn-159', gr_no: '0159', date: '2026-10-14' } }),
        line({ id: 'd', qty: 5, grn: null, topGrnId: null }),
      ],
      'Unknown Item'
    );
    expect(itemTotals(items)).toEqual({ bags: 120, lines: 4, grns: 3 });
  });

  it('is zero for no lines', () => {
    expect(itemTotals([])).toEqual({ bags: 0, lines: 0, grns: 0 });
  });
});

describe('buildInvoiceTable', () => {
  const second = { invoice_id: 'inv-242', invoice_no: 242, invoice_date: '2026-10-16T09:00:00+05:30', total: 3250 };

  it('lists each linked invoice once, oldest first, with its id, date and whole total', () => {
    const table = buildInvoiceTable(
      [line({ id: 'a', invoice: second }), line({ id: 'b', invoice: {} }), line({ id: 'c', invoice: {} }), line({ id: 'd' })],
      { total_invoices: 2, total_amount: 15700, invoice_numbers: [241, 242] }
    );

    expect(table).toEqual({
      detailed: true,
      count: 2,
      total: 15700,
      rows: [
        { key: 'inv-241', invoice_id: 'inv-241', invoice_no: 241, invoice_date: '2026-10-15T10:00:00+05:30', total: 12450 },
        { key: 'inv-242', invoice_id: 'inv-242', invoice_no: 242, invoice_date: '2026-10-16T09:00:00+05:30', total: 3250 },
      ],
    });
  });

  it('keeps an invoice without a date undated', () => {
    const table = buildInvoiceTable([line({ invoice: { invoice_date: null } })], { total_invoices: 1, total_amount: 12450, invoice_numbers: [241] });
    expect(table.rows[0].invoice_date).toBeNull();
    expect(table.detailed).toBe(true);
  });

  it('falls back to the summary numbers, with no date, amount or id, when the lines carry no invoices', () => {
    const table = buildInvoiceTable([line({ id: 'a' })], { total_invoices: 2, total_amount: 15700, invoice_numbers: [241, 242] });

    expect(table).toEqual({
      detailed: false,
      count: 2,
      total: 15700,
      rows: [
        { key: 'number:241:0', invoice_id: null, invoice_no: 241, invoice_date: null, total: null },
        { key: 'number:242:1', invoice_id: null, invoice_no: 242, invoice_date: null, total: null },
      ],
    });
  });

  it('falls back when the lines account for fewer invoices than the summary, never splitting the total', () => {
    const table = buildInvoiceTable([line({ invoice: {} })], { total_invoices: 2, total_amount: 15700, invoice_numbers: [241, 242] });

    expect(table.detailed).toBe(false);
    expect(table.rows.every((r) => r.total === null && r.invoice_id === null && r.invoice_date === null)).toBe(true);
    expect(table.total).toBe(15700);
  });

  it('falls back when an invoice comes without a total', () => {
    const table = buildInvoiceTable([line({ invoice: { total: null } })], { total_invoices: 1, total_amount: 12450, invoice_numbers: [241] });
    expect(table.detailed).toBe(false);
  });

  it('is empty with no invoices or no summary', () => {
    expect(buildInvoiceTable([line()], { total_invoices: 0, total_amount: 0, invoice_numbers: [] })).toEqual({ detailed: false, count: 0, total: 0, rows: [] });
    expect(buildInvoiceTable(undefined, undefined)).toEqual({ detailed: false, count: 0, total: 0, rows: [] });
  });
});
