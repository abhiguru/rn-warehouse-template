/// <reference types="node" />
/// <reference types="jest" />
/**
 * The phone's database, faked at the native boundary only (CG-67 to CG-73): `expo-sqlite`'s async API backed by Node's
 * built-in SQLite (which has FTS5 and the trigram tokenizer). Everything above it (`openExpoDriver`, the schema, the
 * engine, the queries) is the real product code. It does not model SQLCipher (an unknown `PRAGMA key` is a no-op in
 * Node's SQLite, and is logged so a test can see it came first) or the backup exclusion; those are device checks (T10, T56).
 *
 * Use: `jest.mock('expo-sqlite', () => require('<path>/fakeExpoSqlite').expoSqliteModule(), { virtual: true })`.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Params = SQLInputValue[] | Record<string, SQLInputValue>;
// Shared across jest.resetModules(), so a test can "kill the app" (reload every module) and find the files still there.
const holder = globalThis as unknown as {
  __fakePhoneFiles?: Map<string, DatabaseSync>;
  __fakePhoneLog?: string[];
  __fakePhoneFailures?: Failure[];
};
const files = (holder.__fakePhoneFiles ??= new Map<string, DatabaseSync>());
const log = (holder.__fakePhoneLog ??= []);
const failures = (holder.__fakePhoneFailures ??= []);

type Failure = { match: RegExp; skip: number; error: Error };

/** Every statement sent to the database, in order, since the last `resetFakePhone`. */
export const statementLog = () => log;
/** Make the next statement matching `match` (after `skip` earlier matches) throw `error`, once. */
export function failStatement(match: RegExp, error: Error, skip = 0) { failures.push({ match, skip, error }); }
/** Forget every database, the statement log and any planned failure: a brand-new phone. */
export function resetFakePhone() {
  for (const raw of files.values()) raw.close();
  files.clear();
  log.length = 0;
  failures.length = 0;
  gates.length = 0;
}
/** The names of the databases on the "phone". */
export function fakeDatabaseNames(): string[] { return [...files.keys()]; }

function check(sql: string) {
  log.push(sql);
  const index = failures.findIndex(f => f.match.test(sql));
  if (index < 0) return;
  const failure = failures[index];
  if (failure.skip > 0) { failure.skip -= 1; return; }
  failures.splice(index, 1);
  throw failure.error;
}
const asArray = (params?: Params): SQLInputValue[] | [Record<string, SQLInputValue>] =>
  params === undefined ? [] : Array.isArray(params) ? params : [params];
const paramsOf = (rest: unknown[]) => (rest.length === 1 ? rest[0] : rest) as Params | undefined;

function wrap(raw: DatabaseSync, name: string) {
  let depth = 0;
  const db = {
    databaseName: name,
    async execAsync(sql: string) { check(sql); await passGates(sql); raw.exec(sql); },
    async runAsync(sql: string, ...rest: unknown[]) {
      await passGates(sql);
      check(sql);
      const result = raw.prepare(sql).run(...(asArray(paramsOf(rest)) as never[]));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getAllAsync<T>(sql: string, ...rest: unknown[]): Promise<T[]> {
      check(sql);
      return raw.prepare(sql).all(...(asArray(paramsOf(rest)) as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, ...rest: unknown[]): Promise<T | null> {
      check(sql);
      return (raw.prepare(sql).get(...(asArray(paramsOf(rest)) as never[])) as T | undefined) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      if (depth > 0) { await task(); return; }
      raw.exec('BEGIN');
      depth += 1;
      try { await task(); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; } finally { depth -= 1; }
    },
    async withExclusiveTransactionAsync(task: (tx: unknown) => Promise<void>) {
      await db.withTransactionAsync(() => task(db));
    },
    async closeAsync() { /* the file stays: a reopened name sees what was committed, as after an app kill */ },
  };
  return db;
}

export function expoSqliteModule() {
  const open = async (name: string) => {
    let raw = files.get(name);
    if (!raw) { raw = new DatabaseSync(':memory:'); files.set(name, raw); }
    return wrap(raw, name);
  };
  return {
    __esModule: true,
    openDatabaseAsync: open,
    deleteDatabaseAsync: async (name: string) => { files.get(name)?.close(); files.delete(name); },
  };
}

type StatementGate = { match: RegExp; opened: Promise<void>; release: () => void; onHit: () => void; wait: Promise<void> };
const gates = ((holder as unknown as { __fakePhoneGates?: StatementGate[] }).__fakePhoneGates ??= []);
/** Statements matching `match` wait (the first one resolves `opened`) until `release()`: a write that is slow. */
export function holdStatement(match: RegExp) {
  let release!: () => void; let onHit!: () => void;
  const opened = new Promise<void>(resolve => { onHit = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const gate = { match, opened, release, onHit, wait };
  gates.push(gate);
  return gate;
}
export async function passGates(sql: string) {
  for (const gate of gates) if (gate.match.test(sql)) { gate.onHit(); await gate.wait; }
}
