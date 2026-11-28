/**
 * WH-299 §10.5, the edge Dev names: a send pass runs inside `withoutWriteNote`, so a DIRECT online save made while a pass is
 * running is not noted and relies on the pass's own after-send sync. Real: the send engine, the queue, the quick-change kind,
 * the sync engine, the copy, facilityWrite. Faked at the edge: the server's answers and the phone's native modules. The direct
 * save is the real `noteDataWrite` that the request layer calls.
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

let w: Warehouse;
const sendNow = () => (require('@/features/unsent/sendEngine') as { sendNow(reason: string): Promise<void> }).sendNow('send-now');
const directSave = () => (require('@/config/facilityWrite') as typeof import('@/config/facilityWrite')).noteDataWrite('https://warehouse.example.test/rest/v1/rpc/save_grn');
const pushNewGrn = () => env.feed.changeAnswers.push({
  position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
  changes: [
    upsert('goodsreceived', 'g-N1', grnFeedRow({ ...grnNamed('B1'), id: 'g-N1', gr_no: 'N1' })),
    upsert('goodsreceived_trl', 'l-N1', { ...lotNamed('l06'), id: 'l-N1', gr_id: 'g-N1' }),
  ] as never,
});

/** One quick change of a lot's rack, saved offline, so a pass has something to send; then back online. */
async function startWithOneUnsent(): Promise<void> {
  w = await bootWarehouse({ role: 'staff' });
  await loadCopy(w);
  require('@/features/unsent/lotChangeKind');
  const service = require('@/features/quick-change/lotChangeService') as { saveLotChange(input: Record<string, unknown>): Promise<unknown> };
  await (require('@/features/unsent/unsentStore') as { initUnsent(): Promise<void> }).initUnsent();
  await goOffline(w);
  await service.saveLotChange({ lotId: 'l06', grnId: 'g-B1', grnNumber: 'B1', customer: 'asha Traders', copy: { rack: 'D-4', package_mark: 'pk-99' }, rack: 'Z-1' });
  await setReachable(true);
  w.phone.engine.setCopyOffline(false);
}

beforeEach(() => { resetEnv(); files.reset(); seedWarehouse(); });
afterEach(async () => { await eraseEverything(); });

describe('a direct online save made while a send pass runs', () => {
  it('the pass\'s own send does not ask for a sync, and the pass asks for exactly one afterwards', async () => {
    await startWithOneUnsent();
    // the request layer notes every accepted write: the send itself is one, and it must not ask for a sync of its own
    w.answers.set_lot_rack_and_mark = () => { directSave(); return SENT; };
    const before = syncs();
    await sendNow();
    await sleep(1200);
    expect(syncs()).toBe(before + 1);
  });

  it('the pass sent something: the new record is in the copy after the pass\'s own after-send sync', async () => {
    await startWithOneUnsent();
    const hold = gate<unknown>();
    w.answers.set_lot_rack_and_mark = () => hold.promise as never;
    const pass = sendNow();
    await sleep(200);
    pushNewGrn();
    directSave();                      // made while the pass is in flight: not noted
    hold.release(SENT);
    await pass;
    await sleep(1500);
    expect(await idsOf(w.phone, 'goodsreceived')).toContain('g-N1');
  });

  it('the pass sent nothing (the server did not answer): the new record still appears without waiting for the 45 s interval', async () => {
    await startWithOneUnsent();
    const hold = gate<unknown>();
    w.answers.set_lot_rack_and_mark = () => hold.promise as never;
    const pass = sendNow();
    await sleep(200);
    pushNewGrn();
    directSave();
    hold.release({ data: null, error: { message: 'Network request failed' } });
    await pass;
    await sleep(2500);                 // well under the 45 s interval
    expect(await idsOf(w.phone, 'goodsreceived')).toContain('g-N1');
  }, 15000);
});
