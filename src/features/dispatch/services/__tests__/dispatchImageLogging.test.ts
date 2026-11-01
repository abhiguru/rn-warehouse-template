/**
 * An expected photo failure (no connection, a lost answer) logs at info, never console.error (it would raise a red
 * LogBox on the phone); an unexpected one keeps console.error.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { uploadDeferredDispatchImages } from '../dispatchImageService';
import type { DispatchImageData } from '@/types/dispatch.types';

jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: jest.fn(() => jest.fn()),
  getAuthenticatedClient: jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid', anonKey: 'anon' }),
}));
jest.mock('@/utils/photoCompression', () => ({
  ...jest.requireActual('@/utils/photoCompression'),
  compressPhoto: jest.fn(),
}));

const DISPATCH_ID = '11111111-2222-4333-8444-555555555555';
const photo: DispatchImageData = { id: 'temp_truck', file_name: 'truck.webp', image_url: 'file:///cache/truck.webp', upload_status: 'completed' };

const registrationFails = (error: Record<string, unknown>) => {
  const rpc = jest.fn(async () => ({ data: null, error }));
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
};

let errorSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('logs a registration that failed for want of a connection at info, not console.error', async () => {
  registrationFails({ message: 'Network request failed' });
  const outcome = await uploadDeferredDispatchImages(DISPATCH_ID, [photo]);
  expect(outcome.failed).toEqual([photo]);
  expect(errorSpy).not.toHaveBeenCalled();
  expect(logSpy.mock.calls.some(call => String(call[0]).includes('Registration failed'))).toBe(true);
});

it('keeps console.error for a registration the server refused', async () => {
  registrationFails({ message: 'permission denied for function register_dispatch_image_upload', code: '42501' });
  await uploadDeferredDispatchImages(DISPATCH_ID, [photo]);
  expect(errorSpy.mock.calls.some(call => String(call[0]).includes('Registration failed'))).toBe(true);
});
