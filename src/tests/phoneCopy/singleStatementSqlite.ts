/// <reference types="jest" />
/**
 * The phone's database connection as the real expo-sqlite behaves when a second statement starts while the first is still
 * running on the same connection: the second call is rejected (WH-348, Design's Users finding). Wraps the fake of
 * fakeExpoSqlite.ts; the guard is off until `guard.on = true`, so a test can load the copy first.
 *
 * Use: `jest.mock('expo-sqlite', () => require('<path>/singleStatementSqlite').singleStatementSqliteModule(), { virtual: true })`.
 */
import { expoSqliteModule } from './fakeExpoSqlite';

export const guard = { on: false, rejected: 0 };

type Method = (...args: unknown[]) => Promise<unknown>;
const GUARDED = ['execAsync', 'runAsync', 'getAllAsync', 'getFirstAsync'] as const;

function oneAtATime(db: Record<string, unknown>) {
  let busy = false;
  for (const name of GUARDED) {
    const original = (db[name] as Method).bind(db);
    db[name] = async (...args: unknown[]) => {
      if (!guard.on) return original(...args);
      if (busy) {
        guard.rejected += 1;
        throw new Error('Call to function NativeDatabase.prepareAsync has been rejected: another statement is running on this connection');
      }
      busy = true;
      try {
        // The statement is still in flight for a turn of the event loop, as the native call is.
        await new Promise(resolve => setTimeout(resolve, 0));
        return await original(...args);
      } finally {
        busy = false;
      }
    };
  }
  return db;
}

export function singleStatementSqliteModule() {
  const base = expoSqliteModule();
  return { ...base, openDatabaseAsync: async (name: string) => oneAtATime((await base.openDatabaseAsync(name)) as unknown as Record<string, unknown>) };
}
