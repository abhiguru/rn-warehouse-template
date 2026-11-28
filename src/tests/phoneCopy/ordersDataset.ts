/// <reference types="jest" />
/**
 * WH-328 (product/tech/app-offline-orders-payments.md): orders, order lines and payments on top of grnDataset's and
 * documentsDataset's fictional warehouse, as the format-3 change feed sends them (contract section 0 columns).
 * Call after `seedWarehouse()` and `seedDocuments()`, before `bootWarehouse()`.
 *
 * The shared fake feed knows only the format-2 entities, so this adds the three new ones to its first-load answers
 * (start, pages, checksums) and nothing else; the app's own sync code reads them.
 */
import { env } from './phoneEnv';
import { defaultV } from './fakeFeed';

type Row = Record<string, unknown> & { id: string };
export const NEW_ENTITIES = ['orders', 'order_items', 'payments'] as const;

const order = (id: string, order_no: number, customer_id: 'c1' | 'c2', name: string, status: 'OPEN' | 'DISPATCHED', updated_at: string): Row => ({
  id, order_no, order_date: '2026-11-24', requested_dispatch_date: null, status, priority: 'NORMAL', customer_id, customer_name: name,
  customer_email: null, customer_phone: null, note: null, is_ignored: false, cancelled_at: null, created_at: updated_at, updated_at,
  created_by: 'p1', updated_by: 'p1', updated_by_name: 'Meera Fictional', updated_by_display_name: 'Meera', deleted_at: null,
});
const line = (id: string, order_id: string, lot: string, name: string, requested: number, sort: number, stored: number): Row => ({
  id, order_id, order_no: 1, requested_quantity: requested, fulfilled_quantity: 0, grn_items_id: lot, grn_items_item_id: 'i2',
  grn_items_item_name: name, grn_items_package_mark: null, grn_items_packaging: 'Bag', grn_items_rack: 'C-1', grn_items_weight: 40,
  grn_items_image_url: null, grns_id: 'g-A10', grns_gr_no: 'A10', grns_date: '2026-11-20T05:00:00+00:00', grns_customer_id: 'c2',
  grns_customer_name: 'Bhavin Foods', available_stock_at_order: stored, current_stock: stored, item_status: 'PENDING',
  sort_order: sort, created_at: '2026-11-24T05:00:00+00:00', updated_at: '2026-11-24T05:00:00+00:00',
});

/** o-1: asha Traders' open order, two pending lines on lots l03 (stock 19) and l04 (stock 20). o-2: Bhavin Foods', dispatched. */
export const ORDER_ROWS: Row[] = [
  order('o-1', 101, 'c1', 'asha Traders', 'OPEN', '2026-11-25T04:00:00+00:00'),
  order('o-2', 102, 'c2', 'Bhavin Foods', 'DISPATCHED', '2026-11-24T04:00:00+00:00'),
];
export const LINE_ROWS: Row[] = [
  line('ol-1', 'o-1', 'l03', 'Beans', 5, 1, 19),
  line('ol-2', 'o-1', 'l04', 'Beans', 7, 2, 20),
  { ...line('ol-3', 'o-2', 'l06', 'Peas', 3, 1, 9), item_status: 'FULFILLED', fulfilled_quantity: 3 },
];
/** Payments on invoice inv1 (customer c2, from documentsDataset): the later date is listed last, the same-day ones by number. */
export const PAYMENT_ROWS: Row[] = [
  { id: 'pay-2', payment_no: 12, payment_date: '2026-11-25T06:00:00+00:00', paid_on: '2026-11-25', customer_id: 'c2', invoice_id: 'inv1',
    amount: 1000, payment_mode: 'cash', note: null, updated_at: '2026-11-25T06:00:00+00:00', imported: false, recorded_in_app: true, entered_by_name: 'Meera Fictional' },
  { id: 'pay-1', payment_no: 11, payment_date: '2026-11-24T06:00:00+00:00', paid_on: '2026-11-24', customer_id: 'c2', invoice_id: 'inv1',
    amount: 500, payment_mode: 'upi', note: 'Fictional part', updated_at: '2026-11-24T06:00:00+00:00', imported: false, recorded_in_app: true, entered_by_name: 'Meera Fictional' },
];

/** `staff` has no payment rows in its copy (contract section 2). */
export function seedOrders({ payments = true }: { payments?: boolean } = {}): void {
  const feed = env.feed;
  feed.format = 3;
  for (const name of NEW_ENTITIES) feed.rows[name] = [];
  for (const r of ORDER_ROWS) feed.rows.orders.push({ id: r.id, row: r });
  for (const r of LINE_ROWS) feed.rows.order_items.push({ id: r.id, row: r });
  if (payments) for (const r of PAYMENT_ROWS) feed.rows.payments.push({ id: r.id, row: r });
  // The invoice carries the server's three figures (contract section 5: "the invoice row's payment_state").
  const inv = feed.rows.invoice.find(r => r.id === 'inv1');
  if (inv && payments) inv.row.payment_state = { paid_amount: 1500, due_amount: 2821, payment_status: 'part_paid' };
  for (const r of feed.rows.dispatch) if (r.id === 'd-D2') Object.assign(r.row, { source_order_id: 'o-2', created_by_name: 'Meera Fictional' });

  const rpc = feed.rpc.bind(feed);
  feed.rpc = async (name, args = {}) => {
    const answer = await rpc(name, args);
    const data = answer.data as Record<string, unknown> | null;
    if (name === 'get_sync_start' && data?.success) data.entities = [...(data.entities as string[]), ...NEW_ENTITIES];
    if (name === 'get_sync_checksums' && data?.success) {
      const extra = NEW_ENTITIES.map(e => {
        const sum = feed.rows[e].reduce((t, r) => t + BigInt(`0x${(r.v ?? defaultV(r.id)).slice(0, 15)}`), 0n) % (1n << 60n);
        return { e, count: feed.rows[e].length, sum: sum.toString(), settled: true };
      });
      data.entities = [...(data.entities as unknown[]), ...extra];
    }
    return answer;
  };
}

/** A deactivated customer (c4) with an order o-3 of one line: contract 13.3, staff open it online and from the copy. */
export function seedDeactivatedCustomerOrder(): void {
  env.feed.rows.customers.push({ id: 'c4', row: { id: 'c4', name: 'Dhruv Dairy', mobile: null, active: false, deleted_at: null } });
  const o = order('o-3', 103, 'c1', 'Dhruv Dairy', 'OPEN', '2026-11-23T04:00:00+00:00');
  o.customer_id = 'c4';
  env.feed.rows.orders.push({ id: 'o-3', row: o });
  env.feed.rows.order_items.push({ id: 'ol-4', row: line('ol-4', 'o-3', 'l04', 'Beans', 2, 1, 20) });
}
