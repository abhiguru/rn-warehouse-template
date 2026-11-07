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
  // (a retry that stops waiting for a failed upload starts one of its own, so answer until nothing is left)
  for (let round = 0; round < 5; round += 1) {
    pending.splice(0).forEach(resolve => resolve(noConnection));
    await jest.advanceTimersByTimeAsync(0);
  }
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

describe('a photo uploaded after the wait, and photos given up on', () => {
  const advanceGeneration = () => (require('@/config/sessionLifecycle') as typeof import('@/config/sessionLifecycle')).advanceSessionGeneration();
  const { giveUpDispatchPhotos } = require('../dispatchImageService') as typeof import('../dispatchImageService');
  const flush = async () => { for (let i = 0; i < 20; i += 1) await jest.advanceTimersByTimeAsync(0); };
  let releaseStorage: Array<() => void>;
  let registered: string[];
  const originalFetch = global.fetch;
  const originalReader = global.FileReader;

  /** A server that registers and confirms every photo, with the file upload held until the test lets it go. */
  const lateServer = (registerFor: (file: string) => Promise<Answer> | null = () => null) => {
    const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'register_dispatch_image_upload') {
        registered.push(String(args.p_file_name));
        const held = registerFor(String(args.p_file_name));
        if (held) return held;
        return { data: { success: true, image_id: `img-${args.p_file_name}`, storage_path: `p/${args.p_file_name}`, upload_token: 'tok' }, error: null };
      }
      if (name === 'confirm_dispatch_image_upload') return { data: { success: true }, error: null };
      return { data: null, error: { message: `unexpected ${name}` } };
    });
    const upload = jest.fn(() => new Promise<{ error: null }>(resolve => { releaseStorage.push(() => resolve({ error: null })); }));
    jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc, storage: { from: () => ({ upload }) } } as never);
    return rpc;
  };

  beforeEach(() => {
    releaseStorage = [];
    registered = [];
    global.fetch = jest.fn(async () => ({ blob: async () => ({}) })) as never;
    // The file read answers at once, whatever the fake clock says.
    global.FileReader = class {
      result: ArrayBuffer | null = null;
      error: Error | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsArrayBuffer() {
        this.result = new ArrayBuffer(8);
        void Promise.resolve().then(() => this.onload?.());
      }
    } as never;
  });
  afterEach(async () => {
    global.fetch = originalFetch;
    global.FileReader = originalReader;
    releaseStorage.forEach(release => release());
    await flush();
  });

  it('a retry counts a photo that finished after the wait as uploaded and sends nothing more', async () => {
    lateServer();
    const late = photo('lateok');
    const first = uploadDeferredDispatchImages(DISPATCH_ID, [late], 50);
    await jest.advanceTimersByTimeAsync(50);
    const afterWait = await first;
    expect(afterWait).toMatchObject({ success: false, uploadedCount: 0, failed: [late] });
    expect(registered).toEqual(['lateok.webp']);

    // The upload ends after the wait: the photo is attached (and its phone copy is deleted).
    releaseStorage.forEach(release => release());
    await flush();

    const retry = await uploadDeferredDispatchImages(DISPATCH_ID, [late], 50);
    expect(retry).toEqual({ success: true, uploadedCount: 1, errors: [], failed: [] });
    expect(registered).toEqual(['lateok.webp']);
  });

  it('forgets what finished late when the session changes, so nothing is taken as done for another session', async () => {
    lateServer();
    const late = photo('session');
    const first = uploadDeferredDispatchImages(DISPATCH_ID, [late], 50);
    await jest.advanceTimersByTimeAsync(50);
    await first;
    releaseStorage.forEach(release => release());
    await flush();

    advanceGeneration();
    const retry = uploadDeferredDispatchImages(DISPATCH_ID, [late], 50);
    await jest.advanceTimersByTimeAsync(50);
    await retry;
    expect(registered).toEqual(['session.webp', 'session.webp']);
  });

  it('a photo uploaded late for one dispatch is not taken as done for another dispatch', async () => {
    lateServer();
    const late = photo('other');
    const first = uploadDeferredDispatchImages(DISPATCH_ID, [late], 50);
    await jest.advanceTimersByTimeAsync(50);
    await first;
    releaseStorage.forEach(release => release());
    await flush();

    const retry = uploadDeferredDispatchImages('99999999-2222-4333-8444-555555555555', [late], 50);
    await jest.advanceTimersByTimeAsync(50);
    await retry;
    expect(registered).toEqual(['other.webp', 'other.webp']);
  });

  it('"Continue without photos": a photo still waiting for an upload place is never started', async () => {
    const releaseRegister: Array<() => void> = [];
    // The first four photos hold every place (4 at a time); the fifth waits for one.
    lateServer(file => (file === 'queued.webp' ? null : new Promise<Answer>(resolve => { releaseRegister.push(() => resolve(noConnection)); })));
    const holders = ['h1', 'h2', 'h3', 'h4'].map(photo);
    const queued = photo('queued');
    const call = uploadDeferredDispatchImages(DISPATCH_ID, [...holders, queued], 50);
    await jest.advanceTimersByTimeAsync(50);
    const outcome = await call;
    expect(outcome.failed).toHaveLength(5);
    expect(registered).toHaveLength(4);

    giveUpDispatchPhotos(DISPATCH_ID, outcome.failed);
    releaseRegister.forEach(release => release());
    await flush();
    await flush();
    expect(registered).not.toContain('queued.webp');
    expect(registered).toHaveLength(4);
  });

  it('without giving up, the same queued photo does start once a place is free', async () => {
    const releaseRegister: Array<() => void> = [];
    lateServer(file => (file === 'queued2.webp' ? null : new Promise<Answer>(resolve => { releaseRegister.push(() => resolve(noConnection)); })));
    const holders = ['g1', 'g2', 'g3', 'g4'].map(photo);
    const call = uploadDeferredDispatchImages(DISPATCH_ID, [...holders, photo('queued2')], 50);
    await jest.advanceTimersByTimeAsync(50);
    await call;
    releaseRegister.forEach(release => release());
    await flush();
    await flush();
    expect(registered).toContain('queued2.webp');
  });

  it('giving up on a photo clears a late success noted for it, so a retry is not told it is attached', async () => {
    lateServer();
    const unwanted = photo('unwanted');
    const first = uploadDeferredDispatchImages(DISPATCH_ID, [unwanted], 50);
    await jest.advanceTimersByTimeAsync(50);
    await first;
    releaseStorage.forEach(release => release());
    await flush();
    giveUpDispatchPhotos(DISPATCH_ID, [unwanted]);
    const retry = await uploadDeferredDispatchImages(DISPATCH_ID, [unwanted], 50);
    expect(retry.success).toBe(false);
    expect(retry.failed).toEqual([unwanted]);
    expect(registered).toEqual(['unwanted.webp']);
  });
});
