/**
 * WH-393 follow-ups: a send pass's own requests are quiet, so the pass itself asks for the sync at its end. It asks for one
 * when it changed anything on the server (an item held, a photo attached, marked missing, reported or deleted), asks for none
 * when it changed nothing or its session ended, and a photo upload that keeps failing asks for none and is tried again only
 * after the retry waits (a sync's end starts a pass, so a sync asked for it would restart it at once, for ever).
 *
 * Real: the unsent store, send engine, photos kind, hand-over, held-photo sender, photo reports, image deletion, upload
 * rollback, phone copy and facilityWrite. Faked at the edge: the server's RPC and storage answers, the phone's native
 * modules, the clock, and the request layer's rule "an accepted write that is not quiet is noted" (the real `sessionFetch`
 * is tested in src/config/__tests__/sessionFetchWriteNote.test.ts). A sync is counted by the feed's get_sync_changes calls.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { failStatement, fakeDatabaseNames, statementLog } from '@/tests/phoneCopy/fakeExpoSqlite';
import { addPhoto, clearPlannedFailures, keptPhotoFiles, NO_NETWORK, rawRows, rawRun, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';
import { bootHolding, rpcCalls, serverRefusal, type HoldingPhone } from '@/tests/unsent/holdingPhone';

const ok = (extra: Record<string, unknown> = {}): RpcAnswer => ({ data: { success: true, ...extra }, error: null });
const syncs = () => env.feed.named('get_sync_changes').length;
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
let uploadFails: (path: string) => boolean = () => false;

/** The client of the unsent phone with storage, noting every accepted write that is not quiet, as the request layer does. */
function withRequestLayer(): void {
  const supabase = require('@/config/supabaseConfig') as Record<string, unknown>;
  const client = async (options?: { quietWrite?: boolean }) => ({
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name.startsWith('get_sync_')) return env.feed.rpc(name, args);
      server.calls.push({ name, args });
      const answer = (await server.answers[name]?.(args)) ?? NO_NETWORK;
      if (!answer.error && !options?.quietWrite) {
        (require('@/config/facilityWrite') as typeof import('@/config/facilityWrite')).noteDataWrite(`https://warehouse.example.test/rest/v1/rpc/${name}`);
      }
      return answer;
    },
    storage: {
      from: () => ({
        upload: async (path: string) => (uploadFails(path) ? { data: null, error: { message: 'No internet connection' } } : { data: { path }, error: null }),
        remove: async (paths: string[]) => ({ data: paths.map(name => ({ name })), error: null }),
      }),
    },
  });
  supabase.getAuthenticatedClient = client;
  supabase.getSupabaseClient = client;
}

async function start(): Promise<HoldingPhone> {
  const phone = await bootHolding({ role: 'staff', withCopy: true });
  withRequestLayer();
  require('@/features/unsent/photosKind');
  await phone.offline();
  return phone;
}

/** A GRN photos item for a record already on the server, with `count` files and the photos an edit removed. */
async function photosItem(phone: HoldingPhone, count: number, remove: string[] = []) {
  return phone.queue.enqueue({
    kind: 'photos',
    body: { doc: 'grn', recordId: 'g-B1', ...(remove.length ? { remove } : {}) },
    what: 'Photos',
    customer: 'asha Traders',
    photos: Array.from({ length: count }, (_, i) => ({ file: addPhoto(`pass-${i}.jpg`), role: 'header' })),
  });
}
/** The same item as the server holds it: its files go up under the held id. */
async function heldPhotosItem(phone: HoldingPhone, count: number) {
  await photosItem(phone, count);
  await rawRun(`UPDATE items SET state = 'refused', held_id = 'h-1'`);
}

/** Back online: the pass starts. `ms` covers the pass, the 400 ms write delay and the sync, well under any interval sync. */
async function pass(phone: HoldingPhone, ms = 3_000) {
  await phone.online();
  await advance(ms);
}

let registrations = 0;
const registerOk = (): RpcAnswer => {
  registrations += 1;
  return ok({ status: 'registered', image_id: `img-${registrations}`, storage_path: `grn/p-${registrations}.jpg`, upload_token: 't', bucket: 'grn-images' });
};

/** The answer, a few times only: a pass that restarts without a wait then stops on an unanswered call, and the case fails on its count instead of never ending. */
const bounded = (answer: (args: Record<string, any>) => RpcAnswer) => {
  let calls = 0;
  return (args: Record<string, any>): RpcAnswer | Promise<RpcAnswer> => (++calls > 12 ? new Promise<RpcAnswer>(() => {}) : answer(args));
};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-28T09:00:00+05:30'), doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
  resetEnv();
  files.reset();
  server.reset();
  uploadFails = () => false;
  registrations = 0;
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

describe('a pass that changed anything on the server asks for one sync, even with nothing sent', () => {
  async function refused(phone: HoldingPhone) {
    await photosItem(phone, 1);
    await rawRun(`UPDATE items SET state = 'refused'`);
  }

  it('an item handed over to the holding list', async () => {
    const phone = await start();
    await refused(phone);
    server.answers.hold_items = args => ok({ held: (args.p_items as { request_key: string }[]).map(item => ({ request_key: item.request_key, id: 'h-1' })) });
    const before = syncs();
    await pass(phone);
    expect(rpcCalls('hold_items')).toHaveLength(1);
    expect(syncs()).toBe(before + 1);
  });

  it('a hand-over the server did not answer asks for none', async () => {
    const phone = await start();
    await refused(phone);
    const before = syncs();
    await pass(phone);
    expect(rpcCalls('hold_items').length).toBeGreaterThanOrEqual(1);
    expect(syncs()).toBe(before);
  });

  it('a held photo uploaded and confirmed', async () => {
    const phone = await start();
    await heldPhotosItem(phone, 1);
    server.answers.register_held_photo_upload = registerOk;
    server.answers.confirm_held_photo_upload = () => ok();
    const before = syncs();
    await pass(phone);
    expect((await rawRows<{ state: string }>('items'))[0].state).toBe('held');
    expect(syncs()).toBe(before + 1);
  });

  it('a held photo marked missing', async () => {
    const phone = await start();
    await heldPhotosItem(phone, 1);
    for (const path of keptPhotoFiles()) files.held.delete(path);
    server.answers.mark_held_photo_missing = () => ok();
    const before = syncs();
    await pass(phone);
    expect(rpcCalls('mark_held_photo_missing')).toHaveLength(1);
    expect(syncs()).toBe(before + 1);
  });

  it('one photo of an item attached while another fails', async () => {
    const phone = await start();
    await photosItem(phone, 2);
    server.answers.register_grn_image_upload = registerOk;
    server.answers.confirm_grn_image_upload = () => ok();
    server.answers.cancel_grn_image_upload = () => ok();
    uploadFails = path => path !== 'grn/p-1.jpg';
    const before = syncs();
    await pass(phone);
    expect((await rawRows<{ done: number }>('item_photos')).map(row => row.done).sort()).toEqual([0, 1]);
    expect(syncs()).toBe(before + 1);
  });

  it.each([
    ['taken by the server: one sync', ok(), 1],
    ['refused by the server: none', serverRefusal('GRN_NOT_FOUND', 'gone'), 0],
    ['not answered: none', NO_NETWORK, 0],
  ] as [string, RpcAnswer, number][])('a missing-photo report sent in the pass, %s (WH-385)', async (_what, answer, expected) => {
    const phone = await start();
    await photosItem(phone, 2);
    // One file is gone (reported), the other cannot go up, so nothing is attached and nothing else asks.
    files.held.delete(keptPhotoFiles()[0]);
    server.answers.register_grn_image_upload = registerOk;
    server.answers.cancel_grn_image_upload = () => ok();
    server.answers.mark_grn_photo_missing = () => answer;
    uploadFails = () => true;
    const before = syncs();
    await pass(phone);
    expect(rpcCalls('mark_grn_photo_missing').length).toBeGreaterThanOrEqual(1);
    expect(syncs()).toBe(before + expected);
  });

  it('a photo deleted before the server refused to delete the next one', async () => {
    const phone = await start();
    await photosItem(phone, 0, ['old-1', 'old-2']);
    server.answers.delete_grn_image = args => (args.p_image_id === 'old-1' ? ok({ data: { storage_path: 'grn/old-1.jpg' } }) : serverRefusal('GRN_PHOTO_REQUIRED', 'last'));
    const before = syncs();
    await pass(phone);
    expect(rpcCalls('delete_grn_image')).toHaveLength(2);
    expect((await rawRows<{ state: string }>('items'))[0].state).toBe('refused');
    expect(syncs()).toBe(before + 1);
  });

  it('a deletion that will be repeated (the next one unanswered) asks for none', async () => {
    const phone = await start();
    await photosItem(phone, 0, ['old-1', 'old-2']);
    server.answers.delete_grn_image = args => (args.p_image_id === 'old-1' ? ok({ data: { storage_path: 'grn/old-1.jpg' } }) : NO_NETWORK);
    const before = syncs();
    await pass(phone);
    expect(rpcCalls('delete_grn_image')).toHaveLength(2);
    expect(syncs()).toBe(before);
  });

  it('nothing is asked for a change the server accepted after the pass\'s session ended', async () => {
    const phone = await start();
    await refused(phone);
    let release!: () => void;
    server.answers.hold_items = args => new Promise<RpcAnswer>(resolve => {
      release = () => resolve(ok({ held: (args.p_items as { request_key: string }[]).map(item => ({ request_key: item.request_key, id: 'h-1' })) }));
    });
    const before = syncs();
    await pass(phone, 1_000);
    (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
    release();
    await advance(3_000);
    expect(syncs()).toBe(before);
  });
});

describe('a photo upload that keeps failing', () => {
  it.each([
    ['a GRN photo', 'register_grn_image_upload', photosItem],
    ['a held photo', 'register_held_photo_upload', heldPhotosItem],
  ] as const)('%s: asks for no sync and is tried again only after 5 s, then 15 s', async (_what, register, make) => {
    const phone = await start();
    await make(phone, 1);
    server.answers[register] = bounded(registerOk);
    server.answers.cancel_grn_image_upload = () => ok();
    uploadFails = () => true;
    const before = syncs();
    await pass(phone, 4_000);
    expect(rpcCalls(register)).toHaveLength(1);
    await advance(2_000); // 6 s
    expect(rpcCalls(register)).toHaveLength(2);
    await advance(13_000); // 19 s
    expect(rpcCalls(register)).toHaveLength(2);
    await advance(3_000); // 22 s
    expect(rpcCalls(register)).toHaveLength(3);
    expect(syncs()).toBe(before);
  });
});

// WH-422: an accepted report asks for a sync only once it is gone from the phone, so a store that cannot remove it asks for
// none, and the end of that sync cannot send it again with no wait.
describe('a photo report the phone cannot remove (WH-422)', () => {
  const REPORT = 'mark_grn_photo_missing';
  const photoReports = () => require('@/features/unsent/photoReports') as typeof import('@/features/unsent/photoReports');
  const cannotRemove = () => rawRun("CREATE TRIGGER keep_report BEFORE DELETE ON photo_reports BEGIN SELECT RAISE(ABORT, 'disk I/O error'); END");
  const left = async () => {
    const sqlite = require('expo-sqlite') as { openDatabaseAsync(n: string): Promise<{ getAllAsync(sql: string): Promise<unknown[]> }> };
    const name = fakeDatabaseNames().find(n => n.includes('unsent-work'))!;
    return (await (await sqlite.openDatabaseAsync(name)).getAllAsync('SELECT * FROM photo_reports')).length;
  };
  async function planted() {
    const phone = await start();
    await phone.online();
    await advance(1_000);
    await rawRun(`INSERT INTO photo_reports (scope, grn_id, client_photo_id, role, grn_item_id, reason, created_at) VALUES ('${(await phone.phone.scope())!}', 'g-B1', 'cp-1', 'header', NULL, 'file_missing', 1)`);
    return phone;
  }
  /** One sync run, and time for whatever it, and what follows it, asks. */
  async function run(phone: HoldingPhone) {
    await phone.sync();
    await advance(5_000);
  }

  it('at the end of a sync run: asks for no sync and is not sent again at once; once removable it asks for one, after the removal', async () => {
    const phone = await planted();
    await cannotRemove();
    server.answers[REPORT] = bounded(() => ok());
    photoReports().startPhotoReports();
    const before = syncs();
    await run(phone);
    expect(rpcCalls(REPORT)).toHaveLength(1);
    expect(syncs()).toBe(before + 1); // the run asked for above, and no other
    expect(await left()).toBe(1);

    await rawRun('DROP TRIGGER keep_report');
    await run(phone);
    expect(await left()).toBe(0);
    expect(rpcCalls(REPORT)).toHaveLength(2);
    expect(syncs()).toBe(before + 3); // the run asked for, and the one the removed report asks for
  });

  it('a report refused for good is removed at a run\'s end and asks for none', async () => {
    const phone = await planted();
    server.answers[REPORT] = () => serverRefusal('GRN_NOT_FOUND', 'gone');
    photoReports().startPhotoReports();
    const before = syncs();
    await run(phone);
    expect(await left()).toBe(0);
    expect(syncs()).toBe(before + 1);
  });

  it('in a send pass: asks for no sync and is not sent again at once', async () => {
    const phone = await start();
    await photosItem(phone, 2);
    files.held.delete(keptPhotoFiles()[0]);
    server.answers.register_grn_image_upload = registerOk;
    server.answers.cancel_grn_image_upload = () => ok();
    server.answers[REPORT] = bounded(() => ok());
    uploadFails = () => true;
    await cannotRemove();
    const before = syncs();
    await pass(phone, 4_000);
    expect(rpcCalls(REPORT)).toHaveLength(1);
    expect(await left()).toBe(1);
    expect(syncs()).toBe(before);
  });

  it.each([
    ['a send pass joins a run begun at a sync\'s end: the report asks for its own sync', false],
    ['a sync\'s end joins a run begun by a send pass: the pass is told, and no other sync is asked', true],
  ])('%s', async (_what, passFirst) => {
    await planted();
    let release!: () => void;
    server.answers[REPORT] = () => new Promise<RpcAnswer>(resolve => { release = () => resolve(ok()); });
    const onWrite = jest.fn();
    const asPass = () => photoReports().sendPhotoReports({ quietWrite: true, onWrite });
    const atRunEnd = () => photoReports().sendPhotoReports();
    const before = syncs();
    const first = passFirst ? asPass() : atRunEnd();
    await advance(100);
    const joined = passFirst ? atRunEnd() : asPass();
    release();
    await Promise.all([first, joined]);
    await advance(3_000);
    expect(rpcCalls(REPORT)).toHaveLength(1);
    expect(onWrite).toHaveBeenCalledTimes(passFirst ? 1 : 0);
    expect(syncs()).toBe(before + (passFirst ? 0 : 1));
  });
});

// WH-421: while the phone's own store keeps failing, what failed waits 5, 15, then 30 s before it goes again, whatever
// asks for a pass meanwhile (the sync an accepted write asks for ends in a pass).
describe('a store that keeps failing while a pass records what the server accepted (WH-421)', () => {
  const sendNow = (reason: 'send-now' | 'sync') =>
    (require('@/features/unsent/sendEngine') as typeof import('@/features/unsent/sendEngine')).sendNow(reason);
  const cannotUpdate = (table: 'items' | 'item_photos', when = '') =>
    rawRun(`CREATE TRIGGER keep_${table} BEFORE UPDATE ON ${table} ${when} BEGIN SELECT RAISE(ABORT, 'disk I/O error'); END`);
  const works = (table: 'items' | 'item_photos') => rawRun(`DROP TRIGGER keep_${table}`);
  const holdOk = (args: Record<string, any>): RpcAnswer =>
    ok({ held: (args.p_items as { request_key: string }[]).map(item => ({ request_key: item.request_key, id: 'h-1' })) });

  function answers() {
    server.answers.register_grn_image_upload = bounded(registerOk);
    server.answers.confirm_grn_image_upload = bounded(() => ok());
    server.answers.cancel_grn_image_upload = bounded(() => ok());
    server.answers.register_held_photo_upload = bounded(registerOk);
    server.answers.confirm_held_photo_upload = bounded(() => ok());
    server.answers.mark_held_photo_missing = bounded(() => ok());
    server.answers.hold_items = bounded(holdOk);
  }

  /** `count()` is 1 now, 2 only after 5 s, 3 only after 15 s more. */
  async function paced(count: () => number) {
    await advance(4_000); // 4 s
    expect(count()).toBe(1);
    await advance(2_000); // 6 s
    expect(count()).toBe(2);
    await advance(13_000); // 19 s
    expect(count()).toBe(2);
    await advance(3_000); // 22 s
    expect(count()).toBe(3);
  }

  const photoCases: [string, string, (phone: HoldingPhone) => Promise<void>][] = [
    ['a photo of a sent record, marked done', 'register_grn_image_upload', async phone => { await photosItem(phone, 1); }],
    ['a held photo, marked done', 'register_held_photo_upload', async phone => { await heldPhotosItem(phone, 1); }],
    ['a held photo, marked missing', 'mark_held_photo_missing', async phone => {
      await heldPhotosItem(phone, 1);
      for (const path of keptPhotoFiles()) files.held.delete(path);
    }],
    ['a held photo already missing, its report marked queued', 'mark_held_photo_missing', async phone => {
      await heldPhotosItem(phone, 1);
      await rawRun('UPDATE item_photos SET missing = 1');
    }],
  ];

  it.each(photoCases)('%s: paced, never refused, one sync per accepted change, and it ends once the store works', async (_what, call, arrange) => {
    const phone = await start();
    answers();
    await arrange(phone);
    await cannotUpdate('item_photos');
    const before = syncs();
    await phone.online();
    await paced(() => rpcCalls(call).length);
    await advance(3_000);
    expect(syncs()).toBe(before + 3);
    expect((await rawRows<{ state: string }>('items'))[0].state).not.toBe('held');
    expect((await rawRows<{ state: string }>('items'))[0].state).not.toBe('sent');

    await works('item_photos');
    await advance(60_000);
    expect(rpcCalls(call)).toHaveLength(4);
    expect(['sent', 'held']).toContain((await rawRows<{ state: string }>('items'))[0].state);
    await advance(120_000);
    expect(rpcCalls(call)).toHaveLength(4);
  });

  it('other photo items still go while one waits', async () => {
    const phone = await start();
    answers();
    const stuck = await photosItem(phone, 1);
    const other = await photosItem(phone, 1);
    await cannotUpdate('item_photos', `WHEN old.item_id = '${stuck.id}'`);
    await pass(phone);
    const states = await rawRows<{ id: string; state: string }>('items', 'ORDER BY seq');
    expect(states.find(row => row.id === other.id)?.state).toBe('sent');
    expect(states.find(row => row.id === stuck.id)?.state).not.toBe('sent');
    expect(states.find(row => row.id === stuck.id)?.state).not.toBe('refused');
  });

  it('Send now ends the wait for one try, a longer wait follows, and a session change forgets the wait', async () => {
    const phone = await start();
    answers();
    await photosItem(phone, 1);
    await cannotUpdate('item_photos');
    await pass(phone, 1_000);
    expect(rpcCalls('register_grn_image_upload')).toHaveLength(1);
    void sendNow('sync');
    await advance(500);
    expect(rpcCalls('register_grn_image_upload')).toHaveLength(1);
    void sendNow('send-now');
    await advance(500);
    expect(rpcCalls('register_grn_image_upload')).toHaveLength(2);
    await advance(13_000); // the second failure waits 15 s
    expect(rpcCalls('register_grn_image_upload')).toHaveLength(2);
    await advance(3_000);
    expect(rpcCalls('register_grn_image_upload')).toHaveLength(3);

    (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
    await advance(500);
    void sendNow('sync');
    await advance(500);
    expect(rpcCalls('register_grn_image_upload')).toHaveLength(4);
  });

  it('a record whose missing photo cannot be marked waits, and nothing saved after it goes ahead of it', async () => {
    const phone = await start();
    phone.kinds.registerSendKind('testRecord', {
      lane: 'record',
      send: async body => {
        const client = await (require('@/config/supabaseConfig') as typeof import('@/config/supabaseConfig')).getAuthenticatedClient({ quietWrite: true });
        const answer = await client.rpc('save_test', { p_body: body });
        return phone.engine.classify(answer.data, answer.error);
      },
    });
    server.answers.save_test = () => ok();
    await phone.queue.enqueue({ kind: 'testRecord', body: { n: 1 }, what: 'First', photos: [{ file: addPhoto('first.jpg'), role: 'header' }] });
    await phone.queue.enqueue({ kind: 'testRecord', body: { n: 2 }, what: 'Second' });
    for (const path of keptPhotoFiles()) files.held.delete(path);
    await cannotUpdate('item_photos');
    const marks = () => statementLog().filter(sql => /^UPDATE item_photos SET missing/.test(sql)).length;
    const before = marks();
    await phone.online();
    await paced(() => marks() - before);
    expect(rpcCalls('save_test')).toEqual([]);

    await works('item_photos');
    await advance(60_000);
    expect(rpcCalls('save_test').map(each => each.args.p_body)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('an accepted hand-over the phone cannot record is not offered again at once', async () => {
    const phone = await start();
    answers();
    await photosItem(phone, 1);
    await rawRun(`UPDATE items SET state = 'refused'`);
    // Only the hand-over's own record of it fails.
    await cannotUpdate('items', 'WHEN new.held_id IS NOT NULL');
    await phone.online();
    await paced(() => rpcCalls('hold_items').length);

    await works('items');
    await advance(60_000);
    expect(rpcCalls('hold_items')).toHaveLength(4);
    expect((await rawRows<{ held_id: string | null }>('items'))[0].held_id).toBe('h-1');
  });
});

// WH-420: a store error during the lost-answer check pauses it, and "Send now" ends that wait.
describe('a store that keeps failing during the lost-answer check (WH-420)', () => {
  const sendNow = (reason: 'send-now' | 'sync') =>
    (require('@/features/unsent/sendEngine') as typeof import('@/features/unsent/sendEngine')).sendNow(reason);
  const lookups = () => rpcCalls('get_submission_result').length;
  const saves = () => rpcCalls('save_test').length;

  /** A record whose first answer is lost; from then on the store cannot write the item. */
  async function inDoubt(found: boolean) {
    const phone = await start();
    phone.kinds.registerSendKind('testRecord', {
      lane: 'record',
      send: async () => {
        const client = await (require('@/config/supabaseConfig') as typeof import('@/config/supabaseConfig')).getAuthenticatedClient({ quietWrite: true });
        const answer = await client.rpc('save_test', {});
        return phone.engine.classify(answer.data, answer.error);
      },
    });
    server.answers.save_test = () => ({ data: null, error: { message: 'Gateway Timeout', status: 504 } });
    server.answers.get_submission_result = bounded(() => (found ? { data: { found: true, response: { success: true } }, error: null } : { data: { found: false }, error: null }));
    await phone.queue.enqueue({ kind: 'testRecord', body: {}, what: 'GRN' });
    await phone.online();
    await advance(1_000);
    expect(saves()).toBe(1);
    await rawRun(`CREATE TRIGGER keep_items BEFORE UPDATE ON items BEGIN SELECT RAISE(ABORT, 'disk I/O error'); END`);
    return phone;
  }

  it.each([
    ['before the resend is recorded', false],
    ['while a found answer is applied', true],
  ])('the store fails %s: asked again only after 5, 15, 30 then 60 s, and a sync meanwhile asks nothing', async (_what, found) => {
    await inDoubt(found);
    await advance(9_500); // 10.5 s: the first question, 10 s after the send
    expect(lookups()).toBe(1);
    void sendNow('sync');
    let at = 10_500;
    // [just before the wait ends, just after it]: the waits end at 15, 30, 60, 120 and 180 s.
    for (const [due, count] of [[15_000, 2], [30_000, 3], [60_000, 4], [120_000, 5], [180_000, 6]]) {
      await advance(due - 500 - at);
      expect(lookups()).toBe(count - 1);
      await advance(1_000);
      expect(lookups()).toBe(count);
      at = due + 500;
    }
    expect(saves()).toBe(1);
    expect((await rawRows<{ state: string }>('items'))[0].state).toBe('sending');
  });

  it('Send now ends the wait: one question at once, and after it fails again nothing until the longer wait', async () => {
    await inDoubt(false);
    await advance(11_000); // asked at 10 s; waiting until 15 s
    expect(lookups()).toBe(1);
    void sendNow('send-now');
    await advance(500);
    expect(lookups()).toBe(2);
    await advance(13_500); // 25 s: the second failure at 11 s waits 15 s
    expect(lookups()).toBe(2);
    await advance(2_000);
    expect(lookups()).toBe(3);
  });

  it('once the store works the record settles, and the next failure starts at 5 s again', async () => {
    const phone = await inDoubt(true);
    await advance(10_000); // failed once at 10 s
    await advance(6_000); // failed twice: the next wait is 15 s
    await rawRun('DROP TRIGGER keep_items');
    await advance(20_000);
    expect((await rawRows<{ state: string }>('items'))[0].state).toBe('sent');
    const settled = lookups();

    await phone.queue.enqueue({ kind: 'testRecord', body: {}, what: 'Second GRN' });
    await advance(1_000);
    await rawRun(`CREATE TRIGGER keep_items BEFORE UPDATE ON items BEGIN SELECT RAISE(ABORT, 'disk I/O error'); END`);
    await advance(9_500);
    expect(lookups()).toBe(settled + 1);
    await advance(6_000);
    expect(lookups()).toBe(settled + 2);
  });

  it('a session change during the wait starts nothing', async () => {
    await inDoubt(false);
    await advance(11_000);
    expect(lookups()).toBe(1);
    (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
    await advance(3_000); // 14 s: before the old wait would have ended
    const after = lookups();
    expect(after).toBe(1);
    await advance(60_000);
    expect(lookups()).toBe(1);
  });

  it('a read of the item that keeps failing is tried after 5, 15 and 30 s only, and asks the server nothing', async () => {
    const phone = await start();
    phone.kinds.registerSendKind('testRecord', {
      lane: 'record',
      send: async () => {
        // From the moment the answer is lost, the item cannot be read.
        for (let i = 0; i < 500; i += 1) failStatement(/^SELECT \* FROM items WHERE id = \?$/, new Error('disk I/O error'));
        return { kind: 'lost' };
      },
    });
    const reads = () => statementLog().filter(sql => sql === 'SELECT * FROM items WHERE id = ?').length;
    await phone.queue.enqueue({ kind: 'testRecord', body: {}, what: 'GRN' });
    const before = reads();
    await phone.online();
    await advance(4_000); // 4 s
    expect(reads() - before).toBe(1);
    await advance(2_000); // 6 s
    expect(reads() - before).toBe(2);
    await advance(13_000); // 19 s
    expect(reads() - before).toBe(2);
    await advance(3_000); // 22 s
    expect(reads() - before).toBe(3);
    expect(lookups()).toBe(0);
    clearPlannedFailures();
  });
});
