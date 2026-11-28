/// <reference types="jest" />
/**
 * A small fictional warehouse as the change feed sends it (format 2: `grn_lock.invoice_state`, lot `emptied_at`), and
 * the row `get_all_grn_items` answers for each of its lots. The row's keys are the ones the server function builds
 * (backend cd9531e: baseline plus migrations 165, 191, 202 and 207).
 */
import { env } from './phoneEnv';

export type Grn = {
  id: string; gr_no: string; date: string; customer_id: string; customer_name: string; registration: string | null;
  supervisor_name: string | null; note: string | null; out_of_stock: boolean | null; invoiced: boolean | null;
  import_batch_id: string | null; deleted_at: string | null; invoice_state: 'not_invoiced' | 'invoiced' | 'partly_invoiced';
};
export type Lot = {
  id: string; gr_id: string; item_id: string; item_name: string; packaging: string | null; qty: number; stock: number;
  weight: number | null; rack: string | null; package_mark: string | null; trl_img_url: string | null; emptied_at: string | null;
};

const grn = (gr_no: string, date: string, customer: 'c1' | 'c2' | 'c3', extra: Partial<Grn> = {}): Grn => ({
  id: `g-${gr_no}`, gr_no, date, customer_id: customer,
  customer_name: { c1: 'asha Traders', c2: 'Bhavin Foods', c3: 'Chirag Stores' }[customer],
  registration: null, supervisor_name: 'Meera Fictional', note: null, out_of_stock: false, invoiced: false,
  import_batch_id: null, deleted_at: null, invoice_state: 'not_invoiced', ...extra,
});

export const GRNS: Grn[] = [
  grn('X1', '2026-11-18T05:00:00+00:00', 'c3', { registration: 'GJ05XY9999', invoiced: true, invoice_state: 'invoiced', import_batch_id: 'batch-1' }),
  grn('A2', '2026-11-20T05:00:00+00:00', 'c1', { registration: 'GJ01AB1234', invoice_state: 'partly_invoiced', note: 'Fictional note' }),
  grn('A10', '2026-11-20T05:00:00+00:00', 'c2', { out_of_stock: null, invoiced: null }),
  grn('a3', '2026-11-21T05:00:00+00:00', 'c2', { supervisor_name: null }),
  grn('B1', '2026-11-21T05:00:00+00:00', 'c1'),
  // One microsecond apart: the later one has the number that sorts after the other.
  grn('5', '2026-11-22T05:00:00.000001+00:00', 'c3'),
  grn('GR-1', '2026-11-22T05:00:00.000002+00:00', 'c1'),
];

const lot = (id: string, gr_no: string, item: 'i1' | 'i2' | 'i3', qty: number, stock: number, weight: number | null,
  rack: string | null, package_mark: string | null): Lot => ({
  id, gr_id: `g-${gr_no}`, item_id: item, item_name: { i1: 'Peas', i2: 'Beans', i3: 'Rice' }[item], packaging: 'Bag',
  qty, stock, weight, rack, package_mark, trl_img_url: null, emptied_at: stock === 0 ? '2026-11-23T05:00:00+00:00' : null,
});

export const LOTS: Lot[] = [
  lot('l01', 'X1', 'i1', 10, 10, 50, 'A-1', 'PK-77'),
  lot('l02', 'A2', 'i1', 100, 0, 25, 'B-2', 'PK-78'),
  lot('l03', 'A2', 'i2', 100, 19, 30, 'B-3', '50%_OFF'),
  lot('l04', 'A10', 'i2', 100, 20, 40, 'C-1', null),
  lot('l05', 'a3', 'i3', 5, 1, null, null, 'back\\slash'),
  lot('l06', 'B1', 'i1', 50, 9, 26, 'D-4', 'pk-99'),
  lot('l07', '5', 'i3', 8, 8, 51, 'E-5', 'ગ-5'),
  lot('l08', 'GR-1', 'i1', 3, 2, 24, 'F-6', 'A'),
];
export const ALL_LOTS = LOTS.map(l => l.id);

/** What the grn_lock entity carries that the list needs; the other lock facts do not matter to these tests. */
export const lockRow = (g: Grn, invoice_state: Grn['invoice_state'] = g.invoice_state) =>
  ({ grn_id: g.id, gr_no: g.gr_no, date: g.date, lines: [], imported: g.import_batch_id !== null, invoice_state });
export const grnFeedRow = (g: Grn) => {
  const { invoice_state: _lockOnly, ...row } = g;
  return row;
};

export const grnNamed = (gr_no: string): Grn => {
  const found = GRNS.find(g => g.gr_no === gr_no);
  if (!found) throw new Error(`no GRN ${gr_no}`);
  return found;
};
export const lotNamed = (id: string): Lot => {
  const found = LOTS.find(l => l.id === id);
  if (!found) throw new Error(`no lot ${id}`);
  return found;
};

/** One row of `get_all_grn_items`' `data` for a lot of this warehouse. */
export function serverRow(lotId: string) {
  const l = lotNamed(lotId);
  const g = GRNS.find(x => x.id === l.gr_id) as Grn;
  return {
    id: g.id, gr_no: g.gr_no, date: g.date, customer_name: g.customer_name, supervisor_name: g.supervisor_name,
    registration: g.registration, out_of_stock: g.out_of_stock, invoiced: g.invoiced, invoice_state: g.invoice_state,
    imported: g.import_batch_id !== null, note: g.note, grn_item_id: l.id, item_name: l.item_name, packaging: l.packaging,
    qty: l.qty, stock: l.stock, weight: l.weight, rack: l.rack, package_mark: l.package_mark, trl_img_url: l.trl_img_url,
  };
}

/** Puts the warehouse on the fake server, as a format-2 feed. Call after `resetEnv()`. */
export function seedWarehouse(): void {
  const feed = env.feed;
  feed.format = 2;
  for (const [id, name, mobile] of [['c1', 'asha Traders', '+91 90000 00001'], ['c2', 'Bhavin Foods', '09000000002'], ['c3', 'Chirag Stores', null]] as const) {
    feed.rows.customers.push({ id, row: { id, name, mobile, active: true, deleted_at: null } });
  }
  for (const [id, name] of [['i1', 'Peas'], ['i2', 'Beans'], ['i3', 'Rice']] as const) {
    feed.rows.items.push({ id, row: { id, name, packaging: 'Bag', description: 'Fictional Produce', active: true } });
  }
  for (const g of GRNS) {
    feed.rows.goodsreceived.push({ id: g.id, row: grnFeedRow(g) });
    feed.rows.grn_lock.push({ id: g.id, row: lockRow(g) });
  }
  for (const l of LOTS) feed.rows.goodsreceived_trl.push({ id: l.id, row: { ...l } });
}
