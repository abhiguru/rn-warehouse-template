/**
 * Handing refused items to the server's holding list (WH-304, product/tech/app-offline-holding-list.md sections 3 and 12).
 *
 * The send engine calls `handOverRefused` at the start and end of each pass: a refused item and everything that follows it go
 * to the server in one `hold_items` call (groups over 50 go in calls of 50, in `seq` order). Until the server answers, the rows
 * stay `refused` and counted (Product PQ1). A hand-over that does not end held sets `handover_failed` on its rows (Design 7.11:
 * "Not passed on") and is tried again by the next pass; the person's own Delete ends such an item (Product PQ10).
 *
 * `moveOtherPersonToHolding` is the administrator's "Move to the holding list" for another person's items on this phone. Both
 * always resolve: a failure is an answer, never a rejection.
 */
import { backendHasFeature } from '@/config/backendFeatures';
import { hasCapability } from '@/config/facilityCapabilities';
import { normalizeRole } from '@/config/roles';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { isCopyOffline } from '@/features/phone-copy/syncEngine';
import { SAVE_WAIT_MS } from '@/features/unsent/offlineNew';
import { answerFiguresOf, answerCodeOf } from '@/features/unsent/refusalAnswer';
import { classify, DEPENDS_ON_REFUSED } from '@/features/unsent/sendEngine';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { createLogger, loggableError } from '@/utils/logger';
import { emptyAnswerAsError, withHttpStatus } from '@/utils/serverText';
import { allItems, deleteItems, itemsOfScope, photosOf, updateItem, type ItemRow } from '@/features/unsent/unsentRows';
import { cannotSendUnsent, currentPersonRole } from '@/features/unsent/unsentRole';
import { heldWhatOf } from './heldWhat';

const logger = createLogger('[holding-handover]');

/** Items in one `hold_items` call (contract 11.1: more is refused whole). */
const CALL_LIMIT = 50;
/** The server cannot hand over what it does not have (a server without the holding list): the item stays refused. */
const SERVER_TOO_OLD = 'SERVER_TOO_OLD';

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether this phone hands refused items over: the facility syncs and its server has the holding list. */
export function holdingOn(): boolean {
  return hasCapability('sync') && backendHasFeature('holdingList');
}

/** What a pass learns of a hand-over. */
export interface HandOverResult {
  /** The session ended (401): the pass ends. */
  stop: boolean;
  /** The server could not be reached: the pass is tried again after a wait. */
  transient: boolean;
  /** A record's own Save wait is still running: look again after this many ms (null: nothing waits). */
  deferMs: number | null;
}

const NOTHING: HandOverResult = { stop: false, transient: false, deferMs: null };

/**
 * Items whose hand-over the server refused for good (the gate, a too large body, a server without the function): not asked again
 * until the app starts again (a new server release is then found), so a refusal is not repeated at every pass.
 */
const refusedForGood = new Set<string>();

/** A code is written to the log once, whatever the number of items that met it. */
const logged = new Set<string>();
function logOnce(code: string, error?: unknown): void {
  if (logged.has(code)) return;
  logged.add(code);
  logger.warn(`The hand-over was refused: ${code}`, error === undefined ? undefined : loggableError(error));
}

const parse = (raw: string | null): unknown => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

/** The code kept with a refused row (`items.result`), or null. */
const codeOfRow = (row: ItemRow): string | null => {
  const result = parse(row.result);
  return isFields(result) && typeof result.code === 'string' && result.code !== '' ? result.code : null;
};

/** The customer a body names, for the server to keep it on the row (it keeps it only when it is a customer). */
function customerOf(body: unknown): string | undefined {
  if (!isFields(body) || !isFields(body.args)) return undefined;
  const direct = body.args.p_customer_id;
  const dispatch = isFields(body.args.p_dispatch_data) ? body.args.p_dispatch_data.customer_id : undefined;
  const id = typeof direct === 'string' ? direct : dispatch;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

interface HoldItem {
  request_key: string;
  kind: string;
  body: unknown;
  seq: number;
  recorded_at: string;
  what: unknown;
  follows_key?: string;
  customer_id?: string;
  refusal?: { code?: string; reason?: string; data?: unknown };
}

async function itemOf(row: ItemRow, followsKey: string | null): Promise<HoldItem> {
  const body = parse(row.body);
  const result = parse(row.result);
  const code = codeOfRow(row);
  const customer = customerOf(body);
  const hasRefusal = row.last_error !== null && row.last_error !== DEPENDS_ON_REFUSED;
  return {
    request_key: row.request_key,
    kind: row.kind,
    body,
    seq: row.seq,
    recorded_at: new Date(row.recorded_at).toISOString(),
    what: heldWhatOf(row, row.kind === 'photos' ? (await photosOf(row.id)).length : 0),
    ...(followsKey === null ? {} : { follows_key: followsKey }),
    ...(customer === undefined ? {} : { customer_id: customer }),
    ...(hasRefusal
      ? {
          refusal: {
            ...(code === null ? {} : { code }),
            reason: row.last_error ?? '',
            data: isFields(result) ? answerFiguresOf(result.answer) : {},
          },
        }
      : {}),
  };
}

type CallResult =
  | { kind: 'held'; answered: Map<string, { id: string | null; reused: boolean }> }
  | { kind: 'stop' }
  | { kind: 'transient' }
  | { kind: 'refused'; code: string };

/** One `hold_items` call. Never throws: a call that fails is a result. */
async function callHoldItems(items: readonly HoldItem[], recorder?: string): Promise<CallResult> {
  let answer: { data: unknown; error: unknown; status?: number };
  try {
    const client = await getAuthenticatedClient();
    answer = (await client.rpc('hold_items', { p_items: items, ...(recorder === undefined ? {} : { p_recorder: recorder }) })) as typeof answer;
  } catch (error) {
    answer = { data: null, error };
  }
  const failure = answer.error ? withHttpStatus(answer.error, answer.status) : emptyAnswerAsError(answer);
  const outcome = classify(answer.data, failure);
  switch (outcome.kind) {
    case 'stop':
      return { kind: 'stop' };
    case 'lost':
    case 'transient':
      return { kind: 'transient' };
    case 'refused':
      return { kind: 'refused', code: outcome.code ?? answerCodeOf(answer.data) ?? 'refused' };
    case 'sent': {
      const held = isFields(outcome.result) && Array.isArray(outcome.result.held) ? (outcome.result.held as unknown[]) : [];
      const answered = new Map<string, { id: string | null; reused: boolean }>();
      for (const entry of held) {
        if (!isFields(entry) || typeof entry.request_key !== 'string') continue;
        const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : null;
        answered.set(entry.request_key, { id, reused: entry.reason === 'REQUEST_KEY_REUSED' || id === null });
      }
      return { kind: 'held', answered };
    }
  }
}

/** A group: a refused item and everything that follows it, in `seq` order. */
function groupsOf(rows: readonly ItemRow[], candidate: (row: ItemRow) => boolean): ItemRow[][] {
  const groups: ItemRow[][] = [];
  const groupOf = new Map<string, ItemRow[]>();
  for (const row of rows) {
    if (!candidate(row)) continue;
    const before = row.depends_on === null ? undefined : groupOf.get(row.depends_on);
    const group = before ?? [];
    if (!before) groups.push(group);
    group.push(row);
    groupOf.set(row.id, group);
  }
  return groups;
}

/** The request key of the item `row` follows, when the server holds it or gets it in the same call. */
function followsKeyOf(row: ItemRow, byId: ReadonlyMap<string, ItemRow>, inCall: ReadonlySet<string>): string | null {
  if (row.depends_on === null) return null;
  const before = byId.get(row.depends_on);
  if (!before) return null;
  const heldByServer = before.state === 'held' || (before.held_id !== null && before.held_id !== undefined);
  return heldByServer || inCall.has(before.id) ? before.request_key : null;
}

/** What the server answered for each row of a call, written to the file: held, or marked as not passed on. */
async function settle(rows: readonly ItemRow[], result: Extract<CallResult, { kind: 'held' }>): Promise<void> {
  for (const row of rows) {
    const entry = result.answered.get(row.request_key);
    if (!entry || entry.reused || entry.id === null) {
      await updateItem(row.id, { handover_failed: 1 });
      continue;
    }
    // A photos item is held only when its files are on the server too (contract 3); until then it stays refused, counted as waiting photos.
    await updateItem(row.id, { held_id: entry.id, handover_failed: 0, ...(row.kind === 'photos' ? {} : { state: 'held' }) });
  }
}

/** Hands over the refused items of `scope` the server does not hold yet. Always resolves. */
export async function handOverRefused(scope: string): Promise<HandOverResult> {
  try {
    if (!holdingOn() || isCopyOffline() || cannotSendUnsent()) return NOTHING;
    const rows = await itemsOfScope(scope);
    const byId = new Map(rows.map(row => [row.id, row]));
    // An item whose own refusal says the server lacks the function is never handed over, nor what follows it.
    const barred = new Set<string>();
    for (const row of rows) {
      if (row.state === 'refused' && (codeOfRow(row) === SERVER_TOO_OLD || (row.depends_on !== null && barred.has(row.depends_on)))) barred.add(row.id);
    }
    const candidate = (row: ItemRow): boolean =>
      row.state === 'refused' && (row.held_id ?? null) === null && !barred.has(row.id) && !refusedForGood.has(row.request_key);
    let deferMs: number | null = null;
    let transient = false;
    for (const group of groupsOf(rows, candidate)) {
      // A record saved by a form is still being waited for by that form for a few seconds: the form takes a refusal back first.
      const first = group[0];
      const waiting = first && (first.form_row ?? null) !== null ? SAVE_WAIT_MS - (Date.now() - first.recorded_at) : 0;
      if (waiting > 0) {
        deferMs = deferMs === null ? waiting : Math.min(deferMs, waiting);
        continue;
      }
      const sentIds = new Set<string>();
      for (let start = 0; start < group.length; start += CALL_LIMIT) {
        const chunk = group.slice(start, start + CALL_LIMIT);
        const inCall = new Set(chunk.map(row => row.id));
        const items = await Promise.all(chunk.map(row => itemOf(row, followsKeyOf(row, byId, inCall))));
        const result = await callHoldItems(items);
        if (result.kind === 'stop') return { stop: true, transient, deferMs };
        if (result.kind === 'held') {
          await settle(chunk, result);
          chunk.forEach(row => sentIds.add(row.id));
          continue;
        }
        // Refused or not answered: every row of the group still not held reads "Not passed on" and is tried again by the next pass.
        for (const row of group) if (!sentIds.has(row.id)) await updateItem(row.id, { handover_failed: 1 });
        if (result.kind === 'refused') {
          logOnce(result.code);
          for (const row of group) refusedForGood.add(row.request_key);
        } else {
          transient = true;
        }
        break;
      }
      if (transient) break;
    }
    return { stop: false, transient, deferMs };
  } catch (error) {
    logger.warn('A hand-over failed', loggableError(error));
    return { ...NOTHING, transient: true };
  }
}

/** What "Move to the holding list" did: how many items the server holds now, how many of the person's are still here. */
export interface MoveOutcome {
  moved: number;
  remaining: number;
  /** `adminOnly`, `needsConnection`, the server's refusal code, or `transient`. */
  failed?: string;
}

const MOVABLE: readonly string[] = ['saved', 'sending', 'refused'];

/**
 * The administrator's move of another person's unsent items to the holding list (spec step 27, Product PQ7): their items of this
 * facility go by `hold_items` with that person as the recorder, in `seq` order, and each is deleted from this phone once the
 * server holds it. A failure leaves the rest untouched. A photos item is left here: its files cannot be sent for another
 * person yet.
 */
export async function moveOtherPersonToHolding(subject: string): Promise<MoveOutcome> {
  const own = async (): Promise<ItemRow[]> => (await subjectRows(subject)).filter(row => MOVABLE.includes(row.state));
  try {
    const before = await own();
    if (normalizeRole(currentPersonRole()) !== 'admin') return { moved: 0, remaining: before.length, failed: 'adminOnly' };
    if (isCopyOffline()) return { moved: 0, remaining: before.length, failed: 'needsConnection' };
    const movable = before.filter(row => row.kind !== 'photos');
    const byId = new Map(before.map(row => [row.id, row]));
    let moved = 0;
    let failed: string | undefined;
    for (let start = 0; start < movable.length && failed === undefined; start += CALL_LIMIT) {
      const chunk = movable.slice(start, start + CALL_LIMIT);
      const inCall = new Set(chunk.map(row => row.id));
      const items = await Promise.all(chunk.map(row => itemOf(row, followsKeyOf(row, byId, inCall))));
      const result = await callHoldItems(items, subject);
      if (result.kind === 'stop') failed = 'transient';
      else if (result.kind === 'transient') failed = 'transient';
      else if (result.kind === 'refused') failed = result.code;
      else {
        const done = chunk.filter(row => result.answered.get(row.request_key)?.reused === false);
        const scope = chunk[0]?.scope;
        if (scope !== undefined && done.length > 0) await deleteItems(scope, done.map(row => row.id));
        moved += done.length;
        if (done.length < chunk.length) failed = 'REQUEST_KEY_REUSED';
      }
    }
    const remaining = (await own()).length;
    return { moved, remaining, ...(failed === undefined ? {} : { failed }) };
  } catch (error) {
    logger.warn('Moving to the holding list failed', loggableError(error));
    return { moved: 0, remaining: (await own().catch(() => [])).length, failed: 'transient' };
  }
}

/** Every row of another person (by their subject) in this facility, oldest first. */
async function subjectRows(subject: string): Promise<ItemRow[]> {
  const mine = await getSessionCacheScope();
  if (!mine) return [];
  const [origin, instance] = JSON.parse(mine) as [string, string, string];
  return (await allItems()).filter(row => {
    const [rowOrigin, rowInstance, rowSubject] = JSON.parse(row.scope) as [string, string, string];
    return rowOrigin === origin && rowInstance === instance && rowSubject === subject;
  });
}
