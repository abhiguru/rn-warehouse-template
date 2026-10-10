/**
 * Photos of a GRN are changed on the server only when the GRN is saved, and a
 * photo that does not arrive is reported, not swallowed.
 *
 * The services run against a fake backend that records every call in order:
 * RPCs by name, storage calls as `storage.upload` / `storage.remove`.
 */
import { createGRN, updateGRN } from '../grnFormService';
import { uploadGRNPhotos, collectDeferredGRNPhotos, type FailedGRNPhoto } from '../imageUploadService';
import type { GRNHeaderData, GRNImageData } from '@/store/slices/grnFormSlice';

type RpcAnswer = { data: unknown; error: unknown };
const mockCalls: Array<{ name: string; args: any }> = [];
let mockRpcHandlers: Record<string, (args: any) => RpcAnswer | Promise<RpcAnswer>> = {};
let mockRegistered = 0;

jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
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
          return { error: null };
        },
        remove: async (paths: string[]) => {
          mockCalls.push({ name: 'storage.remove', args: paths });
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  }),
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
  photoBackend();
  // The photo file is read with fetch + FileReader on the device.
  (global as any).fetch = jest.fn(async () => ({ blob: async () => ({ size: 1200 }) }));
  (global as any).FileReader = class {
    result: ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsArrayBuffer() {
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
        error: 'Network request failed',
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
