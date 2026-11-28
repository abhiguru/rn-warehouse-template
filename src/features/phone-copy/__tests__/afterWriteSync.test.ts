/**
 * WH-299, release review Medium (contract §10.5 "After an online write"): a record saved online reaches the copy the
 * screens read before a screen shows it. Real: facilityWrite (noteDataWrite, withoutWriteNote), the sync engine, the copy,
 * grn-service, grn-detail-service, customer-service, admin-user-service. Faked at the edge: the server's answers (feed
 * pages and the RPC/table answers of wh299Phone) and the phone's native modules. The write itself is the real
 * `noteDataWrite` that `sessionFetch` calls (the request layer is tested in src/config/__tests__/sessionFetchWriteNote.test.ts).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - A sync is counted by the feed's get_sync_changes calls after the first load (every run makes one).
 *  - `waitForSyncAfterWrite`, `noteDataWrite`, `withoutWriteNote` and `subscribeFacilityWrite` are the names in the build.
 * ==================================
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { grnFeedRow, grnNamed, lotNamed, seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootWarehouse, copySource, goOffline, loadCopy, sourceOf, type Warehouse } from '@/tests/phoneCopy/wh299Phone';

const BASE = 'https://warehouse.example.test/rest/v1';
const facilityWrite = () => require('@/config/facilityWrite') as typeof import('@/config/facilityWrite');
const grnService = () => require('@/services/grn-service') as typeof import('@/services/grn-service');
const grnDetails = (id: string) => (require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service')).getGRNDetails(id);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const syncs = () => env.feed.named('get_sync_changes').length;

const NEW_GRN = { ...grnFeedRow({ ...grnNamed('B1'), id: 'g-N1', gr_no: 'N1' }) };
const NEW_LOT = { ...lotNamed('l06'), id: 'l-N1', gr_id: 'g-N1', package_mark: 'FRESH-1' };
const upsert = (e: string, id: string, row: unknown) => ({ e, id, op: 'upsert', v: 'a3f09c2b11d4e5f6', row });
function pushNewGrnPage() {
  env.feed.changeAnswers.push({
    position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [],
    changes: [upsert('goodsreceived', 'g-N1', NEW_GRN), upsert('goodsreceived_trl', 'l-N1', NEW_LOT)] as never,
  });
}
const note = (path: string) => facilityWrite().noteDataWrite(`${BASE}${path}`);

async function ready(role: 'admin' | 'staff' = 'staff'): Promise<Warehouse> {
  const w = await bootWarehouse({ role });
  await loadCopy(w);
  return w;
}

beforeEach(() => { resetEnv(); seedWarehouse(); });
afterEach(async () => { await eraseEverything(); });

describe('one sync after an online write', () => {
  it.each([
    ['save_grn', '/rpc/save_grn'],
    ['create dispatch', '/rpc/create_dispatch'],
    ['an invoice', '/rpc/create_invoice'],
    ['a payment', '/payments'],
    ['a new customer', '/customers'],
  ])('%s: exactly one sync, asked after the write', async (_what, path) => {
    await ready();
    const before = syncs();
    note(path);
    expect(syncs()).toBe(before);          // not at once: it waits for the writes to stop
    await sleep(900);
    expect(syncs()).toBe(before + 1);
    await sleep(900);
    expect(syncs()).toBe(before + 1);      // and nothing more
  });

  it('several writes within 400 ms make one sync', async () => {
    await ready();
    const before = syncs();
    note('/rpc/save_grn');
    await sleep(150);
    note('/payments');
    await sleep(150);
    note('/customers');
    await sleep(1000);
    expect(syncs()).toBe(before + 1);
  });

  it('a write during a run makes the run go once more, and no more than once', async () => {
    const w = await ready();
    const before = syncs();
    const gate = env.feed.hold(call => call.name === 'get_sync_changes');
    const run = w.phone.engine.syncNow('interval');
    await gate.opened;
    note('/rpc/save_grn');
    gate.release();
    await run;
    await sleep(1200);
    expect(syncs()).toBe(before + 2);
  });

  it('no loop: a sync, and the feed\'s own get_sync_* calls, schedule no further sync', async () => {
    const w = await ready();
    const before = syncs();
    expect(await w.phone.engine.syncNow('interval')).toBe('done');
    await sleep(1000);
    expect(syncs()).toBe(before + 1);
    // after a write's own sync, the run that brings the write in asks for nothing more
    note('/rpc/save_grn');
    await sleep(1500);
    expect(syncs()).toBe(before + 2);
    await sleep(1000);
    expect(syncs()).toBe(before + 2);
  });

  it.each([
    'can_make_bills', 'suggest_document_number', 'mark_held_item_seen', 'make_pairing_code', 'set_my_language',
    'revoke_session', 'operator_review_enrollment', 'review_enrollment_again', 'submit_connection_notes',
  ])('%s changes nothing the copy holds: no sync', async rpc => {
    await ready();
    const before = syncs();
    note(`/rpc/${rpc}`);
    await sleep(900);
    expect(syncs()).toBe(before);
  });

  it('a Storage object or an edge function is not the facility\'s data: no sync', async () => {
    await ready();
    const before = syncs();
    facilityWrite().noteDataWrite('https://warehouse.example.test/storage/v1/object/grn-images/a.jpg');
    facilityWrite().noteDataWrite('https://warehouse.example.test/functions/v1/print-grn-preprinted');
    await sleep(900);
    expect(syncs()).toBe(before);
  });

  it('a write inside withoutWriteNote (a queue send pass) is not noted, and it is noted again after', async () => {
    await ready();
    const before = syncs();
    await facilityWrite().withoutWriteNote(async () => { note('/rpc/save_grn'); note('/rpc/save_grn'); });
    await sleep(900);
    expect(syncs()).toBe(before);
    note('/rpc/save_grn');
    await sleep(900);
    expect(syncs()).toBe(before + 1);
  });

  it('offline: no sync is asked and nothing reaches the server', async () => {
    const w = await ready();
    await goOffline(w);
    const before = syncs();
    note('/rpc/save_grn');
    await sleep(900);
    expect(syncs()).toBe(before);
    expect(w.serverCalls).toEqual([]);
  });

  it('with the copy not loaded yet: no sync is asked', async () => {
    const w = await bootWarehouse({ role: 'staff' });
    await w.phone.engine.startPhoneCopy();
    const before = syncs();
    note('/rpc/save_grn');
    await sleep(900);
    expect(syncs()).toBe(before);
  });
});

describe('waitForSyncAfterWrite', () => {
  it('resolves at once when nothing is owed', async () => {
    const w = await ready();
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    expect(Date.now() - started).toBeLessThan(100);
    expect(syncs()).toBe(env.feed.named('get_sync_changes').length);
  });

  it('resolves when the sync lands: the list then shows the GRN just saved, and its details open', async () => {
    const w = await ready();
    pushNewGrnPage();
    note('/rpc/save_grn');
    await w.phone.engine.waitForSyncAfterWrite();
    const list = await grnService().getGRNListPage({ p_limit: 50, p_offset: 0, p_filters: { search: 'N1' } }, null);
    expect(list.data.items.map(i => i.grn_item_id)).toEqual(['l-N1']);
    expect(sourceOf(list)).toEqual(copySource());
    const details = await grnDetails('g-N1');
    expect(details).toMatchObject({ success: true });
    expect(w.serverCalls).toEqual([]);
  });

  it('does not sit out the 400 ms that coalesce writes: the person is waiting', async () => {
    const w = await ready();
    pushNewGrnPage();
    note('/rpc/save_grn');
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    expect(Date.now() - started).toBeLessThan(350);
  });

  it('gives up after 3 s when the sync never lands, without hanging; the later sync fills the list', async () => {
    const w = await ready();
    pushNewGrnPage();
    const gate = env.feed.hold(call => call.name === 'get_sync_changes');
    note('/rpc/save_grn');
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(2900);
    expect(waited).toBeLessThan(4000);
    // the list shows without the new GRN (as before the fix) ...
    const before = await grnService().getGRNListPage({ p_limit: 50, p_offset: 0, p_filters: { search: 'N1' } }, null);
    expect(before.data.items).toEqual([]);
    // ... and fills when the run ends
    gate.release();
    await sleep(500);
    const after = await grnService().getGRNListPage({ p_limit: 50, p_offset: 0, p_filters: { search: 'N1' } }, null);
    expect(after.data.items.map(i => i.grn_item_id)).toEqual(['l-N1']);
  }, 15000);

  it('a failed run releases the wait at once (the screen goes on as before)', async () => {
    const w = await ready();
    env.feed.failWhen = call => call.name === 'get_sync_changes';
    note('/rpc/save_grn');
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    expect(Date.now() - started).toBeLessThan(2500);
  }, 15000);

  it('offline it resolves at once', async () => {
    const w = await ready();
    note('/rpc/save_grn');
    await goOffline(w);
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    expect(Date.now() - started).toBeLessThan(100);
  });
});

describe('a record the copy lacks: online reads the server, offline answers from the copy', () => {
  const SERVER_GRN = {
    grn: { id: 'g-N1', gr_no: 'N1', date: '2026-11-27T05:00:00+00:00', customer_id: 'c1', customer_name: 'asha Traders', items: [], header_images: [], statistics: {} },
  };

  it('GRN details: online the server answers; offline "not found" from the copy, no server call', async () => {
    const w = await ready();
    w.answers.get_grn_details = () => ({ data: { success: true, data: SERVER_GRN }, error: null });
    const online: any = await grnDetails('g-N1');
    expect(online).toMatchObject({ success: true });
    expect(sourceOf(online)).toBeUndefined();
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_grn_details']);
    w.serverCalls.length = 0;
    await goOffline(w);
    const offline: any = await grnDetails('g-N1');
    expect(offline).toMatchObject({ success: false, notFound: true });
    expect(sourceOf(offline)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);
  });

  it('online and the server says not found too: it is "not found"', async () => {
    const w = await ready();
    w.answers.get_grn_details = () => ({ data: { success: false, message: 'GRN not found or access denied' }, error: null });
    expect(await grnDetails('g-nowhere')).toMatchObject({ success: false, notFound: true });
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_grn_details']);
  });

  it('a GRN the copy holds is still read from the copy online (no server call)', async () => {
    const w = await ready();
    const details: any = await grnDetails('g-A2');
    expect(details).toMatchObject({ success: true });
    expect(sourceOf(details)).toEqual(copySource());
    expect(w.serverCalls).toEqual([]);
  });

  it('customer: online the server answers; offline "not found" from the copy', async () => {
    env.feed.format = 3;   // customers and users are read from the copy from format 3 (WH-348)
    const w = await ready('admin');
    const customers = require('@/services/customer-service') as typeof import('@/services/customer-service');
    w.answers['from:customers'] = () => ({ data: { id: 'c-new', name: 'Fresh Fictional Traders', mobile: '9000000099', active: true }, error: null });
    const online: any = await customers.customerService.getCustomerById('c-new');
    expect(online).toMatchObject({ success: true });
    expect(w.serverCalls.map(c => c.name)).toEqual(['from:customers']);
    w.serverCalls.length = 0;
    await goOffline(w);
    const offline: any = await customers.customerService.getCustomerById('c-never-read');
    expect(offline).toMatchObject({ success: false, error: 'NOT_FOUND' });
    expect(w.serverCalls).toEqual([]);
  });

  it('user: online the server answers; offline "not found" from the copy', async () => {
    env.feed.format = 3;
    const w = await ready('admin');
    const users = require('@/services/admin-user-service') as typeof import('@/services/admin-user-service');
    w.answers.get_user_details = () => ({
      data: { success: true, user: { id: 'u-new', name: 'Fresh Fictional User', role: 'staff', active: true, mobile: '9000000098' }, assigned_customers: [] },
      error: null,
    });
    const online: any = await users.adminUserService.getUserDetails('u-new');
    expect(online).toMatchObject({ success: true });
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_user_details']);
    w.serverCalls.length = 0;
    await goOffline(w);
    const offline: any = await users.adminUserService.getUserDetails('u-never-read');
    expect(offline).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(w.serverCalls).toEqual([]);
  });
});

describe('with the offline feature off (no copy): nothing here runs', () => {
  it('a write asks for no sync and the wait resolves at once', async () => {
    const w = await bootWarehouse({ role: 'staff', capability: false });
    await w.phone.engine.startPhoneCopy();
    note('/rpc/save_grn');
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    expect(Date.now() - started).toBeLessThan(100);
    await sleep(900);
    expect(env.feed.calls).toEqual([]);
    expect(w.serverCalls).toEqual([]);
  });

  it('GRN details and the lists answer from the server as before, with no after-write effect', async () => {
    const w = await bootWarehouse({ role: 'staff', capability: false });
    w.answers.get_grn_details = () => ({ data: { success: true, data: { grn: { id: 'g-N1', gr_no: 'N1', items: [], header_images: [], statistics: {} } } }, error: null });
    note('/rpc/save_grn');
    const details: any = await grnDetails('g-N1');
    expect(details).toMatchObject({ success: true });
    expect(sourceOf(details)).toBeUndefined();
    expect(w.serverCalls.map(c => c.name)).toEqual(['get_grn_details']);
    expect(env.feed.calls).toEqual([]);
  });
});

// WH-397: a photo's register call is followed by the file upload (not a write the app sees) and then its confirm.
describe('the hold between a photo upload\'s register and its confirm', () => {
  afterEach(() => { jest.useRealTimers(); });
  const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
  const register = (kind: 'grn' | 'dispatch' = 'grn') => note(`/rpc/register_${kind}_image_upload`);
  const confirm = () => note('/rpc/confirm_grn_image_upload');

  it.each(['grn', 'dispatch'] as const)('a registered %s photo holds the sync until its confirm, then the normal 400 ms', async kind => {
    await ready();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const before = syncs();
    register(kind);
    await advance(5000);
    expect(syncs()).toBe(before);              // held: the file is still going up
    confirm();
    await advance(300);
    expect(syncs()).toBe(before);
    await advance(300);
    expect(syncs()).toBe(before + 1);
  });

  it('a cancel (any write after the register) restarts the normal 400 ms in the same way', async () => {
    await ready();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const before = syncs();
    register();
    await advance(2000);
    note('/rpc/cancel_grn_image_upload');
    await advance(700);
    expect(syncs()).toBe(before + 1);
  });

  it('a save with 3 photos makes ONE sync', async () => {
    await ready();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const before = syncs();
    note('/rpc/save_grn');
    for (let i = 0; i < 3; i += 1) {
      register();
      await advance(800);                      // the file goes up
      confirm();
      await advance(100);
    }
    await advance(3000);
    expect(syncs()).toBe(before + 1);
  });

  it('a screen that waits does not sit out the hold', async () => {
    const w = await ready();
    pushNewGrnPage();
    register();
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(syncs()).toBeGreaterThan(0);
  });

  it('an upload that never confirms still gets its sync, at 30 s', async () => {
    await ready();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const before = syncs();
    register();
    await advance(29_900);
    expect(syncs()).toBe(before);
    await advance(300);
    expect(syncs()).toBe(before + 1);
  });
});

// WH-395: the timer, the pending state and the waiters belong to one session and to the run they wait for.
describe('the after-write sync ends with the session and with every run', () => {
  const clearSession = () =>
    (require('@/config/sessionScopedRegistry') as { runSessionScopedClears(context: { dispatch: () => void }): Promise<void> })
      .runSessionScopedClears({ dispatch: () => undefined });

  it('is registered as a session-scoped module', async () => {
    await ready();
    expect((require('@/config/sessionScopedRegistry') as { registeredSessionScopedNames(): string[] }).registeredSessionScopedNames()).toContain('after-write-sync');
  });

  it('a 400 ms timer from the old session does not fire a sync after a facility switch', async () => {
    await ready();
    const before = syncs();
    note('/rpc/save_grn');
    await clearSession();
    await sleep(900);
    expect(syncs()).toBe(before);
  });

  it('what a session noted does not make the next one wait or count', async () => {
    const w = await ready();
    note('/rpc/save_grn');
    await clearSession();
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    expect(Date.now() - started).toBeLessThan(100);
  });

  it('a wait pending at a session change resolves at once, not after 3 s', async () => {
    const w = await ready();
    env.feed.hold(call => call.name === 'get_sync_changes');       // the sync never ends
    note('/rpc/save_grn');
    const started = Date.now();
    const waiting = w.phone.engine.waitForSyncAfterWrite(3000);
    await sleep(100);
    await clearSession();
    await waiting;
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('a wait pending at stopPhoneCopy resolves at once', async () => {
    const w = await ready();
    note('/rpc/save_grn');
    const started = Date.now();
    const waiting = w.phone.engine.waitForSyncAfterWrite(3000);
    await sleep(100);
    await w.phone.engine.stopPhoneCopy();
    await waiting;
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('a wait pending when the app goes to the background (the run is cut) resolves at once', async () => {
    const w = await ready();
    const gate = env.feed.hold(call => call.name === 'get_sync_changes');
    note('/rpc/save_grn');
    const started = Date.now();
    const waiting = w.phone.engine.waitForSyncAfterWrite(3000);
    await gate.opened;
    const stopping = w.phone.engine.stopPhoneCopy();     // the background stop cuts the run in flight
    gate.release();
    await stopping;
    await waiting;
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
