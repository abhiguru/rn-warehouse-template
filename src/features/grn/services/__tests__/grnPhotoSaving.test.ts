/**
 * Photos of a GRN are changed on the server only when the GRN is saved, and a
 * photo that does not arrive is reported, not swallowed.
 *
 * The services run against a fake backend that records every call in order:
 * RPCs by name, storage calls as `storage.upload` / `storage.remove`.
 */
import { createGRN, updateGRN } from '../grnFormService';
import {
  uploadGRNPhotos,
  uploadGRNImage,
  collectDeferredGRNPhotos,
  unpreparedGRNPhotos,
  GRN_PHOTO_UPLOAD_CONCURRENCY,
  type FailedGRNPhoto,
} from '../imageUploadService';
import type { GRNHeaderData, GRNImageData } from '@/store/slices/grnFormSlice';

type RpcAnswer = { data: unknown; error: unknown };
const mockCalls: Array<{ name: string; args: any }> = [];
let mockRpcHandlers: Record<string, (args: any) => RpcAnswer | Promise<RpcAnswer>> = {};
let mockRegistered = 0;
/** When set, a storage upload waits for what this returns (P2F-MEDIA-2). */
let mockSignedUrlThrows = false;
let mockUploadHook: ((path: string) => Promise<{ error: unknown }>) | null = null;
/** Switch gates taken and ended by the uploads. */
const mockMutation = { begun: 0, finished: 0 };
/** Photo files read into memory. */
let mockBuffersRead = 0;

jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => {
    mockMutation.begun += 1;
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      mockMutation.finished += 1;
    };
  },
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: async () => ({
    rpc: async (name: string, args: any) => {
      mockCalls.push({ name, args });
      const handler = mockRpcHandlers[name];
      if (!handler) throw new Error(`unexpected rpc ${name}`);
      return handler(args);
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          mockCalls.push({ name: 'storage.upload', args: path });
          return mockUploadHook ? mockUploadHook(path) : { error: null };
        },
        createSignedUrl: async (path: string) => {
          if (mockSignedUrlThrows) throw new Error('signing unavailable');
          return { data: { signedUrl: `https://facility.invalid/signed/${path}` }, error: null };
        },
        remove: async (paths: string[]) => {
          mockCalls.push({ name: 'storage.remove', args: paths });
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  }),
}));
jest.mock('@/utils/photoCompression', () => ({
  ...jest.requireActual('@/utils/photoCompression'),
  compressPhoto: async () => ({ uri: 'file:///cache/prepared.webp', fileSize: 1200, mimeType: 'image/webp', extension: '.webp' }),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-crypto', () => {
  const { createHash } = jest.requireActual('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm: string, text: string) => createHash('sha256').update(text).digest('hex'),
    randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
  };
});

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const LINE_ID = '55555555-2222-4333-8444-555555555555';
const NEW_LINE_ID = '77777777-2222-4333-8444-555555555555';
const ITEM_MASTER_ID = '66666666-2222-4333-8444-555555555555';
const OLD_PHOTO_ID = 'aaaaaaaa-2222-4333-8444-555555555555';
const KEPT_PHOTO_ID = 'bbbbbbbb-2222-4333-8444-555555555555';

const picked = (name: string): GRNImageData => ({
  id: `temp_${name}`,
  fileName: `${name}.webp`,
  imageUrl: `file:///cache/${name}.webp`,
  uploadStatus: 'completed',
  fileSize: 1200,
  mimeType: 'image/webp',
});
const saved = (id: string, name: string): GRNImageData => ({
  id,
  fileName: `${name}.webp`,
  imageUrl: `https://facility.invalid/signed/${name}`,
  storagePath: `headers/${GRN_ID}/${name}.webp`,
  uploadStatus: 'completed',
  fileSize: 1200,
  mimeType: 'image/webp',
});

const header = (images: GRNImageData[]): GRNHeaderData => ({
  gr_no: 'A0010',
  registration: '',
  date: '2026-10-01',
  sender_id: '',
  sender_name: 'Fictional Sender',
  customer_id: '33333333-2222-4333-8444-555555555555',
  customer_name: 'Fictional Traders',
  supervisor_id: '44444444-2222-4333-8444-555555555555',
  supervisor_name: 'Fictional Supervisor',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: images,
});
const line = (grnTrlId: string, name: string, images: GRNImageData[] = []) => ({
  grn_trl_id: grnTrlId,
  item_table_id: ITEM_MASTER_ID,
  item_name: name,
  packaging: 'Bag',
  qty: 10,
  stock: 10,
  weight: 50,
  rack: '',
  package_mark: '',
  trl_images: images,
});

/** register → storage upload → confirm, all succeeding, unless a test replaces one. */
function photoBackend() {
  mockRpcHandlers.register_grn_image_upload = () => {
    mockRegistered += 1;
    return {
      data: { success: true, image_id: `image-${mockRegistered}`, storage_path: `path-${mockRegistered}`, upload_token: 'token' },
      error: null,
    };
  };
  mockRpcHandlers.confirm_grn_image_upload = () => ({ data: { success: true }, error: null });
  mockRpcHandlers.cancel_grn_image_upload = () => ({ data: { success: true }, error: null });
}
const names = () => mockCalls.map((call) => call.name);
const callsTo = (name: string) => mockCalls.filter((call) => call.name === name);

beforeEach(() => {
  mockCalls.length = 0;
  mockRpcHandlers = {};
  mockRegistered = 0;
  mockUploadHook = null;
  mockSignedUrlThrows = false;
  mockMutation.begun = 0;
  mockMutation.finished = 0;
  mockBuffersRead = 0;
  photoBackend();
  // The photo file is read with fetch + FileReader on the device.
  (global as any).fetch = jest.fn(async () => ({ blob: async () => ({ size: 1200 }) }));
  (global as any).FileReader = class {
    result: ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsArrayBuffer() {
      mockBuffersRead += 1;
      this.result = new ArrayBuffer(8);
      this.onload?.();
    }
  };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('collectDeferredGRNPhotos', () => {
  it('takes the photos picked in the form and leaves the ones already on the server', () => {
    const photos = collectDeferredGRNPhotos(
      [saved(KEPT_PHOTO_ID, 'kept'), picked('new-a'), picked('new-b')],
      [{ itemId: LINE_ID, itemName: 'Example Potatoes', images: [picked('mark')] }]
    );

    expect(photos.map((photo) => [photo.imageType, photo.image.id, photo.position, photo.itemId])).toEqual([
      ['header', 'temp_new-a', 1, undefined],
      ['header', 'temp_new-b', 2, undefined],
      ['item', 'temp_mark', 1, LINE_ID],
    ]);
  });
});

describe('creating a GRN', () => {
  const createBackend = () => {
    mockRpcHandlers.save_grn = () => ({
      data: {
        success: true,
        message: 'GRN created successfully',
        data: {
          grn_id: GRN_ID,
          gr_no: 'A0010',
          items_created: 1,
          images_saved: 0,
          item_ids: [LINE_ID],
          image_ids: [],
          item_mapping: [{ index: 0, item_id: LINE_ID, item_name: 'Example Potatoes' }],
        },
      },
      error: null,
    });
  };

  it('uploads the picked photos to the new GRN and its new line', async () => {
    createBackend();

    const result = await createGRN({
      header: header([picked('book')]),
      items: [line('item-1', 'Example Potatoes', [picked('mark')])],
    });

    expect(result.success).toBe(true);
    expect(result.data?.photos).toEqual({ uploadedCount: 2, failed: [], removalFailures: 0 });
    expect(callsTo('register_grn_image_upload').map((call) => call.args)).toEqual([
      expect.objectContaining({ p_grn_id: GRN_ID, p_image_type: 'header', p_grn_item_id: null }),
      expect.objectContaining({ p_grn_id: GRN_ID, p_image_type: 'item', p_grn_item_id: LINE_ID }),
    ]);
  });

  // Server migration 43 refuses a path outside the receipt's own folder, and a
  // receipt has no folder before it exists.
  it('sends no image list with save_grn, also for a photo that carries a storage path', async () => {
    createBackend();

    const result = await createGRN({
      header: header([picked('book'), saved('temp_elsewhere', 'elsewhere')]),
      items: [line('item-1', 'Example Potatoes', [picked('mark')])],
    });

    expect(result.success).toBe(true);
    expect(callsTo('save_grn')).toHaveLength(1);
    expect(callsTo('save_grn')[0].args).not.toHaveProperty('p_images');
    expect(callsTo('upload_grn_image')).toHaveLength(0);
  });

  it('says which photo did not upload instead of reporting a clean save', async () => {
    createBackend();
    mockRpcHandlers.register_grn_image_upload = (args) =>
      args.p_image_type === 'header'
        ? { data: null, error: { message: 'Network request failed' } }
        : { data: { success: true, image_id: 'image-1', storage_path: 'path-1', upload_token: 'token' }, error: null };

    const result = await createGRN({
      header: header([picked('book')]),
      items: [line('item-1', 'Example Potatoes', [picked('mark')])],
    });

    // The GRN exists, so the save itself succeeded.
    expect(result.success).toBe(true);
    expect(result.data?.photos.uploadedCount).toBe(1);
    expect(result.data?.photos.failed).toEqual([
      expect.objectContaining({
        imageType: 'header',
        position: 1,
        image: expect.objectContaining({ id: 'temp_book', imageUrl: 'file:///cache/book.webp' }),
        error: 'No answer from the server. The photo change may have gone through. Check the photos on this screen before trying again.',
      }),
    ]);
  });

  it('uploads a failed photo on retry', async () => {
    createBackend();
    mockRpcHandlers.register_grn_image_upload = () => ({ data: null, error: { message: 'Network request failed' } });
    const result = await createGRN({ header: header([picked('book')]), items: [line('item-1', 'Example Potatoes')] });
    const failed = result.data!.photos.failed;
    expect(failed).toHaveLength(1);

    photoBackend();
    const retry = await uploadGRNPhotos(GRN_ID, failed);

    expect(retry).toEqual({ uploadedCount: 1, failed: [] });
    expect(names().slice(-3)).toEqual(['register_grn_image_upload', 'storage.upload', 'confirm_grn_image_upload']);
  });
});

describe('a photo upload that outlasts the wait', () => {
  it('is reported as not uploaded, and a retry waits for it instead of uploading the photo twice', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    mockRpcHandlers.confirm_grn_image_upload = () =>
      new Promise<RpcAnswer>((resolve) => {
        release = () => resolve({ data: { success: true }, error: null });
      });
    const photos = collectDeferredGRNPhotos([picked('book')], []);

    const first = uploadGRNPhotos(GRN_ID, photos, 30000);
    await jest.advanceTimersByTimeAsync(30000);
    const outcome = await first;

    expect(outcome.uploadedCount).toBe(0);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0].inFlight).toBeInstanceOf(Promise);

    // The slow upload lands while the user is reading the message.
    const retry = uploadGRNPhotos(GRN_ID, outcome.failed as FailedGRNPhoto[], 30000);
    release();
    await jest.advanceTimersByTimeAsync(0);

    expect(await retry).toEqual({ uploadedCount: 1, failed: [] });
    expect(callsTo('register_grn_image_upload')).toHaveLength(1);
    expect(callsTo('storage.upload')).toHaveLength(1);
  });
});

// P2F-MEDIA-2: a save with many photos runs a few complete uploads (read, register,
// upload, confirm) at a time, never all of them at once.
describe('a save with many photos', () => {
  const many = (count: number, prefix = 'photo') =>
    Array.from({ length: count }, (_, index) => ({
      image: picked(`${prefix}-${index}`),
      imageType: 'header' as const,
      position: index + 1,
    }));
  /** Storage uploads that wait until the test lets them through. */
  function blockedStorage() {
    const waiting: Array<() => void> = [];
    let active = 0;
    let most = 0;
    mockUploadHook = () => {
      active += 1;
      most = Math.max(most, active);
      return new Promise((resolve) =>
        waiting.push(() => {
          active -= 1;
          resolve({ error: null });
        })
      );
    };
    return {
      get active() { return active; },
      get most() { return most; },
      /** Lets every upload through, also the ones that start meanwhile. */
      async releaseAll(flush: () => Promise<void>) {
        await flush();
        while (waiting.length > 0) {
          waiting.splice(0).forEach((release) => release());
          await flush();
        }
      },
    };
  }
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  const tick = () => jest.advanceTimersByTimeAsync(0);

  it('never has more than four uploads or photo files in memory at once, and uploads all 50', async () => {
    const storage = blockedStorage();
    const saving = uploadGRNPhotos(GRN_ID, many(50));

    await settle();
    expect(storage.active).toBe(4);
    expect(callsTo('storage.upload')).toHaveLength(4);
    expect(mockBuffersRead).toBe(4);
    expect(callsTo('register_grn_image_upload')).toHaveLength(4);

    await storage.releaseAll(settle);
    expect(await saving).toEqual({ uploadedCount: 50, failed: [] });
    expect(storage.most).toBe(GRN_PHOTO_UPLOAD_CONCURRENCY);
    expect(GRN_PHOTO_UPLOAD_CONCURRENCY).toBe(4);
    expect(callsTo('confirm_grn_image_upload')).toHaveLength(50);
    expect(mockBuffersRead).toBe(50);
    expect(mockMutation).toEqual({ begun: 1, finished: 1 });
  });

  it('reports the queued photos like running ones when the wait ends, and they still upload later', async () => {
    jest.useFakeTimers();
    const storage = blockedStorage();
    const first = uploadGRNPhotos(GRN_ID, many(10), 30000);
    await jest.advanceTimersByTimeAsync(30000);
    const outcome = await first;

    expect(outcome.uploadedCount).toBe(0);
    expect(outcome.failed).toHaveLength(10);
    for (const photo of outcome.failed) {
      expect(photo.error).toBe('The upload was still running');
      expect(photo.inFlight).toBeInstanceOf(Promise);
    }
    // Only four were started; six are waiting for a place.
    expect(callsTo('register_grn_image_upload')).toHaveLength(4);
    // The switch gate stays taken until the last queued upload has ended.
    expect(mockMutation.finished).toBe(0);

    await storage.releaseAll(tick);
    const late = await Promise.all(outcome.failed.map((photo) => photo.inFlight!));
    expect(late.every((result) => result.success)).toBe(true);
    expect(callsTo('register_grn_image_upload')).toHaveLength(10);
    expect(callsTo('confirm_grn_image_upload')).toHaveLength(10);
    expect(storage.most).toBe(4);
    expect(mockMutation).toEqual({ begun: 1, finished: 1 });
  });

  it('a retry joins the queued and running uploads instead of registering the photos again', async () => {
    jest.useFakeTimers();
    const storage = blockedStorage();
    const first = uploadGRNPhotos(GRN_ID, many(6), 30000);
    await jest.advanceTimersByTimeAsync(30000);
    const outcome = await first;
    expect(outcome.failed).toHaveLength(6);

    const retry = uploadGRNPhotos(GRN_ID, outcome.failed as FailedGRNPhoto[], 30000);
    await storage.releaseAll(tick);

    expect(await retry).toEqual({ uploadedCount: 6, failed: [] });
    expect(callsTo('register_grn_image_upload')).toHaveLength(6);
    expect(callsTo('storage.upload')).toHaveLength(6);
    expect(storage.most).toBe(4);
  });

  it('two saves at the same time share the four places', async () => {
    const storage = blockedStorage();
    const one = uploadGRNPhotos(GRN_ID, many(5, 'one'));
    const two = uploadGRNPhotos(GRN_ID, many(5, 'two'));

    await settle();
    expect(storage.active).toBe(4);
    await storage.releaseAll(settle);

    expect(await one).toEqual({ uploadedCount: 5, failed: [] });
    expect(await two).toEqual({ uploadedCount: 5, failed: [] });
    expect(storage.most).toBe(4);
    expect(mockMutation).toEqual({ begun: 2, finished: 2 });
  });

  it('a failing upload frees its place: every photo is still tried and reported', async () => {
    mockRpcHandlers.register_grn_image_upload = () => ({ data: null, error: { message: 'Network request failed' } });
    const outcome = await uploadGRNPhotos(GRN_ID, many(9));

    expect(outcome.uploadedCount).toBe(0);
    expect(outcome.failed.map((photo) => photo.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(callsTo('register_grn_image_upload')).toHaveLength(9);
    expect(mockMutation).toEqual({ begun: 1, finished: 1 });
  });
});

describe('saving an edited GRN', () => {
  /** update_grn as the backend answers it: top-level grn, stats and item_mapping. */
  const updateAnswer = (overrides: { images?: Array<{ id: string }>; item_mapping?: unknown[] } = {}) => ({
    data: {
      success: true,
      message: 'GRN updated successfully',
      grn: { id: GRN_ID, gr_no: 'A0010', items: [], images: overrides.images ?? [] },
      stats: { items_updated: 1, items_added: 0, items_deleted: 0, images_updated: 0, images_added: 0, images_deleted: 0, items_skipped_stock: [] },
      item_mapping: overrides.item_mapping ?? [],
    },
    error: null,
  });

  it('uploads a photo attached to a line added in this edit, under the id the server gave that line', async () => {
    mockRpcHandlers.update_grn = () =>
      updateAnswer({
        images: [{ id: KEPT_PHOTO_ID }],
        item_mapping: [{ index: 1, grn_trl_item_id: NEW_LINE_ID, item_name: 'Example Onions' }],
      });

    const result = await updateGRN(GRN_ID, {
      header: header([saved(KEPT_PHOTO_ID, 'kept')]),
      items: [line(LINE_ID, 'Example Potatoes'), line('item-1760000000000-abc', 'Example Onions', [picked('mark')])],
    });

    expect(result.success).toBe(true);
    expect(result.data?.photos).toEqual({ uploadedCount: 1, failed: [], removalFailures: 0 });
    // The new line goes to update_grn without an id, and no photo for it yet.
    const update = callsTo('update_grn')[0].args;
    expect(update.p_items[1].id).toBeUndefined();
    expect(update.p_images).toEqual([expect.objectContaining({ id: KEPT_PHOTO_ID, image_type: 'header' })]);
    expect(callsTo('register_grn_image_upload').map((call) => call.args)).toEqual([
      expect.objectContaining({ p_grn_id: GRN_ID, p_image_type: 'item', p_grn_item_id: NEW_LINE_ID }),
    ]);
    // Nothing is registered or uploaded before the GRN itself is saved.
    expect(names()[0]).toBe('update_grn');
  });

  it('reports the photo when the server does not say which line is new', async () => {
    mockRpcHandlers.update_grn = () => updateAnswer({ images: [{ id: KEPT_PHOTO_ID }], item_mapping: [] });

    const result = await updateGRN(GRN_ID, {
      header: header([saved(KEPT_PHOTO_ID, 'kept')]),
      items: [line('item-1760000000000-abc', 'Example Onions', [picked('mark')])],
    });

    expect(result.success).toBe(true);
    expect(result.data?.photos.failed).toEqual([
      expect.objectContaining({ imageType: 'item', itemName: 'Example Onions', position: 1 }),
    ]);
    expect(callsTo('register_grn_image_upload')).toHaveLength(0);
  });

  it('deletes a removed photo after the save when update_grn left it on the GRN', async () => {
    // Every remaining photo is new, so p_images is empty and update_grn deletes nothing.
    mockRpcHandlers.update_grn = () => updateAnswer({ images: [{ id: OLD_PHOTO_ID }] });
    mockRpcHandlers.delete_grn_image = () => ({
      data: { success: true, data: { storage_path: `headers/${GRN_ID}/old.webp` } },
      error: null,
    });

    const result = await updateGRN(
      GRN_ID,
      { header: header([picked('replacement')]), items: [line(LINE_ID, 'Example Potatoes')] },
      { removedImages: [{ id: OLD_PHOTO_ID, storagePath: `headers/${GRN_ID}/old.webp` }] }
    );

    expect(result.data?.photos).toEqual({ uploadedCount: 1, failed: [], removalFailures: 0 });
    expect(callsTo('update_grn')[0].args.p_images).toEqual([]);
    expect(callsTo('delete_grn_image').map((call) => call.args)).toEqual([{ p_image_id: OLD_PHOTO_ID }]);
    expect(names().indexOf('delete_grn_image')).toBeGreaterThan(names().indexOf('update_grn'));
    // The replacement is registered and confirmed before the old photo is deleted (the server keeps a GRN's last photo).
    expect(names().indexOf('delete_grn_image')).toBeGreaterThan(names().indexOf('confirm_grn_image_upload'));
  });

  it('keeps the removed GRN-book photo in p_images while its replacement waits, when the GRN also has an item photo', async () => {
    const ITEM_PHOTO_ID = '99999999-2222-4333-8444-555555555555';
    mockRpcHandlers.update_grn = () => updateAnswer({ images: [{ id: ITEM_PHOTO_ID }, { id: OLD_PHOTO_ID }] });
    mockRpcHandlers.delete_grn_image = () => ({ data: { success: true, data: { storage_path: `headers/${GRN_ID}/old.webp` } }, error: null });
    const removed = [{ id: OLD_PHOTO_ID, storagePath: `headers/${GRN_ID}/old.webp`, header: { fileName: 'old.webp', fileSize: 10, mimeType: 'image/webp' } }];

    const result = await updateGRN(
      GRN_ID,
      { header: header([picked('replacement')]), items: [line(LINE_ID, 'Example Potatoes', [saved(ITEM_PHOTO_ID, 'mark')])] },
      { removedImages: removed }
    );

    expect(result.success).toBe(true);
    const sent = callsTo('update_grn')[0].args.p_images;
    expect(sent.map((i: any) => [i.id, i.image_type])).toEqual([[ITEM_PHOTO_ID, 'item'], [OLD_PHOTO_ID, 'header']]);
    expect(callsTo('delete_grn_image').map((call) => call.args)).toEqual([{ p_image_id: OLD_PHOTO_ID }]);
    expect(names().indexOf('delete_grn_image')).toBeGreaterThan(names().indexOf('confirm_grn_image_upload'));
  });

  it('says a GRN needs a photo when the server keeps the last one', async () => {
    mockRpcHandlers.update_grn = () => updateAnswer({ images: [{ id: OLD_PHOTO_ID }] });
    mockRpcHandlers.delete_grn_image = () => ({
      data: { success: false, error_code: 'WH409', reason: 'GRN_PHOTO_REQUIRED', error: 'English', gr_no: 'A0010' },
      error: null,
    });

    const result = await updateGRN(
      GRN_ID,
      { header: header([picked('replacement')]), items: [line(LINE_ID, 'Example Potatoes')] },
      { removedImages: [{ id: OLD_PHOTO_ID }] }
    );

    expect(result.success).toBe(true);
    expect(result.data?.photos.removalFailures).toBe(1);
    expect(result.data?.photos.removalRefusal).toBe('A GRN needs at least one photo. Add another before deleting this one.');
  });

  it('does not delete again a photo update_grn already removed, and clears its file', async () => {
    mockRpcHandlers.update_grn = () => updateAnswer({ images: [{ id: KEPT_PHOTO_ID }] });

    const result = await updateGRN(
      GRN_ID,
      { header: header([saved(KEPT_PHOTO_ID, 'kept')]), items: [line(LINE_ID, 'Example Potatoes')] },
      { removedImages: [{ id: OLD_PHOTO_ID, storagePath: `headers/${GRN_ID}/old.webp` }] }
    );

    expect(result.data?.photos.removalFailures).toBe(0);
    expect(callsTo('delete_grn_image')).toHaveLength(0);
    expect(callsTo('storage.remove').map((call) => call.args)).toEqual([[`headers/${GRN_ID}/old.webp`]]);
  });

  it('counts a removed photo that could not be deleted', async () => {
    mockRpcHandlers.update_grn = () => updateAnswer({ images: [{ id: OLD_PHOTO_ID }] });
    mockRpcHandlers.delete_grn_image = () => ({ data: { success: false, message: 'Staff access required' }, error: null });

    const result = await updateGRN(
      GRN_ID,
      { header: header([picked('replacement')]), items: [line(LINE_ID, 'Example Potatoes')] },
      { removedImages: [{ id: OLD_PHOTO_ID }] }
    );

    expect(result.success).toBe(true);
    expect(result.data?.photos.removalFailures).toBe(1);
  });

  it('leaves every photo on the server alone when the save is refused', async () => {
    mockRpcHandlers.update_grn = () => ({ data: { success: false, message: 'GRN number already exists: A0010' }, error: null });

    const result = await updateGRN(
      GRN_ID,
      { header: header([picked('replacement')]), items: [line(LINE_ID, 'Example Potatoes', [picked('mark')])] },
      { removedImages: [{ id: OLD_PHOTO_ID, storagePath: `headers/${GRN_ID}/old.webp` }] }
    );

    expect(result.success).toBe(false);
    expect(names()).toEqual(['update_grn']);
  });
});

// RF-1 (M5-11): until a photo's preparation has finished, and when it has
// failed, the form's entry still points at the original camera or gallery file.
describe('a photo whose preparation has not finished or has failed', () => {
  /** The entry ImageUploadButton puts in the form the moment a photo is picked. */
  const original = (name: string, uploadStatus: 'uploading' | 'failed'): GRNImageData => ({
    id: `temp_${name}`,
    fileName: `${name}.jpg`,
    imageUrl: `file:///DCIM/Camera/${name}.jpg`,
    uploadStatus,
    fileSize: 8_000_000,
    mimeType: 'image/jpeg',
  });
  const createBackend = () => {
    mockRpcHandlers.save_grn = () => ({
      data: { success: true, data: { grn_id: GRN_ID, gr_no: 'A0010', item_mapping: [{ index: 0, item_id: LINE_ID }] } },
      error: null,
    });
  };

  it('is not among the photos to upload', () => {
    const photos = collectDeferredGRNPhotos(
      [picked('book'), original('running', 'uploading'), original('broken', 'failed')],
      [{ itemId: LINE_ID, itemName: 'Example Potatoes', images: [original('mark', 'uploading')] }]
    );
    expect(photos.map((photo) => photo.image.id)).toEqual(['temp_book']);
  });

  it('tells the form apart: preparing, failed, ready', () => {
    expect(unpreparedGRNPhotos([picked('book'), saved(KEPT_PHOTO_ID, 'kept')], [{ images: [picked('mark')] }])).toBeNull();
    expect(unpreparedGRNPhotos([picked('book')], [{ images: [original('mark', 'uploading')] }])).toBe('preparing');
    expect(unpreparedGRNPhotos([original('running', 'uploading'), original('broken', 'failed')], [])).toBe('failed');
  });

  it('is never sent by a create: the original file is not registered, read or uploaded', async () => {
    createBackend();
    const result = await createGRN({
      header: header([picked('book'), original('broken', 'failed'), original('running', 'uploading')]),
      items: [line('item-1', 'Example Potatoes', [original('mark', 'failed')])],
    });

    expect(result.success).toBe(true);
    expect(callsTo('register_grn_image_upload').map((call) => call.args.p_file_name)).toEqual(['book.webp']);
    expect(callsTo('storage.upload')).toHaveLength(1);
    expect(JSON.stringify((global as any).fetch.mock.calls)).not.toContain('DCIM');
  });

  it('is never sent by an edit', async () => {
    mockRpcHandlers.update_grn = () => ({
      data: { success: true, grn: { id: GRN_ID, images: [{ id: KEPT_PHOTO_ID }] }, item_mapping: [] },
      error: null,
    });
    const result = await updateGRN(GRN_ID, {
      header: header([saved(KEPT_PHOTO_ID, 'kept'), original('broken', 'failed')]),
      items: [line(LINE_ID, 'Example Potatoes', [original('mark', 'uploading')])],
    });

    expect(result.success).toBe(true);
    expect(callsTo('register_grn_image_upload')).toHaveLength(0);
    expect(callsTo('storage.upload')).toHaveLength(0);
  });

  it('is refused by the upload itself, whatever list it is given', async () => {
    const outcome = await uploadGRNPhotos(GRN_ID, [
      { image: original('broken', 'failed'), imageType: 'header', position: 1 },
      { image: picked('book'), imageType: 'header', position: 2 },
    ]);

    expect(outcome.uploadedCount).toBe(1);
    expect(outcome.failed.map((photo) => [photo.image.id, photo.error])).toEqual([['temp_broken', 'The photo was not ready to upload']]);
    expect(callsTo('register_grn_image_upload')).toHaveLength(1);
  });
});

// RF-3: the service says when the answer to update_grn was lost, so the form
// asks the server what it holds before saving again.
describe('an update whose answer is lost', () => {
  const edit = () => updateGRN(GRN_ID, { header: header([saved(KEPT_PHOTO_ID, 'kept')]), items: [line('item-new', 'Example Onions')] });

  it.each([
    ['a dropped connection', 'TypeError: Network request failed'],
    ['the request time limit', 'TimeoutError: Request timeout'],
  ])('is reported with its request code and time after %s', async (_case, message) => {
    mockRpcHandlers.update_grn = () => ({ data: null, error: { message, code: '', details: '', hint: '' } });
    const result = await edit();
    expect(result.success).toBe(false);
    expect(result.lostAnswer).toEqual({
      key: expect.stringMatching(/^warehouse-grn-update-[a-f0-9]{64}$/),
      sentAt: expect.any(Number),
      args: expect.objectContaining({ p_grn_id: GRN_ID }),
    });
    expect(result.lostAnswer?.key).toBe(callsTo('update_grn')[0].args.p_idempotency_key);
  });

  it('is not claimed when the server answered with a refusal', async () => {
    mockRpcHandlers.update_grn = () => ({ data: { success: false, message: 'GRN number already exists: A0010' }, error: null });
    expect((await edit()).lostAnswer).toBeUndefined();
    mockRpcHandlers.update_grn = () => ({ data: null, error: { message: 'new row violates check constraint', code: '23514' } });
    expect((await edit()).lostAnswer).toBeUndefined();
  });
});

// RF-3: update_grn takes an idempotency key (backend migration 47). A Save that
// is repeated with the same body carries the same key, so the server answers
// with the first result and applies nothing; any other Save carries a new one.
describe('the idempotency key of an update', () => {
  const answer = (extra: Record<string, unknown> = {}) => ({
    data: {
      success: true,
      message: 'GRN updated successfully',
      grn: { id: GRN_ID, gr_no: 'A0010', items: [], images: [{ id: KEPT_PHOTO_ID }] },
      stats: {},
      item_mapping: [],
      ...extra,
    },
    error: null,
  });
  const lost = () => ({ data: null, error: { message: 'TypeError: Network request failed', code: '', details: '', hint: '' } });
  const edit = (note = '', options: Parameters<typeof updateGRN>[2] = {}) =>
    updateGRN(
      GRN_ID,
      { header: { ...header([saved(KEPT_PHOTO_ID, 'kept')]), note }, items: [line(LINE_ID, 'Example Potatoes'), line('item-new', 'Example Onions')] },
      options
    );
  const keys = () => callsTo('update_grn').map((call) => call.args.p_idempotency_key);

  it('is sent, and is the same on every retry of a Save that got no answer', async () => {
    mockRpcHandlers.update_grn = lost;
    await edit();
    await edit();
    mockRpcHandlers.update_grn = () => answer();
    expect((await edit()).success).toBe(true);

    expect(keys()[0]).toMatch(/^warehouse-grn-update-[a-f0-9]{64}$/);
    expect(keys()).toEqual([keys()[0], keys()[0], keys()[0]]);
  });

  // Also when the form is changed back: both earlier saves may have been applied, and the
  // stored answer of the first would leave the GRN as the second made it.
  it('is a new one whenever the form was changed after a Save that got no answer', async () => {
    mockRpcHandlers.update_grn = lost;
    await edit('first note');
    await edit('second note');
    await edit('first note');

    expect(new Set(keys()).size).toBe(3);
  });

  it('is a new one after a save the server answered, also for the same body', async () => {
    mockRpcHandlers.update_grn = () => answer();
    await edit();
    await edit();

    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it('stays the same after a refusal, which the server did not keep', async () => {
    mockRpcHandlers.update_grn = () => ({ data: { success: false, message: 'GRN number already exists: A0010' }, error: null });
    await edit();
    await edit();

    expect(keys()[1]).toBe(keys()[0]);
  });

  // Owner rule D22: after the check found nothing, the identical request is sent again, byte for byte.
  it('a resend repeats the lost request exactly, under the same code, and makes no new one', async () => {
    mockRpcHandlers.update_grn = lost;
    const first = await edit('first note');
    expect(first.lostAnswer).toBeDefined();
    mockRpcHandlers.update_grn = () => answer({ idempotent: true });
    // The form's note is another one now: the resend must still repeat what was sent, not what the form holds.
    const result = await edit('changed after the loss', { resend: first.lostAnswer });

    expect(result.success).toBe(true);
    expect(callsTo('update_grn')).toHaveLength(2);
    expect(callsTo('update_grn')[1].args).toEqual(callsTo('update_grn')[0].args);
    expect(keys()[1]).toBe(first.lostAnswer?.key);
  });

  it('a resend that gets no answer either is unsettled again, under the same code', async () => {
    mockRpcHandlers.update_grn = lost;
    const first = await edit();
    const second = await edit('', { resend: first.lostAnswer });

    expect(second.success).toBe(false);
    expect(second.lostAnswer?.key).toBe(first.lostAnswer?.key);
  });

  it('a stored answer found by the check is handled as the answer that was lost, and nothing is sent', async () => {
    mockRpcHandlers.update_grn = lost;
    await edit();
    const result = await edit('', { storedAnswer: answer({ idempotent: true }).data });

    expect(result.success).toBe(true);
    expect(callsTo('update_grn')).toHaveLength(1);
  });

  it('takes the replayed answer of the first save as a save: the photo of the added line goes up', async () => {
    mockRpcHandlers.update_grn = () =>
      answer({ idempotent: true, item_mapping: [{ index: 1, grn_trl_item_id: NEW_LINE_ID, is_new: true }] });
    const result = await updateGRN(GRN_ID, {
      header: header([saved(KEPT_PHOTO_ID, 'kept')]),
      items: [line(LINE_ID, 'Example Potatoes'), line('item-new', 'Example Onions', [picked('onions')])],
    });

    expect(result.success).toBe(true);
    expect(result.data?.photos).toEqual({ uploadedCount: 1, failed: [], removalFailures: 0 });
    expect(callsTo('register_grn_image_upload')[0].args.p_grn_item_id).toBe(NEW_LINE_ID);
  });

  describe('on a server without the parameter (migration 47 not applied)', () => {
    const unknownFunction = {
      code: 'PGRST202',
      message: 'Could not find the function public.update_grn(p_grn_id, p_idempotency_key, p_items) in the schema cache',
      details: 'Searched for the function public.update_grn with parameters p_grn_id, p_idempotency_key, p_items',
      hint: null,
    };
    const oldServer = (keyless: () => RpcAnswer) => {
      mockRpcHandlers.update_grn = (args) => ('p_idempotency_key' in args ? { data: null, error: unknownFunction } : keyless());
    };

    it('sends the same body once more without the key', async () => {
      oldServer(() => answer());
      const result = await edit();

      expect(result.success).toBe(true);
      const [withKey, withoutKey] = callsTo('update_grn').map((call) => call.args);
      expect(callsTo('update_grn')).toHaveLength(2);
      expect(withoutKey).not.toHaveProperty('p_idempotency_key');
      expect({ ...withKey, p_idempotency_key: undefined }).toEqual({ ...withoutKey, p_idempotency_key: undefined });
    });

    it('a lost answer of the second request has no request code to ask about: no lostAnswer', async () => {
      oldServer(lost);
      const result = await edit();

      expect(result.success).toBe(false);
      expect(result.lostAnswer).toBeUndefined();
      expect(callsTo('update_grn')).toHaveLength(2);
    });

    it('does not repeat any other failure', async () => {
      mockRpcHandlers.update_grn = () => ({ data: null, error: { message: 'new row violates check constraint', code: '23514' } });
      expect((await edit()).success).toBe(false);
      expect(callsTo('update_grn')).toHaveLength(1);
    });
  });
});

// A date picker gives local midnight. As an instant that is 18:30 UTC of the
// day before in India, and the server takes the day from the text (M3-2).
describe('the GRN date goes to the server as a calendar day', () => {
  const pickedInstant = new Date(2026, 9, 11).toISOString();

  it('on create', async () => {
    mockRpcHandlers.save_grn = () => ({
      data: { success: true, message: 'GRN created successfully', data: { grn_id: GRN_ID, gr_no: 'A0010', item_ids: [LINE_ID], image_ids: [], item_mapping: [] } },
      error: null,
    });
    await createGRN({ header: { ...header([]), date: pickedInstant }, items: [line('item-1', 'Example Potatoes')] });
    expect(callsTo('save_grn')[0].args.p_date).toBe('2026-10-11');
  });

  it('on edit, also for a date the server sent back as a timestamp', async () => {
    mockRpcHandlers.update_grn = () => ({
      data: { success: true, message: 'GRN updated successfully', grn: { id: GRN_ID, gr_no: 'A0010', items: [], images: [] }, stats: {}, item_mapping: [] },
      error: null,
    });
    await updateGRN(GRN_ID, { header: { ...header([]), date: pickedInstant }, items: [line(LINE_ID, 'Example Potatoes')] });
    expect(callsTo('update_grn')[0].args.p_date).toBe('2026-10-11');
  });

  it('leaves a plain day alone', async () => {
    mockRpcHandlers.update_grn = () => ({
      data: { success: true, message: 'GRN updated successfully', grn: { id: GRN_ID, gr_no: 'A0010', items: [], images: [] }, stats: {}, item_mapping: [] },
      error: null,
    });
    await updateGRN(GRN_ID, { header: header([]), items: [line(LINE_ID, 'Example Potatoes')] });
    expect(callsTo('update_grn')[0].args.p_date).toBe('2026-10-01');
  });
});

// BR-05: a lost confirm answer must not cost a photo the server has attached.
describe('rolling back a photo upload', () => {
  const asset = { uri: 'file:///cache/book.jpg', fileName: 'book.jpg', width: 800, height: 600 } as any;
  const pending = [{ image: picked('book'), imageType: 'header' as const, position: 1 }];
  const flows: Array<[string, () => Promise<{ success: boolean; imageId?: string; error?: string }>]> = [
    ['immediate', () => uploadGRNImage(asset, GRN_ID, 'header')],
    [
      'deferred',
      async () => {
        const outcome = await uploadGRNPhotos(GRN_ID, pending);
        return { success: outcome.failed.length === 0 && outcome.uploadedCount === 1 };
      },
    ],
  ];
  const lostConfirm = () => {
    mockRpcHandlers.confirm_grn_image_upload = () => ({ data: null, error: { message: 'Network request failed' } });
  };
  const removals = () => callsTo('storage.remove');

  describe.each(flows)('%s upload', (_name, run) => {
    it('keeps the file when the cancel says the pending row was not found (old server)', async () => {
      lostConfirm();
      mockRpcHandlers.cancel_grn_image_upload = () => ({
        data: { success: false, code: 'NOT_FOUND', error: 'Pending upload not found' },
        error: null,
      });
      const result = await run();
      expect(removals()).toEqual([]);
      expect(result.success).toBe(false);
    });

    it('reports success and keeps the file when the cancel says the upload is already confirmed', async () => {
      lostConfirm();
      mockRpcHandlers.cancel_grn_image_upload = () => ({
        data: { success: false, code: 'ALREADY_CONFIRMED', error: 'Upload already confirmed', image_id: 'image-1', storage_path: 'path-1' },
        error: null,
      });
      const result = await run();
      expect(removals()).toEqual([]);
      expect(result.success).toBe(true);
      if (_name === 'immediate') expect(result.imageId).toBe('image-1');
    });

    it('hands the form the whole success answer when the cancel says the upload is already confirmed', async () => {
      if (_name !== 'immediate') return;
      lostConfirm();
      mockRpcHandlers.cancel_grn_image_upload = () => ({
        data: { success: false, code: 'ALREADY_CONFIRMED', error: 'Upload already confirmed', image_id: 'image-1', storage_path: 'path-1' },
        error: null,
      });
      // ImageUploadButton only takes a result with imageUrl and metadata as a success.
      expect(await uploadGRNImage(asset, GRN_ID, 'header')).toEqual(
        expect.objectContaining({
          success: true,
          imageId: 'image-1',
          imageUrl: 'https://facility.invalid/signed/path-1',
          metadata: expect.objectContaining({ storagePath: 'path-1' }),
        })
      );
    });

    it('removes the file once when the confirm was refused and the pending row was cancelled', async () => {
      mockRpcHandlers.confirm_grn_image_upload = () => ({ data: { success: false, code: 'IMAGE_NOT_VERIFIED' }, error: null });
      mockRpcHandlers.cancel_grn_image_upload = () => ({ data: { success: true, storage_path: 'path-1' }, error: null });
      const result = await run();
      expect(removals().map((call) => call.args)).toEqual([['path-1']]);
      expect(result.success).toBe(false);
    });

    it('keeps the file when the cancel itself throws', async () => {
      lostConfirm();
      mockRpcHandlers.cancel_grn_image_upload = () => {
        throw new Error('Network request failed');
      };
      const result = await run();
      expect(removals()).toEqual([]);
      expect(result.success).toBe(false);
    });
  });

  it('does not cancel a confirmed photo when signing its URL throws', async () => {
    mockRpcHandlers.confirm_grn_image_upload = () => ({ data: { success: true }, error: null });
    mockRpcHandlers.cancel_grn_image_upload = () => ({ data: { success: true, storage_path: 'path-1' }, error: null });
    mockSignedUrlThrows = true;
    const result = await uploadGRNImage(asset, GRN_ID, 'header');
    expect(callsTo('cancel_grn_image_upload')).toEqual([]);
    expect(removals()).toEqual([]);
    // Same answer as a missing signed URL: the direct storage URL.
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        imageUrl: expect.stringMatching(/^https:\/\/facility\.invalid\/storage\/v1\/object\/grn-images\//),
      })
    );
  });
});
