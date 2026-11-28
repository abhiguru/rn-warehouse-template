/**
 * WH-299 §10.5 and WH-393: a send pass marks its OWN requests quiet (`quietWrite`), so a DIRECT online save made while a
 * pass is running is noted and synced at once, and the pass asks for exactly one sync for what it sent. Real: the send
 * engine, the queue, the quick-change kind, the sync engine, the copy, facilityWrite. Faked at the edge: the server's answers,
 * the phone's native modules, and the request layer's rule "an accepted write that is not quiet is noted" (the real one is
 * `sessionFetch`, tested in src/config/__tests__/sessionFetchWriteNote.test.ts). The direct save is the real `noteDataWrite`.
 */
import { bootWarehouse, goOffline, loadCopy, type Warehouse } from '@/tests/phoneCopy/wh299Phone';
import { env, eraseEverything, idsOf, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { grnFeedRow, grnNamed, lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const gate = <T>() => { let release!: (v: T) => void; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; };
const upsert = (e: string, id: string, row: unknown) => ({ e, id, op: 'upsert', v: 'a3f09c2b11d4e5f6', row });
const syncs = () => env.feed.named('get_sync_changes').length;
const SENT = { data: { success: true, lot: { id: 'l06', gr_id: 'g-B1', rack: 'Z-1', package_mark: 'pk-99' }, grn: { id: 'g-B1', gr_no: 'B1', updated_at: 'x' }, changed: ['rack'], replaced: [] }, error: null };
const NO_ANSWER = { data: null, error: { message: 'Network request failed' } };

let w: Warehouse;
const sendNow = () => (require('@/features/unsent/sendEngine') as { sendNow(reason: string): Promise<void> }).sendNow('send-now');
const noteWrite = (rpc: string) => (require('@/config/facilityWrite') as typeof import('@/config/facilityWrite')).noteDataWrite(`https://warehouse.example.test/rest/v1/rpc/${rpc}`);
const directSave = () => noteWrite('save_grn');
const pushNewGrn = () => env.feed.changeAnswers.push({
  position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
  changes: [
    upsert('goodsreceived', 'g-N1', grnFeedRow({ ...grnNamed('B1'), id: 'g-N1', gr_no: 'N1' })),
    upsert('goodsreceived_trl', 'l-N1', { ...lotNamed('l06'), id: 'l-N1', gr_id: 'g-N1' }),
  ] as never,
});

type Client = { rpc(name: string, args?: Record<string, unknown>): Promise<{ error: unknown }> };
/** What the request layer does for every client it hands out: an accepted write is noted unless the caller asked for quiet. */
function requestLayer(): void {
  const supabase = require('@/config/supabaseConfig') as { getAuthenticatedClient(options?: { quietWrite?: boolean }): Promise<Client> };
  const base = supabase.getAuthenticatedClient;
  supabase.getAuthenticatedClient = async options => {
    const client = await base();
    return {
      ...client,
      rpc: async (name: string, args?: Record<string, unknown>) => {
        const answer = await client.rpc(name, args);
        if (!answer.error && !options?.quietWrite && !/^(get|search|check|list|count)_/.test(name)) noteWrite(name);
        return answer;
      },
    };
  };
}

/** One quick change of a lot's rack, saved offline, so a pass has something to send; then back online. */
async function startWithOneUnsent(): Promise<void> {
  w = await bootWarehouse({ role: 'staff' });
  requestLayer();
  await loadCopy(w);
  require('@/features/unsent/lotChangeKind');
  const service = require('@/features/quick-change/lotChangeService') as { saveLotChange(input: Record<string, unknown>): Promise<unknown> };
  await (require('@/features/unsent/unsentStore') as { initUnsent(): Promise<void> }).initUnsent();
  await goOffline(w);
  await service.saveLotChange({ lotId: 'l06', grnId: 'g-B1', grnNumber: 'B1', customer: 'asha Traders', copy: { rack: 'D-4', package_mark: 'pk-99' }, rack: 'Z-1' });
  await setReachable(true);
  w.phone.engine.setCopyOffline(false);
}

/** Starts a pass whose one request is held until `release` is called. */
async function passHeld() {
  const hold = gate<unknown>();
  w.answers.set_lot_rack_and_mark = () => hold.promise as never;
  let ended = false;
  const pass = sendNow().then(() => { ended = true; });
  await sleep(200);
  return { pass, release: hold.release, ended: () => ended };
}

beforeEach(() => { resetEnv(); files.reset(); seedWarehouse(); });
afterEach(async () => {
  // End the test's own session while the copy is offline: a lost-answer wait stops, its retry is dropped, and the pass its
  // end asks for returns at once, so nothing runs or logs after the file is torn down.
  w?.phone.engine.setCopyOffline(true);
  (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
  await sleep(100);
  await eraseEverything();
});

describe('a direct online save made while a send pass runs', () => {
  it('the pass\'s own send does not ask for a sync, and the pass asks for exactly one afterwards', async () => {
    await startWithOneUnsent();
    w.answers.set_lot_rack_and_mark = () => SENT;
    const before = syncs();
    await sendNow();
    await sleep(1200);
    expect(syncs()).toBe(before + 1);
  });

  it('is synced at once: the new record is in the copy while the pass is still sending', async () => {
    await startWithOneUnsent();
    const held = await passHeld();
    const before = syncs();
    pushNewGrn();
    directSave();
    await sleep(1200);
    expect(held.ended()).toBe(false);
    expect(syncs()).toBe(before + 1);
    expect(await idsOf(w.phone, 'goodsreceived')).toContain('g-N1');
    held.release(SENT);
    await held.pass;
    await sleep(1200);
    expect(syncs()).toBe(before + 2);    // the save's own, and the pass's own
  }, 15000);

  it('the pass sent nothing (the server did not answer): the new record still appears without waiting for the 45 s interval', async () => {
    await startWithOneUnsent();
    const held = await passHeld();
    pushNewGrn();
    directSave();
    held.release(NO_ANSWER);
    await held.pass;
    await sleep(2500);                 // well under the 45 s interval
    expect(await idsOf(w.phone, 'goodsreceived')).toContain('g-N1');
  }, 15000);
});

describe('waitForSyncAfterWrite for a save made during a send pass', () => {
  const listHas = async (): Promise<boolean> => {
    const list = await (require('@/services/grn-service') as typeof import('@/services/grn-service')).getGRNListPage({ p_limit: 50, p_offset: 0, p_filters: { search: 'N1' } }, null);
    return list.data.items.map(i => i.grn_item_id).includes('l-N1');
  };

  it('does not wait for the pass: the new GRN is in the list the moment the wait resolves, with the pass still sending', async () => {
    await startWithOneUnsent();
    const held = await passHeld();
    const before = syncs();
    pushNewGrn();
    directSave();
    await w.phone.engine.waitForSyncAfterWrite(3000);
    expect(held.ended()).toBe(false);
    expect(await listHas()).toBe(true);
    expect(syncs()).toBe(before + 1);
    held.release(SENT);
    await held.pass;
    await sleep(1500);
    expect(syncs()).toBe(before + 2);
  }, 15000);

  it('resolves well within its 3 s limit when the pass never ends', async () => {
    await startWithOneUnsent();
    const held = await passHeld();
    directSave();
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite(3000);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(held.ended()).toBe(false);
    held.release(SENT);
    await held.pass;
  }, 15000);

  it('offline it resolves at once', async () => {
    await startWithOneUnsent();
    const held = await passHeld();
    directSave();
    await goOffline(w);
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite(3000);
    expect(Date.now() - started).toBeLessThan(150);
    held.release(SENT);
    await held.pass;
  });
});
