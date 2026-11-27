/**
 * The background pass that keeps Customer dues and the statements up to date (WH-305, contract 4 and 13). Started at the
 * end of each good sync run while the app is in front, reachable and the copy ready; stopped by the background, going
 * offline or a new sync run; never from a timer of its own. One request at a time, `MONEY_REFRESH_GAP_MS` between the
 * starts of two statements. It asks the server and keeps the answer whole: the phone works out no money.
 */
import { AppState } from 'react-native';
import { createLogger } from '@/utils/logger';
import type { CustomerDues } from '@/services/reporting/statement-service';
import { mapKeptDues } from '@/services/reporting/statement-service';
import { businessDate } from '../pgCompat';
import { isCopyOffline, subscribeSyncRunEnd } from '../syncEngine';
import { getSyncSnapshot, subscribeSync } from '../syncStore';
import { fetchDues, fetchStatement, type MoneyFetched } from './moneyFetch';
import { moneyOn } from './moneyGate';
import {
  clearMark, deleteMarks, deleteMoneyAnswer, eraseMoney, isDuesStale, keptStatementIds, putMark, readMarks, readMoneyAnswer,
  restoreMark, writeMoneyAnswer,
} from './moneyStore';

const logger = createLogger('[money-refresh]');

/** Dues are fetched again once the kept answer is this old while changes keep arriving. */
export const DUES_REFRESH_GAP_MS = 600_000;
/** Between the starts of two statement requests. */
export const MONEY_REFRESH_GAP_MS = 2000;
/** Failures in a row that end a pass. */
const MAX_FAILURES = 3;
const SLICE_MS = 250;

const pass = { epoch: 0, tail: Promise.resolve(), stops: [] as (() => void)[] };

const inFront = (): boolean => AppState.currentState !== 'background';
const canGo = (id: number): boolean => id === pass.epoch && inFront() && !isCopyOffline();

/** Waits `ms` in short slices so a stopped pass does not sit in its wait. */
async function wait(ms: number, id: number): Promise<void> {
  const until = performance.now() + ms;
  while (performance.now() < until && canGo(id)) {
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(SLICE_MS, Math.max(1, until - performance.now()))));
  }
}

const dayOf = (kept: { asOf: string; today: string | null }): string => (kept.today !== null && kept.today !== '' ? kept.today : businessDate(kept.asOf));

/** Keeps a fetched answer; false when the pass must stop (a refusal). */
async function keep<T extends { as_of: string; today: string }>(kind: 'dues' | 'statement', key: string, got: MoneyFetched<T>): Promise<'kept' | 'failed' | 'stop'> {
  if (got.kind === 'answer') {
    await writeMoneyAnswer({ kind, key, asOf: got.asOf, today: got.today || null, body: got.body });
    return 'kept';
  }
  if (got.kind === 'refused') {
    await eraseMoney();
    return 'stop';
  }
  if (got.kind === 'notFound') {
    await deleteMoneyAnswer(kind, key);
    return 'kept';
  }
  await restoreMark(kind, key);
  return 'failed';
}

async function runPass(id: number): Promise<void> {
  if (!moneyOn() || getSyncSnapshot().phase !== 'ready' || !canGo(id)) return;
  let failures = 0;

  // Rule 3: dues.
  let dues = await readMoneyAnswer('dues', '');
  const phoneDay = businessDate(Date.now());
  const refetch =
    !dues ||
    dayOf(dues) < phoneDay ||
    ((await isDuesStale()) && Date.now() - Date.parse(dues.asOf) >= DUES_REFRESH_GAP_MS);
  if (refetch) {
    await clearMark('dues', '');
    const outcome = await keep('dues', '', await fetchDues());
    if (outcome === 'stop') return;
    if (outcome === 'failed') failures += 1;
    dues = await readMoneyAnswer('dues', '');
    if (!canGo(id)) return;
  }
  if (!dues) return;

  // Rule 2: the wanted set, the dues list's order first.
  const listed = mapKeptDues(dues.body).customers.map((row: CustomerDues['customers'][number]) => row.customer_id);
  const wanted = [...new Set([...listed, ...(await keptStatementIds())])];

  // Rule 1: a mark "all" becomes one mark per wanted customer; marks outside the wanted set go.
  const marks = await readMarks();
  if (marks.includes('all')) {
    await deleteMarks(['all']);
    for (const customer of wanted) await putMark(customer);
  }
  const wantedSet = new Set(wanted);
  await deleteMarks((await readMarks()).filter(mark => !wantedSet.has(mark)));

  // Rule 4: statements, one at a time.
  let lastStart = -Infinity;
  for (;;) {
    if (!canGo(id) || failures >= MAX_FAILURES) return;
    const marked = new Set(await readMarks());
    const kept = new Set(await keptStatementIds());
    const next = wanted.find(customer => marked.has(customer) || !kept.has(customer));
    if (next === undefined) return;
    await wait(MONEY_REFRESH_GAP_MS - (performance.now() - lastStart), id);
    if (!canGo(id)) return;
    lastStart = performance.now();
    await clearMark('statement', next);
    const got = await fetchStatement(next);
    const outcome = await keep('statement', next, got);
    if (outcome === 'stop') return;
    if (outcome === 'failed') failures += 1;
    else failures = 0;
  }
}

/** A new pass, after the one before it has ended (one request at a time). */
function begin(): void {
  pass.epoch += 1;
  const id = pass.epoch;
  pass.tail = pass.tail.then(() => runPass(id)).catch((error: unknown) => {
    logger.warn('The money refresh pass failed', error instanceof Error ? error.name : 'unknown');
  });
}

/** Starts listening to the end of each sync run. Idempotent. */
export function startMoneyRefresh(): void {
  if (pass.stops.length) return;
  pass.stops = [
    subscribeSyncRunEnd(begin),
    // A new sync run ends the pass at its next step; it is taken up again at that run's end.
    subscribeSync(() => {
      if (getSyncSnapshot().running !== null) pass.epoch += 1;
    }),
  ];
}

/** Stops listening and ends a pass at its next step. Idempotent. */
export function stopMoneyRefresh(): void {
  for (const stop of pass.stops) stop();
  pass.stops = [];
  pass.epoch += 1;
}
