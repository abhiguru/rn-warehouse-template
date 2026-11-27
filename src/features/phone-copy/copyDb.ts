/**
 * The one open handle of the phone copy (WH-298, contract 4.2 and 4.3): opens the copy of the current session, erases
 * a copy that belongs to another session, another schema or can never be read, and erases it with the session. A read or
 * open that merely failed erases nothing (WH-355): it throws, and the engine tries again.
 *
 * A copy belongs to one server and one person (the scope, getSessionCacheScope). It is never read for another scope.
 */
import { createLogger } from '@/utils/logger';
import { COPY_FILE, deleteCopyFile, openExpoDriver, type CopyDriver } from './copyDriver';
import { forgetCopyKey, loadCopyKey, makeCopyKey, type CopyKey } from './copyKey';
import { erasePhotoFolder } from './photoFolder';
import { SCHEMA_VERSION, createSchema } from './copySchema';
import { resetCopyKeyReadTries } from './copyKeyReadTries';
import { resetSyncSnapshot } from './syncStore';

const logger = createLogger('[phone-copy]');

const holder = {
  handle: null as CopyDriver | null,
  scope: null as string | null,
  line: Promise.resolve() as Promise<unknown>,
  /** Stops the sync engine and waits for its local transaction before an erase (set by syncEngine.ts). */
  beforeErase: null as null | (() => Promise<void>),
};

/** Secure storage could not be read for the copy's key (WH-365): the engine counts it, and nothing is erased for it. */
export class CopyKeyUnreadableError extends Error {
  constructor() {
    super('The key of the phone copy could not be read');
    this.name = 'CopyKeyUnreadableError';
  }
}

/** Runs one open or erase at a time. */
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const next = holder.line.then(task, task);
  holder.line = next.catch(() => undefined);
  return next;
}

async function closeHandle(): Promise<void> {
  const handle = holder.handle;
  holder.handle = null;
  holder.scope = null;
  if (handle) await handle.close().catch(() => undefined);
}

/** File and key gone; nothing open. Never throws. */
async function removeFiles(): Promise<void> {
  await closeHandle();
  await deleteCopyFile(COPY_FILE);
  await forgetCopyKey();
  // The photos kept for this copy go with it.
  await erasePhotoFolder();
}

async function metaValue(db: CopyDriver, key: string): Promise<string | null> {
  const rows = await db.all<{ v: string }>('SELECT v FROM meta WHERE k = ?', [key]);
  return rows[0]?.v ?? null;
}

async function writeEmptyCopy(db: CopyDriver, scope: string): Promise<void> {
  await db.transaction(async tx => {
    await createSchema(tx);
    await tx.run(
      "INSERT OR REPLACE INTO meta (k, v) VALUES ('schema_version', ?), ('scope', ?), ('phase', 'empty')",
      [String(SCHEMA_VERSION), scope]
    );
  });
}

/** SQLite's own verdict that this file is never readable with this key: SQLITE_NOTADB (also a wrong key) or SQLITE_CORRUPT. */
function isUnreadableFile(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /is not a database|disk image is malformed|SQLITE_NOTADB|SQLITE_CORRUPT/i.test(text);
}

/** A new, empty copy for `scope` with a new key. */
async function createCopy(scope: string): Promise<CopyDriver> {
  // The new key is written first: when secure storage refuses it, this throws and the old file and key are untouched.
  const key = await makeCopyKey(scope);
  await deleteCopyFile(COPY_FILE);
  const db = await openExpoDriver(COPY_FILE, key.keyHex);
  try {
    await writeEmptyCopy(db, scope);
  } catch (error) {
    await db.close().catch(() => undefined);
    throw error;
  }
  return db;
}

/**
 * The existing copy when its key opens it and it is this scope's and this schema's. Null (closed) when it is another's,
 * of another schema, or can never be read. Throws (closed) when it could not be opened or read this time.
 */
async function openExisting(key: CopyKey, scope: string): Promise<CopyDriver | null> {
  let db: CopyDriver | null = null;
  try {
    db = await openExpoDriver(COPY_FILE, key.keyHex);
    const hasMeta = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'");
    if (hasMeta.length === 0) {
      // A file the key opens but that has no copy in it (made and left before its schema was written).
      await writeEmptyCopy(db, scope);
      return db;
    }
    if ((await metaValue(db, 'schema_version')) === String(SCHEMA_VERSION) && (await metaValue(db, 'scope')) === scope) {
      // A table an entity added since this copy was made (WH-304: `held_items`) is made now, empty; the feed's format change loads it.
      await createSchema(db);
      return db;
    }
  } catch (error) {
    await db?.close().catch(() => undefined);
    if (!isUnreadableFile(error)) throw error;
    // Corrupt, or a file restored from a backup or another phone: never readable here.
    logger.warn('The copy on the phone cannot be read; it is erased and loaded again');
    return null;
  }
  await db.close().catch(() => undefined);
  return null;
}

/**
 * The copy of `scope`, opened (and kept open) for the caller. A copy of another scope or schema, a file the key does not
 * open, or a file with no key is erased and replaced by an empty copy with a new key. Rejects, erasing nothing, when
 * secure storage or the database failed this time.
 */
export function openCopy(scope: string): Promise<CopyDriver> {
  const open = holder.handle;
  if (open && holder.scope === scope) return Promise.resolve(open);
  return inTurn(async () => {
    if (holder.handle && holder.scope === scope) return holder.handle;
    await closeHandle();
    let key: CopyKey | null;
    try {
      key = await loadCopyKey();
    } catch {
      throw new CopyKeyUnreadableError();
    }
    // Secure storage answered: the count of failed key reads (WH-365) goes.
    void resetCopyKeyReadTries();
    let db = key?.scope === scope ? await openExisting(key, scope) : null;
    db ??= await createCopy(scope);
    holder.handle = db;
    holder.scope = scope;
    return db;
  });
}

/** The open copy, if any, without opening one. */
export function currentCopy(): CopyDriver | null {
  return holder.handle;
}

/**
 * Erases the copy while the engine goes on with a new one (a server-ordered full reload): file and key gone, a new
 * empty copy for the same scope with a new key. The engine calls it between its own transactions.
 */
export function replaceWithEmptyCopy(scope: string): Promise<CopyDriver> {
  return inTurn(async () => {
    // The old copy goes only once a new key is stored (createCopy), so a failed key write leaves it as it was.
    await closeHandle();
    const db = await createCopy(scope);
    holder.handle = db;
    holder.scope = scope;
    return db;
  });
}

/** Erase without stopping the engine (it has stopped itself, or never ran). Never throws. */
export function eraseCopyFiles(): Promise<void> {
  return inTurn(removeFiles).catch(() => undefined);
}

/** Set by the engine: what has to stop before the file goes. */
export function setBeforeErase(stop: (() => Promise<void>) | null): void {
  holder.beforeErase = stop;
}

/**
 * Erases the copy (spec step 26, decision 7): stops the engine (the request in flight is dropped, a local transaction
 * finishes or rolls back), closes the handle, deletes the file and its key, and returns the published state to a
 * phone with no copy. Never throws.
 */
export async function eraseCopy(): Promise<void> {
  try {
    await holder.beforeErase?.();
  } catch {
    // The erase goes on: the engine checks the file it writes to before every transaction.
  }
  await eraseCopyFiles();
  resetSyncSnapshot();
}
