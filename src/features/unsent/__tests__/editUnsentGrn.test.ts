/**
 * WH-161 S6 (product/tech/app-offline-new-records.md §8, Design 10.3 and 10.6 DQ4): Edit of a new GRN still waiting on this
 * phone loads the form from the queued item and saves it back in place, with no server call: the same item, `localId`,
 * `request_key` and recorded time; photos kept, added and removed. While the item is being sent or was already tried, Edit is
 * refused with "Being sent. Try again in a moment."
 *
 * Real: src/features/unsent (queue, rows, store, engine, the newGrn kind, editUnsentGrn), the phone copy. Faked at the edge: the
 * server's answers (`server`), expo-sqlite, files, NetInfo, AppState, the signed-in person (newRecordPhone.ts).
 */
import { eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, GATEWAY_TIMEOUT, keptPhotoFiles, NO_NETWORK, rawRows, server } from '@/tests/unsent/unsentPhone';
import { bootNewRecords, grnPayload, type NewRecordPhone } from '@/tests/unsent/newRecordPhone';

type EditModule = typeof import('@/features/unsent/editUnsentGrn');
type ItemRow = { id: string; kind: string; state: string; body: string; request_key: string; depends_on: string | null; attempts: number };
type PhotoRow = { item_id: string; file: string; client_photo_id: string; role: string; line_ref: string | null };

const edit = () => require('@/features/unsent/editUnsentGrn') as EditModule;
const offlineNew = () => require('@/features/unsent/offlineNew') as typeof import('@/features/unsent/offlineNew');
const store = () => require('@/features/unsent/unsentStore') as typeof import('@/features/unsent/unsentStore');
const items = () => rawRows<ItemRow>('items', 'ORDER BY seq');
const photos = () => rawRows<PhotoRow>('item_photos', 'ORDER BY rowid');
const image = (uri: string) => ({ id: `img-${uri}`, fileName: uri.slice(uri.lastIndexOf('/') + 1), imageUrl: uri, uploadStatus: 'completed' as const });

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30') });
  resetEnv();
  files.reset();
  server.reset();
});
afterEach(async () => {
  jest.useRealTimers();
  await eraseEverything();
});

/** Offline, a new GRN with two header photos is saved on this phone; returns its localId and the item row. */
async function savedOfflineGrn(phone: NewRecordPhone) {
  await phone.offline();
  const first = addPhoto('front.jpg');
  const second = addPhoto('back.jpg');
  const payload = { ...grnPayload(), header: { ...grnPayload().header, gr_images: [image(first), image(second)] } };
  const saved = await offlineNew().saveNewGrn(payload as never, {
    numberMode: 'pending',
    photos: [{ file: first, role: 'header' }, { file: second, role: 'header' }],
  });
  expect(saved.path).toBe('saved');
  await store().refreshUnsent();
  const record = (await items()).find(row => row.kind === 'newGrn')!;
  return { localId: JSON.parse(record.body).localId as string, record };
}

describe('S6: loading an unsent GRN for Edit', () => {
  it('fills the form from the queued item with no server call: number given when sent, the lot ids and the kept photos', async () => {
    const phone = await bootNewRecords();
    const { localId, record } = await savedOfflineGrn(phone);
    const callsBefore = server.calls.length;

    const loaded = await edit().loadUnsentGrnForEdit(localId);

    expect(loaded.kind).toBe('loaded');
    if (loaded.kind !== 'loaded') return;
    expect(loaded.data.numberMode).toBe('pending');
    expect(loaded.data.header).toMatchObject({ gr_no: '', customer_id: 'c1', customer_name: 'asha Traders', date: '2026-11-27' });
    expect(loaded.data.items).toHaveLength(1);
    expect(loaded.data.items[0]).toMatchObject({ item_name: 'Peas', packaging: 'Bag', qty: 40, weight: 25, rack: 'A-1' });
    expect(loaded.data.items[0].grn_trl_id).toBe(JSON.parse(record.body).lotLocalIds[0]);
    expect(loaded.data.header.gr_images?.map(img => img.imageUrl)).toEqual(keptPhotoFiles());
    expect(server.calls.length).toBe(callsBefore);
  });

  it('an id that is not an unsent new GRN is not found, and its state is not-new', async () => {
    const phone = await bootNewRecords();
    await savedOfflineGrn(phone);
    expect(await edit().loadUnsentGrnForEdit('grn-server-77')).toEqual({ kind: 'not-found' });
    expect(edit().unsentGrnEditState('grn-server-77')).toBe('not-new');
  });
});

describe('S6: saving the edited GRN in place', () => {
  it('keeps the item, localId, request_key, lot id and recorded time; changes the lines; keeps one photo, adds one, removes one', async () => {
    const phone = await bootNewRecords();
    const { localId, record } = await savedOfflineGrn(phone);
    const before = JSON.parse(record.body);
    const [keptFront, droppedBack] = keptPhotoFiles();
    const added = addPhoto('side.jpg');
    const callsBefore = server.calls.length;

    const base = grnPayload();
    const edited = {
      ...base,
      header: { ...base.header, gr_images: [image(keptFront), image(added)] },
      items: [{ ...base.items[0], qty: 55 }],
    };
    const outcome = await edit().saveEditedUnsentGrn(localId, edited as never, { ratesNotOnPhone: false, lineIds: [before.lotLocalIds[0]] });

    expect(outcome).toBe('replaced');
    const rows = await items();
    const grnRows = rows.filter(row => row.kind === 'newGrn');
    expect(grnRows).toHaveLength(1);
    expect(grnRows[0]).toMatchObject({ id: record.id, request_key: record.request_key, state: 'saved', attempts: 0 });
    const after = JSON.parse(grnRows[0].body);
    expect(after.localId).toBe(localId);
    expect(after.lotLocalIds).toEqual(before.lotLocalIds);
    expect(after.args).toMatchObject({ p_gr_no: '', p_issue_number: true, p_recorded_at: before.args.p_recorded_at });
    expect(after.args.p_items[0].qty).toBe(55);

    const photosItem = rows.filter(row => row.kind === 'photos');
    expect(photosItem).toHaveLength(1);
    expect(photosItem[0].depends_on).toBe(record.id);
    const kept = await photos();
    expect(kept).toHaveLength(2);
    expect(kept[0].file).toBe(keptFront);
    expect(kept[1].file).toMatch(/unsent-work\/photos\/.*side\.jpg$/);
    expect(files.held.has(droppedBack)).toBe(false);
    expect(files.held.has(added)).toBe(false); // moved into the unsent folder
    expect(server.calls.length).toBe(callsBefore);
  });

  it('removing every photo removes the photos item and its files', async () => {
    const phone = await bootNewRecords();
    const { localId, record } = await savedOfflineGrn(phone);
    const oldFiles = keptPhotoFiles();

    const outcome = await edit().saveEditedUnsentGrn(localId, grnPayload() as never, {
      ratesNotOnPhone: false,
      lineIds: [JSON.parse(record.body).lotLocalIds[0]],
    });

    expect(outcome).toBe('replaced');
    expect((await items()).map(row => row.kind)).toEqual(['newGrn']);
    expect(await photos()).toHaveLength(0);
    for (const file of oldFiles) expect(files.held.has(file)).toBe(false);
  });
});

describe('S6: Edit while the GRN is being sent', () => {
  it('a waiting GRN is editable; while it is sending, Edit is refused and the item is left as it was', async () => {
    const phone = await bootNewRecords();
    const { localId, record } = await savedOfflineGrn(phone);
    expect(edit().unsentGrnEditState(localId)).toBe('editable');

    await phone.online();
    server.answers.save_grn = () => new Promise(() => undefined); // the send never answers: the item stays `sending`
    void phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(100);
    await store().refreshUnsent();
    expect((await items()).find(row => row.id === record.id)!.state).toBe('sending');

    expect(edit().unsentGrnEditState(localId)).toBe('being-sent');
    expect(await edit().loadUnsentGrnForEdit(localId)).toEqual({ kind: 'being-sent' });
    const base = grnPayload();
    const outcome = await edit().saveEditedUnsentGrn(localId, { ...base, items: [{ ...base.items[0], qty: 99 }] } as never, { ratesNotOnPhone: false });
    expect(outcome).toBe('being-sent');
    expect((await items()).find(row => row.id === record.id)!.body).toBe(record.body);
  });

  it('a GRN that was already tried once (answer lost) stays refused for Edit', async () => {
    const phone = await bootNewRecords();
    const { localId, record } = await savedOfflineGrn(phone);

    await phone.online();
    server.answers.save_grn = () => GATEWAY_TIMEOUT; // the request may have run: the item keeps its attempt
    await phone.pass(1_000);
    server.answers.save_grn = () => NO_NETWORK;
    await store().refreshUnsent();
    const row = (await items()).find(r => r.id === record.id)!;
    expect(row.attempts).toBe(1);

    expect(edit().unsentGrnEditState(localId)).toBe('being-sent');
    expect(await edit().loadUnsentGrnForEdit(localId)).toEqual({ kind: 'being-sent' });
    expect(await edit().saveEditedUnsentGrn(localId, grnPayload() as never, { ratesNotOnPhone: false })).toBe('being-sent');
  });

  it('the disabled Edit says why: the sentence and the spoken label', async () => {
    await bootNewRecords();
    const { t } = require('@/i18n') as typeof import('@/i18n');
    expect(t('offline.offlineNew.beingSent')).toBe('Being sent. Try again in a moment.');
    expect(edit().beingSentLabel('Edit')).toBe('Edit, being sent');
  });
});
