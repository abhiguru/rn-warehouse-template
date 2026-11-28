/**
 * WH-385, the ordinary path (contract product/tech/app-missing-photo-note.md sections 4 to 6, cases A1 to A7): a photo of a
 * GRN sent from the unsent queue whose file is gone is queued as a report before any upload starts, sent to the server with
 * `mark_grn_photo_missing`, and kept until the server has taken it or refused it for good. The report outlives the sent item.
 * The count reaches the screens as `photos_missing` of the GRN's details.
 *
 * Real: the unsent store, queue, send engine, photos kind, photo reports, phone copy. Faked at the edge: the server's RPC and
 * storage answers, expo-sqlite, files, NetInfo, AppState, the clock.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, GATEWAY_TIMEOUT, keptPhotoFiles, NO_NETWORK, rawRows, rawRun, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';
import { bootHolding, rpcCalls, serverRefusal, type HoldingPhone } from '@/tests/unsent/holdingPhone';

const REPORT = 'mark_grn_photo_missing';
const ok: RpcAnswer = { data: { success: true }, error: null };
const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);
const reports = () => rpcCalls(REPORT);
const photoReports = () => require('@/features/unsent/photoReports') as typeof import('@/features/unsent/photoReports');

type Report = { scope: string; grn_id: string; client_photo_id: string; role: string; grn_item_id: string | null; reason: string };
async function waiting(): Promise<Report[]> {
  const name = fakeDatabaseNames().find(n => n.includes('unsent-work'))!;
  const sqlite = require('expo-sqlite') as { openDatabaseAsync(n: string): Promise<{ getAllAsync(sql: string): Promise<Report[]> }> };
  return (await sqlite.openDatabaseAsync(name)).getAllAsync('SELECT * FROM photo_reports ORDER BY client_photo_id');
}

function withStorage(): void {
  const supabase = require('@/config/supabaseConfig') as Record<string, unknown>;
  const client = async () => ({
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name.startsWith('get_sync_')) return env.feed.rpc(name, args);
      server.calls.push({ name, args });
      return (await server.answers[name]?.(args)) ?? NO_NETWORK;
    },
    storage: { from: () => ({ upload: async (path: string) => ({ data: { path }, error: null }), remove: async () => ({ data: [], error: null }) }) },
  });
  supabase.getAuthenticatedClient = client;
  supabase.getSupabaseClient = client;
}

async function start(): Promise<HoldingPhone> {
  const phone = await bootHolding({ role: 'staff', withCopy: true });
  withStorage();
  require('@/features/unsent/photosKind');
  server.answers.register_grn_image_upload = () => ({ data: { success: true, image_id: 'img-1', storage_path: 'grn/p.jpg', upload_token: 't' }, error: null });
  server.answers.confirm_grn_image_upload = () => ok;
  await phone.offline();
  return phone;
}

/** A GRN photos item; the files whose index is in `gone` are removed from the phone. */
async function queued(phone: HoldingPhone, photos: { role: string; lineRef?: string }[], gone: number[]) {
  const item = await phone.queue.enqueue({
    kind: 'photos',
    body: { doc: 'grn', recordId: 'g-B1' },
    what: 'Photos',
    customer: 'asha Traders',
    photos: photos.map((photo, i) => ({ file: addPhoto(`report-${i}.jpg`), ...photo })),
  });
  const kept = keptPhotoFiles();
  for (const i of gone) files.held.delete(kept[i]);
  return item;
}

/** A report waiting in the unsent file for the signed-in person, or for `scope`. */
async function plant(phone: HoldingPhone, id: string, scope?: string) {
  const own = scope ?? (await phone.phone.scope())!;
  await rawRun(`INSERT INTO photo_reports (scope, grn_id, client_photo_id, role, grn_item_id, reason, created_at) VALUES ('${own}', 'g-B1', '${id}', 'header', NULL, 'file_missing', 1)`);
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-28T09:00:00+05:30'), doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
  resetEnv();
  files.reset();
  server.reset();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

describe('A2: a photo marked missing is queued before any upload, and sent once', () => {
  it('the report is in the file when the first upload is registered, then goes with the GRN, the line and the reason', async () => {
    const phone = await start();
    await queued(phone, [{ role: 'header' }, { role: 'item', lineRef: 'item-7' }], [1]);
    let atRegister: Report[] = [];
    let reportsAtRegister = -1;
    server.answers.register_grn_image_upload = async () => {
      atRegister = await waiting();
      reportsAtRegister = reports().length;
      return { data: { success: true, image_id: 'img-1', storage_path: 'grn/p.jpg', upload_token: 't' }, error: null };
    };
    server.answers[REPORT] = () => ok;
    await phone.online();
    await phone.pass();

    expect(atRegister).toEqual([expect.objectContaining({ grn_id: 'g-B1', role: 'item', grn_item_id: 'item-7', reason: 'file_missing' })]);
    expect(reportsAtRegister).toBe(0);
    expect(reports().map(call => call.args)).toEqual([
      { p_grn_id: 'g-B1', p_client_photo_id: atRegister[0].client_photo_id, p_role: 'item', p_grn_item_id: 'item-7', p_reason: 'file_missing' },
    ]);
    expect(await waiting()).toEqual([]);
  });

  it('a line that cannot be told is sent as no line: the photo still counts on the GRN', async () => {
    const phone = await start();
    await queued(phone, [{ role: 'item', lineRef: 'index:4' }], [0]);
    server.answers[REPORT] = () => ok;
    await phone.online();
    await phone.pass();
    expect(reports().map(call => [call.args.p_role, call.args.p_grn_item_id])).toEqual([['item', null]]);
  });

  it('an item sent again queues no second report for the same photo', async () => {
    const phone = await start();
    await queued(phone, [{ role: 'header' }, { role: 'header' }], [1]);
    server.answers[REPORT] = () => ok;
    server.answers.register_grn_image_upload = () => NO_NETWORK;
    await phone.online();
    await phone.pass(1_000);
    expect(reports()).toHaveLength(1);
    await phone.pass(120_000);
    expect(rpcCalls('register_grn_image_upload').length).toBeGreaterThanOrEqual(2);
    expect(reports()).toHaveLength(1);
  });
});

describe('A3: the report outlives the sent item', () => {
  it('stays after the item is sent and swept the next day, and goes then', async () => {
    const phone = await start();
    await queued(phone, [{ role: 'header' }], [0]);
    await phone.online();
    await phone.pass(); // the report gets no answer
    expect((await rawRows<{ state: string }>('items')).map(row => row.state)).toEqual(['sent']);
    expect(await waiting()).toHaveLength(1);

    jest.setSystemTime(Date.now() + 26 * 3_600_000);
    await phone.pass();
    expect(await rawRows('items')).toEqual([]);
    expect(await waiting()).toHaveLength(1);

    server.answers[REPORT] = () => ok;
    await photoReports().sendPhotoReports();
    expect(await waiting()).toEqual([]);
  });
});

describe('A4: what ends a report and what keeps it', () => {
  it.each([
    ['taken', ok],
    ['GRN_NOT_FOUND', serverRefusal('GRN_NOT_FOUND', 'gone')],
    ['GRN_PHOTO_LINE_GONE', serverRefusal('GRN_PHOTO_LINE_GONE', 'gone')],
    ['GRN_PHOTO_INVALID', serverRefusal('GRN_PHOTO_INVALID', 'bad')],
  ])('%s: the report is finished', async (_what, answer) => {
    const phone = await start();
    await phone.online();
    await plant(phone, 'cp-1');
    server.answers[REPORT] = () => answer;
    await photoReports().sendPhotoReports();
    expect(reports()).toHaveLength(1);
    expect(await waiting()).toEqual([]);
  });

  it.each([
    ['no network', NO_NETWORK],
    ['a lost answer', GATEWAY_TIMEOUT],
    ['a sign-in problem', { data: null, error: { message: 'JWT expired', status: 401 } }],
    ['no permission (42501)', { data: null, error: { message: 'Staff access required', code: '42501', status: 403 } }],
  ] as [string, RpcAnswer][])('%s: the report is kept', async (_what, answer) => {
    const phone = await start();
    await phone.online();
    await plant(phone, 'cp-1');
    server.answers[REPORT] = () => answer;
    await photoReports().sendPhotoReports();
    expect(reports()).toHaveLength(1);
    expect(await waiting()).toHaveLength(1);
  });
});

describe('A5: no call when the server cannot or must not be told; the reports wait', () => {
  it('offline, and then they go', async () => {
    const phone = await start();
    await plant(phone, 'cp-1');
    server.answers[REPORT] = () => ok;
    await photoReports().sendPhotoReports();
    expect(reports()).toHaveLength(0);
    expect(await waiting()).toHaveLength(1);
    await phone.online();
    await photoReports().sendPhotoReports();
    expect(reports()).toHaveLength(1);
  });

  it('on a server older than the report (244), and not on one that has it (245)', async () => {
    const phone = await start();
    await phone.online();
    await plant(phone, 'cp-1');
    server.answers[REPORT] = () => ok;
    const features = require('@/config/backendFeatures') as typeof import('@/config/backendFeatures');
    const release = (schemaHead: string) => features.setFacilityRelease({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }, { schemaHead });
    release('00000000000244_wh304_holding_list');
    await photoReports().sendPhotoReports();
    expect(reports()).toHaveLength(0);
    expect(await waiting()).toHaveLength(1);
    release('00000000000245_grn_missing_photos');
    await photoReports().sendPhotoReports();
    expect(reports()).toHaveLength(1);
  });

  it('another person\'s or facility\'s report is never sent in this session', async () => {
    const phone = await start();
    await phone.online();
    await plant(phone, 'cp-other', 'someone-else@elsewhere');
    await plant(phone, 'cp-own');
    server.answers[REPORT] = () => ok;
    await photoReports().sendPhotoReports();
    expect(reports().map(call => call.args.p_client_photo_id)).toEqual(['cp-own']);
    expect((await waiting()).map(row => row.client_photo_id)).toEqual(['cp-other']);
  });
});

describe('A6: waiting reports go at the end of a sync run, one run at a time', () => {
  it('only after startPhotoReports, and no more after stopPhotoReports', async () => {
    const phone = await start();
    await phone.online();
    await plant(phone, 'cp-1');
    server.answers[REPORT] = () => ok;
    await phone.sync();
    await advance(1_000);
    expect(reports()).toHaveLength(0);

    photoReports().startPhotoReports();
    await phone.sync();
    await advance(1_000);
    expect(reports()).toHaveLength(1);
    expect(await waiting()).toEqual([]);

    photoReports().stopPhotoReports();
    await plant(phone, 'cp-2');
    await phone.sync();
    await advance(1_000);
    expect(reports()).toHaveLength(1);
  });

  it('a call during a run starts no second request beside it, and the run goes once more', async () => {
    const phone = await start();
    await phone.online();
    await plant(phone, 'cp-1');
    let release!: () => void;
    server.answers[REPORT] = () => new Promise<RpcAnswer>(resolve => { release = () => resolve(NO_NETWORK); });
    const first = photoReports().sendPhotoReports();
    await advance(100);
    const second = photoReports().sendPhotoReports();
    await advance(100);
    expect(reports()).toHaveLength(1);
    server.answers[REPORT] = () => ok;
    release();
    await Promise.all([first, second]);
    expect(reports()).toHaveLength(2);
    expect(await waiting()).toEqual([]);
  });
});

describe('A7: the count the screens read', () => {
  const details = async () => {
    const answer = await (require('@/services/grn-detail-service') as typeof import('@/services/grn-detail-service')).getGRNDetails('g-B1');
    return (answer as unknown as { data: { grn: { photos_missing?: number } } }).data.grn;
  };

  // A customer account's GRN details screen is in src/tests/phoneCopy/customerAccountsDetailsReports.test.tsx.
  it.each([
    ['the number on the GRN\'s copy row', 2, 2],
    ['0 when the row has no such key', undefined, 0],
  ] as const)('%s', async (_what, onRow, expected) => {
    const phone = await bootHolding({ role: 'staff' });
    if (onRow !== undefined) {
      const row = env.feed.rows.goodsreceived.find(each => each.id === 'g-B1')!;
      (row.row as Record<string, unknown>).photos_missing = onRow;
    }
    await phone.phone.engine.startPhoneCopy();
    expect(await phone.phone.engine.syncNow('open')).toBe('done');
    expect((await details()).photos_missing).toBe(expected);
  });
});
