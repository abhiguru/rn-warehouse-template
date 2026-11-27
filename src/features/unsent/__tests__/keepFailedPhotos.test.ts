/**
 * WH-301 (contract section 2, Design 4.9; the failed-photo path): photos that did not upload when a GRN or dispatch was saved
 * are kept on the phone as one waiting `photos` item and sent later. This is the function the two review steps call; the dialog
 * sentence it triggers (`offline.photosKept`) is checked in src/i18n/__tests__/unsentTexts.gu.test.ts.
 *
 * Real: `keepFailedPhotos`, the queue, the unsent file, the facility capability. Faked at the edge: expo-sqlite, files,
 * NetInfo, the signed-in person. Not tested here (screens): that GrnReviewStep and DispatchReviewStep append the sentence to the
 * success dialog and call this only for photos that failed.
 */
import { env } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { addPhoto, keptPhotoFiles, rawRows, rawRun, unsentFileNames } from '@/tests/unsent/unsentPhone';
import { keepFailedPhotos } from '@/features/unsent/keepFailedPhotos';
import { initUnsent, getUnsentSummary } from '@/features/unsent/unsentStore';
import { accountActionAllowed, canStartWork } from '@/features/unsent/workGate';
import { saveOperatorServer } from '@/config/operatorServer';
import { setFacilityCapabilities } from '@/config/facilityCapabilities';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('@/config/supabaseConfig', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined }));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const input = (...names: string[]) => ({
  doc: 'grn' as const,
  recordId: 'grn-uuid-1',
  number: 'RV14999',
  customer: 'Asha Fictional Traders',
  photos: names.map(name => ({ file: addPhoto(name), role: 'header' as const })),
});

beforeAll(async () => {
  await saveOperatorServer(SERVER);
  await initUnsent();
});
beforeEach(async () => {
  files.reset();
  env.subject = 'user-1';
  setFacilityCapabilities(SERVER, { sync: true });
  await rawRun('DELETE FROM item_photos'); await rawRun('DELETE FROM items');
  await initUnsent();
});

describe('keeping photos that did not upload', () => {
  it('keeps them as one waiting item for the saved record and says how many were kept', async () => {
    expect(await keepFailedPhotos(input('a.jpg', 'b.jpg', 'c.jpg'))).toBe(3);
    const items = await rawRows<{ kind: string; body: string; target_ref: string; state: string }>('items');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('photos');
    expect(JSON.parse(items[0].body)).toMatchObject({ doc: 'grn', recordId: 'grn-uuid-1' });
    expect(JSON.parse(items[0].target_ref)).toMatchObject({ grnId: 'grn-uuid-1', number: 'RV14999' });
    expect(await rawRows('item_photos')).toHaveLength(3);
  });

  it('moves the files into the unsent folder, out of the cache where the form left them', async () => {
    const photos = input('a.jpg');
    await keepFailedPhotos(photos);
    expect(files.held.has(photos.photos[0].file)).toBe(false);
    expect(keptPhotoFiles()).toHaveLength(1);
  });

  it('they count as unsent (the bar, sign-out) but never start the 2-hour clock (PQ2)', async () => {
    await keepFailedPhotos(input('a.jpg'));
    expect(getUnsentSummary()).toMatchObject({ count: 1, limitReached: false });
    expect(accountActionAllowed()).toEqual({ ok: false, count: 1 });
    expect(canStartWork()).toEqual({ ok: true });
  });

  it('nothing kept for no photos: no item is made and the count is 0', async () => {
    expect(await keepFailedPhotos(input())).toBe(0);
    expect(await rawRows('items')).toEqual([]);
  });

  it('with the offline feature off nothing is kept and no file moves (today\'s retry in the form stays)', async () => {
    setFacilityCapabilities(SERVER, { sync: false });
    const photos = input('a.jpg');
    expect(await keepFailedPhotos(photos)).toBe(0);
    expect(await rawRows('items')).toEqual([]);
    expect(files.held.has(photos.photos[0].file)).toBe(true);
    expect(keptPhotoFiles()).toEqual([]);
  });

  it('a save that fails (the file is full) keeps nothing, says 0, and leaves the files where they were', async () => {
    const { failStatement } = require('@/tests/phoneCopy/fakeExpoSqlite') as typeof import('@/tests/phoneCopy/fakeExpoSqlite');
    failStatement(/INSERT INTO item_photos/i, new Error('SQLITE_FULL'));
    const photos = input('a.jpg');
    expect(await keepFailedPhotos(photos)).toBe(0);
    expect(await rawRows('items')).toEqual([]);
    expect(files.held.has(photos.photos[0].file)).toBe(true);
    expect(unsentFileNames()).toHaveLength(1);
  });
});
