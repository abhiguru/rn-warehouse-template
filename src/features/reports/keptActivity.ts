/**
 * Customer activity kept as the server last answered (WH-305, contract 5.3 and 13; Design offline-capture.md 8.6, 8.7), for
 * `useReportQuery` with `keptWhenCopy`. The answers live in the phone copy's `money_answers` (kind `activity`), keyed by
 * `customers|<from>|<to>` or `customer:<id>|<from>|<to>`. Offline the newest kept answer of the scope is shown whatever its
 * period, with that period on the period chip. The answer carries no time of its own: the time it reached the phone is kept.
 */
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { activityKey, activityScope, activityPeriod, readMoneyAnswer, readNewestActivity, writeMoneyAnswer } from '@/features/phone-copy/money/moneyStore';

/** The time and period of the kept answer a query shows. */
export interface KeptActivity {
  asOf: string;
  from: string;
  to: string;
  customerId: string | null;
}

const shown = new Map<string, KeptActivity>();
const notHere = new Set<string>();
registerSessionScoped('kept-activity', () => {
  shown.clear();
  notHere.clear();
});

const hashOf = (key: readonly unknown[]): string => JSON.stringify(['report', ...key]);

/** `[report, 'customers', from, to]` or `[report, 'customer', id, from, to]`; null for any other key. */
function parts(key: readonly unknown[]): { customerId: string | null; from: string; to: string } | null {
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  if (key[1] === 'customers' && key.length === 4) {
    const from = text(key[2]);
    const to = text(key[3]);
    return from !== null && to !== null ? { customerId: null, from, to } : null;
  }
  if (key[1] === 'customer' && key.length === 5) {
    const customerId = text(key[2]);
    const from = text(key[3]);
    const to = text(key[4]);
    return customerId !== null && from !== null && to !== null ? { customerId, from, to } : null;
  }
  return null;
}

export const keptActivityOf = (key: readonly unknown[]): KeptActivity | undefined => shown.get(hashOf(key));
export const activityNotHere = (key: readonly unknown[]): boolean => notHere.has(hashOf(key));

/** Offline: the newest kept answer of the key's scope; null (and "not here") when nothing was ever kept. */
export async function readOfflineActivity<T>(key: readonly unknown[]): Promise<T | null> {
  const wanted = parts(key);
  const hash = hashOf(key);
  if (!wanted) return null;
  const kept = await readNewestActivity(activityScope(wanted.customerId));
  const period = kept ? activityPeriod(kept.key) : null;
  if (!kept || !period) {
    notHere.add(hash);
    return null;
  }
  notHere.delete(hash);
  shown.set(hash, { asOf: kept.asOf, from: period.from, to: period.to, customerId: wanted.customerId });
  return kept.body as T;
}

/** Online: the kept answer of this very key, shown while the server is asked again. */
export async function readExactActivity<T>(key: readonly unknown[]): Promise<{ data: T; asOf: string } | null> {
  const wanted = parts(key);
  if (!wanted) return null;
  const kept = await readMoneyAnswer('activity', activityKey(wanted.customerId, wanted.from, wanted.to));
  if (!kept) return null;
  shown.set(hashOf(key), { asOf: kept.asOf, from: wanted.from, to: wanted.to, customerId: wanted.customerId });
  return { data: kept.body as T, asOf: kept.asOf };
}

/** The server answered: keep it with the time it reached the phone. */
export async function keepActivity(key: readonly unknown[], body: unknown): Promise<void> {
  const wanted = parts(key);
  if (!wanted) return;
  const asOf = new Date().toISOString();
  const hash = hashOf(key);
  notHere.delete(hash);
  shown.set(hash, { asOf, from: wanted.from, to: wanted.to, customerId: wanted.customerId });
  await writeMoneyAnswer({ kind: 'activity', key: activityKey(wanted.customerId, wanted.from, wanted.to), asOf, today: null, body });
}
