/**
 * WH-304 A-6 and PQ11 (contract product/tech/app-offline-holding-list.md 2.5 and 3; Product PQ2, PQ11): the files of a `photos`
 * item whose record the server holds go up under the item's held id (register, upload, confirm), and the row becomes `held` only
 * when every file is done or missing. A file the phone cannot send is told to the server (`mark_held_photo_missing`, with its
 * reason), so the decider sees it as missing. The administrator's Move carries photos items too.
 *
 * Real: the unsent-work store, queue, send engine, hand-over, photo sender, phone copy. Faked at the edge: the server's RPC
 * answers, the storage upload, expo-sqlite, files, NetInfo, AppState, fake timers (as handOver.test.ts).
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, keptPhotoFiles, NO_NETWORK, rawRows, rawRun, rpcKind, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';
import { bootHolding, rpcCalls, serverRefusal, type HoldingPhone } from '@/tests/unsent/holdingPhone';

const SAVE = 'save_held_photos_test';
const rateMissing = (): RpcAnswer => serverRefusal('RATE_MISSING', 'Missing rate');

const sampleGrnBody = (localId = '5f304000-0000-4000-8000-0000000000p1') => ({
  v: 1,
  localId,
  lotLocalIds: [`${localId}-l1`],
  args: { p_gr_no: '', p_issue_number: true, p_date: '2026-11-27', p_customer_id: 'c1', p_items: [{ item_id: 'i1', qty: 10 }] },
  show: { customerName: 'asha Traders', lines: [{ itemName: 'Beans', packaging: 'Bag' }] },
});

type ItemDbRow = { id: string; kind: string; state: string; held_id: string | null; request_key: string };
type PhotoDbRow = { item_id: string; client_photo_id: string; done: number; missing: number };
const itemRows = () => rawRows<ItemDbRow>('items', 'ORDER BY seq');
const photoRows = () => rawRows<PhotoDbRow>('item_photos');

const holdOk = (prefix: string) => {
  let next = 0;
  return (args: Record<string, any>): RpcAnswer => {
    const list = (args.p_items as { request_key: string }[]) ?? [];
    return { data: { success: true, held: list.map(item => ({ request_key: item.request_key, id: `${prefix}-${(next += 1)}`, state: 'held' })) }, error: null };
  };
};
const registered = (status = 'registered'): RpcAnswer => ({ data: { success: true, status, storage_path: 'held/h-1/p.jpg', bucket: 'grn-images' }, error: null });
const okAnswer: RpcAnswer = { data: { success: true }, error: null };

/** What happened to the files, in order, across the RPCs and the storage upload. */
let steps: string[] = [];
let uploads: { bucket: string; path: string; options: Record<string, unknown> }[] = [];
let uploadError: unknown = null;
let uploadsAllowed = Infinity;
let uploadsSeen = 0;

/** The phone's server client, with the storage upload the held-photo sender needs (the unsent phone's client has only `rpc`). */
function withStorage(): void {
  const supabase = require('@/config/supabaseConfig') as Record<string, unknown>;
  const client = async () => ({
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      server.calls.push({ name, args });
      if (name.startsWith('get_sync_')) return env.feed.rpc(name, args);
      steps.push(name);
      return server.answers[name]?.(args) ?? NO_NETWORK;
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: unknown, options: Record<string, unknown>) => {
          steps.push('upload');
          uploadsSeen += 1;
          const error = uploadsSeen > uploadsAllowed ? { message: 'No internet connection' } : uploadError;
          uploads.push({ bucket, path, options });
          return { data: error ? null : { path }, error };
        },
      }),
    },
  });
  supabase.getAuthenticatedClient = client;
  supabase.getSupabaseClient = client;
}

async function startStaff(): Promise<HoldingPhone> {
  const phone = await bootHolding({ role: 'staff', withCopy: true });
  withStorage();
  phone.kinds.registerSendKind('newGrn', rpcKind(phone, SAVE));
  return phone;
}

/** A refused GRN with a photos item of `count` files behind it, handed over; the files still to go up. */
async function refusedGrnWithPhotos(phone: HoldingPhone, count = 1) {
  await phone.offline();
  const root = await phone.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody(), what: 'New GRN', customer: 'asha Traders' });
  const photos = await phone.queue.enqueue({
    kind: 'photos',
    body: { doc: 'grn' },
    dependsOn: root.id,
    what: 'Photos',
    customer: 'asha Traders',
    photos: Array.from({ length: count }, (_, i) => ({ file: addPhoto(`held-doc-${i}.jpg`), role: 'header' })),
  });
  server.answers[SAVE] = rateMissing;
  server.answers.hold_items = holdOk('h');
  await phone.online();
  return { root, photos };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30'), doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
  resetEnv();
  files.reset();
  server.reset();
  steps = [];
  uploads = [];
  uploadError = null;
  uploadsAllowed = Infinity;
  uploadsSeen = 0;
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

describe('A-6: the files of a held photos item go up under its held id', () => {
  it('registers, uploads and confirms each file, in that order and with these arguments; then the row is held', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    server.answers.register_held_photo_upload = () => registered();
    server.answers.confirm_held_photo_upload = () => okAnswer;
    await phone.pass();

    const names = steps.filter(step => ['register_held_photo_upload', 'upload', 'confirm_held_photo_upload'].includes(step));
    expect(names).toEqual(['register_held_photo_upload', 'upload', 'confirm_held_photo_upload']);
    const [photoRow] = await photoRows();
    const rows = await itemRows();
    const photosItem = rows.find(row => row.kind === 'photos')!;
    expect(rpcCalls('register_held_photo_upload')[0].args).toEqual({
      p_held_id: photosItem.held_id,
      p_client_photo_id: photoRow.client_photo_id,
      p_role: 'header',
      p_file_name: expect.stringMatching(/\.jpg$/),
      p_file_size: 1200,
      p_mime_type: 'image/jpeg',
      p_line_ref: null,
    });
    expect(uploads).toEqual([{ bucket: 'grn-images', path: 'held/h-1/p.jpg', options: expect.objectContaining({ upsert: true }) }]);
    expect(rpcCalls('confirm_held_photo_upload')[0].args).toEqual({ p_held_id: photosItem.held_id, p_client_photo_id: photoRow.client_photo_id });
    expect(photoRow).toMatchObject({ done: 1, missing: 0 });
    expect(photosItem.state).toBe('held');
  });

  it('a resend the server already has confirmed needs no upload and no confirm', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    server.answers.register_held_photo_upload = () => registered('confirmed');
    await phone.pass();
    expect(steps).not.toContain('upload');
    expect(steps).not.toContain('confirm_held_photo_upload');
    expect((await photoRows())[0]).toMatchObject({ done: 1 });
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
  });

  it('the row is held only when every file is done: one file fails, the row stays refused and counted, and the done file is not sent again', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone, 2);
    server.answers.register_held_photo_upload = () => registered();
    server.answers.confirm_held_photo_upload = () => okAnswer;
    // Only the first upload gets through: the second file keeps failing until the test lets it.
    uploadsAllowed = 1;

    await phone.pass();
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('refused');
    expect((await photoRows()).map(photo => photo.done).sort()).toEqual([0, 1]);
    expect(phone.store.getUnsentSummary().count).toBe(1);

    const registersBefore = rpcCalls('register_held_photo_upload').length;
    uploadsAllowed = Infinity;
    await phone.pass();
    expect(rpcCalls('register_held_photo_upload').length - registersBefore).toBe(1);
    expect((await photoRows()).map(photo => photo.done)).toEqual([1, 1]);
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });

  it('an item decided meanwhile (HELD_ALREADY_DECIDED) needs no files: the row is settled at once', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    server.answers.register_held_photo_upload = () => serverRefusal('HELD_ALREADY_DECIDED', 'decided');
    await phone.pass();
    expect(steps).not.toContain('upload');
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
  });
});

describe('PQ11: a photo that cannot be sent is told to the server as missing', () => {
  const missingCalls = () => rpcCalls('mark_held_photo_missing');

  it('a file gone from the phone is reported with reason file_missing, then the row is held', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    for (const path of keptPhotoFiles()) files.held.delete(path);
    server.answers.mark_held_photo_missing = () => okAnswer;
    await phone.pass();

    expect(missingCalls()).toHaveLength(1);
    const photosItem = (await itemRows()).find(row => row.kind === 'photos')!;
    expect(missingCalls()[0].args).toEqual({
      p_held_id: photosItem.held_id,
      p_client_photo_id: (await photoRows())[0].client_photo_id,
      p_role: 'header',
      p_line_ref: null,
      p_reason: 'file_missing',
    });
    expect(steps).not.toContain('register_held_photo_upload');
    expect((await photoRows())[0]).toMatchObject({ missing: 1, done: 0 });
    expect(photosItem.state).toBe('held');
    // The row says so on the phone, with the GRN's missing-photo footnote (Design 7.11c).
    const { rows } = await (require('@/features/unsent/unsentList') as typeof import('@/features/unsent/unsentList')).loadUnsentList();
    expect(rows.find(row => row.id === photosItem.id)).toMatchObject({ photoMissing: true });
  });

  it('(a) a photo the server refuses as invalid is reported with reason invalid and the rest goes on', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone, 2);
    let registers = 0;
    server.answers.register_held_photo_upload = () => (++registers === 1 ? serverRefusal('HELD_PHOTO_INVALID', 'wrong type') : registered());
    server.answers.confirm_held_photo_upload = () => okAnswer;
    server.answers.mark_held_photo_missing = () => okAnswer;
    await phone.pass();

    expect(missingCalls().map(call => call.args.p_reason)).toEqual(['invalid']);
    expect((await photoRows()).map(photo => [photo.missing, photo.done]).sort()).toEqual([[0, 1], [1, 0]]);
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });

  it('(b) a photo refused as not the person\'s is tried again, and marked missing (not_yours) once one full sync run has ended', async () => {
    const phone = await startStaff();
    // PhoneCopyLifecycle starts it with the copy; it does not listen at import. The phone's modules are loaded fresh at boot.
    (require('@/features/holding/heldPhotos') as typeof import('@/features/holding/heldPhotos')).startHeldPhotos();
    // The hand-over asks for a sync at the end of its pass (WH-393), and that is a full run: it is kept from ending here.
    const run = env.feed.hold(call => call.name === 'get_sync_changes');
    await refusedGrnWithPhotos(phone);
    server.answers.register_held_photo_upload = () => serverRefusal('HELD_PHOTO_NOT_YOURS', 'not yours');
    server.answers.mark_held_photo_missing = () => okAnswer;

    // Short passes: the held call must not run into its time limit.
    await phone.pass(1_000);
    await phone.pass(1_000);
    expect(rpcCalls('register_held_photo_upload').length).toBeGreaterThanOrEqual(2);
    expect(missingCalls()).toHaveLength(0);
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('refused');
    expect(phone.store.getUnsentSummary().count).toBe(1);

    run.release();
    await jest.advanceTimersByTimeAsync(1_000); // the run ends
    await phone.pass();
    expect(missingCalls().map(call => call.args.p_reason)).toEqual(['not_yours']);
    expect((await photoRows())[0]).toMatchObject({ missing: 1 });
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
    expect(phone.store.getUnsentSummary().count).toBe(0);
  });

  it('(b) nothing counts sync runs before startHeldPhotos(): a run that ends first does not release a refused photo', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    server.answers.register_held_photo_upload = () => serverRefusal('HELD_PHOTO_NOT_YOURS', 'not yours');
    server.answers.mark_held_photo_missing = () => okAnswer;

    await phone.pass();
    await phone.sync();
    await phone.pass();
    await phone.sync();
    await phone.pass();
    expect(missingCalls()).toHaveLength(0);
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('refused');
  });

  it('session end: the sync runs counted and the first refusals are forgotten, so the next person\'s photo waits a full run of its own', async () => {
    const phone = await startStaff();
    (require('@/features/holding/heldPhotos') as typeof import('@/features/holding/heldPhotos')).startHeldPhotos();
    await refusedGrnWithPhotos(phone);
    // Refused once; the tries after it get no answer, so the run that ends meanwhile releases nothing yet.
    let registers = 0;
    server.answers.register_held_photo_upload = () => (++registers === 1 ? serverRefusal('HELD_PHOTO_NOT_YOURS', 'not yours') : NO_NETWORK);
    server.answers.mark_held_photo_missing = () => okAnswer;

    await phone.pass(); // the first refusal, with no run ended yet
    await phone.sync(); // one run ended: the next refusal would mark the photo missing
    expect(missingCalls()).toHaveLength(0);
    await (require('@/config/sessionScopedRegistry') as typeof import('@/config/sessionScopedRegistry')).runSessionScopedClears({ dispatch: () => undefined });

    server.answers.register_held_photo_upload = () => serverRefusal('HELD_PHOTO_NOT_YOURS', 'not yours');
    const registersBefore = rpcCalls('register_held_photo_upload').length;
    await phone.pass(); // as a first refusal again: tried, and not yet marked
    expect(rpcCalls('register_held_photo_upload').length).toBeGreaterThan(registersBefore);
    expect(missingCalls()).toHaveLength(0);
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('refused');
  });

  it('a report the server did not take is not marked: the photo stays waiting and is reported again next pass', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    for (const path of keptPhotoFiles()) files.held.delete(path);
    server.answers.mark_held_photo_missing = () => NO_NETWORK;
    await phone.pass();
    expect((await photoRows())[0]).toMatchObject({ missing: 0 });
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('refused');
    expect(phone.store.getUnsentSummary().count).toBe(1);

    server.answers.mark_held_photo_missing = () => okAnswer;
    await phone.pass(120_000);
    expect(missingCalls().length).toBeGreaterThanOrEqual(2);
    expect((await photoRows())[0]).toMatchObject({ missing: 1 });
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
  });

  it('a report the server refuses for another reason is finished, not retried for ever: the row is held (WH-385)', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    for (const path of keptPhotoFiles()) files.held.delete(path);
    server.answers.mark_held_photo_missing = () => serverRefusal('HELD_NOT_FOUND', 'no such item');
    await phone.pass();
    expect((await photoRows())[0]).toMatchObject({ missing: 1, done: 0, report_queued: 1 });
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
    expect(phone.store.getUnsentSummary().count).toBe(0);

    await phone.pass(120_000);
    expect(missingCalls()).toHaveLength(1);
  });

  it('WH-385: a photo already marked missing on the phone before the hand-over is reported once, and the row reaches held', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    await rawRun('UPDATE item_photos SET missing = 1');
    server.answers.mark_held_photo_missing = () => okAnswer;
    await phone.pass();
    const item = (await itemRows()).find(row => row.kind === 'photos')!;
    expect(missingCalls().map(call => call.args)).toEqual([expect.objectContaining({ p_held_id: item.held_id, p_reason: 'file_missing', p_role: 'header' })]);
    expect((await photoRows())[0]).toMatchObject({ missing: 1, report_queued: 1 });
    expect(item.state).toBe('held');
    expect(steps).not.toContain('register_held_photo_upload');
    await phone.pass(120_000);
    expect(missingCalls()).toHaveLength(1);
  });

  it('WH-385: that report is kept and retried after a transient failure, and settles on HELD_ALREADY_DECIDED', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    await rawRun('UPDATE item_photos SET missing = 1');
    server.answers.mark_held_photo_missing = () => NO_NETWORK;
    await phone.pass();
    expect((await photoRows())[0]).toMatchObject({ report_queued: 0 });
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('refused');

    server.answers.mark_held_photo_missing = () => serverRefusal('HELD_ALREADY_DECIDED', 'decided');
    const before = missingCalls().length;
    await phone.pass(120_000);
    expect(missingCalls().length).toBeGreaterThan(before);
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
  });

  it('a report for an item decided meanwhile settles the row', async () => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    for (const path of keptPhotoFiles()) files.held.delete(path);
    server.answers.mark_held_photo_missing = () => serverRefusal('HELD_ALREADY_DECIDED', 'decided');
    await phone.pass();
    expect((await itemRows()).find(row => row.kind === 'photos')?.state).toBe('held');
  });
});

describe('WH-304 (migration 244): a late photo whose line or document is gone is marked missing', () => {
  const missingCalls = () => rpcCalls('mark_held_photo_missing');
  const BAD_GATEWAY: RpcAnswer = { data: null, error: { message: 'Bad gateway', status: 502 } };
  const photosRow = async () => (await itemRows()).find(row => row.kind === 'photos')!;

  describe.each([
    ['HELD_PHOTO_LINE_GONE', 'line_gone'],
    ['HELD_PHOTO_DOCUMENT_GONE', 'document_gone'],
  ] as const)('%s', (code, reason) => {
    it.each([
      ['register', () => { server.answers.register_held_photo_upload = () => serverRefusal(code, 'gone'); }],
      ['confirm', () => { server.answers.register_held_photo_upload = () => registered(); server.answers.confirm_held_photo_upload = () => serverRefusal(code, 'gone'); }],
    ] as [string, () => void][])(`answered by %s: reported with reason ${reason}, the row finishes and is not tried again, the tile says missing`, async (_stage, arrange) => {
      const phone = await startStaff();
      await refusedGrnWithPhotos(phone);
      arrange();
      server.answers.mark_held_photo_missing = () => okAnswer;
      await phone.pass();

      const item = await photosRow();
      expect(missingCalls()).toHaveLength(1);
      expect(missingCalls()[0].args).toEqual({
        p_held_id: item.held_id,
        p_client_photo_id: (await photoRows())[0].client_photo_id,
        p_role: 'header',
        p_line_ref: null,
        p_reason: reason,
      });
      expect((await photoRows())[0]).toMatchObject({ missing: 1, done: 0 });
      expect(item.state).toBe('held');
      expect(phone.store.getUnsentSummary().count).toBe(0);
      const { rows } = await (require('@/features/unsent/unsentList') as typeof import('@/features/unsent/unsentList')).loadUnsentList();
      expect(rows.find(row => row.id === item.id)).toMatchObject({ photoMissing: true });

      // Finished: another pass asks nothing more about this photo.
      const registersBefore = rpcCalls('register_held_photo_upload').length;
      await phone.pass();
      expect(rpcCalls('register_held_photo_upload')).toHaveLength(registersBefore);
      expect(missingCalls()).toHaveLength(1);
    });

    it('a report the server could not take (502) leaves the photo for the next pass, which reports again', async () => {
      const phone = await startStaff();
      await refusedGrnWithPhotos(phone);
      server.answers.register_held_photo_upload = () => serverRefusal(code, 'gone');
      server.answers.mark_held_photo_missing = () => BAD_GATEWAY;
      await phone.pass();
      expect((await photoRows())[0]).toMatchObject({ missing: 0 });
      expect((await photosRow()).state).toBe('refused');
      expect(phone.store.getUnsentSummary().count).toBe(1);

      server.answers.mark_held_photo_missing = () => okAnswer;
      await phone.pass(120_000);
      expect(missingCalls().length).toBeGreaterThanOrEqual(2);
      expect(missingCalls().every(call => call.args.p_reason === reason)).toBe(true);
      expect((await photoRows())[0]).toMatchObject({ missing: 1 });
      expect((await photosRow()).state).toBe('held');
    });

    it('the report answered HELD_ALREADY_DECIDED still settles the row as decided', async () => {
      const phone = await startStaff();
      await refusedGrnWithPhotos(phone);
      server.answers.register_held_photo_upload = () => serverRefusal(code, 'gone');
      server.answers.mark_held_photo_missing = () => serverRefusal('HELD_ALREADY_DECIDED', 'decided');
      await phone.pass();
      expect(missingCalls()).toHaveLength(1);
      expect((await photosRow()).state).toBe('held');
      expect(phone.store.getUnsentSummary().count).toBe(0);
    });
  });

  it.each([
    ['register', () => { server.answers.register_held_photo_upload = () => serverRefusal('HELD_PHOTO_SOMETHING_NEW', 'new'); }],
    ['confirm', () => { server.answers.register_held_photo_upload = () => registered(); server.answers.confirm_held_photo_upload = () => serverRefusal('HELD_PHOTO_SOMETHING_NEW', 'new'); }],
  ] as [string, () => void][])('a code the phone does not know, answered by %s, is not "missing": nothing is reported and the photo is tried again', async (_stage, arrange) => {
    const phone = await startStaff();
    await refusedGrnWithPhotos(phone);
    arrange();
    server.answers.mark_held_photo_missing = () => okAnswer;
    await phone.pass();
    expect(missingCalls()).toHaveLength(0);
    expect((await photoRows())[0]).toMatchObject({ missing: 0, done: 0 });
    expect((await photosRow()).state).toBe('refused');

    const registersBefore = rpcCalls('register_held_photo_upload').length;
    await phone.pass(120_000);
    expect(rpcCalls('register_held_photo_upload').length).toBeGreaterThan(registersBefore);
    expect(missingCalls()).toHaveLength(0);
  });
});

describe('A-6: Move to the holding list carries photos items', () => {
  async function seedOther(subject: string, count = 1) {
    env.subject = subject;
    const staff = await startStaff();
    await staff.offline();
    const root = await staff.queue.enqueue({ kind: 'newGrn', body: sampleGrnBody('5f304000-0000-4000-8000-0000000000p2'), what: 'New GRN', customer: 'asha Traders' });
    await staff.queue.enqueue({
      kind: 'photos', body: { doc: 'grn' }, dependsOn: root.id, what: 'Photos', customer: 'asha Traders',
      photos: Array.from({ length: count }, (_, i) => ({ file: addPhoto(`moved-${i}.jpg`), role: 'header' })),
    });
    env.subject = 'admin-user-1';
    const admin = await bootHolding({ role: 'admin', profileId: 'profile-admin-1', profileName: 'Neha Fictional' });
    withStorage();
    return admin;
  }
  const move = (subject: string) => (require('@/features/holding/handOver') as typeof import('@/features/holding/handOver')).moveOtherPersonToHolding(subject);

  it('the files go up first, in the administrator\'s session, and then both items leave the phone', async () => {
    const admin = await seedOther('staff-user-21');
    server.answers.hold_items = holdOk('mv');
    server.answers.register_held_photo_upload = () => registered();
    server.answers.confirm_held_photo_upload = () => okAnswer;
    await admin.online();
    const outcome = await move('staff-user-21');

    expect(outcome).toMatchObject({ moved: 2, remaining: 0 });
    expect(outcome.failed).toBeUndefined();
    expect(steps.filter(step => step !== 'hold_items')).toEqual(['register_held_photo_upload', 'upload', 'confirm_held_photo_upload']);
    expect(steps.indexOf('hold_items')).toBeLessThan(steps.indexOf('register_held_photo_upload'));
    expect(await itemRows()).toHaveLength(0);
  });

  it('a file that does not go up keeps the photos item and the record it follows for the next try, which sends the rest and removes both', async () => {
    const admin = await seedOther('staff-user-22');
    server.answers.hold_items = holdOk('mv');
    server.answers.register_held_photo_upload = () => registered();
    server.answers.confirm_held_photo_upload = () => okAnswer;
    uploadError = { message: 'No internet connection' };
    await admin.online();

    const first = await move('staff-user-22');
    expect(first.failed).toBe('transient');
    expect((await itemRows()).map(row => row.kind).sort()).toEqual(['newGrn', 'photos']);

    uploadError = null;
    const holdCalls = rpcCalls('hold_items').length;
    const second = await move('staff-user-22');
    expect(second.failed).toBeUndefined();
    expect(rpcCalls('hold_items').length).toBe(holdCalls);
    expect(await itemRows()).toHaveLength(0);
  });
});
