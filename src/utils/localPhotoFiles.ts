/**
 * The photo files the app itself writes, and when they are removed again
 * (P2F-MEDIA-3).
 *
 * The in-app camera writes each shot to the app's cache, and preparing a photo
 * for upload writes a re-encoded copy next to it. Nothing else ever deleted
 * those files. Each one is now registered here when it is written, with what it
 * is for, and deleted through this module once nothing needs it:
 *
 * - a camera shot that is retaken, or left when the camera is closed;
 * - a camera shot once its prepared copy has taken its place in the form;
 * - a prepared copy that was not kept (too large, or uploaded at once);
 * - a prepared copy once its upload is confirmed by the server;
 * - the photos of a form when the form is discarded or reset;
 * - at app start, any registered file older than seven days that nothing
 *   holds, and the record of any file that is already gone.
 *
 * A file whose upload is running or waiting, or whose upload failed and can be
 * retried, is held: a request to delete it waits until the upload is confirmed
 * (then it goes) or the app restarts (then the start-up sweep decides). When
 * the photos are given up (continue without them, sign-out) the retry is
 * abandoned: the file goes at once, or, while an upload of it still runs, when
 * that upload ends.
 *
 * Only files the app wrote are ever deleted. A file is accepted only as a
 * `file://` address inside the app's own cache or document directory, so a
 * gallery photo (`content://`, `ph://`, or a file elsewhere on the phone) is
 * refused even if it is passed here by mistake, and a file that was never
 * registered is left alone. Failures are logged, never thrown.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { createLogger, loggableError } from '@/utils/logger';

const log = createLogger('local-photos');

export type LocalPhotoRole = 'capture' | 'prepared';

export interface LocalPhotoEntry {
  uri: string;
  /** What the file belongs to: the camera, or the form it was prepared for. */
  owner: string;
  role: LocalPhotoRole;
  /** Milliseconds since the epoch. */
  createdAt: number;
}

/** Who a registered file belongs to. */
export const LOCAL_PHOTO_OWNERS = {
  /** A shot of the in-app camera, until a form takes it. */
  camera: 'camera',
  grnForm: 'grn-form',
  dispatchForm: 'dispatch-form',
} as const;

/** One AsyncStorage key per file, so registrations never overwrite each other. */
export const LOCAL_PHOTO_KEY_PREFIX = 'local_photo_file:';

/** Files younger than this survive the start-up sweep. */
export const LOCAL_PHOTO_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const keyOf = (uri: string) => `${LOCAL_PHOTO_KEY_PREFIX}${uri}`;

// Uploads that are running or waiting for a place, per file.
const holds = new Map<string, number>();
// Files whose last upload failed: a retry may still need them.
const awaitingRetry = new Set<string>();
// Files someone asked to delete while they were held.
const deferred = new Set<string>();
// Files given up while an upload of them still ran: that upload's failure keeps nothing.
const abandoned = new Set<string>();
// Registrations not yet written, so a quick delete does not miss them.
const registering = new Map<string, Promise<void>>();
// Deletions started without a caller waiting for them.
const background = new Set<Promise<unknown>>();

const isBusy = (uri: string) => (holds.get(uri) ?? 0) > 0 || awaitingRetry.has(uri);

function inBackground(work: Promise<unknown>): void {
  background.add(work);
  void work.finally(() => background.delete(work));
}

/** Resolves when every deletion started in the background has ended. */
export async function localPhotoFilesIdle(): Promise<void> {
  while (background.size > 0) {
    await Promise.allSettled([...background]);
  }
}

function ownedDirectories(): string[] {
  const directories: string[] = [];
  for (const read of [() => Paths.cache.uri, () => Paths.document.uri]) {
    try {
      const uri = read();
      if (typeof uri === 'string' && uri.startsWith('file://')) {
        directories.push(uri.endsWith('/') ? uri : `${uri}/`);
      }
    } catch {
      // A directory that cannot be named owns nothing.
    }
  }
  return directories;
}

/**
 * Whether `uri` is a file the app may delete: a `file://` address inside the
 * app's cache or document directory. Never a gallery or content address.
 */
export function isAppOwnedFileUri(uri: string | null | undefined): uri is string {
  if (typeof uri !== 'string' || !uri.startsWith('file://')) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return false;
  }
  if (decoded.split('/').includes('..')) return false;
  return ownedDirectories().some((directory) => uri.startsWith(directory) && uri.length > directory.length);
}

function deleteFile(uri: string): boolean {
  if (!isAppOwnedFileUri(uri)) return false;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
    return true;
  } catch (error) {
    log.warn('Could not delete a photo file', loggableError(error));
    return false;
  }
}

function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    // When it cannot be told, the file is kept.
    return true;
  }
}

/**
 * Record a file the app has just written. Refuses (and returns false for)
 * anything outside the app's own directories, such as a gallery photo.
 */
export function registerLocalPhoto(uri: string, owner: string, role: LocalPhotoRole): Promise<boolean> {
  if (!isAppOwnedFileUri(uri)) {
    log.warn('Refused to register a photo file the app does not own', { role });
    return Promise.resolve(false);
  }
  const entry: LocalPhotoEntry = { uri, owner, role, createdAt: Date.now() };
  const write = (async () => {
    try {
      await AsyncStorage.setItem(keyOf(uri), JSON.stringify(entry));
      return true;
    } catch (error) {
      log.warn('Could not register a photo file', loggableError(error));
      return false;
    }
  })();
  const pending = write.then(() => undefined);
  registering.set(uri, pending);
  void pending.finally(() => {
    if (registering.get(uri) === pending) registering.delete(uri);
  });
  return write;
}

async function readEntry(uri: string): Promise<LocalPhotoEntry | null> {
  await registering.get(uri);
  const value = await AsyncStorage.getItem(keyOf(uri));
  if (!value) return null;
  const entry = JSON.parse(value) as LocalPhotoEntry;
  return entry && entry.uri === uri ? entry : null;
}

/** Delete one registered file now, or later if an upload still holds it. */
async function release(uri: string): Promise<boolean> {
  try {
    const entry = await readEntry(uri);
    if (!entry) return false;
    if (isBusy(uri)) {
      deferred.add(uri);
      return false;
    }
    deferred.delete(uri);
    if (!deleteFile(uri) && fileExists(uri)) return false;
    await AsyncStorage.removeItem(keyOf(uri));
    return true;
  } catch (error) {
    log.warn('Could not release a photo file', loggableError(error));
    return false;
  }
}

/**
 * Nothing needs these files any more. Each one the app registered is deleted,
 * or, while an upload holds it, deleted once the upload is confirmed. Files
 * that were never registered (gallery photos, server addresses) are left
 * alone. Returns how many were deleted now.
 */
export async function releaseLocalPhotos(uris: Iterable<string | null | undefined>): Promise<number> {
  const unique = new Set<string>();
  for (const uri of uris) if (isAppOwnedFileUri(uri)) unique.add(uri);
  const results = await Promise.all([...unique].map(release));
  return results.filter(Boolean).length;
}

async function entries(): Promise<Array<[string, LocalPhotoEntry | null]>> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(LOCAL_PHOTO_KEY_PREFIX));
  if (keys.length === 0) return [];
  const pairs = await AsyncStorage.multiGet(keys);
  return pairs.map(([key, value]) => {
    try {
      const entry = value ? (JSON.parse(value) as LocalPhotoEntry) : null;
      return [key, entry && typeof entry.uri === 'string' && keyOf(entry.uri) === key ? entry : null];
    } catch {
      return [key, null];
    }
  });
}

/**
 * Release every file registered for `owner` before `createdBefore` (for a form
 * that is discarded or reset: also the photos that were removed from it
 * earlier). A file registered after that moment belongs to the next form.
 */
export async function releaseLocalPhotosOwnedBy(
  owner: string,
  { createdBefore = Date.now(), abandonRetries = false }: { createdBefore?: number; abandonRetries?: boolean } = {}
): Promise<number> {
  try {
    const owned = (await entries())
      .map(([, entry]) => entry)
      .filter((entry): entry is LocalPhotoEntry => !!entry && entry.owner === owner && entry.createdAt <= createdBefore);
    // Signing out gives up every retry of these photos, so the files go too.
    if (abandonRetries) owned.forEach((entry) => abandonLocalPhotoUpload(entry.uri));
    return await releaseLocalPhotos(owned.map((entry) => entry.uri));
  } catch (error) {
    log.warn('Could not release the photo files of a form', loggableError(error));
    return 0;
  }
}

/**
 * Delete a file the app wrote and never used, such as the output of a size
 * probe. Refused, like everything here, outside the app's own directories.
 */
export async function discardLocalPhoto(uri: string | null | undefined): Promise<void> {
  if (!isAppOwnedFileUri(uri) || isBusy(uri)) return;
  deleteFile(uri);
}

/**
 * An upload of this file is running or waiting for a place: it is not deleted
 * until the returned function is called (once, when the upload has ended).
 */
export function holdLocalPhoto(uri: string): () => void {
  holds.set(uri, (holds.get(uri) ?? 0) + 1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const left = (holds.get(uri) ?? 1) - 1;
    if (left > 0) holds.set(uri, left);
    else {
      holds.delete(uri);
      abandoned.delete(uri);
    }
    if (!isBusy(uri) && deferred.has(uri)) inBackground(release(uri));
  };
}

/**
 * An upload of this file has ended. Confirmed: the file is deleted (when the
 * last hold on it ends). Not confirmed: it is kept for a retry, also when its
 * form is reset in the meantime.
 */
export function localPhotoUploadEnded(uri: string, confirmed: boolean): void {
  if (!confirmed) {
    if (!abandoned.has(uri)) awaitingRetry.add(uri);
    return;
  }
  awaitingRetry.delete(uri);
  if (isBusy(uri)) deferred.add(uri);
  else inBackground(release(uri));
}

/**
 * The photo will not be uploaded again (its photos were given up, or the user
 * signed out): a failed upload no longer keeps its file, so the release that
 * follows deletes it. An upload of it that is still running keeps holding it;
 * its failure then keeps nothing, and the release happens when it ends.
 */
export function abandonLocalPhotoUpload(uri: string): void {
  awaitingRetry.delete(uri);
  if ((holds.get(uri) ?? 0) > 0) abandoned.add(uri);
}

/**
 * At app start: delete each registered file older than `maxAgeMs` that no
 * upload holds and `isReferenced` does not claim, and forget each file that is
 * already gone. Never throws.
 */
export async function sweepLocalPhotoFiles({
  now = Date.now(),
  maxAgeMs = LOCAL_PHOTO_MAX_AGE_MS,
  isReferenced,
}: { now?: number; maxAgeMs?: number; isReferenced?: (uri: string) => boolean } = {}): Promise<{
  deleted: number;
  forgotten: number;
}> {
  let deleted = 0;
  let forgotten = 0;
  try {
    for (const [key, entry] of await entries()) {
      try {
        if (!entry || !isAppOwnedFileUri(entry.uri) || !fileExists(entry.uri)) {
          await AsyncStorage.removeItem(key);
          forgotten += 1;
          continue;
        }
        const age = now - (Number.isFinite(entry.createdAt) ? entry.createdAt : 0);
        if (age <= maxAgeMs || isBusy(entry.uri) || isReferenced?.(entry.uri)) continue;
        if (deleteFile(entry.uri)) {
          await AsyncStorage.removeItem(key);
          deleted += 1;
        }
      } catch (error) {
        log.warn('Could not sweep a photo file', loggableError(error));
      }
    }
    if (deleted + forgotten > 0) log.debug('Swept photo files', { deleted, forgotten });
  } catch (error) {
    log.warn('Could not sweep photo files', loggableError(error));
  }
  return { deleted, forgotten };
}
