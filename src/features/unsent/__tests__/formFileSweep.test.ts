/**
 * WH-301p (Dev commits 88aed41d and f389c5a2): the form files of the unsent folder.
 *  - Giving a saved record back to its form when the cache folder the photo came from is gone (as after an iOS update): the photo
 *    stays in the unsent folder as `form-<name>`, nothing throws, the form names that file.
 *  - At the app's first start, `form-*` files of `unsent-work/photos/` that no `item_photos` row, no `forms.photos` and no kept
 *    `items.form_row` names are removed; nothing else is touched; it runs once per start and never throws.
 *
 * Real: the unsent store, queue, rows, form drafts. Faked at the edge: expo-sqlite, files, NetInfo, the clock.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The sweep runs from `initUnsent()` on its first call after the app's modules load (a restart is `restart()` of unsentPhone.ts).
 *  - A photo given back with no saved form (nothing to name it) stays in the folder as `form-<name>` and is left for the next sweep.
 * ==================================
 */
import { files, fileSystemModule } from '@/tests/phoneCopy/fakeFiles';
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { addPhoto, bootUnsent, keptPhotoFiles, rawRows, rawRun, restart, server } from '@/tests/unsent/unsentPhone';
import { LEGACY_ROOT, ROOT_A } from '@/tests/unsent/moveContainer';

const PHOTOS = `${ROOT_A}unsent-work/photos/`;
const exists = (uri: string) => files.held.has(uri);
const plant = (name: string) => { const uri = `${PHOTOS}${name}`; files.held.set(uri, 1200); return uri; };
type Queue = typeof import('@/features/unsent/unsentQueue');

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-27T09:00:00+05:30') }); resetEnv(); files.reset(); server.reset(); env.subject = 'user-1'; });
afterEach(async () => { jest.restoreAllMocks(); jest.useRealTimers(); await eraseEverything(); });

/** A first start with an empty file, so the tables exist; then the test arranges rows and files and "restarts". */
async function firstStart() {
  const phone = await bootUnsent();
  await phone.store.initUnsent();
  return phone;
}
const insertPhotoRow = (file: string) =>
  rawRun(`INSERT INTO item_photos (item_id, file, client_photo_id, role, line_ref, done, missing) VALUES ('item-x', '${file}', 'c-${file.length}', 'goods', NULL, 0, 0)`);

describe('the start-up sweep of form files', () => {
  it('removes a form file that nothing names, and keeps the files that are not form files', async () => {
    await firstStart();
    const orphan = plant('form-orphan.jpg');
    const other = plant('11111111-1111-1111-1111-111111111111-queued.jpg');
    const plain = plant('plain.jpg');
    const cache = addPhoto('form-cache.jpg');

    await restart();

    expect(exists(orphan)).toBe(false);
    expect([other, plain, cache].map(exists)).toEqual([true, true, true]);
  });

  it('keeps a form file that an unfinished form names', async () => {
    await firstStart();
    const { saveFormDraft } = require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
    await saveFormDraft({ kind: 'grn', state: { header: { gr_images: [{ uri: addPhoto('pick.jpg') }] }, items: [] } });
    const [named] = keptPhotoFiles();
    expect(named.includes('/form-')).toBe(true);

    await restart();

    expect(exists(named)).toBe(true);
  });

  it('keeps a form file that a photo row names', async () => {
    await firstStart();
    const named = plant('form-row.jpg');
    await insertPhotoRow('unsent-work/photos/form-row.jpg');

    await restart();

    expect(exists(named)).toBe(true);
  });

  it('keeps a form file that only a kept form_row names', async () => {
    const phone = await firstStart();
    const record = await phone.queue.enqueue({ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders' });
    const named = plant('form-kept.jpg');
    const orphan = plant('form-other.jpg');
    const formRow = JSON.stringify({ hadForm: true, photos: JSON.stringify(['unsent-work/photos/form-kept.jpg']) });
    await rawRun(`UPDATE items SET form_row = '${formRow}' WHERE id = '${record.id}'`);

    await restart();

    expect(exists(named)).toBe(true);
    expect(exists(orphan)).toBe(false);
  });

  it('keeps a form file that a legacy absolute address from another container names', async () => {
    await firstStart();
    const named = plant('form-legacy.jpg');
    await insertPhotoRow(`${LEGACY_ROOT}unsent-work/photos/form-legacy.jpg`);

    await restart();

    expect(exists(named)).toBe(true);
  });

  it('does not sweep again on a later call of initUnsent in the same run', async () => {
    await firstStart();
    const phone = await restart();
    const later = plant('form-later.jpg');

    await phone.store.initUnsent();

    expect(exists(later)).toBe(true);
  });

  it('does not throw when a file cannot be deleted, and still removes the others', async () => {
    await firstStart();
    const stuck = plant('form-a-stuck.jpg');
    const orphan = plant('form-b-orphan.jpg');
    const File = fileSystemModule().File;
    const original = File.prototype.delete;
    jest.spyOn(File.prototype, 'delete').mockImplementation(function (this: { uri: string }) {
      if (this.uri === stuck) throw new Error('disk error');
      return original.call(this);
    });

    await expect(restart()).resolves.toBeDefined();

    expect(exists(stuck)).toBe(true);
    expect(exists(orphan)).toBe(false);
  });
});

describe('giving a saved record back when the cache folder its photo came from is gone', () => {
  const cacheGone = () => {
    const File = fileSystemModule().File;
    const original = File.prototype.move;
    jest.spyOn(File.prototype, 'move').mockImplementation(function (this: { uri: string }, to: { uri: string }) {
      if (to.uri.startsWith('file:///phone/cache/')) throw new Error('The folder does not exist');
      return original.call(this, to as never);
    });
  };

  it('keeps the photo in the unsent folder as form-<name> and does not throw (no form had been saved)', async () => {
    const phone = await firstStart();
    const queue = phone.queue as unknown as Queue;
    const [record] = await queue.enqueueAll([{ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders', photos: [{ file: addPhoto('pick.jpg'), role: 'goods' }] }], { kind: 'grn' });
    cacheGone();

    await queue.returnToForm(record.id);

    expect(exists(`${PHOTOS}form-pick.jpg`)).toBe(true);
    expect(await rawRows('items')).toHaveLength(0);
    expect(await rawRows('item_photos')).toHaveLength(0);
  });

  it('gives a saved form back naming a photo that exists under the unsent folder, with nothing absolute stored', async () => {
    const phone = await firstStart();
    const queue = phone.queue as unknown as Queue;
    const { saveFormDraft, loadFormDraft } = require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
    await saveFormDraft({ kind: 'grn', state: { header: { gr_images: [{ uri: addPhoto('pick.jpg') }] }, items: [] } });
    const [formCopy] = keptPhotoFiles();
    const [record] = await queue.enqueueAll([{ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders', photos: [{ file: formCopy, role: 'goods' }] }], { kind: 'grn' });
    cacheGone();

    await queue.returnToForm(record.id);

    const draft = await loadFormDraft('grn');
    const [uri] = (draft?.state as { header: { gr_images: { uri: string }[] } }).header.gr_images.map(image => image.uri);
    expect(uri.startsWith(PHOTOS)).toBe(true);
    expect(exists(uri)).toBe(true);
    const [row] = await rawRows<{ state: string }>('forms');
    expect(row.state).not.toContain('file://');
    expect(row.state).toContain('app-doc:///unsent-work/photos/');
  });
});

describe('a form whose photo list is empty but whose text names the file (owner\'s iPhone: re-saved on the unfixed build after an update)', () => {
  const textNaming = (uri: string) => JSON.stringify({ header: { gr_no: 'RV15001', gr_images: [{ uri }] }, items: [] });
  const imageOf = (state: unknown) => (state as { header: { gr_images: { uri: string }[] } }).header.gr_images[0].uri;
  const arrange = async (address: string) => {
    const phone = await firstStart();
    const { saveFormDraft } = require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
    await saveFormDraft({ kind: 'grn', state: { header: { gr_no: 'RV15001', gr_images: [] }, items: [] } });
    const file = plant('form-x.jpg');
    await rawRun(`UPDATE forms SET state = '${textNaming(address)}', photos = '[]' WHERE kind = 'grn'`);
    return { phone, file };
  };
  const loaded = async () => imageOf((await (require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts')).loadFormDraft('grn'))?.state);

  it('keeps the file and gives back a current address when the text names it by a legacy absolute address of another container', async () => {
    const { file } = await arrange(`${LEGACY_ROOT}unsent-work/photos/form-x.jpg`);

    await restart();

    expect(exists(file)).toBe(true);
    expect(await loaded()).toBe(file);
  });

  it('keeps the file and gives back a current address when the text names it as app-doc:///', async () => {
    const { file } = await arrange('app-doc:///unsent-work/photos/form-x.jpg');

    await restart();

    expect(exists(file)).toBe(true);
    expect(await loaded()).toBe(file);
  });

  it('keeps the file a kept form_row names in its text although its photo list is empty', async () => {
    const phone = await firstStart();
    const record = await phone.queue.enqueue({ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders' });
    const file = plant('form-x.jpg');
    const formRow = JSON.stringify({ hadForm: true, state: textNaming(`${LEGACY_ROOT}unsent-work/photos/form-x.jpg`), photos: '[]' });
    await rawRun(`UPDATE items SET form_row = '${formRow.replace(/'/g, "''")}' WHERE id = '${record.id}'`);

    await restart();

    expect(exists(file)).toBe(true);
  });
});
