/**
 * A dispatch photo that does not upload after the dispatch is created is
 * returned to the caller, not only logged (the dispatch twin of M5-6).
 */
import { beginOperatorMutation, getAuthenticatedClient } from '@/config/supabaseConfig';
import { createDispatch } from '../dispatchFormService';
import { uploadDeferredDispatchImages, uploadDispatchImage } from '../dispatchImageService';
import type { DispatchImageData } from '@/types/dispatch.types';
import { localPhotoUploadEnded } from '@/utils/localPhotoFiles';
import { compressPhoto } from '@/utils/photoCompression';

jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: jest.fn(() => jest.fn()),
  getAuthenticatedClient: jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid', anonKey: 'anon' }),
}));
jest.mock('@/utils/photoCompression', () => ({
  ...jest.requireActual('@/utils/photoCompression'),
  compressPhoto: jest.fn(),
}));
// The real registry, with the end of each upload watched.
jest.mock('@/utils/localPhotoFiles', () => ({
  ...jest.requireActual('@/utils/localPhotoFiles'),
  localPhotoUploadEnded: jest.fn(),
}));
jest.mock('@/utils/submissionIdempotency', () => ({ submissionIdempotencyKey: async () => 'warehouse-dispatch-fictional-key' }));

const DISPATCH_ID = '11111111-2222-4333-8444-555555555555';
const photo = (name: string): DispatchImageData => ({ id: `temp_${name}`, file_name: `${name}.webp`, image_url: `file:///cache/${name}.webp`, upload_status: 'completed' });
const photos = [photo('truck'), photo('load')];
const payload = {
  header: { disp_no: 'I0042', disp_date: '2026-10-01', registration: '', customer_id: 'c1', customer_name: 'Fictional Traders', note: '' },
  items: [{ grnItems_id: 'fictional-lot', disp_quantity: 2 }],
  images: photos,
} as unknown as Parameters<typeof createDispatch>[0];

/** A server that creates the dispatch and refuses to register `refused` photos. */
function server(refused: string[]) {
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'create_dispatch_with_stock_check') return { data: { success: true, dispatch_id: DISPATCH_ID }, error: null };
    if (name === 'register_dispatch_image_upload' && refused.includes(String(args.p_file_name)))
      return { data: null, error: { message: 'Network request failed' } };
    return { data: null, error: { message: `unexpected ${name}` } };
  });
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('createDispatch succeeds and returns the photos that did not upload', async () => {
  server(['truck.webp', 'load.webp']);
  const result = await createDispatch(payload);
  expect(result.success).toBe(true);
  expect(result.dispatch_id).toBe(DISPATCH_ID);
  expect(result.failed_photos).toEqual(photos);
});

it('createDispatch reports no failed photo for a dispatch without photos', async () => {
  server([]);
  const result = await createDispatch({ ...payload, images: [] });
  expect(result).toMatchObject({ success: true, failed_photos: [] });
});

it('uploadDeferredDispatchImages names each photo that failed', async () => {
  server(['truck.webp', 'load.webp']);
  const outcome = await uploadDeferredDispatchImages(DISPATCH_ID, photos);
  expect(outcome.success).toBe(false);
  expect(outcome.uploadedCount).toBe(0);
  expect(outcome.failed).toEqual(photos);
});

it('a failure before any upload reports every photo, not none', async () => {
  jest.mocked(getAuthenticatedClient).mockRejectedValue(new Error('Network request failed: session refresh unavailable'));
  const outcome = await uploadDeferredDispatchImages(DISPATCH_ID, photos);
  expect(outcome.success).toBe(false);
  expect(outcome.failed).toEqual(photos);
  // The switch gate taken for the uploads is released.
  const release = jest.mocked(beginOperatorMutation).mock.results[0].value as jest.Mock;
  expect(release).toHaveBeenCalledTimes(1);
  // Like a failed upload, each file is kept for the retry, also through the form reset.
  expect(jest.mocked(localPhotoUploadEnded).mock.calls).toEqual([
    ['file:///cache/truck.webp', false],
    ['file:///cache/load.webp', false],
  ]);
});

it('photos that already have a storage path are not uploaded again and not reported', async () => {
  const rpc = server([]);
  const stored = { ...photo('seal'), storage_path: `${DISPATCH_ID}/seal.webp` };
  expect(await uploadDeferredDispatchImages(DISPATCH_ID, [stored])).toEqual({ success: true, uploadedCount: 0, errors: [], failed: [] });
  expect(rpc).not.toHaveBeenCalled();
});

// The server takes the dispatch day from the text it is sent ('...'::date), so
// an instant at 01:30 in India would be filed under the day before (M3-2).
it('createDispatch sends the dispatch date as a calendar day', async () => {
  const rpc = server([]);
  await createDispatch({ ...payload, header: { ...payload.header, disp_date: new Date(2026, 9, 11, 1, 30).toISOString() }, images: [] });
  const sent = rpc.mock.calls.find(([name]) => name === 'create_dispatch_with_stock_check')![1] as { p_dispatch_data: { disp_date: string } };
  expect(sent.p_dispatch_data.disp_date).toBe('2026-10-11');
});

// P2F-MEDIA-2: the dispatch uploads share the GRN rule, a few complete uploads at a time.
it('uploads at most four photos at once, reading each file only when its turn comes', async () => {
  const waiting: Array<() => void> = [];
  let active = 0;
  let most = 0;
  let buffersRead = 0;
  const confirmed: string[] = [];
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'register_dispatch_image_upload') {
      return { data: { success: true, image_id: `image-${args.p_file_name}`, storage_path: `path/${args.p_file_name}`, upload_token: 'token' }, error: null };
    }
    if (name === 'confirm_dispatch_image_upload') {
      confirmed.push(String(args.p_image_id));
      return { data: { success: true }, error: null };
    }
    return { data: null, error: { message: `unexpected ${name}` } };
  });
  const upload = jest.fn(() => {
    active += 1;
    most = Math.max(most, active);
    return new Promise<{ error: null }>((resolve) =>
      waiting.push(() => {
        active -= 1;
        resolve({ error: null });
      })
    );
  });
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc, storage: { from: () => ({ upload }) } } as never);
  (global as any).fetch = jest.fn(async () => ({ blob: async () => ({ size: 1200 }) }));
  (global as any).FileReader = class {
    result: ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    readAsArrayBuffer() {
      buffersRead += 1;
      this.result = new ArrayBuffer(8);
      this.onload?.();
    }
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  };

  const many = Array.from({ length: 10 }, (_, index) => photo(`crate-${index}`));
  const saving = uploadDeferredDispatchImages(DISPATCH_ID, many);
  await settle();
  expect(active).toBe(4);
  expect(buffersRead).toBe(4);

  while (waiting.length > 0) {
    waiting.splice(0).forEach((release) => release());
    await settle();
  }
  const outcome = await saving;
  expect(outcome).toEqual({ success: true, uploadedCount: 10, errors: [], failed: [] });
  expect(most).toBe(4);
  expect(confirmed).toHaveLength(10);
  // The switch gate is released once, after the last upload.
  const release = jest.mocked(beginOperatorMutation).mock.results[0].value as jest.Mock;
  expect(release).toHaveBeenCalledTimes(1);
});

it('never uploads the original file of a photo that is still being prepared or failed', async () => {
  const rpc = server([]);
  const prepared = photo('prepared');
  const preparing: DispatchImageData = { ...photo('raw_camera'), upload_status: 'uploading' };
  const tooLarge: DispatchImageData = { ...photo('twelve_mb'), upload_status: 'failed' };
  const outcome = await uploadDeferredDispatchImages(DISPATCH_ID, [prepared, preparing, tooLarge]);
  const registered = rpc.mock.calls.filter(([name]) => name === 'register_dispatch_image_upload').map(([, args]) => (args as { p_file_name: string }).p_file_name);
  expect(registered).toEqual(['prepared.webp']);
  expect(outcome.failed).toEqual([prepared]);
});

// BR-05: a lost confirm answer must not cost a photo the server has attached.
describe('rolling back a photo upload', () => {
  const asset = { uri: 'file:///cache/truck.jpg', fileName: 'truck.jpg', width: 800, height: 600 } as never;
  const flows: Array<[string, () => Promise<{ success: boolean; imageId?: string }>]> = [
    ['immediate', () => uploadDispatchImage(asset, DISPATCH_ID)],
    ['deferred', async () => ({ success: (await uploadDeferredDispatchImages(DISPATCH_ID, [photo('truck')])).uploadedCount === 1 })],
  ];

  /** register and storage upload succeed; the confirm and cancel answers are given by the test. */
  function rollbackServer(confirm: () => unknown, cancel: () => unknown, signedUrl?: (path: string) => unknown) {
    const remove = jest.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const rpc = jest.fn(async (name: string) => {
      if (name === 'register_dispatch_image_upload')
        return { data: { success: true, image_id: 'image-1', storage_path: 'path-1', upload_token: 'token' }, error: null };
      if (name === 'confirm_dispatch_image_upload') return confirm();
      if (name === 'cancel_dispatch_image_upload') return cancel();
      return { data: null, error: { message: `unexpected ${name}` } };
    });
    const storage = {
      from: () => ({
        upload: async () => ({ error: null }),
        createSignedUrl: async (path: string) =>
          signedUrl ? signedUrl(path) : { data: { signedUrl: `https://facility.invalid/signed/${path}` }, error: null },
        remove,
      }),
    };
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc, storage } as never);
    return remove;
  }
  const lostConfirm = () => ({ data: null, error: { message: 'Network request failed' } });

  beforeEach(() => {
    jest.mocked(compressPhoto).mockResolvedValue({ uri: 'file:///cache/prepared.webp', fileSize: 1200, mimeType: 'image/webp', extension: '.webp' } as never);
    (global as any).fetch = jest.fn(async () => ({ blob: async () => ({ size: 1200 }) }));
    (global as any).FileReader = class {
      result: ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      readAsArrayBuffer() {
        this.result = new ArrayBuffer(8);
        this.onload?.();
      }
    };
  });

  describe.each(flows)('%s upload', (name, run) => {
    it('keeps the file when the cancel says the pending row was not found (old server)', async () => {
      const remove = rollbackServer(lostConfirm, () => ({ data: { success: false, code: 'NOT_FOUND', error: 'Pending upload not found' }, error: null }));
      const result = await run();
      expect(remove).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('reports success and keeps the file when the cancel says the upload is already confirmed', async () => {
      const remove = rollbackServer(lostConfirm, () => ({
        data: { success: false, code: 'ALREADY_CONFIRMED', error: 'Upload already confirmed', image_id: 'image-1', storage_path: 'path-1' },
        error: null,
      }));
      const result = await run();
      expect(remove).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (name === 'immediate') expect(result.imageId).toBe('image-1');
    });

    it('hands the form the whole success answer, and ends the local copy as confirmed, when the cancel says the upload is already confirmed', async () => {
      rollbackServer(lostConfirm, () => ({
        data: { success: false, code: 'ALREADY_CONFIRMED', error: 'Upload already confirmed', image_id: 'image-1', storage_path: 'path-1' },
        error: null,
      }));
      if (name === 'immediate') {
        // ImageUploadButton only takes a result with imageUrl and metadata as a success.
        expect(await uploadDispatchImage(asset, DISPATCH_ID)).toEqual(
          expect.objectContaining({
            success: true,
            imageId: 'image-1',
            imageUrl: 'https://facility.invalid/signed/path-1',
            metadata: expect.objectContaining({ storage_path: 'path-1' }),
          })
        );
      } else {
        const outcome = await uploadDeferredDispatchImages(DISPATCH_ID, [photo('truck')]);
        expect(outcome.failed).toEqual([]);
        expect(jest.mocked(localPhotoUploadEnded).mock.calls).toEqual([['file:///cache/truck.webp', true]]);
      }
    });

    it('removes the file once when the confirm was refused and the pending row was cancelled', async () => {
      const remove = rollbackServer(
        () => ({ data: { success: false, code: 'IMAGE_NOT_VERIFIED' }, error: null }),
        () => ({ data: { success: true, storage_path: 'path-1' }, error: null })
      );
      const result = await run();
      expect(remove.mock.calls).toEqual([[['path-1']]]);
      expect(result.success).toBe(false);
    });

    it('keeps the file when the cancel itself throws', async () => {
      const remove = rollbackServer(lostConfirm, () => {
        throw new Error('Network request failed');
      });
      const result = await run();
      expect(remove).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });
  });

  it('does not cancel a confirmed photo when signing its URL throws', async () => {
    const cancel = jest.fn(() => ({ data: { success: true, storage_path: 'path-1' }, error: null }));
    const remove = rollbackServer(() => ({ data: { success: true }, error: null }), cancel, () => {
      throw new Error('signing unavailable');
    });
    const result = await uploadDispatchImage(asset, DISPATCH_ID);
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    // Same answer as a missing signed URL: the direct storage URL.
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        imageUrl: expect.stringMatching(/^https:\/\/facility\.invalid\/storage\/v1\/object\//),
      })
    );
  });
});
