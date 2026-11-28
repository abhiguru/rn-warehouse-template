/**
 * WH-299, release review Medium (contract §10.5 "After an online write"): a record saved online reaches the copy the
 * screens read before a screen shows it. Real: facilityWrite (noteDataWrite), the sync engine, the copy,
 * grn-service, grn-detail-service, customer-service, admin-user-service. Faked at the edge: the server's answers (feed
 * pages and the RPC/table answers of wh299Phone) and the phone's native modules. The write itself is the real
 * `noteDataWrite` that `sessionFetch` calls (the request layer is tested in src/config/__tests__/sessionFetchWriteNote.test.ts).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - A sync is counted by the feed's get_sync_changes calls after the first load (every run makes one).
 *  - `waitForSyncAfterWrite`, `noteDataWrite` and `subscribeFacilityWrite` are the names in the build.
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

  // WH-411: naming the session changes nothing the copy holds. A queue send pass's quiet requests (WH-393) are not noted at
  // all: that is the request layer's part, in src/config/__tests__/sessionFetchWriteNote.test.ts.
  it('set_session_device_name asks for no sync, and the next real write still does', async () => {
    await ready();
    const before = syncs();
    note('/rpc/set_session_device_name');
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

// WH-397: online photo uploads hold the after-write sync with a token each (holdAfterWriteSync), released in a finally by the
// upload service. The hold is not sniffed from the URLs of register/confirm/cancel: only a token holds.
describe('the hold while online photo uploads are running (tokens)', () => {
  afterEach(() => { jest.useRealTimers(); });
  const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
  const hold = () => facilityWrite().holdAfterWriteSync();
  const fake = () => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  const clearSession = () =>
    (require('@/config/sessionScopedRegistry') as { runSessionScopedClears(context: { dispatch: () => void }): Promise<void> })
      .runSessionScopedClears({ dispatch: () => undefined });

  it('a plain write with no upload syncs after 400 ms, not before', async () => {
    await ready();
    fake();
    const before = syncs();
    note('/rpc/save_grn');
    await advance(399);
    expect(syncs()).toBe(before);
    await advance(2);
    expect(syncs()).toBe(before + 1);
  });

  it('a register or confirm URL alone holds nothing: only a token does', async () => {
    await ready();
    fake();
    const before = syncs();
    note('/rpc/register_grn_image_upload');
    await advance(500);
    expect(syncs()).toBe(before + 1);
  });

  it.each(['grn', 'dispatch'] as const)('a %s photo upload holds the sync until it releases, then the normal 400 ms', async kind => {
    await ready();
    fake();
    const before = syncs();
    const release = hold();
    note(`/rpc/register_${kind}_image_upload`);
    await advance(5000);
    expect(syncs()).toBe(before);              // held: the file is still going up
    note(`/rpc/confirm_${kind}_image_upload`);
    await advance(5000);
    expect(syncs()).toBe(before);              // a confirm is just a write: the token is what holds
    release();
    await advance(300);
    expect(syncs()).toBe(before);
    await advance(300);
    expect(syncs()).toBe(before + 1);
  });

  it('a photo step during an upload is held, and the 30 s deadline is not pushed out by later photo steps', async () => {
    await ready();
    fake();
    const before = syncs();
    const release = hold();
    note('/rpc/register_grn_image_upload');    // the hold starts here
    await advance(10_000);
    expect(syncs()).toBe(before);
    note('/rpc/confirm_grn_image_upload');     // a later photo step during the hold
    await advance(19_900);                     // 29.9 s after the first photo step
    expect(syncs()).toBe(before);
    await advance(200);
    expect(syncs()).toBe(before + 1);          // the deadline stood
    release();
    await advance(1000);
    expect(syncs()).toBe(before + 1);          // the late release owes nothing more
  });

  it('WH-401: a save made just before the upload starts is not held: it syncs after the normal 400 ms', async () => {
    await ready();
    fake();
    const before = syncs();
    note('/rpc/save_grn');
    hold();                                    // the photos start before the timer fires
    await advance(399);
    expect(syncs()).toBe(before);
    await advance(2);
    expect(syncs()).toBe(before + 1);
  });

  it.each(['/customers', '/rpc/save_grn', '/rpc/update_item'])('WH-401: another write (%s) during a photo hold syncs after 400 ms, replacing the hold', async path => {
    await ready();
    fake();
    const before = syncs();
    const release = hold();
    note('/rpc/register_grn_image_upload');
    await advance(5000);
    expect(syncs()).toBe(before);
    note(path);
    await advance(399);
    expect(syncs()).toBe(before);
    await advance(2);
    expect(syncs()).toBe(before + 1);          // not after the 25 s left of the hold
    await advance(30_000);
    expect(syncs()).toBe(before + 1);          // the replaced hold owes nothing
    release();
  });

  it('WH-399: a photo registration the server refuses holds nothing back: the upload releases its hold and the sync follows', async () => {
    const w = await ready();
    const supabase = require('@/config/supabaseConfig') as Record<string, unknown>;
    supabase.beginOperatorMutation = () => () => undefined;
    // The request layer notes every HTTP 200, a refusal included; then the service reads `success: false`.
    w.answers.register_grn_image_upload = () => {
      note('/rpc/register_grn_image_upload');
      return { data: { success: false, error: 'Fictional refusal' }, error: null };
    };
    const { uploadGRNPhotos } = require('@/features/grn/services/imageUploadService') as typeof import('@/features/grn/services/imageUploadService');
    fake();
    const before = syncs();
    note('/rpc/save_grn');
    const outcome = await uploadGRNPhotos('g-A2', [{
      image: { id: 'temp_book', imageUrl: 'file:///phone/cache/book.webp', uploadStatus: 'completed', fileSize: 1200, mimeType: 'image/webp' } as never,
      imageType: 'header',
    } as never]);
    expect(w.serverCalls.map(c => c.name)).toEqual(['register_grn_image_upload']);
    expect(outcome.failed).toHaveLength(1);
    await advance(401);
    expect(facilityWrite().hasActiveUploadHold()).toBe(false);
    expect(syncs()).toBe(before + 1);
  });

  it('a save with 3 photos makes ONE sync', async () => {
    await ready();
    fake();
    const before = syncs();
    note('/rpc/save_grn');
    const batch = hold();                      // the batch, as uploadGRNPhotos takes it
    for (let i = 0; i < 3; i += 1) {
      const photo = hold();
      note('/rpc/register_grn_image_upload');
      await advance(800);                      // the file goes up
      note('/rpc/confirm_grn_image_upload');
      photo();
      await advance(100);
    }
    await advance(10_000);
    expect(syncs()).toBe(before);              // not one per photo
    batch();
    await advance(3000);
    expect(syncs()).toBe(before + 1);
  });

  it('two saves uploading at once: the hold lasts until both release, then there is one sync', async () => {
    await ready();
    fake();
    const before = syncs();
    const a = hold();
    const b = hold();
    note('/rpc/register_grn_image_upload');
    note('/rpc/register_dispatch_image_upload');
    a();
    await advance(5000);
    expect(syncs()).toBe(before);              // b is still uploading
    b();
    await advance(300);
    expect(syncs()).toBe(before);
    await advance(300);
    expect(syncs()).toBe(before + 1);
    await advance(3000);
    expect(syncs()).toBe(before + 1);
  });

  it('a release called twice frees only its own token', async () => {
    await ready();
    fake();
    const before = syncs();
    const a = hold();
    hold();                                    // b never releases in this test
    note('/rpc/register_grn_image_upload');
    a();
    a();
    await advance(5000);
    expect(syncs()).toBe(before);              // b still holds
    expect(facilityWrite().hasActiveUploadHold()).toBe(true);
  });

  it('a release with no write owed makes no sync', async () => {
    await ready();
    fake();
    const before = syncs();
    hold()();
    await advance(2000);
    expect(syncs()).toBe(before);
  });

  it('the hold is released and the sync follows when the work throws (withAfterWriteSyncHold)', async () => {
    await ready();
    fake();
    const before = syncs();
    note('/rpc/save_grn');
    await expect(facilityWrite().withAfterWriteSyncHold(async () => { throw new Error('upload failed'); })).rejects.toThrow('upload failed');
    expect(facilityWrite().hasActiveUploadHold()).toBe(false);
    await advance(1000);
    expect(syncs()).toBe(before + 1);
  });

  it('a hold that is never released still syncs at the 30 s cap', async () => {
    await ready();
    fake();
    const before = syncs();
    hold();
    note('/rpc/register_grn_image_upload');
    await advance(29_900);
    expect(syncs()).toBe(before);
    await advance(300);
    expect(syncs()).toBe(before + 1);
  });

  it('a screen that waits does not sit out the hold', async () => {
    const w = await ready();
    pushNewGrnPage();
    hold();
    note('/rpc/register_grn_image_upload');
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(syncs()).toBeGreaterThan(0);
  });

  it('a screen that waits gives up at its own limit when the held sync never lands', async () => {
    const w = await ready();
    pushNewGrnPage();
    hold();
    note('/rpc/save_grn');
    env.feed.hold(call => call.name === 'get_sync_changes');
    const started = Date.now();
    await w.phone.engine.waitForSyncAfterWrite(1200);
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(1100);
    expect(waited).toBeLessThan(2500);
  }, 15000);

  describe('the session and the copy', () => {
    it('the token set is registered as a session-scoped module', async () => {
      await ready();
      expect((require('@/config/sessionScopedRegistry') as { registeredSessionScopedNames(): string[] }).registeredSessionScopedNames())
        .toContain('facility-write-upload-holds');
    });

    it('a session clear drops every token: no hold leaks into the next session, a write there syncs at 400 ms', async () => {
      const w = await ready();
      hold();
      hold();
      expect(facilityWrite().hasActiveUploadHold()).toBe(true);
      await clearSession();
      expect(facilityWrite().hasActiveUploadHold()).toBe(false);
      await loadCopy(w);                       // the next session's copy
      fake();
      const before = syncs();
      note('/rpc/register_grn_image_upload');   // a photo step: only a leaked token would hold it
      await advance(500);
      expect(syncs()).toBe(before + 1);
    });

    it('a stale release from the old session does not free a token of the new one', async () => {
      const w = await ready();
      const stale = hold();
      await clearSession();
      await loadCopy(w);
      fake();
      const before = syncs();
      hold();                                  // the new session's upload
      note('/rpc/register_grn_image_upload');
      stale();
      await advance(5000);
      expect(syncs()).toBe(before);
      expect(facilityWrite().hasActiveUploadHold()).toBe(true);
    });

    it('stopPhoneCopy cuts the held timer: the release afterwards makes no sync', async () => {
      const w = await ready();
      fake();
      const before = syncs();
      const release = hold();
      note('/rpc/register_grn_image_upload');
      await w.phone.engine.stopPhoneCopy();
      release();
      await advance(31_000);
      expect(syncs()).toBe(before);
    });

    it('offline: no hold timer is armed and a release makes no sync', async () => {
      const w = await ready();
      await goOffline(w);
      fake();
      const before = syncs();
      const release = hold();
      note('/rpc/register_grn_image_upload');
      await advance(31_000);
      release();
      await advance(1000);
      expect(syncs()).toBe(before);
    });

    it('going offline while held cuts the 30 s timer', async () => {
      const w = await ready();
      fake();
      const before = syncs();
      hold();
      note('/rpc/register_grn_image_upload');
      await goOffline(w);
      await advance(31_000);
      expect(syncs()).toBe(before);
    });
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

// The 'after-write-sync' entry on its own: the whole teardown also stops the copy (which clears the timer too), so this runs
// only that entry, taken from the registry as the module registers it.
describe('the after-write-sync session entry, alone', () => {
  const recorded = new Map<string, (context: { dispatch: () => void }) => void | Promise<void>>();
  beforeEach(() => {
    recorded.clear();
    jest.doMock('@/config/sessionScopedRegistry', () => {
      const actual = jest.requireActual('@/config/sessionScopedRegistry') as typeof import('@/config/sessionScopedRegistry');
      return { ...actual, registerSessionScoped: (name: string, clear: never, options?: never) => { recorded.set(name, clear); return actual.registerSessionScoped(name, clear, options); } };
    });
  });
  afterEach(() => { jest.dontMock('@/config/sessionScopedRegistry'); });
  const endOnlyThisEntry = async () => { await recorded.get('after-write-sync')!({ dispatch: () => undefined }); };

  it('a 400 ms timer from the old session does not fire a sync after a facility switch', async () => {
    await ready();
    expect(recorded.has('after-write-sync')).toBe(true);
    const before = syncs();
    note('/rpc/save_grn');
    await endOnlyThisEntry();
    await sleep(900);
    expect(syncs()).toBe(before);
  });

  it('a wait pending at the session change resolves at once', async () => {
    const w = await ready();
    env.feed.hold(call => call.name === 'get_sync_changes');
    note('/rpc/save_grn');
    const started = Date.now();
    const waiting = w.phone.engine.waitForSyncAfterWrite(3000);
    await sleep(100);
    await endOnlyThisEntry();
    await waiting;
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
