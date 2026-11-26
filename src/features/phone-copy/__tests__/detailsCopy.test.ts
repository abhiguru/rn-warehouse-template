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

beforeEach(() => {
  resetEnv();
  seedWarehouse();
  seedDocuments();
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

  it('counts the GRN as the server does and names its dispatches', async () => {
    await ready();
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(grn.statistics).toMatchObject({
      total_items: 2, total_qty: 200, total_stock: 19, total_weight: 5500, total_dispatched: 100, has_out_of_stock: true,
    });
    expect(grn.dispatches_summary).toEqual({ total_dispatches: 1, dispatch_numbers: ['D1'] });
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

describe('P6: dispatch details from the copy', () => {
  it('gives the dispatch with its customer, lines and photos', async () => {
    const w = await ready();
    const result: any = await dispatchDetails('d-D2');
    expect(w.serverCalls).toEqual([]);
    expect(sourceOf(result)).toEqual(copySource());
    const dispatch = result.data.dispatch;
    expect(dispatch).toMatchObject({
      id: 'd-D2', disp_no: 'D2', disp_date: '2026-11-23T05:00:00+00:00', registration: null, note: 'Fictional dispatch note',
      customer_details: { id: 'c2', name: 'Bhavin Foods' },
      supervisor_details: expect.objectContaining({ name: 'Meera Fictional' }),
    });
    expect(ids(dispatch.images)).toEqual(['ph-disp']);
    const lines = [...dispatch.items].sort((a: any, b: any) => (a.id < b.id ? -1 : 1));
    expect(ids(lines)).toEqual(['t2a', 't2b']);
    expect(lines[0]).toMatchObject({
      disp_qty: 30, grn_id: 'g-A10', grn_item_id: 'l04',
      grn_item_details: { id: 'l04', qty: 100, stock: 20, weight: 40, rack: 'C-1', item_name: 'Beans' },
      grn_details: { id: 'g-A10', gr_no: 'A10', customer_name: 'Bhavin Foods' },
      item_details: { id: 'i2', name: 'Beans' },
    });
  });

  it('counts the dispatch and orders its GRN numbers as the server does', async () => {
    await ready();
    const { dispatch } = ((await dispatchDetails('d-D2')) as any).data;
    expect(dispatch.statistics).toMatchObject({ total_items: 2, total_dispatched_qty: 34, unique_grns: 2 });
    // en_US order: "A10" before "a3".
    expect(dispatch.grns_summary).toEqual({ total_grns: 2, grn_numbers: ['A10', 'a3'] });
  });

  it('PR1: leaves each line without invoice amounts and says they need the server', async () => {
    await ready();
    const result: any = await dispatchDetails('d-D2');
    expect(sourceOf(result)).toEqual(copySource());
    for (const line of result.data.dispatch.items) {
      for (const amount of ['charge', 'tax', 'labour_rate', 'total']) {
        expect(line.invoice_details ?? {}).not.toHaveProperty(amount);
      }
    }
    expect(needsServer(result)).toEqual(['invoiceAmounts']);
  });

  it('C3: a dispatch deleted on the server is "not found" after the sync', async () => {
    const w = await ready();
    await sync(w, [{ e: 'dispatch', id: 'd-D2', op: 'delete' }]);
    expect(await dispatchDetails('d-D2')).toMatchObject({ success: false, notFound: true });
    expect(w.serverCalls).toEqual([]);
  });
});

describe('the unsent-work seam (contract 10.4)', () => {
  const overlayModule = () => require(`@/features/phone-copy/${'unsentOverlay'}`) as { getUnsentOverlay: () => any };

  it('returns nothing in this card', async () => {
    await ready();
    const overlay = overlayModule().getUnsentOverlay();
    expect(overlay.grn('g-A2')).toBeNull();
    expect(overlay.lot('l03')).toBeNull();
    expect(overlay.dispatch('d-D2')).toBeNull();
    expect(overlay.lessUnsent('l03')).toBe(0);
    expect(overlay.lessHeld('l03')).toBe(0);
  });

  it('is applied by the readers: stock is the copy\'s less the unsent and the held', async () => {
    await ready();
    const seam = overlayModule();
    jest.spyOn(seam, 'getUnsentOverlay').mockReturnValue({
      grn: () => null, lot: () => null, dispatch: () => null,
      lessUnsent: (lot: string) => (lot === 'l03' ? 4 : 0),
      lessHeld: (lot: string) => (lot === 'l03' ? 1 : 0),
    });
    const { grn } = ((await grnDetails('g-A2')) as any).data;
    expect(grn.items.map((item: any) => item.stock)).toEqual([0, 14]);
    const list = await grnService().getAllGRNItems({ p_filters: { grn_ids: ['g-A2'] } } as never);
    expect(Object.fromEntries(list.data.items.map((item: any) => [item.grn_item_id, item.stock]))).toEqual({ l02: 0, l03: 14 });
  });
});
