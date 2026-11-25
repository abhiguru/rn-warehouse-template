/**
 * The phone copy's database connection (WH-298, product/tech/app-offline-copy-and-sync.md section 2.1 and 4.2).
 *
 * Every module above this file works through `CopyDriver`, never `expo-sqlite` directly. The file is encrypted with
 * SQLCipher: `PRAGMA key` is the first statement on every connection, and a wrong key fails the first read.
 *
 * One connection, used one statement or one transaction at a time: a transaction runs on the same connection
 * (expo-sqlite's exclusive transaction opens a second connection, which would not have the key), so every other use
 * waits in line until it ends.
 */
import { File } from 'expo-file-system';
import * as ExpoSqlite from 'expo-sqlite';

export type SqlValue = string | number | null;

export interface CopyDriver {
  /** DDL, PRAGMA, several statements. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** One transaction; rolls back when `work` throws. Nothing else runs on the connection meanwhile. */
  transaction(work: (tx: CopyDriver) => Promise<void>): Promise<void>;
  close(): Promise<void>;
  /** The database file's path, when the platform says. */
  readonly path: string | null;
}

/** The phone copy's one file. */
export const COPY_FILE = 'phone-copy.db';

interface SqliteDatabase {
  databasePath?: string;
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}
interface SqliteModule {
  openDatabaseAsync(name: string): Promise<SqliteDatabase>;
  deleteDatabaseAsync(name: string): Promise<void>;
  defaultDatabaseDirectory?: unknown;
}

const loadSqlite = (): Promise<SqliteModule> => Promise.resolve(ExpoSqlite);

function directDriver(db: SqliteDatabase, path: string | null): CopyDriver {
  const tx: CopyDriver = {
    exec: sql => db.execAsync(sql),
    run: async (sql, params = []) => ({ changes: (await db.runAsync(sql, params)).changes }),
    all: (sql, params = []) => db.getAllAsync(sql, params),
    transaction: work => work(tx),
    close: () => Promise.resolve(),
    path,
  };
  return tx;
}

/** Opens (or creates) the file with the key, sets the PRAGMAs and proves the key with a first read. */
export async function openExpoDriver(fileName: string, keyHex: string): Promise<CopyDriver> {
  if (!/^[0-9a-f]{64}$/.test(keyHex)) throw new Error('phone copy key is not 32 bytes of hex');
  const sqlite = await loadSqlite();
  const db = await sqlite.openDatabaseAsync(fileName);
  const path = typeof db.databasePath === 'string' ? db.databasePath : null;
  try {
    await db.execAsync(`PRAGMA key = "x'${keyHex}'"`);
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA foreign_keys = OFF;');
    await db.getAllAsync('SELECT count(*) AS n FROM sqlite_master', []);
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
  const inner = directDriver(db, path);
  const line = { tail: Promise.resolve() as Promise<unknown> };
  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const next = line.tail.then(task, task);
    line.tail = next.catch(() => undefined);
    return next;
  };
  return {
    exec: sql => inTurn(() => inner.exec(sql)),
    run: (sql, params) => inTurn(() => inner.run(sql, params)),
    all: <T>(sql: string, params?: SqlValue[]) => inTurn(() => inner.all<T>(sql, params)),
    transaction: work => inTurn(() => db.withTransactionAsync(() => work(inner))),
    close: () => inTurn(() => db.closeAsync()),
    path,
  };
}

/** A file URI for a path expo-sqlite names (its paths are plain file-system paths). */
export const fileUri = (path: string): string => (path.startsWith('file://') ? path : `file://${path}`);

/** Deletes the file with its -wal, -shm and -journal. Never throws. */
export async function deleteCopyFile(fileName: string): Promise<void> {
  try {
    const sqlite = await loadSqlite();
    await sqlite.deleteDatabaseAsync(fileName).catch(() => undefined);
    const directory = typeof sqlite.defaultDatabaseDirectory === 'string' ? sqlite.defaultDatabaseDirectory : null;
    if (!directory) return;
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      try {
        const file = new File(fileUri(`${directory.replace(/\/$/, '')}/${fileName}${suffix}`));
        if (file.exists) file.delete();
      } catch {
        // Already gone, or never made.
      }
    }
  } catch {
    // Teardown must not fail: a file left behind cannot be opened without its key, which is forgotten next.
  }
}
