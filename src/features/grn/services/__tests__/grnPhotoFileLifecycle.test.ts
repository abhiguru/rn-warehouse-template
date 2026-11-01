/**
 * The prepared photo files of a GRN save, with the real file registry
 * (P2F-MEDIA-3): a copy goes once its upload is confirmed, stays while its
 * upload is running, queued or may be retried, also through a form reset.
 */
import { uploadGRNPhotos, type FailedGRNPhoto } from '../imageUploadService';
import {
  abandonLocalPhotoUpload,
  LOCAL_PHOTO_OWNERS,
  localPhotoFilesIdle,
  registerLocalPhoto,
  releaseLocalPhotos,
  releaseLocalPhotosOwnedBy,
} from '@/utils/localPhotoFiles';
import type { GRNImageData } from '@/store/slices/grnFormSlice';

let mockConfirmFails = false;
let mockClientFails = false;
let mockUploadHook: (() => Promise<{ error: unknown }>) | null = null;
const mockFiles = new Set<string>();

jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => () => {},
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getSupabaseWithJWT: jest.fn(),
  getSupabaseClient: jest.fn(),
  getAuthenticatedClient: async () => {
    if (mockClientFails) throw new Error('Fictional expired session while offline');
    return mockClient();
  },
}));
const mockClient = () => ({
  rpc: async (name: string) => {
    if (name === 'register_grn_image_upload') {
      return { data: { success: true, image_id: 'image-1', storage_path: 'path-1', upload_token: 'token' }, error: null };
    }
    if (name === 'confirm_grn_image_upload') {
      return mockConfirmFails
        ? { data: null, error: { message: 'Network request failed' } }
        : { data: { success: true }, error: null };
    }
    return { data: { success: true }, error: null };
  },
  storage: {
    from: () => ({
      upload: async () => (mockUploadHook ? mockUploadHook() : { error: null }),
      remove: async () => ({ data: [], error: null }),
    }),
  },
});
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { WEBP: 'webp' }, manipulateAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-file-system', () => ({
  Paths: {
    cache: { uri: 'file:///data/user/0/org.example.warehouse/cache/' },
    document: { uri: 'file:///data/user/0/org.example.warehouse/files/' },
  },
  File: class {
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return 1200;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));

const GRN_ID = '11111111-2222-4333-8444-555555555555';
let counter = 0;
async function preparedPhoto(): Promise<{ image: GRNImageData; imageType: 'header'; position: number }> {
  counter += 1;
  const uri = `file:///data/user/0/org.example.warehouse/cache/ImageManipulator/copy-${counter}.webp`;
  mockFiles.add(uri);
  await registerLocalPhoto(uri, LOCAL_PHOTO_OWNERS.grnForm, 'prepared');
  return {
    image: { id: `temp_${counter}`, fileName: `copy-${counter}.webp`, imageUrl: uri, uploadStatus: 'completed', fileSize: 1200, mimeType: 'image/webp' },
    imageType: 'header',
    position: counter,
  };
}

beforeEach(() => {
  mockConfirmFails = false;
  mockClientFails = false;
  mockUploadHook = null;
  (global as any).fetch = jest.fn(async () => ({ blob: async () => ({ size: 1200 }) }));
  (global as any).FileReader = class {
    result: ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    readAsArrayBuffer() {
      this.result = new ArrayBuffer(8);
      this.onload?.();
    }
  };
  for (const method of ['log', 'warn', 'error'] as const) jest.spyOn(console, method).mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('deletes the copy of a confirmed upload', async () => {
  const photo = await preparedPhoto();
  expect(await uploadGRNPhotos(GRN_ID, [photo])).toEqual({ uploadedCount: 1, failed: [] });
  await localPhotoFilesIdle();
  expect(mockFiles.has(photo.image.imageUrl)).toBe(false);
});

it('keeps the copy of a failed upload through the form reset, and deletes it when the retry is confirmed', async () => {
  const photo = await preparedPhoto();
  mockConfirmFails = true;
  const outcome = await uploadGRNPhotos(GRN_ID, [photo]);
  expect(outcome.failed).toHaveLength(1);

  // The GRN was saved, so the form is reset before the retry.
  await releaseLocalPhotos([photo.image.imageUrl]);
  await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm);
  await localPhotoFilesIdle();
  expect(mockFiles.has(photo.image.imageUrl)).toBe(true);

  mockConfirmFails = false;
  expect(await uploadGRNPhotos(GRN_ID, outcome.failed)).toEqual({ uploadedCount: 1, failed: [] });
  await localPhotoFilesIdle();
  expect(mockFiles.has(photo.image.imageUrl)).toBe(false);
});

it('keeps the copies still uploading or queued when the wait ends and the form is reset; each goes when it lands', async () => {
  jest.useFakeTimers();
  const waiting: Array<() => void> = [];
  mockUploadHook = () => new Promise((resolve) => waiting.push(() => resolve({ error: null })));
  const photos = await Promise.all(Array.from({ length: 6 }, preparedPhoto));

  const saving = uploadGRNPhotos(GRN_ID, photos, 30000);
  await jest.advanceTimersByTimeAsync(30000);
  const outcome = await saving;
  expect(outcome.failed).toHaveLength(6);

  await releaseLocalPhotos(photos.map((photo) => photo.image.imageUrl));
  await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm);
  expect(photos.every((photo) => mockFiles.has(photo.image.imageUrl))).toBe(true);

  while (waiting.length > 0) {
    waiting.splice(0).forEach((release) => release());
    await jest.advanceTimersByTimeAsync(0);
  }
  await Promise.all((outcome.failed as FailedGRNPhoto[]).map((photo) => photo.inFlight));
  jest.useRealTimers();
  await localPhotoFilesIdle();
  expect(photos.filter((photo) => mockFiles.has(photo.image.imageUrl))).toEqual([]);
});

it('keeps the copies when the upload could not start, through the form reset, for the retry that reads them', async () => {
  const photos = [await preparedPhoto(), await preparedPhoto()];
  mockClientFails = true;
  const outcome = await uploadGRNPhotos(GRN_ID, photos);
  expect(outcome).toEqual(expect.objectContaining({ uploadedCount: 0 }));
  expect(outcome.failed).toHaveLength(2);

  // The GRN was saved, so the form is reset before the retry.
  await releaseLocalPhotos(photos.map((photo) => photo.image.imageUrl));
  await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm);
  await localPhotoFilesIdle();
  expect(photos.every((photo) => mockFiles.has(photo.image.imageUrl))).toBe(true);

  mockClientFails = false;
  expect(await uploadGRNPhotos(GRN_ID, outcome.failed)).toEqual({ uploadedCount: 2, failed: [] });
  await localPhotoFilesIdle();
  expect(photos.filter((photo) => mockFiles.has(photo.image.imageUrl))).toEqual([]);
});

it('deletes the copies when the photos are given up after a failed upload (continue without photos)', async () => {
  const photo = await preparedPhoto();
  mockConfirmFails = true;
  const outcome = await uploadGRNPhotos(GRN_ID, [photo]);
  await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm);
  expect(mockFiles.has(photo.image.imageUrl)).toBe(true);

  // What the review step does for "Continue without photos".
  const files = outcome.failed.map((failed) => failed.image.imageUrl);
  files.forEach(abandonLocalPhotoUpload);
  await releaseLocalPhotos(files);
  await localPhotoFilesIdle();
  expect(mockFiles.has(photo.image.imageUrl)).toBe(false);
});

describe('the sentence of a failed upload is the app\'s own', () => {
  it('a storage refusal with any English sentence is shown as the generic text, never the library\'s sentence', async () => {
    const photo = await preparedPhoto();
    const refusal = Object.assign(new Error('The object exceeded the maximum allowed size'), { name: 'StorageApiError', status: 413 });
    mockUploadHook = async () => ({ error: refusal });
    const outcome = await uploadGRNPhotos(GRN_ID, [photo]);
    expect(outcome.failed[0].error).toBe("Couldn't upload the photo. Try again.");
  });

  it('a dropped connection says the photo change may have gone through', async () => {
    const photo = await preparedPhoto();
    mockUploadHook = async () => ({ error: new Error('Network request failed') });
    const outcome = await uploadGRNPhotos(GRN_ID, [photo]);
    expect(outcome.failed[0].error).toBe('No answer from the server. The photo change may have gone through. Check the photos on this screen before trying again.');
  });
});
