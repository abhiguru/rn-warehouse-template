/**
 * WH-301 (Design 2.2 to 2.4; contract 2.1) and WH-302 (quick-change contract section 4, cases O1 to O7): what the phone shows
 * for work it has not sent. Markers ("Not sent yet" / "Sending…"), the changed fields, the values (a lot's unsent rack and mark)
 * through the read of Find goods and the GRN list, a sent item's values held until the next sync ends, another person's items
 * changing nothing, and a value put back showing nothing.
 *
 * Real: the copy store loaded by the real first load, `findGoods`, `getAllGRNItems`, `getGRNDetails` (server path),
 * `saveLotChange`, the queue and the send engine, the overlay. Faked at the edge: the server's answers and the native modules.
 */
import { bootWarehouse, goOffline, loadCopy, settleWrites, type Warehouse } from '@/tests/phoneCopy/wh299Phone';
import { env, eraseEverything, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { grnRow, lotRow } from '@/tests/phoneCopy/fakeFeed';
import { files } from '@/tests/phoneCopy/fakeFiles';

const GRN_A = 'g-001';
const GRN_B = 'g-002';
const COPY = { rack: 'A-1', package_mark: 'PK-77' };
type Overlay = {
  marker(kind: 'grn' | 'lot' | 'dispatch', id: string): 'notSent' | 'sending' | null;
  changedFields(kind: 'grn' | 'dispatch', id: string): string[];
  lot(id: string): Record<string, unknown> | null;
  grn(id: string): Record<string, unknown> | null;
  lotValues(): ReadonlyMap<string, Record<string, unknown>>;
};
type Service = { saveLotChange(input: Record<string, unknown>): Promise<{ id: string; requestKey: string; merged: boolean; dropped?: boolean }> };

let w: Warehouse;
let service: Service;
const overlay = () => (require('@/features/phone-copy/unsentOverlay') as { getUnsentOverlay(): Overlay }).getUnsentOverlay();
const rows = () => (require('@/features/unsent/unsentStore') as { loadedUnsentRows(): { state: string; kind: string; scope: string }[] }).loadedUnsentRows();

async function start(): Promise<void> {
  w = await bootWarehouse({ role: 'staff' });
  await loadCopy(w);
  require('@/features/unsent/lotChangeKind');
  service = require('@/features/quick-change/lotChangeService') as Service;
  await (require('@/features/unsent/unsentStore') as { initUnsent(): Promise<void> }).initUnsent();
  await goOffline(w);
}
const change = (extra: Record<string, unknown>, lotId = 'l01', grnId = GRN_A) =>
  service.saveLotChange({ lotId, grnId, grnNumber: '1', customer: 'Asha Fictional Traders', copy: COPY, ...extra } as never);
const findGoodsIds = async (query: string) => {
  const { findGoods } = require('@/features/find-goods/findGoodsService') as typeof import('@/features/find-goods/findGoodsService');
  const answer = await findGoods(query, 0);
  if (answer.kind !== 'page') throw new Error(`Find goods answered ${answer.kind}`);
  return { ids: answer.page.data.map(row => (row as unknown as { grn_item_id: string }).grn_item_id).sort(), total: answer.page.total_count };
};
const listIds = async (filters: Record<string, unknown>) => {
  const grn = require('@/services/grn-service') as typeof import('@/services/grn-service');
  const result = await grn.getAllGRNItems({ p_filters: filters } as never);
  return (result.data.items as unknown as { grn_item_id: string }[]).map(row => row.grn_item_id).sort();
};

beforeEach(() => {
  resetEnv();
  env.feed.format = 2; // the copy's format that the reads need
  files.reset();
  env.feed.rows.goodsreceived.push(grnRow(GRN_A, { gr_no: 'G-001', customer_name: 'Asha Fictional Traders', date: '2026-11-20' }));
  env.feed.rows.goodsreceived.push(grnRow(GRN_B, { gr_no: 'G-002', customer_name: 'Bhavin Sample Foods', date: '2026-11-21' }));
  env.feed.rows.goodsreceived_trl.push(lotRow('l01', GRN_A, { gr_id: GRN_A, item_name: 'Fictional Peas', package_mark: 'PK-77', rack: 'A-1', stock: 10 }));
  env.feed.rows.goodsreceived_trl.push(lotRow('l02', GRN_A, { gr_id: GRN_A, item_name: 'Fictional Beans', package_mark: 'PK-78', rack: 'A-2', stock: 10 }));
  env.feed.rows.goodsreceived_trl.push(lotRow('l03', GRN_B, { gr_id: GRN_B, item_name: 'Fictional Peas', package_mark: 'PK-90', rack: 'B-2', stock: 10 }));
});
afterEach(async () => {
  // End the test's own session while the copy is offline: a lost-answer wait stops, its retry is dropped, and the pass its
  // end asks for returns at once, so nothing runs or logs after the file is torn down.
  w?.phone.engine.setCopyOffline(true);
  (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
  await new Promise(resolve => setTimeout(resolve, 100));
  await eraseEverything();
});

describe('markers and the changed fields (O1)', () => {
  it('an unsent rack marks its lot and GRN "not sent" and names Rack; a lot nobody changed has no marker', async () => {
    await start();
    expect(overlay().marker('lot', 'l01')).toBeNull();
    await change({ rack: 'C-2' });
    expect(overlay().marker('lot', 'l01')).toBe('notSent');
    expect(overlay().marker('grn', GRN_A)).toBe('notSent');
    expect(overlay().changedFields('grn', GRN_A)).toEqual(['common.rack']);
    expect(overlay().marker('lot', 'l02')).toBeNull();
    expect(overlay().marker('grn', GRN_B)).toBeNull();
  });

  it('rack and mark together name both fields', async () => {
    await start();
    await change({ rack: 'C-2', package_mark: 'ZZ-1' });
    expect(overlay().changedFields('grn', GRN_A)).toEqual(['common.rack', 'grn.item.mark']);
  });

  it('the marker reads "sending" while the item is on its way', async () => {
    await start();
    await change({ rack: 'C-2' });
    const { rawRun } = require('@/tests/unsent/unsentPhone') as typeof import('@/tests/unsent/unsentPhone');
    await rawRun("UPDATE items SET state = 'sending', attempts = 1");
    await (require('@/features/unsent/unsentStore') as { initUnsent(): Promise<void> }).initUnsent();
    expect(overlay().marker('lot', 'l01')).toBe('sending');
    expect(overlay().marker('grn', GRN_A)).toBe('sending');
  });

  it('a value put back drops the item and shows nothing (O5)', async () => {
    await start();
    await change({ rack: 'C-2' });
    const back = await change({ rack: 'A-1' });
    expect(back.dropped).toBe(true);
    expect(overlay().marker('lot', 'l01')).toBeNull();
    expect(overlay().changedFields('grn', GRN_A)).toEqual([]);
    expect(overlay().lot('l01')).toBeNull();
  });

  it('one of two fields put back: the strip names the other only, and the item is still queued (O5)', async () => {
    await start();
    await change({ rack: 'C-2', package_mark: 'ZZ-1' });
    await change({ rack: 'A-1' });
    expect(overlay().changedFields('grn', GRN_A)).toEqual(['grn.item.mark']);
    expect(overlay().lot('l01')).toEqual({ package_mark: 'ZZ-1' });
    expect(rows().filter(row => row.state === 'saved')).toHaveLength(1);
  });

  it('a value put back after an attempt left the phone shows nothing, though the first item is still queued (O5)', async () => {
    await start();
    await change({ rack: 'C-2' });
    // The first item was tried and its answer was lost: it is frozen, so the put-back is an item of its own.
    const unsent = require('@/features/unsent/unsentStore') as { initUnsent(): Promise<void> };
    const { rawRun } = require('@/tests/unsent/unsentPhone') as typeof import('@/tests/unsent/unsentPhone');
    await rawRun("UPDATE items SET state = 'sending', attempts = 1");
    await unsent.initUnsent();
    await change({ rack: 'A-1' });
    expect(rows()).toHaveLength(2);
    expect(overlay().marker('lot', 'l01')).toBeNull();
    expect(overlay().changedFields('grn', GRN_A)).toEqual([]);
  });
});

describe('values read by search and filters (O4)', () => {
  it('Find goods finds the lot by its unsent rack and no longer by the old one', async () => {
    await start();
    expect((await findGoodsIds('a-1')).ids).toEqual(['l01']);
    await change({ rack: 'C-2' });
    expect((await findGoodsIds('c-2')).ids).toEqual(['l01']);
    expect((await findGoodsIds('a-1')).ids).toEqual([]);
    expect((await findGoodsIds('a-1')).total).toBe(0);
  });

  it('the GRN list searches by the unsent rack too', async () => {
    await start();
    await change({ rack: 'C-2' });
    expect(await listIds({ search: 'c-2' })).toEqual(['l01']);
    expect(await listIds({ search: 'a-1' })).toEqual([]);
  });

  it('the mark filter follows the unsent mark', async () => {
    await start();
    await change({ package_mark: 'ZZ-1' });
    expect(await listIds({ package_mark: 'zz-1' })).toEqual(['l01']);
    expect(await listIds({ package_mark: 'pk-77' })).toEqual([]);
    expect(await listIds({ package_mark: 'pk-78' })).toEqual(['l02']);
  });

  it('with no unsent work the results are the copy\'s (parity)', async () => {
    await start();
    expect((await findGoodsIds('a-')).ids).toEqual(['l01', 'l02']);
    expect(await listIds({ package_mark: 'pk-7' })).toEqual(['l01', 'l02']);
  });

  it('a blank rack is searchable as blank: the old rack no longer finds the lot', async () => {
    await start();
    await change({ rack: '   ' });
    expect((await findGoodsIds('a-1')).ids).toEqual([]);
  });
});

describe('another person (O3)', () => {
  it('changes nothing on this person\'s screens: no marker, no value', async () => {
    await start();
    await change({ rack: 'C-2' });
    env.subject = 'user-2';
    await (require('@/features/unsent/unsentStore') as { initUnsent(): Promise<void> }).initUnsent();
    expect(overlay().marker('lot', 'l01')).toBeNull();
    expect(overlay().marker('grn', GRN_A)).toBeNull();
    expect(overlay().lot('l01')).toBeNull();
    expect(overlay().lotValues().size).toBe(0);
  });
});

describe('a server-read details page (O7)', () => {
  it('shows an unsent rack, never the server\'s old one', async () => {
    await start();
    await change({ rack: 'C-2' });
    // A copy that is not ready sends the read to the server; the server (reachable now) answers with its old values.
    await setReachable(true);
    w.phone.engine.setCopyOffline(false);
    await w.phone.engine.stopPhoneCopy();
    w.answers.set_lot_rack_and_mark = () => ({ data: null, error: { message: 'Network request failed' } });
    w.answers.get_grn_details = () => ({
      data: { success: true, grn: { id: GRN_A, gr_no: 'G-001', header_images: [], items: [
        { id: 'l01', rack: 'A-1', package_mark: 'PK-77', item_images: [] },
        { id: 'l02', rack: 'A-2', package_mark: 'PK-78', item_images: [] },
      ] } },
      error: null,
    });
    const { getGRNDetails } = require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service');
    const result = await getGRNDetails(GRN_A);
    await settleWrites();
    const items = (result.data as unknown as { grn: { items: { id: string; rack: string }[] } }).grn.items;
    expect(items.find(item => item.id === 'l01')?.rack).toBe('C-2');
    expect(items.find(item => item.id === 'l02')?.rack).toBe('A-2');
  });
});

describe('a sent item holds its values until the next sync ends (O2)', () => {
  it('after "sent" and before the sync run ends: the new value and no marker; after it: the copy\'s value, no overlay', async () => {
    await start();
    await change({ rack: 'C-2' });
    // The server holds the change from now on, and the next sync brings it to the copy.
    w.answers.set_lot_rack_and_mark = () => ({
      data: { success: true, lot: { id: 'l01', gr_id: GRN_A, rack: 'C-2', package_mark: 'PK-77' }, grn: { id: GRN_A, gr_no: 1, updated_at: 'x' }, changed: ['rack'], replaced: [] },
      error: null,
    });
    const gate = env.feed.hold(call => call.name === 'get_sync_changes');
    await setReachable(true);
    w.phone.engine.setCopyOffline(false);
    const { sendNow } = require('@/features/unsent/sendEngine') as { sendNow(reason: string): Promise<void> };
    await sendNow('send-now');
    expect(rows().map(row => row.state)).toEqual(['sent']);
    expect(overlay().marker('lot', 'l01')).toBeNull();
    expect(overlay().lot('l01')).toEqual({ rack: 'C-2' });
    gate.release();
    for (let i = 0; i < 30 && overlay().lot('l01') !== null; i += 1) await settleWrites();
    expect(overlay().lot('l01')).toBeNull();
    expect(overlay().changedFields('grn', GRN_A)).toEqual([]);
  });
});
