/**
 * The photo files the app writes are deleted once nothing needs them, and only
 * those (P2F-MEDIA-3). The file system is a fake that records what exists;
 * the registry lives in the AsyncStorage mock.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  abandonLocalPhotoUpload,
  discardLocalPhoto,
  holdLocalPhoto,
  isAppOwnedFileUri,
  LOCAL_PHOTO_KEY_PREFIX,
  LOCAL_PHOTO_MAX_AGE_MS,
  LOCAL_PHOTO_OWNERS,
  localPhotoFilesIdle,
  localPhotoUploadEnded,
  registerLocalPhoto,
  releaseLocalPhotos,
  releaseLocalPhotosOwnedBy,
  sweepLocalPhotoFiles,
} from '../localPhotoFiles';

const mockFiles = new Set<string>();
const mockDeleted: string[] = [];
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
    delete() {
      if (!mockFiles.delete(this.uri)) throw new Error('no such file');
      mockDeleted.push(this.uri);
    }
  },
}));

const CACHE = 'file:///data/user/0/org.example.warehouse/cache';
let counter = 0;
/** A new file in the app's cache, as the camera or the encoder writes it. */
const written = (folder: 'Camera' | 'ImageManipulator') => {
  counter += 1;
  const uri = `${CACHE}/${folder}/photo-${counter}.jpg`;
  mockFiles.add(uri);
  return uri;
};
const capture = async () => {
  const uri = written('Camera');
  expect(await registerLocalPhoto(uri, LOCAL_PHOTO_OWNERS.camera, 'capture')).toBe(true);
  return uri;
};
const prepared = async (owner: string = LOCAL_PHOTO_OWNERS.grnForm) => {
  const uri = written('ImageManipulator');
  expect(await registerLocalPhoto(uri, owner, 'prepared')).toBe(true);
  return uri;
};
const registered = async (uri: string) => (await AsyncStorage.getItem(`${LOCAL_PHOTO_KEY_PREFIX}${uri}`)) !== null;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockFiles.clear();
  mockDeleted.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('which files may be deleted', () => {
  it('accepts only file addresses inside the app cache or document directory', () => {
    expect(isAppOwnedFileUri(`${CACHE}/Camera/a.jpg`)).toBe(true);
    expect(isAppOwnedFileUri('file:///data/user/0/org.example.warehouse/files/prepared/b.webp')).toBe(true);
    expect(isAppOwnedFileUri('content://media/external/images/media/41')).toBe(false);
    expect(isAppOwnedFileUri('ph://8F2B1C3D-0000-4000-8000-000000000000/L0/001')).toBe(false);
    expect(isAppOwnedFileUri('file:///storage/emulated/0/DCIM/Camera/IMG_0001.jpg')).toBe(false);
    expect(isAppOwnedFileUri(`${CACHE}/../../shared_prefs/x.xml`)).toBe(false);
    expect(isAppOwnedFileUri(`${CACHE}/%2E%2E/%2E%2E/x.jpg`)).toBe(false);
    expect(isAppOwnedFileUri(`${CACHE}/`)).toBe(false);
    expect(isAppOwnedFileUri('https://facility.invalid/storage/v1/object/grn-images/a.webp')).toBe(false);
    expect(isAppOwnedFileUri(undefined)).toBe(false);
  });

  it('refuses to register a gallery photo, so it can never be deleted', async () => {
    const gallery = 'file:///storage/emulated/0/DCIM/Camera/IMG_0002.jpg';
    mockFiles.add(gallery);
    expect(await registerLocalPhoto('content://media/external/images/media/42', LOCAL_PHOTO_OWNERS.camera, 'capture')).toBe(false);
    expect(await registerLocalPhoto(gallery, LOCAL_PHOTO_OWNERS.grnForm, 'prepared')).toBe(false);
    expect(await AsyncStorage.getAllKeys()).toEqual([]);

    expect(await releaseLocalPhotos([gallery, 'content://media/external/images/media/42'])).toBe(0);
    expect(await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm)).toBe(0);
    expect(mockFiles.has(gallery)).toBe(true);
  });

  it('leaves alone an app file it did not register (such as the picker copy of a gallery photo)', async () => {
    const pickerCopy = `${CACHE}/ImagePicker/copy-1.jpg`;
    mockFiles.add(pickerCopy);
    expect(await releaseLocalPhotos([pickerCopy])).toBe(0);
    expect(mockFiles.has(pickerCopy)).toBe(true);
  });

  it('a deletion that fails is logged, not thrown, and the record stays for the sweep', async () => {
    const shot = await capture();
    mockFiles.delete(shot); // gone already: delete() would throw
    const File = jest.requireMock('expo-file-system').File;
    const exists = jest.spyOn(File.prototype, 'exists', 'get').mockReturnValue(true);
    await expect(releaseLocalPhotos([shot])).resolves.toBe(0);
    expect(await registered(shot)).toBe(true);
    exists.mockRestore();
  });
});

describe('the ownership matrix', () => {
  it('retake: the discarded shot is deleted, the accepted one stays', async () => {
    const first = await capture();
    const second = await capture();

    expect(await releaseLocalPhotos([first])).toBe(1);
    expect(mockDeleted).toEqual([first]);
    expect(await registered(first)).toBe(false);
    expect(mockFiles.has(second)).toBe(true);
  });

  it('a release right after the registration is not missed', async () => {
    const uri = written('Camera');
    void registerLocalPhoto(uri, LOCAL_PHOTO_OWNERS.camera, 'capture');
    expect(await releaseLocalPhotos([uri])).toBe(1);
    expect(mockFiles.has(uri)).toBe(false);
  });

  it('the shot is deleted once its prepared copy has taken its place; the copy stays', async () => {
    const shot = await capture();
    const copy = await prepared();
    await releaseLocalPhotos([shot]);
    expect(mockDeleted).toEqual([shot]);
    expect(mockFiles.has(copy)).toBe(true);
  });

  it('discard: the form photos and those removed from it earlier go; other forms, later files and gallery photos stay', async () => {
    const failedShot = await capture(); // a photo whose preparation failed still shows the shot
    const inForm = await prepared();
    const removedEarlier = await prepared();
    const dispatchCopy = await prepared(LOCAL_PHOTO_OWNERS.dispatchForm);
    const gallery = 'file:///storage/emulated/0/DCIM/Camera/IMG_0003.jpg';
    mockFiles.add(gallery);
    const resetAt = Date.now();
    const nextFormCopy = await prepared();
    // Registered after the reset: it belongs to the next form.
    await AsyncStorage.mergeItem(`${LOCAL_PHOTO_KEY_PREFIX}${nextFormCopy}`, JSON.stringify({ createdAt: resetAt + 1 }));

    await releaseLocalPhotos([failedShot, inForm, gallery]);
    await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm, { createdBefore: resetAt });

    expect(mockDeleted.sort()).toEqual([failedShot, inForm, removedEarlier].sort());
    expect(mockFiles.has(dispatchCopy)).toBe(true);
    expect(mockFiles.has(nextFormCopy)).toBe(true);
    expect(mockFiles.has(gallery)).toBe(true);
  });

  it('success: the copy is deleted once its upload is confirmed', async () => {
    const copy = await prepared();
    const end = holdLocalPhoto(copy);
    localPhotoUploadEnded(copy, true);
    expect(mockFiles.has(copy)).toBe(true); // still held by the upload
    end();
    await localPhotoFilesIdle();
    expect(mockDeleted).toEqual([copy]);
    expect(await registered(copy)).toBe(false);
  });

  it('failure then retry: kept through a form reset, deleted when the retry is confirmed', async () => {
    const copy = await prepared();
    let end = holdLocalPhoto(copy);
    localPhotoUploadEnded(copy, false);
    end();
    await localPhotoFilesIdle();

    // The saved form is reset while the photo waits for a retry.
    await releaseLocalPhotos([copy]);
    await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm);
    expect(mockFiles.has(copy)).toBe(true);

    end = holdLocalPhoto(copy);
    localPhotoUploadEnded(copy, true);
    end();
    await localPhotoFilesIdle();
    expect(mockDeleted).toEqual([copy]);
  });

  it('failure then the photos are given up: abandon then release deletes the file', async () => {
    const copy = await prepared();
    const end = holdLocalPhoto(copy);
    localPhotoUploadEnded(copy, false);
    end();
    await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.grnForm);
    expect(mockFiles.has(copy)).toBe(true);

    abandonLocalPhotoUpload(copy);
    expect(mockFiles.has(copy)).toBe(true); // abandoning alone deletes nothing
    expect(await releaseLocalPhotos([copy])).toBe(1);
    expect(mockDeleted).toEqual([copy]);
    expect(await registered(copy)).toBe(false);
  });

  it('abandoning a running upload keeps its file until it ends; its failure then keeps nothing', async () => {
    const copy = await prepared();
    const end = holdLocalPhoto(copy);
    abandonLocalPhotoUpload(copy);
    expect(await releaseLocalPhotos([copy])).toBe(0);
    await localPhotoFilesIdle();
    expect(mockFiles.has(copy)).toBe(true);

    localPhotoUploadEnded(copy, false);
    end();
    await localPhotoFilesIdle();
    expect(mockDeleted).toEqual([copy]);
  });

  it('the abandon mark ends with the upload it was set on: a later retry that fails keeps its file', async () => {
    const copy = await prepared();
    let end = holdLocalPhoto(copy);
    abandonLocalPhotoUpload(copy);
    localPhotoUploadEnded(copy, true);
    end();
    await localPhotoFilesIdle();
    expect(mockDeleted).toEqual([copy]);

    // A second file: abandoned while running, the mark ends with that upload.
    const next = await prepared();
    end = holdLocalPhoto(next);
    abandonLocalPhotoUpload(next);
    localPhotoUploadEnded(next, false);
    end();
    end = holdLocalPhoto(next);
    localPhotoUploadEnded(next, false);
    end();
    await releaseLocalPhotos([next]);
    expect(mockFiles.has(next)).toBe(true);
  });

  it('signing out (release with abandoned retries) deletes the files kept for a retry', async () => {
    const copy = await prepared(LOCAL_PHOTO_OWNERS.dispatchForm);
    const end = holdLocalPhoto(copy);
    localPhotoUploadEnded(copy, false);
    end();
    expect(await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.dispatchForm)).toBe(0);
    expect(await releaseLocalPhotosOwnedBy(LOCAL_PHOTO_OWNERS.dispatchForm, { abandonRetries: true })).toBe(1);
    expect(mockDeleted).toEqual([copy]);
  });

  it('late completion after the wait: a queued upload keeps its file through the reset, which goes when it lands', async () => {
    const landsLate = await prepared();
    const failsLate = await prepared();
    const endFirst = holdLocalPhoto(landsLate);
    const endSecond = holdLocalPhoto(failsLate);

    // The wait ended; the form is reset while both are still queued or running.
    await releaseLocalPhotos([landsLate, failsLate]);
    expect(mockDeleted).toEqual([]);

    localPhotoUploadEnded(landsLate, true);
    endFirst();
    localPhotoUploadEnded(failsLate, false);
    endSecond();
    await localPhotoFilesIdle();

    expect(mockDeleted).toEqual([landsLate]);
    expect(mockFiles.has(failsLate)).toBe(true);
  });

  it('a file still held by another upload is not deleted when one of them is confirmed', async () => {
    const copy = await prepared();
    const one = holdLocalPhoto(copy);
    const two = holdLocalPhoto(copy);
    localPhotoUploadEnded(copy, true);
    one();
    await localPhotoFilesIdle();
    expect(mockFiles.has(copy)).toBe(true);
    two();
    await localPhotoFilesIdle();
    expect(mockFiles.has(copy)).toBe(false);
  });

  it('the size probe copy is deleted at once; a gallery photo is never discarded', async () => {
    const probe = written('ImageManipulator');
    await discardLocalPhoto(probe);
    expect(mockFiles.has(probe)).toBe(false);

    const gallery = 'file:///storage/emulated/0/Pictures/IMG_0004.jpg';
    mockFiles.add(gallery);
    await discardLocalPhoto(gallery);
    await discardLocalPhoto('content://media/external/images/media/43');
    expect(mockFiles.has(gallery)).toBe(true);
  });
});

describe('the start-up sweep', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const entryAt = async (uri: string, createdAt: number) => {
    mockFiles.add(uri);
    await AsyncStorage.setItem(
      `${LOCAL_PHOTO_KEY_PREFIX}${uri}`,
      JSON.stringify({ uri, owner: LOCAL_PHOTO_OWNERS.grnForm, role: 'prepared', createdAt })
    );
  };

  it('deletes week-old files nothing holds, keeps younger and referenced ones, forgets missing ones', async () => {
    const now = Date.UTC(2026, 9, 13, 9, 0);
    const old = `${CACHE}/ImageManipulator/old.webp`;
    const young = `${CACHE}/ImageManipulator/young.webp`;
    const referenced = `${CACHE}/ImageManipulator/referenced.webp`;
    const held = `${CACHE}/ImageManipulator/held.webp`;
    const missing = `${CACHE}/Camera/missing.jpg`;
    await entryAt(old, now - 8 * DAY);
    await entryAt(young, now - 2 * DAY);
    await entryAt(referenced, now - 30 * DAY);
    await entryAt(held, now - 30 * DAY);
    await entryAt(missing, now - 1 * DAY);
    mockFiles.delete(missing);
    const end = holdLocalPhoto(held);

    const result = await sweepLocalPhotoFiles({ now, isReferenced: (uri) => uri === referenced });

    expect(result).toEqual({ deleted: 1, forgotten: 1 });
    expect(mockDeleted).toEqual([old]);
    expect(await registered(old)).toBe(false);
    expect(await registered(missing)).toBe(false);
    for (const kept of [young, referenced, held]) {
      expect(mockFiles.has(kept)).toBe(true);
      expect(await registered(kept)).toBe(true);
    }
    end();
  });

  it('uses a seven-day limit and leaves other storage keys alone', async () => {
    expect(LOCAL_PHOTO_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    await AsyncStorage.setItem('grn_list_cache_x', JSON.stringify({ timestamp: 0 }));
    await AsyncStorage.setItem(`${LOCAL_PHOTO_KEY_PREFIX}broken`, 'not json');
    const result = await sweepLocalPhotoFiles({ now: Date.now() + 8 * DAY });
    expect(result.forgotten).toBe(1);
    expect(await AsyncStorage.getItem('grn_list_cache_x')).not.toBeNull();
  });

  it('never throws, also when storage fails', async () => {
    jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(sweepLocalPhotoFiles()).resolves.toEqual({ deleted: 0, forgotten: 0 });
  });
});
