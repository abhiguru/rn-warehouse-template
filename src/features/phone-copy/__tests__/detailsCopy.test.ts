/**
 * WH-299 slices 3 and 4, contract product/tech/app-offline-read-from-copy.md sections 4 and 10.4 (P6, PR1, PR6): GRN and
 * dispatch details read from the copy, what they leave to the server (`needsServer`), and the seam for unsent work.
 *
 * Real: the services, the sync engine, the copy. Faked at the edge: the server's answers and the phone's native modules.
 * Expected values are derived by hand from `get_grn_details` and `get_dispatch_details` (backend cd9531e) for an
 * administrator. Only keys the baseline functions build are asserted; whole-answer parity waits for the golden export.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The contract says "each result carries `needsServer`" without saying where: the result or its `data` is accepted.
 * ==================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { seedDocuments } from '@/tests/phoneCopy/documentsDataset';
import { bootWarehouse, copySource, goOffline, loadCopy, sourceOf } from '@/tests/phoneCopy/wh299Phone';

const DROPPED = new Set(['dispatch', 'dispatch_trl', 'dispatch_images', 'invoice', 'invoice_trl', 'payments', 'orders', 'order_items']);

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  seedDocuments();
  const rpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    const answer = await rpc(name, args);
    const data = answer.data as { entities?: unknown[] } | null;
    if (!data?.entities) return answer;
    if (name === 'get_sync_start') {
      return { ...answer, data: { ...data, entities: (data.entities as string[]).filter(e => !DROPPED.has(e)) } };
    }
    if (name === 'get_sync_checksums') {
      return { ...answer, data: { ...data, entities: (data.entities as Array<{ e: string }>).filter(e => !DROPPED.has(e.e)) } };
    }
    return answer;
  };
});
afterEach(async () => { await eraseEverything(); });

const grnDetails = (id: string) =>
  (require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service')).getGRNDetails(id);
const dispatchDetails = (id: string) =>
  (require('@/services/dispatch-detail-service') as typeof import('@/services/dispatch-detail-service')).getDispatchDetails(id);
const grnService = () => require('@/services/grn-service') as typeof import('@/services/grn-service');
const needsServer = (result: any): unknown => result.needsServer ?? result.data?.needsServer;
const ids = (rows: { id: string }[] | undefined) => (rows ?? []).map(row => row.id);

async function ready() {
  const w = await bootWarehouse({ role: 'admin' });
  await loadCopy(w);
  return w;
}
async function sync(w: Awaited<ReturnType<typeof ready>>, changes: unknown[]) {
  env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [], changes: changes as never });
  expect(await w.phone.engine.syncNow('interval')).toBe('done');
}

describe('P6: GRN details from the copy', () => {
  it('gives the GRN with its customer, supervisor and lots, in the shape the server gives', async () => {
    const w = await ready();
    const result: any = await grnDetails('g-A2');
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
    const grn = result.data.grn;
    expect(grn).toMatchObject({
      id: 'g-A2', gr_no: 'A2', date: '2026-11-20T05:00:00+00:00', registration: 'GJ01AB1234', note: 'Fictional note',
      invoiced: false, out_of_stock: false,
      customer_details: { id: 'c1', name: 'asha Traders', mobile: '+91 90000 00001', active: true },
      supervisor_details: expect.objectContaining({ name: 'Meera Fictional' }),
    });
    expect(ids(grn.items)).toEqual(['l02', 'l03']);
    expect(grn.items[1]).toMatchObject({
      qty: 100, stock: 19, weight: 30, rack: 'B-3', package_mark: '50%_OFF', item_name: 'Beans', packaging: 'Bag',
      item_details: { id: 'i2', name: 'Beans', packaging: 'Bag', active: true },
    });
  });

  it('counts the GRN as WH-381 specifies: total_dispatched = SUM(MAX(0, qty - stock)), empty dispatches_summary & invoices_summary with grn_lock invoice_state', async () => {
    await ready();
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    // l02: max(0, 100 - 0) = 100, l03: max(0, 100 - 19) = 81 -> 181
    expect(grn.statistics).toMatchObject({
      total_items: 2, total_qty: 200, total_stock: 19, total_weight: 5500, total_dispatched: 181, has_out_of_stock: true,
    });
    expect(grn.dispatches_summary).toEqual({ total_dispatches: 0, dispatch_numbers: [] });
    expect(grn.invoices_summary).toEqual({
      total_invoices: 0,
      invoice_state: 'partly_invoiced',
      can_create_invoice: false,
      invoices: [],
      cancelled_count: 0,
      total_amount: 0,
      invoice_labels: [],
      invoice_numbers: [],
    });
  });

  it('lists the header photos in their display order and each lot its own photos', async () => {
    await ready();
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(ids(grn.header_images)).toEqual(['ph-first', 'ph-second']);
    expect(grn.header_images[0]).toMatchObject({ storage_path: 'fictional/ph-first.jpg', original_filename: 'ph-first.jpg' });
    expect(grn.items.map((item: any) => ids(item.item_images))).toEqual([[], ['ph-lot']]);
  });

  it('PR1: leaves the rates out, neither empty nor zero, and says they need the server', async () => {
    await ready();
    const result: any = await grnDetails('g-A2');
    expect(sourceOf(result)).toEqual(copySource());
    expect(result.data.grn).not.toHaveProperty('rates');
    expect(needsServer(result)).toEqual(['rates']);
  });

  it('works with no connection', async () => {
    const w = await ready();
    await goOffline(w);
    const result: any = await grnDetails('g-A2');
    expect(result).toMatchObject({ success: true, data: { grn: { gr_no: 'A2' } } });
    expect(w.serverCalls).toEqual([]);
  });

  it('C1: shows a rack changed on the server after the sync', async () => {
    const w = await ready();
    await sync(w, [{ e: 'goodsreceived_trl', id: 'l03', op: 'upsert', v: 'b000000000000001', row: { ...lotNamed('l03'), rack: 'Z-9' } }]);
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(grn.items[1].rack).toBe('Z-9');
    expect(w.serverCalls).toEqual([]);
  });

  it('C3: a GRN deleted on the server is "not found" after the sync, with no server call', async () => {
    const w = await ready();
    await sync(w, [{ e: 'goodsreceived', id: 'g-A2', op: 'delete' }]);
    const result = await grnDetails('g-A2');
    expect(result).toMatchObject({ success: false, notFound: true });
    expect(w.serverCalls).toEqual([]);
  });
});

describe('WH-381: dispatch details always use the server, never the phone copy', () => {
  it('calls get_dispatch_details on the server online and offline over a ready copy', async () => {
    const w = await ready();
    const online: any = await dispatchDetails('d-D2');
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_dispatch_details']);
    expect(sourceOf(online)).toBeUndefined();

    w.serverCalls.length = 0;
    await goOffline(w);
    const offline: any = await dispatchDetails('d-D2');
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_dispatch_details']);
    expect(sourceOf(offline)).toBeUndefined();
  });
});

describe('the unsent-work seam (WH-381: no dispatch deductions)', () => {
  const overlayModule = () => require(`@/features/phone-copy/${'unsentOverlay'}`) as { getUnsentOverlay: () => any };

  it('returns nothing when no unsent GRN work exists and has zero deductions', async () => {
    await ready();
    const overlay = overlayModule().getUnsentOverlay();
    expect(overlay.grn('g-A2')).toBeNull();
    expect(overlay.lot('l03')).toBeNull();
    expect(overlay.lessUnsent('l03')).toBe(0);
    expect(overlay.lessHeld('l03')).toBe(0);
  });

  it('lot stock stays at the copy figure with no unsent/held dispatch deduction', async () => {
    await ready();
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(grn.items.map((item: any) => item.stock)).toEqual([0, 19]);
    const list = await grnService().getAllGRNItems({ p_filters: { grn_ids: ['g-A2'] } } as never);
    expect(Object.fromEntries(list.data.items.map((item: any) => [item.grn_item_id, item.stock]))).toEqual({ l02: 0, l03: 19 });
  });
});
