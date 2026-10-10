/**
 * A dispatch photo that does not upload after the dispatch is created is
 * returned to the caller, not only logged (the dispatch twin of M5-6).
 */
import { beginOperatorMutation, getAuthenticatedClient } from '@/config/supabaseConfig';
import { createDispatch } from '../dispatchFormService';
import { uploadDeferredDispatchImages } from '../dispatchImageService';
import type { DispatchImageData } from '@/types/dispatch.types';

jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: jest.fn(() => jest.fn()),
  getAuthenticatedClient: jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid', anonKey: 'anon' }),
}));
jest.mock('@/utils/submissionIdempotency', () => ({ submissionIdempotencyKey: async () => 'warehouse-dispatch-fictional-key' }));

const DISPATCH_ID = '11111111-2222-4333-8444-555555555555';
const photo = (name: string): DispatchImageData => ({ id: `temp_${name}`, file_name: `${name}.webp`, image_url: `file:///cache/${name}.webp`, upload_status: 'pending' });
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
});

it('photos that already have a storage path are not uploaded again and not reported', async () => {
  const rpc = server([]);
  const stored = { ...photo('seal'), storage_path: `${DISPATCH_ID}/seal.webp` };
  expect(await uploadDeferredDispatchImages(DISPATCH_ID, [stored])).toEqual({ success: true, uploadedCount: 0, errors: [], failed: [] });
  expect(rpc).not.toHaveBeenCalled();
});
