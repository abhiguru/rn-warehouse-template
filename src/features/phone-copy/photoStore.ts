/**
 * Photos already viewed, kept on the phone (WH-299, product/tech/app-offline-read-from-copy.md section 9; Product's
 * PR11: every photo viewed, full size, no cap other than the low-storage limit). A photo is downloaded once more when it
 * is shown from a signed URL; offline the screens show the kept file, or say the photo needs a connection.
 */
import { File } from 'expo-file-system';
import { sha256Hex } from '@/config/lanSigner';
import { fromStored, toStored } from '@/features/unsent/storedPath';
import { createLogger } from '@/utils/logger';
import { currentCopy } from './copyDb';
import { photoDirectory } from './photoFolder';
import { getSyncSnapshot } from './syncStore';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';

const logger = createLogger('[phone-copy]');

export { erasePhotoFolder as erasePhotos } from './photoFolder';

/** Several asks for one photo share one download. */
const running = new Map<string, Promise<boolean>>();
registerSessionScoped('phone-copy-photo-downloads', () => running.clear());

const fileName = (storagePath: string): Promise<string> => sha256Hex(new TextEncoder().encode(storagePath));

async function download(storagePath: string, signedUrl: string): Promise<boolean> {
  const db = currentCopy();
  if (!db || getSyncSnapshot().storageLow) return false;
  try {
    const directory = photoDirectory();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    const target = new File(directory, await fileName(storagePath));
    if (target.exists) return true;
    const file = await File.downloadFileAsync(signedUrl, target);
    await db.run('INSERT OR REPLACE INTO photo_files (storage_path, file, bytes, kept_at) VALUES (?, ?, ?, ?)', [
      storagePath, toStored(file.uri, 'phone-copy-photos'), file.size ?? 0, Date.now(),
    ]);
    return true;
  } catch (error) {
    // The name of the error only: a message can quote the signed link.
    logger.warn('A photo could not be kept', error instanceof Error ? error.name : 'unknown');
    return false;
  }
}

/** Keeps the photo at `storagePath`, which `signedUrl` shows, unless it is kept or the phone is short of space. */
export function keepPhoto(storagePath: string, signedUrl: string): Promise<boolean> {
  const known = running.get(storagePath);
  if (known) return known;
  const run = download(storagePath, signedUrl).finally(() => running.delete(storagePath));
  running.set(storagePath, run);
  return run;
}

/** The kept file's address, or null when this photo was never kept (or its file has gone). */
export async function photoFile(storagePath: string): Promise<string | null> {
  const db = currentCopy();
  if (!db) return null;
  try {
    const rows = await db.all<{ file: string }>('SELECT file FROM photo_files WHERE storage_path = ?', [storagePath]);
    if (!rows[0]) return null;
    const kept = fromStored(rows[0].file, 'phone-copy-photos');
    if (kept !== null && new File(kept).exists) return kept;
    await db.run('DELETE FROM photo_files WHERE storage_path = ?', [storagePath]);
    return null;
  } catch {
    return null;
  }
}
