/**
 * The answers of Customer dues, Statement and Customer activity as the server last gave them, kept in the phone copy
 * (WH-305, product/tech/app-offline-dues-statement.md 3 and 13). The body is stored as the server sent it: the phone adds,
 * subtracts and estimates nothing (decision 4). Erased with the copy, by the existing paths only (and by a refusal).
 */
import { getSessionCacheScope } from '@/utils/cacheManager';
import { currentCopy } from '../copyDb';
import type { CopyDriver } from '../copyDriver';
import { MONEY_ANSWERS_SQL } from '../copySchema';

export type MoneyKind = 'dues' | 'statement' | 'activity';

/** A body longer than this (as JSON text) is not kept; that screen then behaves as never fetched when offline. */
export const MAX_MONEY_BODY_CHARS = 2_000_000;
/** The newest Customer activity answers kept, by `used_at`. */
export const MAX_ACTIVITY_ANSWERS = 20;

export interface MoneyAnswerInput {
  kind: MoneyKind;
  key: string;
  asOf: string;
  today: string | null;
  body: unknown;
}

export interface KeptMoneyAnswer {
  asOf: string;
  today: string | null;
  body: unknown;
  usedAt: number;
  key: string;
}

interface Row {
  key: string;
  as_of: string;
  today: string | null;
  body: string;
  used_at: number;
}

/** The activity key: `customers|<from>|<to>` or `customer:<id>|<from>|<to>` (contract 13). */
export function activityKey(customerId: string | null, from: string, to: string): string {
  return customerId === null ? `customers|${from}|${to}` : `customer:${customerId}|${from}|${to}`;
}

/** The part of an activity key before its period: `customers|` or `customer:<id>|`. */
export const activityScope = (customerId: string | null): string => (customerId === null ? 'customers|' : `customer:${customerId}|`);

/** The period inside an activity key. */
export function activityPeriod(key: string): { from: string; to: string } | null {
  const parts = key.split('|');
  return parts.length === 3 ? { from: parts[1], to: parts[2] } : null;
}

/** Runs `work` over this session's open copy in one transaction; null when there is none (or it is another session's). */
async function withCopy<T>(work: (tx: CopyDriver) => Promise<T>): Promise<T | null> {
  const db = currentCopy();
  const scope = await getSessionCacheScope();
  if (!db || !scope) return null;
  let result: T | null = null;
  await db.transaction(async tx => {
    await tx.exec(MONEY_ANSWERS_SQL);
    const held = await tx.all<{ v: string }>("SELECT v FROM meta WHERE k = 'scope'");
    if (held[0]?.v !== scope) return;
    result = await work(tx);
  });
  return result;
}

const parse = (row: Row): KeptMoneyAnswer => ({ asOf: row.as_of, today: row.today, body: JSON.parse(row.body) as unknown, usedAt: row.used_at, key: row.key });

/** True when the answer was kept. A later `as_of` already stored keeps the stored one (an equal one is replaced: the same moment, asked again). */
export async function writeMoneyAnswer({ kind, key, asOf, today, body }: MoneyAnswerInput): Promise<boolean> {
  const text = JSON.stringify(body);
  if (text.length > MAX_MONEY_BODY_CHARS) return false;
  const kept = await withCopy(async tx => {
    const held = await tx.all<{ as_of: string }>('SELECT as_of FROM money_answers WHERE kind = ? AND key = ?', [kind, key]);
    if (held[0] && Date.parse(held[0].as_of) > Date.parse(asOf)) return false;
    await tx.run(
      'INSERT INTO money_answers (kind, key, as_of, today, body, used_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(kind, key) DO UPDATE SET as_of = excluded.as_of, today = excluded.today, body = excluded.body, used_at = excluded.used_at',
      [kind, key, asOf, today, text, Date.now()]
    );
    if (kind === 'activity') {
      await tx.run(
        "DELETE FROM money_answers WHERE kind = 'activity' AND key NOT IN " +
          "(SELECT key FROM money_answers WHERE kind = 'activity' ORDER BY used_at DESC, key DESC LIMIT ?)",
        [MAX_ACTIVITY_ANSWERS]
      );
    }
    return true;
  });
  return kept === true;
}

export async function readMoneyAnswer(kind: MoneyKind, key: string): Promise<KeptMoneyAnswer | null> {
  const row = await withCopy(async tx => (await tx.all<Row>('SELECT key, as_of, today, body, used_at FROM money_answers WHERE kind = ? AND key = ?', [kind, key]))[0] ?? null);
  return row ? parse(row) : null;
}

/** The kept Customer activity answer of a scope (`activityScope`) with the newest `used_at`, whatever its period. */
export async function readNewestActivity(scope: string): Promise<KeptMoneyAnswer | null> {
  const row = await withCopy(async tx =>
    (await tx.all<Row>(
      "SELECT key, as_of, today, body, used_at FROM money_answers WHERE kind = 'activity' AND substr(key, 1, ?) = ? ORDER BY used_at DESC LIMIT 1",
      [scope.length, scope]
    ))[0] ?? null
  );
  return row ? parse(row) : null;
}

/** Every kept dues and statement answer, the customers named by the dues answer first is the pass's business. */
export async function keptStatementIds(): Promise<string[]> {
  return (await withCopy(async tx => (await tx.all<{ key: string }>("SELECT key FROM money_answers WHERE kind = 'statement'")).map(r => r.key))) ?? [];
}

export async function deleteMoneyAnswer(kind: MoneyKind, key: string): Promise<void> {
  await withCopy(tx => tx.run('DELETE FROM money_answers WHERE kind = ? AND key = ?', [kind, key]));
}

/**
 * A customer account's phone holds only what its screens show (WH-306): the kept statements and activity answers of a
 * customer no longer in its copy are erased, with that customer's mark. `ids` are the customers the copy now holds.
 */
export async function dropMoneyOutside(ids: readonly string[]): Promise<void> {
  const keep = new Set(ids);
  await withCopy(async tx => {
    const rows = await tx.all<{ kind: string; key: string }>("SELECT kind, key FROM money_answers WHERE kind IN ('statement', 'activity')");
    for (const row of rows) {
      let customer: string | null = null;
      if (row.kind === 'statement') customer = row.key;
      else if (row.key.startsWith('customer:')) customer = row.key.slice('customer:'.length, row.key.indexOf('|'));
      if (customer !== null && !keep.has(customer)) await tx.run('DELETE FROM money_answers WHERE kind = ? AND key = ?', [row.kind, row.key]);
    }
    for (const mark of await tx.all<{ customer_id: string }>('SELECT customer_id FROM money_stale')) {
      if (mark.customer_id !== 'all' && !keep.has(mark.customer_id)) await tx.run('DELETE FROM money_stale WHERE customer_id = ?', [mark.customer_id]);
    }
  });
}

/** A refusal: every kept answer and every mark goes. */
export async function eraseMoney(): Promise<void> {
  await withCopy(async tx => {
    await tx.run('DELETE FROM money_answers');
    await tx.run('DELETE FROM money_stale');
    await tx.run("DELETE FROM meta WHERE k = 'money_dues_stale'");
  });
}

// ---------- marks ----------

export async function readMarks(): Promise<string[]> {
  return (await withCopy(async tx => (await tx.all<{ customer_id: string }>('SELECT customer_id FROM money_stale ORDER BY customer_id')).map(r => r.customer_id))) ?? [];
}
export async function deleteMarks(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  await withCopy(async tx => {
    for (const id of ids) await tx.run('DELETE FROM money_stale WHERE customer_id = ?', [id]);
  });
}
export async function putMark(id: string): Promise<void> {
  await withCopy(tx => tx.run('INSERT OR IGNORE INTO money_stale (customer_id) VALUES (?)', [id]));
}
export async function isDuesStale(): Promise<boolean> {
  return (await withCopy(async tx => (await tx.all('SELECT 1 FROM meta WHERE k = ?', ['money_dues_stale'])).length > 0)) === true;
}
export async function setDuesStale(on: boolean): Promise<void> {
  await withCopy(tx => (on
    ? tx.run("INSERT INTO meta (k, v) VALUES ('money_dues_stale', '1') ON CONFLICT(k) DO UPDATE SET v = excluded.v")
    : tx.run("DELETE FROM meta WHERE k = 'money_dues_stale'")));
}

/** Whether the mark of `kind` for a key is set: dues (the one flag) or a statement's customer. */
export async function isMarked(kind: 'dues' | 'statement', key: string): Promise<boolean> {
  if (kind === 'dues') return isDuesStale();
  return (await withCopy(async tx => (await tx.all('SELECT 1 FROM money_stale WHERE customer_id = ?', [key])).length > 0)) === true;
}
export async function clearMark(kind: 'dues' | 'statement', key: string): Promise<void> {
  if (kind === 'dues') await setDuesStale(false);
  else await deleteMarks([key]);
}
export async function restoreMark(kind: 'dues' | 'statement', key: string): Promise<void> {
  if (kind === 'dues') await setDuesStale(true);
  else await putMark(key);
}

/** The customers the copy holds that are not deleted: for a customer account, its own (WH-306). */
export async function copyCustomerIds(): Promise<string[]> {
  return (await withCopy(async tx => (await tx.all<{ id: string }>('SELECT id FROM customers WHERE deleted_at IS NULL ORDER BY name_lc, id')).map(r => r.id))) ?? [];
}

/** The copy holds a lot with stock on a GRN that is not deleted: of one customer, or of any (`customerId` null). */
export async function copyHasStock(customerId: string | null): Promise<boolean> {
  const found = await withCopy(async tx => {
    const sql =
      'SELECT 1 FROM goodsreceived_trl t JOIN goodsreceived g ON g.id = t.gr_id WHERE g.deleted_at IS NULL AND t.stock > 0' +
      (customerId === null ? ' LIMIT 1' : ' AND g.customer_id = ? LIMIT 1');
    return (await tx.all(sql, customerId === null ? [] : [customerId])).length > 0;
  });
  return found === true;
}
