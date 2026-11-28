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

describe('the form text and the kept form row keep their files (WH-301p, sweep fix d5c32a48)', () => {
  const formsMod = () => require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
  const textNaming = (uri: string) => JSON.stringify({ header: { gr_no: 'RV15001', gr_images: [{ uri }] }, items: [] });
  const emptyForm = { header: { gr_no: 'RV15001', gr_images: [] }, items: [] };
  const photosColumn = async () => JSON.parse((await rawRows<{ photos: string }>('forms'))[0].photos) as string[];

  it('a form turned into items keeps its photo file in the kept form row, and giving it back names a full current address that exists', async () => {
    const phone = await firstStart();
    const queue = phone.queue as unknown as Queue;
    await formsMod().saveFormDraft({ kind: 'grn', state: { header: { gr_no: 'RV15001', gr_images: [{ uri: addPhoto('pick.jpg') }] }, items: [] } });
    const [formCopy] = keptPhotoFiles();
    const [record] = await queue.enqueueAll([{ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders' }], { kind: 'grn' });
    expect(await rawRows('forms')).toHaveLength(0);
    expect(exists(formCopy)).toBe(true);

    await queue.returnToForm(record.id);

    const draft = await formsMod().loadFormDraft('grn');
    const [uri] = (draft?.state as { header: { gr_images: { uri: string }[] } }).header.gr_images.map(image => image.uri);
    expect(uri.startsWith(PHOTOS)).toBe(true);
    expect(exists(uri)).toBe(true);
  });

  it('saving again a form whose text names its file by a stale absolute address does not delete the file and keeps it in the photo list', async () => {
    await firstStart();
    const { saveFormDraft } = formsMod();
    await saveFormDraft({ kind: 'grn', state: emptyForm });
    const file = plant('form-x.jpg');
    await rawRun(`UPDATE forms SET photos = '${JSON.stringify(['unsent-work/photos/form-x.jpg'])}' WHERE kind = 'grn'`);

    expect(await saveFormDraft({ kind: 'grn', state: JSON.parse(textNaming(`${LEGACY_ROOT}unsent-work/photos/form-x.jpg`)) })).toBe(true);

    expect(exists(file)).toBe(true);
    expect(await photosColumn()).toEqual(['unsent-work/photos/form-x.jpg']);
  });

  it('saving a form whose photo list had been left empty still names the file its text names', async () => {
    await firstStart();
    const { saveFormDraft } = formsMod();
    await saveFormDraft({ kind: 'grn', state: emptyForm });
    const file = plant('form-x.jpg');
    await rawRun(`UPDATE forms SET photos = '[]' WHERE kind = 'grn'`);

    await saveFormDraft({ kind: 'grn', state: JSON.parse(textNaming(`${LEGACY_ROOT}unsent-work/photos/form-x.jpg`)) });

    expect(exists(file)).toBe(true);
    expect(await photosColumn()).toEqual(['unsent-work/photos/form-x.jpg']);
  });

  it('reading a form rebuilds its photo list from its text', async () => {
    await firstStart();
    const { saveFormDraft, loadFormDraft } = formsMod();
    await saveFormDraft({ kind: 'grn', state: emptyForm });
    plant('form-x.jpg');
    await rawRun(`UPDATE forms SET state = '${textNaming(`${LEGACY_ROOT}unsent-work/photos/form-x.jpg`)}', photos = '[]' WHERE kind = 'grn'`);

    await loadFormDraft('grn');

    expect(await photosColumn()).toEqual(['unsent-work/photos/form-x.jpg']);
  });

  it('removes nothing when a kept form row cannot be read', async () => {
    const phone = await firstStart();
    const record = await phone.queue.enqueue({ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders' });
    const orphan = plant('form-orphan.jpg');
    await rawRun(`UPDATE items SET form_row = 'not json {' WHERE id = '${record.id}'`);

    await expect(restart()).resolves.toBeDefined();

    expect(exists(orphan)).toBe(true);
  });
});

describe('one file per photo when a saved form becomes items and comes back (batch abb9cb6d)', () => {
  const formsMod = () => require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
  const imagesOf = (state: unknown) => (state as { header: { gr_images: { uri: string }[] } }).header.gr_images.map(image => image.uri);
  const formWith = (...uris: string[]) => ({ header: { gr_no: 'RV15001', gr_images: uris.map(uri => ({ uri })) }, items: [] });
  const inFolder = (name: string) => [...files.held.keys()].filter(path => path.startsWith(PHOTOS) && path.endsWith(name));

  it('gives the photo back at its form-<name> file, the returned form names it, and no copy stays under the item\'s name', async () => {
    const phone = await firstStart();
    const queue = phone.queue as unknown as Queue;
    await formsMod().saveFormDraft({ kind: 'grn', state: formWith(addPhoto('pick.jpg')) });
    expect(inFolder('pick.jpg')).toEqual([`${PHOTOS}form-pick.jpg`]);
    const [record] = await queue.enqueueAll(
      [{ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders', photos: [{ file: addPhoto('pick.jpg'), role: 'goods' }] }],
      { kind: 'grn' }
    );
    expect(inFolder('pick.jpg')).toHaveLength(1); // the item's file only: the saved-form copy was removed

    await queue.returnToForm(record.id);

    const [uri] = imagesOf((await formsMod().loadFormDraft('grn'))?.state);
    expect(uri).toBe(`${PHOTOS}form-pick.jpg`);
    expect(exists(uri)).toBe(true);
    expect(inFolder('pick.jpg')).toEqual([uri]);
  });

  it('keeps a file the kept form row names that no item took over, after the save and after a start-up sweep', async () => {
    const phone = await firstStart();
    const queue = phone.queue as unknown as Queue;
    await formsMod().saveFormDraft({ kind: 'grn', state: formWith(addPhoto('taken.jpg'), addPhoto('left.jpg')) });
    await queue.enqueueAll(
      [{ kind: 'testRecord', body: {}, what: 'GRN 1 for Asha Fictional Traders', photos: [{ file: addPhoto('taken.jpg'), role: 'goods' }] }],
      { kind: 'grn' }
    );
    expect(exists(`${PHOTOS}form-left.jpg`)).toBe(true);

    await restart();

    expect(exists(`${PHOTOS}form-left.jpg`)).toBe(true);
  });
});

describe('WH-390: the sweep and a form save never see each other half done', () => {
  const rowsMod = () => require('@/features/unsent/unsentRows') as typeof import('@/features/unsent/unsentRows');
  const formsMod = () => require('@/features/unsent/formDrafts') as typeof import('@/features/unsent/formDrafts');
  const formOf = (uri: string) => ({ header: { gr_images: [{ uri }] }, items: [] });
  const modified = new Map<string, number>();
  let restoreModified: () => void = () => undefined;

  beforeEach(() => {
    modified.clear();
    // A file's change time, as the phone gives it: the fake files have none, so a test sets the ones it needs.
    const proto = fileSystemModule().File.prototype as object;
    Object.defineProperty(proto, 'lastModified', { configurable: true, get(this: { uri: string }) { return modified.get(this.uri); } });
    restoreModified = () => { delete (proto as Record<string, unknown>).lastModified; };
  });
  afterEach(() => restoreModified());

  it('a sweep started while a save has copied its form file but not yet written its row does not delete the file', async () => {
    await firstStart();
    const { sweepOrphanFormFiles } = rowsMod();
    const File = fileSystemModule().File;
    const original = File.prototype.copy;
    let sweep: Promise<void> | null = null;
    // The save's row is written a little later than its copy (the commit waits for the connection), so a sweep that does not wait
    // for the save reads the rows before the row is there.
    const db = require('@/features/unsent/unsentDb') as typeof import('@/features/unsent/unsentDb');
    const realDb = db.getUnsentDb;
    let slow = false;
    jest.spyOn(db, 'getUnsentDb').mockImplementation(async () => {
      const real = await realDb();
      return slow ? { ...real, transaction: async (work) => { for (let i = 0; i < 100; i += 1) await Promise.resolve(); return real.transaction(work); } } : real;
    });
    jest.spyOn(File.prototype, 'copy').mockImplementation(function (this: { uri: string }, to: { uri: string }) {
      const result = original.call(this, to);
      slow = true;
      sweep = sweepOrphanFormFiles(); // the copy is there, the row is not yet
      return result;
    });

    expect(await formsMod().saveFormDraft({ kind: 'grn', state: formOf(addPhoto('pick.jpg')) })).toBe(true);
    await sweep;

    expect(sweep).not.toBeNull();
    expect(exists(`${PHOTOS}form-pick.jpg`)).toBe(true);
    expect((await rawRows<{ photos: string }>('forms'))[0].photos).toContain('form-pick.jpg');
  });

  it('a save started while a sweep is running waits for it: the new file and its row both stay', async () => {
    await firstStart();
    const { sweepOrphanFormFiles } = rowsMod();
    const orphan = plant('form-old-orphan.jpg');
    const File = fileSystemModule().File;
    const original = File.prototype.delete;
    let save: Promise<boolean> | null = null;
    jest.spyOn(File.prototype, 'delete').mockImplementation(function (this: { uri: string }) {
      if (this.uri === orphan && save === null) save = formsMod().saveFormDraft({ kind: 'grn', state: formOf(addPhoto('late.jpg')) });
      return original.call(this);
    });

    await sweepOrphanFormFiles();
    expect(save).not.toBeNull();
    expect(await save).toBe(true);

    expect(exists(orphan)).toBe(false);
    expect(exists(`${PHOTOS}form-late.jpg`)).toBe(true);
    expect((await rawRows<{ photos: string }>('forms'))[0].photos).toContain('form-late.jpg');
  });

  it('a form file changed at or after the start of this run is kept although no row names it; an older one is swept', async () => {
    await firstStart();
    await restart();
    const startedAt = Date.now();
    const fresh = plant('form-fresh.jpg');
    const atStart = plant('form-at-start.jpg');
    const old = plant('form-old.jpg');
    modified.set(fresh, startedAt + 5_000);
    modified.set(atStart, startedAt);
    modified.set(old, startedAt - 60_000);

    await rowsMod().sweepOrphanFormFiles();

    expect([exists(fresh), exists(atStart), exists(old)]).toEqual([true, true, false]);
  });

  it('a failing guarded job does not hold the guard: a later save and a later sweep still run', async () => {
    await firstStart();
    const { withFormFileGuard, sweepOrphanFormFiles } = rowsMod();
    await expect(withFormFileGuard(async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    expect(await formsMod().saveFormDraft({ kind: 'grn', state: formOf(addPhoto('after.jpg')) })).toBe(true);
    await expect(sweepOrphanFormFiles()).resolves.toBeUndefined();
    expect(exists(`${PHOTOS}form-after.jpg`)).toBe(true);
  });

  it('a save that fails gives false (never throws) and releases the guard: the next save works', async () => {
    await firstStart();
    const circular: Record<string, unknown> = { header: { gr_images: [] }, items: [] };
    circular.self = circular; // cannot be written as text

    expect(await formsMod().saveFormDraft({ kind: 'grn', state: circular })).toBe(false);
    expect(await formsMod().saveFormDraft({ kind: 'grn', state: formOf(addPhoto('two.jpg')) })).toBe(true);
    expect(exists(`${PHOTOS}form-two.jpg`)).toBe(true);
  });
});
