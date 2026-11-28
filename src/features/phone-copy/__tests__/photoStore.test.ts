/**
 * WH-299, contract product/tech/app-offline-read-from-copy.md section 9 (PR11, S4 in part): photos already viewed are
 * kept as files under `phone-copy-photos`, named by the SHA-256 of their storage path, and erased with the copy.
 *
 * Real: the photo store, the sync engine, the copy. Faked at the edge: the phone's files and downloads
 * (tests/phoneCopy/fakeFiles.ts) and the rest of the phone's native modules.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - `photoFile` answers the file's path as a string (contract signature).
 *  - Either `expo-file-system` API may do the download; both are faked.
 * ==================================
 */
import { createHash } from 'node:crypto';
import { env, eraseEverything, mockFactories, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { DOCUMENT_DIRECTORY, fileSystemModule, files } from '@/tests/phoneCopy/fakeFiles';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootWarehouse, loadCopy } from '@/tests/phoneCopy/wh299Phone';

// bootPhone() takes the phone's files from here: this file's fake holds them.
const plainFiles = mockFactories.fileSystem;
beforeAll(() => { mockFactories.fileSystem = fileSystemModule as never; });
afterAll(() => { mockFactories.fileSystem = plainFiles; });
jest.mock('expo-file-system/legacy', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule(), { virtual: true });

beforeEach(() => {
  resetEnv();
  files.reset();
  seedWarehouse();
});
afterEach(async () => { await eraseEverything(); });

interface PhotoStore {
  keepPhoto(storagePath: string, signedUrl: string): Promise<unknown>;
  photoFile(storagePath: string): Promise<string | null>;
  erasePhotos(): Promise<unknown>;
}
async function ready() {
  const w = await bootWarehouse();
  await loadCopy(w);
  // Loaded when first used, so a case's arrangement is checked before the store is needed.
  const load = () => require(`@/features/phone-copy/${'photoStore'}`) as PhotoStore;
  const store: PhotoStore = {
    keepPhoto: (path, url) => load().keepPhoto(path, url),
    photoFile: path => load().photoFile(path),
    erasePhotos: () => load().erasePhotos(),
  };
  return { w, store };
}
const PATH = 'fictional/ph-first.jpg';
const URL = 'https://warehouse.example.test/signed/ph-first.jpg?token=fictional';
const keptName = (storagePath: string) => createHash('sha256').update(storagePath).digest('hex');

it('keeps a viewed photo as a file named by its path\'s hash, and gives it back with no connection', async () => {
  const { store } = await ready();
  expect(await store.photoFile(PATH)).toBeNull();
  await store.keepPhoto(PATH, URL);
  expect(files.downloads.map(d => d.url)).toEqual([URL]);
  await setReachable(false);
  const file = await store.photoFile(PATH);
  expect(file).toBe(`${DOCUMENT_DIRECTORY}phone-copy-photos/${keptName(PATH)}`);
  expect(files.photos()).toEqual([file]);
});

it('records the photo in the copy', async () => {
  const { w, store } = await ready();
  await store.keepPhoto(PATH, URL);
  const db = await w.phone.copyDb.openCopy((await w.phone.scope())!);
  const rows = await db.all<{ storage_path: string; bytes: number }>('SELECT storage_path, bytes FROM photo_files');
  expect(rows).toEqual([{ storage_path: PATH, bytes: 1200 }]);
});

it('does not download a photo it already holds', async () => {
  const { store } = await ready();
  await store.keepPhoto(PATH, URL);
  await store.keepPhoto(PATH, `${URL}-again`);
  expect(files.downloads).toHaveLength(1);
});

it('PR11: keeps every photo viewed, with no cap', async () => {
  const { store } = await ready();
  const paths = Array.from({ length: 60 }, (_, n) => `fictional/many-${n}.jpg`);
  for (const path of paths) await store.keepPhoto(path, URL);
  expect(files.photos()).toHaveLength(60);
  expect(await store.photoFile(paths[0])).not.toBeNull();
});

it('keeps nothing while the phone is short of storage', async () => {
  const { w, store } = await ready();
  env.freeBytes = 1000;
  env.feed.changeAnswers.push({ position: '1048600', as_of: env.feed.asOf, more: false, reload_all: null, reload: [], changes: [] });
  await w.phone.engine.syncNow('interval');
  expect(w.phone.syncStore.getSyncSnapshot().storageLow).toBe(true);
  await store.keepPhoto(PATH, URL);
  expect(files.photos()).toEqual([]);
  expect(await store.photoFile(PATH)).toBeNull();
});

it('erasePhotos removes every kept photo', async () => {
  const { store } = await ready();
  await store.keepPhoto(PATH, URL);
  await store.erasePhotos();
  expect(files.photos()).toEqual([]);
  expect(await store.photoFile(PATH)).toBeNull();
});

it('S4: erasing the copy, as sign-out does, empties the photo folder', async () => {
  const { w, store } = await ready();
  await store.keepPhoto(PATH, URL);
  expect(files.photos()).toHaveLength(1);
  await w.phone.engine.stopPhoneCopy();
  await w.phone.copyDb.eraseCopy();
  expect(files.photos()).toEqual([]);
});

it('keeps the photo folder out of the phone\'s backup and device transfer', () => {
  const written = new Map<string, string>();
  const fs = require('node:fs') as typeof import('node:fs');
  jest.spyOn(fs, 'mkdirSync').mockImplementation((() => undefined) as never);
  jest.spyOn(fs, 'writeFileSync').mockImplementation(((file: string, text: string) => { written.set(String(file), text); }) as never);
  const plugin = require('../../../../plugins/with-data-extraction-rules') as { writeExtractionRules?: (root: string) => void };
  expect(plugin.writeExtractionRules).toEqual(expect.any(Function));
  plugin.writeExtractionRules!('/fictional/android');
  expect(written.size).toBe(2);
  for (const [file, xml] of written) {
    // Twice in the extraction rules (cloud backup and device transfer), once in the older rules.
    const times = file.endsWith('data_extraction_rules.xml') ? 2 : 1;
    expect(xml.match(/<exclude domain="file" path="phone-copy-photos\/" \/>/g) ?? []).toHaveLength(times);
  }
});
