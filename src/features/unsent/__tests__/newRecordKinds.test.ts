/**
 * WH-161, test first (product/tech/app-offline-new-records.md section 5 and 11; cases K3, K4, K9, K10). The kind's `args` for each
 * number mode (K2) and the Save paths (P) are in newRecordSave.test.ts.
 *
 * Real: src/features/unsent (queue, engine, registry, store, photos kind), the two kinds, the unfinished-form store. Faked at the edge:
 * the server's answers (`server`), expo-sqlite, files, NetInfo, AppState.
 *
 * ===== AGREE WITH DEVELOPMENT (the contract names the functions, not their arguments; ASSUMED) =====
 *  - `queue.enqueueAll(inputs: EnqueueInput[], form?: { kind: 'grn' | 'dispatch' })` -> `{ id, requestKey }[]` in input order. A later input
 *    names an earlier one with `dependsOn: 0` (an index into `inputs`, because no id exists yet); the form row of that kind is removed in
 *    the same transaction and its photo files are taken over (section 5).
 *  - `queue.returnToForm(itemId)` -> void. It removes the record item and its photos item and puts the form row (`forms`, with the same
 *    state) and the photo files back (section 3, K10). It throws, with nothing changed, when it cannot.
 *  - A refusal's `reason` of the kind is the server's `reason` text; `items.last_error` holds it (as in the lotChange tests).
 *  - A photo's `line_ref` on the photos item is `index:<n>` while unsent; the kind sends the GRN item id from `item_mapping` as
 *    `p_grn_item_id` (section 5).
 * =================================================================================================
 */
import { eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, keptPhotoFiles, rawRows, server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords, grnSaved, refusal, type NewRecordPhone } from '@/tests/unsent/newRecordPhone';

type Item = { id: string; kind: string; state: string; body: string; last_error: string | null; depends_on: string | null; attempts: number };
const items = () => rawRows<Item>('items', 'ORDER BY seq');
const photoRows = () => rawRows<{ item_id: string; file: string; role: string; line_ref: string | null; done: number }>('item_photos');
const forms = () => rawRows<{ id: string; kind: string; state: string; photos: string | null }>('forms');
const listed = (phone: NewRecordPhone) => phone.queue.listItems() as unknown as Promise<{ id: string; kind: string; state: string; result: any; reason: string | null }[]>;

type Queue = NewRecordPhone['queue'] & {
  enqueueAll(inputs: unknown[], form?: { kind: 'grn' }): Promise<{ id: string; requestKey: string }[]>;
  returnToForm(itemId: string): Promise<void>;
};

const grnBody = (lines = 1) => ({
  v: 1,
  localId: '5f1c0000-0000-4000-8000-0000000000a1',
  lotLocalIds: Array.from({ length: lines }, (_, index) => `5f1c0000-0000-4000-8000-0000000000b${index}`),
  args: { p_gr_no: '', p_issue_number: true, p_date: '2026-11-27', p_customer_id: 'c1', p_customer_name: 'asha Traders', p_items: Array.from({ length: lines }, () => ({ item_id: 'i1', qty: 40 })), p_warn_duplicate: true },
  show: { customerName: 'asha Traders', lines: Array.from({ length: lines }, () => ({ itemName: 'Peas', packaging: 'Bag' })) },
});
const recordWithPhotos = (photos: { file: string; role: string; lineRef?: string }[], body: unknown = grnBody(2)) => [
  { kind: 'newGrn', body, what: 'New GRN', customer: 'asha Traders', targetRef: { grnId: (body as { localId: string }).localId } },
  { kind: 'photos', body: { doc: 'grn' }, what: 'Photos', customer: 'asha Traders', dependsOn: 0, photos },
];

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30') });
  resetEnv();
  files.reset();
  server.reset();
});
afterEach(async () => {
  // A send pass still running ends by arming a retry: let it end on the fake clock, reset the session, drop the timers,
  // so no retry fires or logs after the file is torn down.
  await jest.advanceTimersByTimeAsync(50);
  await eraseEverything();
  await jest.advanceTimersByTimeAsync(50);
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('K3: the result is flat, and photos find the record and the line', () => {
  it('a GRN\'s result is { grn_id, gr_no, item_mapping } and its photos go to the id and the line the server gave', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    const header = addPhoto('header.jpg');
    const line = addPhoto('line1.jpg');
    const queue = phone.queue as Queue;
    await queue.enqueueAll(recordWithPhotos([{ file: header, role: 'header' }, { file: line, role: 'item', lineRef: 'index:1' }]));
    server.answers.save_grn = () => grnSaved('312', 2);
    server.answers.register_grn_image_upload = args => ({ data: { success: true, image_id: `img-${String(args.p_grn_item_id)}`, storage_path: 'p/x.jpg', upload_token: 't' }, error: null });
    server.answers.confirm_grn_image_upload = () => ({ data: { success: true }, error: null });
    await phone.online();
    await phone.pass();
    const [record] = await listed(phone);
    expect(record.result).toMatchObject({ grn_id: 'grn-server-1', gr_no: '312', item_mapping: [{ index: 0, item_id: 'item-server-0' }, { index: 1, item_id: 'item-server-1' }] });
    const registers = server.calls.filter(call => call.name === 'register_grn_image_upload');
    expect(registers.map(call => [call.args.p_grn_id, call.args.p_image_type, call.args.p_grn_item_id ?? null])).toEqual(
      expect.arrayContaining([['grn-server-1', 'header', null], ['grn-server-1', 'item', 'item-server-1']])
    );
    expect((await photoRows()).every(row => row.done === 1)).toBe(true);
  });
});

describe('K4: the record and its photos item are written together', () => {
  it('both rows exist, the photos item depends on the record, and the form\'s row is gone', async () => {
    const phone = await bootNewRecords();
    const photo = addPhoto('bags.jpg');
    const state = { header: { customer: 'asha Traders' }, photos: [photo] };
    const { saveFormDraft } = require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
    expect(await saveFormDraft({ kind: 'grn', state, customer: 'asha Traders' })).toBe(true);
    expect(await forms()).toHaveLength(1);
    const [record, photos] = await (phone.queue as Queue).enqueueAll(recordWithPhotos([{ file: photo, role: 'header' }]), { kind: 'grn' });
    const rows = await items();
    expect(rows.map(row => row.kind)).toEqual(['newGrn', 'photos']);
    expect(rows[1].depends_on).toBe(record.id);
    expect(photos.id).toBe(rows[1].id);
    expect(await forms()).toHaveLength(0);
    expect((await photoRows()).map(row => row.item_id)).toEqual([photos.id]);
    expect(keptPhotoFiles()).toHaveLength(1); // taken over, not copied
  });

  it('a failure writes neither item and leaves the form', async () => {
    const phone = await bootNewRecords();
    const { saveFormDraft } = require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
    await saveFormDraft({ kind: 'grn', state: { header: {} }, customer: 'asha Traders' });
    const missing = 'file:///phone/cache/never-made.jpg'; // moving a file that is not there fails the save
    await expect((phone.queue as Queue).enqueueAll(recordWithPhotos([{ file: missing, role: 'header' }]), { kind: 'grn' })).rejects.toThrow();
    expect(await items()).toHaveLength(0);
    expect(await forms()).toHaveLength(1);
  });
});

describe('K9: a record refused after the wait takes its photos with it', () => {
  it('the photos item is refused with dependsOnRefused and the record\'s id; neither is counted; the photo files stay', async () => {
    const phone = await bootNewRecords();
    await phone.offline();
    const photo = addPhoto('bags.jpg');
    const [record, photos] = await (phone.queue as Queue).enqueueAll(recordWithPhotos([{ file: photo, role: 'header' }]));
    expect(phone.store.getUnsentSummary().count).toBe(1); // a record with its photos counts once
    server.answers.save_grn = () => refusal('NUMBER_TAKEN', { number: 'G-501' });
    await phone.online();
    await phone.pass();
    const rows = await items();
    expect(rows[0]).toMatchObject({ id: record.id, state: 'refused' });
    expect(rows[0].last_error).toContain('NUMBER_TAKEN');
    expect(rows[1]).toMatchObject({ id: photos.id, state: 'refused', depends_on: record.id });
    expect(rows[1].last_error).toContain('dependsOnRefused');
    expect(server.calls.some(call => call.name === 'register_grn_image_upload')).toBe(false);
    // WH-301 ruling (tech/app-offline-unsent-work.md): until WH-304 holds them on the server, the refused record and its photos still count as one unsent
    // thing, keep the 2-hour clock and refuse the account actions, because the phone has the only copy.
    expect(phone.store.getUnsentSummary().count).toBe(1);
    expect(phone.store.getUnsentSummary().sendBy).toBeGreaterThan(0);
    expect(phone.gate.accountActionAllowed()).toMatchObject({ ok: false });
    expect(keptPhotoFiles()).toHaveLength(1);
  });
});

describe('K10: returnToForm', () => {
  async function saved() {
    const phone = await bootNewRecords();
    await phone.offline();
    const photo = addPhoto('bags.jpg');
    const { saveFormDraft } = require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
    await saveFormDraft({ kind: 'grn', state: { header: { customer: 'asha Traders' }, photos: [photo] }, customer: 'asha Traders' });
    const [record] = await (phone.queue as Queue).enqueueAll(recordWithPhotos([{ file: photo, role: 'header' }]), { kind: 'grn' });
    return { phone, record };
  }

  it('removes both items and gives the form row and its photo files back', async () => {
    const { phone, record } = await saved();
    expect(await forms()).toHaveLength(0);
    await (phone.queue as Queue).returnToForm(record.id);
    expect(await items()).toHaveLength(0);
    expect(await photoRows()).toHaveLength(0);
    const [form] = await forms();
    expect(form.kind).toBe('grn');
    expect(JSON.parse(form.state).header.customer).toBe('asha Traders');
    expect(keptPhotoFiles()).toHaveLength(1); // the photo file is kept for the form, not erased
    expect(JSON.parse(form.photos ?? '[]')).toHaveLength(1);
  });

  it('a failure leaves the items exactly as they were', async () => {
    const { phone, record } = await saved();
    const before = await items();
    const { getUnsentDb } = require('@/features/unsent/unsentDb') as typeof import('@/features/unsent/unsentDb');
    const db = await getUnsentDb();
    const original = db.transaction.bind(db);
    jest.spyOn(db, 'transaction').mockImplementation(async work => original(async tx => { await work(tx); throw new Error('disk full'); }));
    await expect((phone.queue as Queue).returnToForm(record.id)).rejects.toThrow();
    jest.restoreAllMocks();
    expect(await items()).toEqual(before);
    expect(await photoRows()).toHaveLength(1);
    expect(await forms()).toHaveLength(0);
  });
});
