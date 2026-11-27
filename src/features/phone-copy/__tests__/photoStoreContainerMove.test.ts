/**
 * WH-301p case 5: the phone copy's kept photos (WH-299) also store an absolute `file://` address (`photo_files.file`). After an iOS
 * update moves the data container, `photoFile` finds no file at the old address, drops the row and answers null, so a photo
 * already viewed is gone offline until it is downloaded again. Test first: fails until the address is stored relative to the
 * documents folder (as the unsent store's will be) and joined to the current folder on read.
 *
 * Not tested, with the reason: `src/utils/localPhotoFiles.ts` keeps an AsyncStorage registry of absolute cache/document addresses
 * of photos just picked, only so a retry or the start-up sweep can find and delete them; a registry entry whose file is gone
 * is forgotten by the sweep and nothing the person owns is lost (the unsent work keeps its own copy, WH-301p cases 1 to 3).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The copy's `photo_files.file` is relative (`phone-copy-photos/<hash>`) and `photoFile` answers the current full address.
 *    Dev may decide the kept photos are only a cache to download again; then this case is dropped by the owner's word, not by Test.
 * ==================================
 */
import { env, eraseEverything, mockFactories, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { fileSystemModule, files } from '@/tests/phoneCopy/fakeFiles';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import { bootWarehouse, loadCopy } from '@/tests/phoneCopy/wh299Phone';
import { moveDocumentRoot, ROOT_A, ROOT_B } from '@/tests/unsent/moveContainer';

const plainFiles = mockFactories.fileSystem;
beforeAll(() => { mockFactories.fileSystem = fileSystemModule as never; });
afterAll(() => { mockFactories.fileSystem = plainFiles; });
jest.mock('expo-file-system/legacy', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule(), { virtual: true });

beforeEach(() => { resetEnv(); files.reset(); seedWarehouse(); });
afterEach(async () => { await eraseEverything(); });

const PATH = 'fictional/ph-first.jpg';
const URL = 'https://warehouse.example.test/signed/ph-first.jpg?token=fictional';

it('gives a kept photo back from the new documents folder after the data container moved, with no connection', async () => {
  const w = await bootWarehouse();
  await loadCopy(w);
  const store = require(`@/features/phone-copy/${'photoStore'}`) as { keepPhoto(p: string, u: string): Promise<unknown>; photoFile(p: string): Promise<string | null> };
  await store.keepPhoto(PATH, URL);
  expect(env.reachable).toBe(true);

  moveDocumentRoot(ROOT_A, ROOT_B);
  await setReachable(false);

  const file = await store.photoFile(PATH);
  expect(file).not.toBeNull();
  expect(file?.startsWith(`${ROOT_B}phone-copy-photos/`)).toBe(true);
  expect(files.photos()).toEqual([file]);
});
