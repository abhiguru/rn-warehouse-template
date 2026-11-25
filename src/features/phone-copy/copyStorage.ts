/**
 * Space taken by the phone copy and space left on the phone (WH-298, contract 7.4; Product's P2: storage is running
 * short under 500 MB free, or when a write failed for lack of space).
 */
import { File, Paths } from 'expo-file-system';
import { COPY_FILE, fileUri } from './copyDriver';

export const LOW_STORAGE_BYTES = 500_000_000;

function fileSize(path: string): number {
  try {
    const file = new File(fileUri(path));
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** The copy's size (the file and its -wal) and the free space on the phone; null for what cannot be read. */
export function readCopyStorage(databasePath: string | null): { copyBytes: number | null; freeBytes: number | null } {
  const base = databasePath ?? COPY_FILE;
  let freeBytes: number | null;
  try {
    const free = Paths.availableDiskSpace;
    freeBytes = typeof free === 'number' && Number.isFinite(free) ? free : null;
  } catch {
    freeBytes = null;
  }
  return { copyBytes: fileSize(base) + fileSize(`${base}-wal`), freeBytes };
}

/** True when free space is known and under the limit. */
export const isSpaceShort = (freeBytes: number | null): boolean => freeBytes !== null && freeBytes < LOW_STORAGE_BYTES;

/** SQLite's "database or disk is full" (SQLITE_FULL). */
export function isDiskFull(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /disk is full|SQLITE_FULL|no space left/i.test(text);
}
