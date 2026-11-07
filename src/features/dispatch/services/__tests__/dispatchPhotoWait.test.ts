/**
 * WH-122: after a dispatch is saved, its photos are waited for at most 30 seconds in all (as on the GRN form). A photo
 * still uploading then is reported as not uploaded, its upload carries on, and a retry reuses it.
 */
import { beginOperatorMutation, getAuthenticatedClient } from '@/config/supabaseConfig';
import { DISPATCH_PHOTO_UPLOAD_WAIT_MS, uploadDeferredDispatchImages } from '../dispatchImageService';
import type { DispatchImageData } from '@/types/dispatch.types';

jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: jest.fn(),
  getAuthenticatedClient: jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid', anonKey: 'anon' }),
}));
jest.mock('@/utils/photoCompression', () => ({
  ...jest.requireActual('@/utils/photoCompression'),
  compressPhoto: jest.fn(),
}));

const DISPATCH_ID = '11111111-2222-4333-8444-555555555555';
let counter = 0;
// A fresh file for each test: uploads still running are remembered by file.
const photo = (name: string): DispatchImageData => ({
  id: `temp_${name}_${++counter}`,
  file_name: `${name}.webp`,
  image_url: `file:///cache/${name}-${counter}.webp`,
  upload_status: 'completed',
});

type Answer = { data: unknown; error: unknown };
let pending: Array<(answer: Answer) => void>;
let finishMutation: jest.Mock;
const hang = () => new Promise<Answer>(resolve => { pending.push(resolve); });
const noConnection: Answer = { data: null, error: { message: 'Network request failed' } };

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.clearAllMocks();
  pending = [];
  finishMutation = jest.fn();
  jest.mocked(beginOperatorMutation).mockReturnValue(finishMutation);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  // Let every hung upload end so nothing runs on into the next test.
  pending.forEach(resolve => resolve(noConnection));
  await Promise.resolve();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('waits 30 seconds in all by default', () => {
  expect(DISPATCH_PHOTO_UPLOAD_WAIT_MS).toBe(30000);
});

it('reports a photo still uploading as not uploaded once the 30 seconds are over, and not before', async () => {
  const rpc = jest.fn(() => hang());
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  const slow = photo('slow');
  let outcome: Awaited<ReturnType<typeof uploadDeferredDispatchImages>> | undefined;
  const call = uploadDeferredDispatchImages(DISPATCH_ID, [slow]).then(result => { outcome = result; });

  await jest.advanceTimersByTimeAsync(29999);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(outcome).toBeUndefined();

  await jest.advanceTimersByTimeAsync(1);
  await call;
  expect(outcome).toMatchObject({ success: false, uploadedCount: 0, failed: [slow] });
  expect(outcome?.errors).toHaveLength(1);
  expect(outcome?.errors[0]).toContain('slow.webp');
});

it('names only the photo that is still uploading and keeps the other photo\'s own error', async () => {
  const rpc = jest.fn((_name: string, args: { p_file_name: string }) =>
    args.p_file_name === 'stuck.webp' ? hang() : Promise.resolve(noConnection)
  );
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  const stuck = photo('stuck');
  const quick = photo('quick');
  const call = uploadDeferredDispatchImages(DISPATCH_ID, [stuck, quick], 50);
  await jest.advanceTimersByTimeAsync(50);
  const outcome = await call;
  expect(outcome.success).toBe(false);
  expect(outcome.failed).toEqual([stuck, quick]);
  expect(outcome.errors).toHaveLength(2);
  expect(outcome.errors.find(e => e.startsWith('quick.webp'))).toBeDefined();
  expect(outcome.errors.find(e => e.startsWith('stuck.webp'))).toBeDefined();
});

it('keeps the upload going after the wait, and the operator mutation open until it ends', async () => {
  const rpc = jest.fn(() => hang());
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  const call = uploadDeferredDispatchImages(DISPATCH_ID, [photo('late')], 50);
  await jest.advanceTimersByTimeAsync(50);
  await call;
  expect(finishMutation).not.toHaveBeenCalled();

  pending.forEach(resolve => resolve(noConnection));
  await jest.advanceTimersByTimeAsync(0);
  expect(finishMutation).toHaveBeenCalledTimes(1);
});

it('a retry of the same photo reuses the upload still running instead of starting a second one', async () => {
  const rpc = jest.fn(() => hang());
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  const again = photo('again');
  const first = uploadDeferredDispatchImages(DISPATCH_ID, [again], 50);
  await jest.advanceTimersByTimeAsync(50);
  await first;
  expect(rpc).toHaveBeenCalledTimes(1);

  const retry = uploadDeferredDispatchImages(DISPATCH_ID, [again], 50);
  await jest.advanceTimersByTimeAsync(50);
  const outcome = await retry;
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(outcome).toMatchObject({ success: false, failed: [again] });
});

it('returns at once, with nothing waited for, when no photo is going up', async () => {
  expect(await uploadDeferredDispatchImages(DISPATCH_ID, [])).toEqual({ success: true, uploadedCount: 0, errors: [], failed: [] });
  expect(beginOperatorMutation).not.toHaveBeenCalled();
});
