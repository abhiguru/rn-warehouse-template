/**
 * The one open handle of the unsent-work file (WH-301, product/tech/app-offline-unsent-work.md section 1). The only
 * module that opens it.
 *
 * Opening never erases: a file that cannot be opened or read this time (corrupt, SQLITE_FULL) rejects, is kept as it is,
 * and is tried again on the next call. No key is used (owner, 2026-11-26).
 *
 * One connection, one statement or transaction at a time (expo-sqlite's transaction on the same connection would let
 * another caller's statement join it), so every use waits in line until the one before has ended.
 */
import { Directory, Paths } from 'expo-file-system';
import * as ExpoSqlite from 'expo-sqlite';
import { createLogger, loggableError } from '@/utils/logger';
import { removeFiles } from './legacyDispatchCleanup';
import { SCHEMA_STATEMENTS, SCHEMA_STEPS, UNSENT_FILE, UNSENT_FOLDER, UNSENT_PHOTO_FOLDER, UNSENT_SCHEMA_VERSION } from './unsentSchema';

const logger = createLogger('[unsent]');

export type SqlValue = string | number | null;

export interface UnsentDb {
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** One transaction; rolls back when `work` throws. Nothing else runs on the connection meanwhile. */
  transaction<T>(work: (tx: UnsentDb) => Promise<T>): Promise<T>;
}

interface SqliteDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

const holder: { open: Promise<UnsentDb> | null } = { open: null };

/** The folder of the photo files. */
export const unsentPhotoDirectory = (): Directory => new Directory(Paths.document, UNSENT_FOLDER, UNSENT_PHOTO_FOLDER);

function wrap(db: SqliteDatabase): UnsentDb {
  const tail: { line: Promise<unknown> } = { line: Promise.resolve() };
  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.line.then(task, task);
    tail.line = next.catch(() => undefined);
    return next;
  };
  const direct: UnsentDb = {
    run: async (sql, params = []) => ({ changes: (await db.runAsync(sql, params)).changes }),
    all: (sql, params = []) => db.getAllAsync(sql, params),
    transaction: async work => work(direct),
  };
  return {
    run: (sql, params) => inTurn(() => direct.run(sql, params)),
    all: <T>(sql: string, params?: SqlValue[]) => inTurn(() => direct.all<T>(sql, params)),
    transaction: <T>(work: (tx: UnsentDb) => Promise<T>) =>
      inTurn(async () => {
        const box: { value?: T } = {};
        await db.withTransactionAsync(async () => {
          box.value = await work(direct);
        });
        return box.value as T;
      }),
  };
}

async function openFile(): Promise<UnsentDb> {
  // In the platform's own database folder (Android `files/SQLite/`, iOS `Documents/SQLite/`; both kept out of backups by the plugins named in unsentSchema.ts), apart from the phone copy's file.
  const db = await ExpoSqlite.openDatabaseAsync(UNSENT_FILE);
  try {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = OFF;');
    for (const statement of SCHEMA_STATEMENTS) await db.execAsync(statement);
    // A later version migrates in place here (ALTER), never by erasing. A new file starts at 1 and takes every step.
    await db.runAsync("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')", []);
    const [stored] = await db.getAllAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'", []);
    const have = Number(stored?.value ?? 1);
    for (const step of SCHEMA_STEPS) {
      if (step.version <= have || step.version > UNSENT_SCHEMA_VERSION) continue;
      const leftovers: { files: readonly string[] } = { files: [] };
      await db.withTransactionAsync(async () => {
        for (const statement of step.statements) await db.execAsync(statement);
        if (step.work) leftovers.files = await step.work(db);
        await db.runAsync("UPDATE meta SET value = ? WHERE key = 'schema_version'", [String(step.version)]);
      });
      removeFiles(leftovers.files);
    }
    await db.getAllAsync('SELECT count(*) AS n FROM items', []);
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
  return wrap(db);
}

/** The open file. Rejects, erasing nothing, when it cannot be opened or read this time. */
export function getUnsentDb(): Promise<UnsentDb> {
  if (!holder.open) {
    const opening = openFile();
    holder.open = opening;
    opening.catch(error => {
      // Tried again on the next call; the file is as it was. No row data is logged.
      holder.open = null;
      logger.warn('The unsent-work file could not be opened', loggableError(error));
    });
  }
  return holder.open;
}
