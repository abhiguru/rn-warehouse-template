/// <reference types="jest" />
/**
 * Dispatches, photos, an invoice and people on top of grnDataset's fictional warehouse, as the change feed sends the
 * table rows. Call after `seedWarehouse()`.
 */
import { env } from './phoneEnv';
import { lotNamed } from './grnDataset';

type Row = Record<string, unknown> & { id: string };
const put = (entity: string, rows: Row[]) => {
  for (const row of rows) env.feed.rows[entity].push({ id: row.id, row });
};

/** [number, customer, dispatch date, registration, created, [line id, lot id, quantity][]] */
export const DISPATCHES: [string, 'c1' | 'c2' | 'c3', string | null, string | null, string, [string, string, number][]][] = [
  ['D1', 'c1', '2026-11-23T05:00:00+00:00', 'GJ01AB1234', '2026-11-23T06:00:00+00:00', [['t1', 'l02', 100]]],
  ['D2', 'c2', '2026-11-23T05:00:00+00:00', null, '2026-11-23T07:00:00+00:00', [['t2a', 'l04', 30], ['t2b', 'l05', 4]]],
  ['D10', 'c3', '2026-11-22T05:00:00+00:00', 'MH12ZZ0001', '2026-11-22T06:00:00+00:00', [['t10', 'l01', 5]]],
  ['D3', 'c1', '2026-11-24T05:00:00+00:00', null, '2026-11-24T06:00:00+00:00', [['t3', 'l06', 41]]],
  ['D4', 'c2', null, null, '2026-11-21T06:00:00+00:00', [['t4', 'l07', 2]]],
];
const CUSTOMER_NAMES = { c1: 'asha Traders', c2: 'Bhavin Foods', c3: 'Chirag Stores' };

export function dispatchRow(number: string): Row {
  const found = DISPATCHES.find(d => d[0] === number);
  if (!found) throw new Error(`no dispatch ${number}`);
  const [disp_no, customer_id, disp_date, registration, created_at] = found;
  return {
    id: `d-${disp_no}`, disp_no, customer_id, customer_name: CUSTOMER_NAMES[customer_id], disp_date, registration,
    note: disp_no === 'D2' ? 'Fictional dispatch note' : null, supervisor_id: 'p1', supervisor_name: 'Meera Fictional',
    disp_image_url: null, source_order_id: null, source_order_no: null, created_at, updated_at: created_at,
    created_by: 'p1', updated_by: 'p1', deleted_at: null, import_batch_id: null,
  };
}

export const photoRow = (id: string, extra: Record<string, unknown>): Row => ({
  id, storage_path: `fictional/${id}.jpg`, original_filename: `${id}.jpg`, file_size: 1200, mime_type: 'image/jpeg',
  display_order: 1, uploaded_by: 'p1', status: 'confirmed', created_at: '2026-11-20T06:00:00+00:00', ...extra,
});

export function seedDocuments(): void {
  for (const [number, , , , , lines] of DISPATCHES) {
    put('dispatch', [dispatchRow(number)]);
    put('dispatch_trl', lines.map(([id, lotId, disp_qty]) =>
      ({ id, disp_id: `d-${number}`, gr_id: lotNamed(lotId).gr_id, gr_trl_id: lotId, disp_qty })));
  }
  // Two header photos of GRN A2 (the second shows first), one photo of its second lot, and one of dispatch D2.
  put('grn_images', [
    photoRow('ph-second', { grn_id: 'g-A2', grn_item_id: null, image_type: 'header', display_order: 2 }),
    photoRow('ph-first', { grn_id: 'g-A2', grn_item_id: null, image_type: 'header', display_order: 1 }),
    photoRow('ph-lot', { grn_id: 'g-A2', grn_item_id: 'l03', image_type: 'item' }),
  ]);
  put('dispatch_images', [photoRow('ph-disp', { dispatch_id: 'd-D2' })]);
  put('invoice', [{ id: 'inv1', gr_id: 'g-A10', customer_id: 'c2', inv_no: 7001, inv_date: '2026-11-24', total: 4321, deleted_at: null }]);
  put('invoice_trl', [{ id: 'invl1', invoice_id: 'inv1', disp_trl_id: 't2a', charge: 12.5, tax: 18, labour_rate: 2, duration: 1, no_of_days: 3 }]);
  const meera = { id: 'p1', name: 'Meera Fictional', display_name: 'Meera', role: 'staff' };
  put('people', [meera]);
  put('user_profiles', [{ ...meera, mobile: '9000000009', active: true, is_service_account: false }]);
}
