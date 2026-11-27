/**
 * WH-303 slice A-2, test first (product/tech/app-offline-edit-grn.md sections 2, 3.6 and 10: L1-L5, L6 in part, Q2 and Q5
 * in part, N1 not here). `loadGRNData` answers the "Edit GRN" form from the phone copy only while the phone is offline, and
 * the copy's GRN details show this person's own unsent edit. `readGrnEditForm` (`reads/grnEditForm.ts`) does not exist yet:
 * the offline cases fail until it is built; the online case (L4) must pass today.
 *
 * Real: `loadGRNData`, the sync engine, the copy, the store, the unsent queue and its overlay. Faked at the edge: the
 * server's answers and the phone's native modules (src/tests/phoneCopy, src/tests/unsent).
 *
 * ===== AGREE WITH DEVELOPMENT (the contract is silent; ASSUMED) =====
 *  - The answer of a copy load has `data.source === 'copy'` (section 2: "optional `source: 'copy' | 'server'`"); a server
 *    load has no `source` or 'server'. `baseline` is not asserted (its shape is not given).
 *  - The offline answer for rates is `grnRates: []` with `ratesNeedServer: true` (section 2).
 *  - L2: a lock is the form's `locks` object of the line (`dispatched`, `hasHistory`, `invoiced`, `onOrder`), as the server path builds it.
 *  - The unsent edit of an own item is read through `saveGrnEditOffline` of `grnEditKind` (see grnEditKind.test.ts).
 *  - `readGrnDetails` shows an unsent removed line in place (still in `items`), as a lot with a field the overlay marks;
 *    ASSUMED: the lot's id is in `getUnsentOverlay().lotsRemoved(grnId)` (contract section 3.6, "accepted in C301 section 2.1c").
 * ====================================================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { grnNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootWarehouse, goOffline, loadCopy, settleWrites, type Warehouse } from '@/tests/phoneCopy/wh299Phone';

const GRN = 'g-B1'; // lot l06: Peas, qty 50, stock 9 (41 dispatched), rack D-4, mark pk-99
const LOT = 'l06';
const LOCK_LINE = { id: LOT, dispatched_qty: 41, has_history: true, on_invoice: false, invoice_label: null, on_order: false, order_customer_name: null };
const LOCK = {
  grn_id: GRN, gr_no: 'B1', date: grnNamed('B1').date, imported: false, invoice_state: 'not_invoiced', rated_item_ids: [],
  updated_at: '2026-11-25T10:00:00+00:00', invoice: null, first_dispatch_date: '2026-11-22T05:00:00+00:00', lines: [LOCK_LINE],
};

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  const lock = env.feed.rows.grn_lock.find(r => r.id === GRN);
  if (lock) lock.row = { ...LOCK };
  const importedLock = env.feed.rows.grn_lock.find(r => r.id === 'g-X1');
  if (importedLock) importedLock.row = { ...importedLock.row, lines: [{ ...LOCK_LINE, id: 'l01', dispatched_qty: 0, has_history: false }], updated_at: '2026-11-25T10:00:00+00:00' };
});
afterEach(async () => { await eraseEverything(); });

const service = () => require('@/features/grn/services/grnFormService') as typeof import('@/features/grn/services/grnFormService');
type Loaded = { success: boolean; error?: string; data?: any };
const load = (id = GRN) => service().loadGRNData(id) as Promise<Loaded>;

async function offlineWarehouse(role: 'admin' | 'staff' = 'staff'): Promise<Warehouse> {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  await goOffline(w);
  w.serverCalls.length = 0;
  return w;
}

describe('L1, L2: offline with the copy ready', () => {
  it('L1: answers the form from the copy without a call to the server', async () => {
    const w = await offlineWarehouse();
    const out = await load();
    expect(out.success).toBe(true);
    expect(w.serverCalls).toEqual([]);
    expect(out.data.source).toBe('copy');
    expect(out.data.header).toMatchObject({
      gr_no: 'B1', customer_id: 'c1', customer_name: 'asha Traders', supervisor_name: 'Meera Fictional', note: '', leon: false, pricing_mode: 'MONTHLY',
    });
    expect(out.data.items).toEqual([expect.objectContaining({
      grn_trl_id: LOT, item_table_id: 'i1', item_name: 'Peas', packaging: 'Bag', qty: 50, stock: 9, weight: 26, rack: 'D-4', package_mark: 'pk-99', trl_images: [],
    })]);
    expect(out.data.updatedAt).toBe('2026-11-25T10:00:00+00:00');
    expect(out.data.firstDispatchDate).toBe('2026-11-22');
    expect(out.data.grnImported).toBe(false);
    expect(out.data.grnInvoiced).toBe(false);
  });

  it('L2: the lot locks are the grn_lock lines, as get_grn_edit_state gives them', async () => {
    await offlineWarehouse();
    const out = await load();
    expect(out.data.items[0].locks).toEqual(expect.objectContaining({ dispatched: true, hasHistory: true, invoiced: false, onOrder: false }));
  });

  it('L2: an invoiced and an on-order lot are locked as the server says', async () => {
    const lock = env.feed.rows.grn_lock.find(r => r.id === GRN) as { row: Record<string, unknown> };
    lock.row = { ...LOCK, invoice: { id: 'inv-1', invoice_label: 'INV-7' }, invoice_state: 'invoiced', lines: [{ ...LOCK_LINE, on_invoice: true, invoice_label: 'INV-7', on_order: true, order_customer_name: 'Bhavin Foods' }] };
    await offlineWarehouse();
    const out = await load();
    expect(out.data.items[0].locks).toEqual(expect.objectContaining({ invoiced: true, invoiceNo: 'INV-7', onOrder: true, customerName: 'Bhavin Foods' }));
    expect(out.data.grnInvoiced).toBe(true);
    expect(out.data.invoice).toEqual(expect.objectContaining({ id: 'inv-1' }));
  });

  it('L6: the rates are not on the phone: none are listed and the form is told to say so', async () => {
    await offlineWarehouse('admin');
    const out = await load();
    expect(out.data.grnRates).toEqual([]);
    expect(out.data.ratesNeedServer).toBe(true);
  });

  it('an imported GRN is told as imported', async () => {
    await offlineWarehouse();
    const out = await load('g-X1');
    expect(out.data.grnImported).toBe(true);
  });
});

describe('L3: the person\'s own unsent change shows in the form', () => {
  it('a second edit starts from the phone\'s values: the unsent rack, and its to value', async () => {
    const w = await offlineWarehouse();
    const kindModule = require('@/features/grn/offline-edit/grnEditKind') as { saveGrnEditOffline(...a: unknown[]): Promise<unknown> };
    await kindModule.saveGrnEditOffline(GRN, {
      v: 1, grnId: GRN, loadedAt: LOCK.updated_at, recordedAt: '2026-11-27T09:00:00.000Z', lots: { [LOT]: { rack: { from: 'D-4', to: 'C-2' } } },
    }, [], { grnNumber: 'B1' });
    await settleWrites();
    const out = await load();
    expect(out.data.items[0].rack).toBe('C-2');
    expect(w.serverCalls).toEqual([]);
  });
});

describe('L4: online', () => {
  it('reads the server in today\'s order and never the copy', async () => {
    const w = await bootWarehouse({ role: 'staff' });
    await loadCopy(w);
    w.serverCalls.length = 0;
    w.answers.get_grn_edit_state = () => ({ data: { success: true, data: { updated_at: 'T', invoice: null, first_dispatch_date: null, lines: [] } }, error: null });
    w.answers['from:goodsreceived'] = () => ({ data: { gr_no: 'B1', registration: '', date: 'd', sender_id: null, sender_name: '', customer_id: 'c1', customer_name: 'asha Traders', supervisor_id: null, supervisor_name: '', note: '', leon: false, pricing_mode: 'MONTHLY' }, error: null });
    w.answers['from:goodsreceived_trl'] = () => ({ data: [], error: null, count: 0 } as never);
    w.answers['from:grn_images'] = () => ({ data: [], error: null, count: 0 } as never);
    w.answers.get_grn_details = () => ({ data: { success: true, data: { grn: { rates: [] } } }, error: null });
    const out = await load();
    expect(out.success).toBe(true);
    expect(out.data.source ?? 'server').toBe('server');
    expect(w.serverCalls.map(c => c.name).slice(0, 3)).toEqual(['get_grn_edit_state', 'from:goodsreceived', 'from:goodsreceived_trl']);
    expect(w.serverCalls.map(c => c.name).at(-1)).toBe('get_grn_details');
  });
});

describe('L5: no copy to read from', () => {
  it('offline with no copy loaded answers the failure envelope, not an empty form', async () => {
    const w = await bootWarehouse({ role: 'staff' });
    await goOffline(w);
    const out = await load();
    expect(out.success).toBe(false);
    expect(typeof out.error).toBe('string');
    expect(out.data).toBeUndefined();
  });

  it('a GRN that is not in the copy fails the load', async () => {
    await offlineWarehouse();
    const out = await load('g-nothing');
    expect(out.success).toBe(false);
  });

  it('a deleted GRN fails the load', async () => {
    const goods = env.feed.rows.goodsreceived.find(r => r.id === GRN) as { row: Record<string, unknown> };
    goods.row = { ...goods.row, deleted_at: '2026-11-26T05:00:00+00:00' };
    await offlineWarehouse();
    expect((await load()).success).toBe(false);
  });

  it('a phone with the feature off reads the server, as today', async () => {
    const w = await bootWarehouse({ role: 'staff', capability: false });
    await goOffline(w);
    const out = await load();
    expect(out.success).toBe(false);
    expect(w.serverCalls.map(c => c.name)).toContain('get_grn_edit_state');
  });
});

describe('Q2, Q5: GRN details over the copy with an unsent edit', () => {
  const details = () => require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service');
  const save = async (body: Record<string, unknown>) => {
    const kindModule = require('@/features/grn/offline-edit/grnEditKind') as { saveGrnEditOffline(...a: unknown[]): Promise<unknown> };
    await kindModule.saveGrnEditOffline(GRN, { v: 1, grnId: GRN, loadedAt: LOCK.updated_at, recordedAt: '2026-11-27T09:00:00.000Z', ...body }, [], { grnNumber: 'B1' });
    await settleWrites();
  };
  const lotsOf = async () => ((await details().getGRNDetails(GRN)) as any).data.items ?? ((await details().getGRNDetails(GRN)) as any).data.grn.items;

  it('Q2: a quantity change shows the new quantity and the stock moved by the same amount', async () => {
    await offlineWarehouse();
    await save({ lots: { [LOT]: { qty: { from: 50, to: 60 } } } });
    const lot = (await lotsOf()).find((l: { id: string }) => l.id === LOT);
    expect(lot.qty).toBe(60);
    expect(lot.stock).toBe(19);
  });

  it('Q5: an unsent removed line stays in place and is marked removed; the quantities of the GRN do not count it', async () => {
    await offlineWarehouse();
    await save({ linesRemoved: [{ lotId: LOT, item_name: 'Peas', qty: 50 }] });
    const overlay = (require('@/features/phone-copy/unsentOverlay') as typeof import('@/features/phone-copy/unsentOverlay')).getUnsentOverlay() as unknown as { lotsRemoved(grnId: string): string[] };
    expect(overlay.lotsRemoved(GRN)).toEqual([LOT]);
    expect((await lotsOf()).some((l: { id: string }) => l.id === LOT)).toBe(true);
  });

  it('Q5: an unsent added line is a lot of the GRN under its client line id', async () => {
    await offlineWarehouse();
    await save({ linesAdded: [{ clientLineId: 'new-1', item_id: 'i3', item_name: 'Rice', packaging: 'Bag', qty: 4, weight: 24, rack: 'F-1', package_mark: null }] });
    const added = (await lotsOf()).find((l: { id: string }) => l.id === 'new-1');
    expect(added).toEqual(expect.objectContaining({ item_name: 'Rice', qty: 4, rack: 'F-1' }));
  });
});
