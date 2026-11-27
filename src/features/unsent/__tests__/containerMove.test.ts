/**
 * WH-301p (High, from the card's last Test notes): on iOS the app's data container changes at every app update, and the app
 * stores absolute `file://` addresses of kept photos, so after an update an unfinished form's photo does not load and the
 * queued photos would not send. Test first: nothing is built; the cases below fail until the stored addresses are relative.
 *
 * The documents folder changes between save and read (container A to container B, the files move with it,
 * src/tests/unsent/moveContainer.ts).
 *
 * Real: formDrafts, the unsent store, queue, send engine, the file rows. Faked at the edge: expo-sqlite, files, the server's
 * answers, NetInfo, the clock. The send kind in case 2 is a stand-in for a record kind: it reads the item's photo rows
 * (`photosOfItem`) and "uploads" each only when its file is there, as a real photo upload does.
 *
 * ===== AGREE WITH DEVELOPMENT (the fix shape agreed in the brief; exact spellings are guesses) =====
 *  - A stored address is relative to the documents folder: `unsent-work/photos/<name>` (item_photos.file and the forms.photos list).
 *  - Inside a saved form's text it is `app-doc:///unsent-work/photos/<name>`.
 *  - On read both are joined to the current `Paths.document.uri`; callers get full current `file://` addresses
 *    (`loadFormDraft(...).state`, `photosOfItem(...)[].file`).
 *  - A legacy absolute `file://.../Documents/unsent-work/...` from ANY container is rebased on read; no migration step, the
 *    legacy row may stay as it is.
 *  - An address not under `unsent-work/` (a cache file, another Documents folder) is left as it is.
 * ====================================================================================================
 */
import { files } from '@/tests/phoneCopy/fakeFiles';
import { env, eraseEverything, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { addPhoto, bootUnsent, keptPhotoFiles, rawRows, rawRun, server, type RpcAnswer } from '@/tests/unsent/unsentPhone';
import { LEGACY_ROOT, moveDocumentRoot, ROOT_A, ROOT_B } from '@/tests/unsent/moveContainer';

type Phone = Awaited<ReturnType<typeof bootUnsent>>;
type Queue = typeof import('@/features/unsent/unsentQueue');
type Context = import('@/features/unsent/sendKinds').SendContext;
/** The photo rows of an item as the app reads them (the helper's typed view of the queue lacks it). */
const photosOf = (phone: Phone, itemId: string) => (phone.queue as unknown as Queue).photosOfItem(itemId);
const SAVE = 'save_test';
const ok = (number: string): RpcAnswer => ({ data: { success: true, number }, error: null });
const formsModule = () => require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
const exists = (uri: string) => { const { File } = require('expo-file-system') as typeof import('expo-file-system'); return new File(uri).exists; };
const formState = (photos: string[]) => ({
  header: { gr_no: 'RV15001', customer_name: 'Asha Fictional Traders', gr_images: photos.map(uri => ({ uri })) },
  items: [],
});
const imagesOf = (state: unknown) => (state as { header: { gr_images: { uri: string }[] } }).header.gr_images.map(image => image.uri);

async function start(): Promise<Phone> {
  const phone = await bootUnsent();
  // A kind with a file: each photo of the item is uploaded only if its file is on the phone ("file not found" otherwise).
  phone.kinds.registerSendKind('testRecord', {
    lane: 'record',
    send: async (body, ctx) => {
      const { getAuthenticatedClient } = require('@/config/supabaseConfig') as { getAuthenticatedClient(): Promise<{ rpc(n: string, a: unknown): Promise<RpcAnswer> }> };
      const answer = await (await getAuthenticatedClient()).rpc(SAVE, { p_key: ctx.requestKey, p_body: body });
      return phone.engine.classify(answer.data, answer.error);
    },
  });
  phone.kinds.registerSendKind('testPhoto', {
    lane: 'photo',
    send: async (_body, context) => {
      const ctx = context as Context;
      const rows = await photosOf(phone, ctx.itemId);
      const missing = rows.filter(row => !exists(row.file));
      if (missing.length > 0) return { kind: 'refused', reason: 'file not found' };
      const { getAuthenticatedClient } = require('@/config/supabaseConfig') as { getAuthenticatedClient(): Promise<{ rpc(n: string, a: unknown): Promise<RpcAnswer> }> };
      const answer = await (await getAuthenticatedClient()).rpc('save_photo', { p_key: ctx.requestKey, files: rows.map(row => row.file) });
      return phone.engine.classify(answer.data, answer.error);
    },
  });
  await phone.store.initUnsent();
  return phone;
}

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-26T09:00:00+05:30') }); resetEnv(); files.reset(); server.reset(); env.subject = 'user-1'; });
afterEach(async () => { jest.useRealTimers(); await eraseEverything(); });

describe('an unfinished form after the documents folder changed', () => {
  it('gives the photo back under the new folder, the file is there, and the stored text holds no absolute address', async () => {
    await start();
    const { saveFormDraft, loadFormDraft } = formsModule();
    expect(await saveFormDraft({ kind: 'grn', state: formState([addPhoto('pick.jpg')]) })).toBe(true);
    expect(keptPhotoFiles()).toHaveLength(1);

    moveDocumentRoot(ROOT_A, ROOT_B);

    const [photo] = imagesOf((await loadFormDraft('grn'))?.state);
    expect(photo.startsWith(`${ROOT_B}unsent-work/photos/`)).toBe(true);
    expect(exists(photo)).toBe(true);
    const [row] = await rawRows<{ state: string; photos: string }>('forms');
    expect(row.state).not.toContain('file://');
    expect(imagesOf(JSON.parse(row.state))[0].startsWith('app-doc:///unsent-work/photos/')).toBe(true);
    expect((JSON.parse(row.photos) as string[]).every(entry => entry.startsWith('unsent-work/'))).toBe(true);
  });

  it('saving the form again after the change keeps the one copy and stores nothing absolute', async () => {
    await start();
    const { saveFormDraft, loadFormDraft } = formsModule();
    await saveFormDraft({ kind: 'grn', state: formState([addPhoto('pick.jpg')]) });
    moveDocumentRoot(ROOT_A, ROOT_B);

    const draft = await loadFormDraft('grn');
    expect(await saveFormDraft({ kind: 'grn', state: draft?.state })).toBe(true);

    expect(keptPhotoFiles()).toHaveLength(1);
    const [row] = await rawRows<{ state: string }>('forms');
    expect(row.state).not.toContain('file://');
    expect(imagesOf(await loadFormDraft('grn').then(d => d?.state))[0].startsWith(`${ROOT_B}unsent-work/photos/`)).toBe(true);
  });
});

describe('a queued item with a photo after the documents folder changed', () => {
  const queueWithPhoto = async (phone: Phone) => {
    await setReachable(false);
    phone.phone.engine.setCopyOffline(true);
    const record = await phone.queue.enqueue({ kind: 'testRecord', body: { lines: [{ item: 'Potato', bags: 3 }] }, what: 'GRN 1 for Asha Fictional Traders' });
    const photo = await phone.queue.enqueue({ kind: 'testPhoto', body: { grn: 'x' }, what: 'Photos of the GRN', dependsOn: record.id, photos: [{ file: addPhoto('a.jpg'), role: 'goods' }] });
    return { record, photo };
  };

  it('stores the photo relative to the documents folder and reads it under the new one', async () => {
    const phone = await start();
    const { photo } = await queueWithPhoto(phone);
    const [stored] = await rawRows<{ file: string }>('item_photos');
    expect(stored.file.startsWith('unsent-work/photos/')).toBe(true);

    moveDocumentRoot(ROOT_A, ROOT_B);

    const [read] = await photosOf(phone, photo.id);
    expect(read.file.startsWith(`${ROOT_B}unsent-work/photos/`)).toBe(true);
    expect(exists(read.file)).toBe(true);
  });

  it('sends the photo after the change: the file is found and uploaded from the new folder', async () => {
    const phone = await start();
    const { photo } = await queueWithPhoto(phone);
    moveDocumentRoot(ROOT_A, ROOT_B);
    server.answers[SAVE] = () => ok('GRN 1');
    server.answers.save_photo = () => ok('photo');
    await setReachable(true);
    phone.phone.engine.setCopyOffline(false);

    const done = phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(120_000);
    await done;

    const uploads = server.calls.filter(call => call.name === 'save_photo');
    expect(uploads).toHaveLength(1);
    expect((uploads[0].args.files as string[]).every(file => file.startsWith(`${ROOT_B}unsent-work/photos/`))).toBe(true);
    const [row] = await rawRows<{ missing: number }>('item_photos');
    expect(row.missing).toBe(0);
    const item = (await rawRows<{ id: string; state: string }>('items')).find(entry => entry.id === photo.id);
    expect(item?.state).toBe('sent');
  });
});

describe('rows written before the fix (an absolute address from an older container)', () => {
  const legacy = (name: string) => `${LEGACY_ROOT}unsent-work/photos/${name}`;

  it('rebases a form text and its photo list to the current folder on read', async () => {
    await start();
    const { saveFormDraft, loadFormDraft } = formsModule();
    await saveFormDraft({ kind: 'grn', state: formState([]) });
    moveDocumentRoot(ROOT_A, ROOT_B);
    files.held.set(`${ROOT_B}unsent-work/photos/form-old.jpg`, 1200);
    await rawRun(`UPDATE forms SET state = '${JSON.stringify(formState([legacy('form-old.jpg')]))}', photos = '${JSON.stringify([legacy('form-old.jpg')])}' WHERE kind = 'grn'`);

    const draft = await loadFormDraft('grn');

    expect(imagesOf(draft?.state)).toEqual([`${ROOT_B}unsent-work/photos/form-old.jpg`]);
    expect(exists(imagesOf(draft?.state)[0])).toBe(true);
  });

  it('rebases an item_photos row to the current folder on read, and the send finds the file', async () => {
    const phone = await start();
    await setReachable(false);
    phone.phone.engine.setCopyOffline(true);
    const record = await phone.queue.enqueue({ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders' });
    const photo = await phone.queue.enqueue({ kind: 'testPhoto', body: {}, what: 'Photos of the GRN', dependsOn: record.id, photos: [{ file: addPhoto('a.jpg'), role: 'goods' }] });
    moveDocumentRoot(ROOT_A, ROOT_B);
    const [kept] = keptPhotoFiles();
    const name = kept.slice(kept.lastIndexOf('/') + 1);
    await rawRun(`UPDATE item_photos SET file = '${legacy(name)}'`);

    const [read] = await photosOf(phone, photo.id);
    expect(read.file).toBe(`${ROOT_B}unsent-work/photos/${name}`);

    server.answers[SAVE] = () => ok('GRN 1');
    server.answers.save_photo = () => ok('photo');
    await setReachable(true);
    phone.phone.engine.setCopyOffline(false);
    const done = phone.engine.sendNow('send-now');
    await jest.advanceTimersByTimeAsync(120_000);
    await done;
    expect(server.calls.filter(call => call.name === 'save_photo')).toHaveLength(1);
    expect((await rawRows<{ missing: number }>('item_photos'))[0].missing).toBe(0);
  });
});

describe('addresses that are not the unsent folder', () => {
  it('leaves a cache file and another Documents folder as they are on read (a guard against rebasing too much)', async () => {
    await start();
    const { saveFormDraft, loadFormDraft } = formsModule();
    await saveFormDraft({ kind: 'grn', state: formState([]) });
    moveDocumentRoot(ROOT_A, ROOT_B);
    const cache = 'file:///var/mobile/Containers/Data/Application/OLD-ID/Library/Caches/ImagePicker/other.jpg';
    const copyPhoto = `${LEGACY_ROOT}phone-copy-photos/abc123`;
    await rawRun(`UPDATE forms SET state = '${JSON.stringify(formState([cache, copyPhoto]))}' WHERE kind = 'grn'`);

    expect(imagesOf((await loadFormDraft('grn'))?.state)).toEqual([cache, copyPhoto]);
  });
});

describe('an address that climbs out of the unsent folder (WH-301p: `..` is never accepted)', () => {
  const climbing = [
    `${LEGACY_ROOT}unsent-work/../../x.jpg`,
    `${ROOT_B}unsent-work/photos/../../../secret.jpg`,
    `${LEGACY_ROOT}unsent-work/%2e%2e/%2e%2e/x.jpg`,
  ];

  it('is not rebased onto the current folder in a form text', async () => {
    await start();
    const { saveFormDraft, loadFormDraft } = formsModule();
    await saveFormDraft({ kind: 'grn', state: formState([]) });
    moveDocumentRoot(ROOT_A, ROOT_B);
    await rawRun(`UPDATE forms SET state = '${JSON.stringify(formState(climbing))}' WHERE kind = 'grn'`);

    const images = imagesOf((await loadFormDraft('grn'))?.state);

    expect(images).toEqual(climbing);
    expect(images[0].startsWith(ROOT_B)).toBe(false);
  });

  it('is never handed to a send as a file of the queued item', async () => {
    const phone = await start();
    await setReachable(false);
    phone.phone.engine.setCopyOffline(true);
    const record = await phone.queue.enqueue({ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders' });
    const photo = await phone.queue.enqueue({ kind: 'testPhoto', body: {}, what: 'Photos of the GRN', dependsOn: record.id, photos: [{ file: addPhoto('a.jpg'), role: 'goods' }] });
    for (const bad of ['unsent-work/../../x.jpg', 'unsent-work/%2e%2e/x.jpg', `${LEGACY_ROOT}unsent-work/../../x.jpg`]) {
      await rawRun(`UPDATE item_photos SET file = '${bad}'`);
      const [read] = await photosOf(phone, photo.id);
      expect(read.file.startsWith(ROOT_A)).toBe(false);
      expect(read.file).not.toContain('..');
      expect(read.file).not.toContain('%2e');
    }
  });
});
