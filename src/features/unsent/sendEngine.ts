/**
 * Sends the unsent work (WH-301, product/tech/app-offline-unsent-work.md sections 3 and 4).
 *
 * Own items only (the scope of the signed-in person), oldest first. The record lane sends one record at a time, strictly in
 * the order saved, and stops at one whose answer is in doubt; an item that waits for another is skipped and does not hold
 * the ones after it. The photo lane sends the waiting photos of records that are sent, up to four at a time, and never holds
 * the record lane. Each item keeps one request ID and one body for ever (`attempts > 0` freezes it), so every resend is the
 * same request. An answer that never came is asked about with `checkSubmission`; nothing else of that lane is sent
 * meanwhile. Offline, a customer account and another person's session send nothing.
 */
import { File } from 'expo-file-system';
import { isCopyOffline, subscribeCopyOffline, subscribeSyncRunEnd, syncNow } from '@/features/phone-copy/syncEngine';
import { businessDate } from '@/features/phone-copy/pgCompat';
import { ROLE_RECHECK_BACKOFF_MS } from '@/config/roleRecheck';
import { onSessionChange } from '@/config/sessionLifecycle';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { getSessionCacheScope } from '@/utils/cacheManager';
import { checkSubmission, isAbortError, isLostAnswer } from '@/utils/lostAnswer';
import { createLogger, loggableError } from '@/utils/logger';
import { handOverRefused } from '@/features/holding/handOver';
import { answerCodeOf } from './refusalAnswer';
import { getSendKind, type SendContext, type SendKind, type SendOutcome } from './sendKinds';
import { takeWriteSeenWhileQuiet, withoutWriteNote } from '@/config/facilityWrite';
import { getUnsentDb } from './unsentDb';
import { cannotSendUnsent } from './unsentRole';
import {
  itemById,
  itemsOfScope,
  markPhoto,
  photosOf,
  removePhotoFile,
  setLastSentAt,
  sweepSentRows,
  updateItem,
  type ItemRow,
} from './unsentRows';

const logger = createLogger('[unsent-send]');

export type SendTrigger = 'open' | 'foreground' | 'reconnect' | 'saved' | 'send-now' | 'sync' | 'retry-timer';

/** Photo items sent at once (the same number as the GRN photo upload, `GRN_PHOTO_UPLOAD_CONCURRENCY`). */
const PHOTO_LANE_SLOTS = 4;

const engine = {
  running: null as Promise<void> | null,
  again: false,
  retryTimer: null as ReturnType<typeof setTimeout> | null,
  retryStep: 0,
  started: false,
  /** Something was sent since the last sync was asked for. */
  sentAny: false,
  /** Items being sent now, or whose answer is being asked about. */
  active: new Set<string>(),
  /** Aborts the questions about a lost answer when the session ends. */
  abort: new AbortController(),
};

const textOf = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string') return message;
  }
  return '';
};
const fieldOf = (error: unknown, name: 'status' | 'code'): unknown =>
  typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[name] : undefined;

/**
 * What an answer means (contract section 4). `result` is the RPC's answer, `error` what the call failed with. A lost answer
 * is asked about; a refusal ends the item; "transient" says the request never ran and is sent again; "stop" ends the pass.
 */
export function classify(result: unknown, error: unknown): SendOutcome {
  if (error !== null && error !== undefined && error !== false) {
    const status = fieldOf(error, 'status');
    const code = fieldOf(error, 'code');
    const text = textOf(error);
    if (status === 401 || /Session changed/i.test(text)) return { kind: 'stop' };
    // Nothing ran: a held write that was given up, too many requests, the server being upgraded.
    if (status === 429 || code === '429' || code === 'upgrading' || /identity verification required/i.test(text)) return { kind: 'transient' };
    if (isLostAnswer(error)) return { kind: 'lost' };
    const codeText = typeof code === 'string' ? code : '';
    const answered = typeof status === 'number' && status >= 400 && status < 500;
    if ((codeText !== '' && codeText !== 'NETWORK' && codeText !== 'TIMEOUT') || answered) {
      return { kind: 'refused', reason: text, ...(codeText ? { code: codeText } : {}) };
    }
    return { kind: 'transient' };
  }
  if (typeof result === 'object' && result !== null) {
    const answer = result as { success?: unknown; error?: unknown; message?: unknown };
    if (answer.success === true) return { kind: 'sent', result };
    if (answer.success === false) {
      const reason = typeof answer.error === 'string' ? answer.error : typeof answer.message === 'string' ? answer.message : '';
      // The code by the one rule (`reason`, else `error_code` unless WH409, else `code`), and the whole answer kept with it.
      const code = answerCodeOf(result);
      return { kind: 'refused', reason, ...(code ? { code } : {}), answer: result };
    }
  }
  // An answer with nothing readable in it: the request may have been applied.
  return { kind: 'lost' };
}

const parse = (text: string | null): unknown => (text === null ? null : (JSON.parse(text) as unknown));

interface Pass {
  scope: string;
  transient: boolean;
  stop: boolean;
  tasks: Set<Promise<void>>;
  /** Look again after this many ms: a form is still waiting for the answer of a record (WH-304). */
  deferMs: number | null;
}

/** Hands the refused items to the server's holding list (WH-304); a feature that is off hands over nothing. */
async function handOver(pass: Pass): Promise<void> {
  if (pass.stop) return;
  const handed = await handOverRefused(pass.scope);
  if (handed.stop) pass.stop = true;
  if (handed.transient) pass.transient = true;
  if (handed.deferMs !== null) pass.deferMs = pass.deferMs === null ? handed.deferMs : Math.min(pass.deferMs, handed.deferMs);
}

/** Whether an item may go now: its dependency is sent (`ready`), is not sent yet (`wait`), or ended in a refusal (`refused`). */
function settle(row: ItemRow, byId: Map<string, ItemRow>): 'ready' | 'wait' | 'refused' {
  if (row.depends_on === null) return 'ready';
  const dependency = byId.get(row.depends_on);
  if (!dependency) return 'refused';
  if (dependency.state === 'sent') return 'ready';
  // What follows an item the server holds (WH-304) is handed over after it, never sent past it.
  return dependency.state === 'refused' || dependency.state === 'held' ? 'refused' : 'wait';
}

const resolvedFor = (row: ItemRow, byId: Map<string, ItemRow>): Record<string, unknown> => {
  const dependency = row.depends_on === null ? undefined : byId.get(row.depends_on);
  return dependency && row.depends_on ? { [row.depends_on]: parse(dependency.result) } : {};
};

function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

async function markMissingPhotos(row: ItemRow): Promise<void> {
  for (const photo of await photosOf(row.id)) {
    if (!photo.done && !photo.missing && !fileExists(photo.file)) await markPhoto(row.id, photo.client_photo_id, { missing: 1 });
  }
}

/**
 * The reason kept on an item that goes with the refused item it depends on (Product's ruling, WH-301): the reason
 * exactly `dependsOnRefused` (the id of the item it follows stays in `depends_on`), never the refused item's own reason.
 */
export const DEPENDS_ON_REFUSED = 'dependsOnRefused';
const dependsOnRefusedReason = (): string => DEPENDS_ON_REFUSED;

/** What a refused item keeps, as `{ code, answer }`: the code when the kind found one and the server's whole answer. */
function refusalResult(outcome: Extract<SendOutcome, { kind: 'refused' }>): string | null {
  const { code, answer } = outcome;
  if (!code && answer === undefined) return null;
  return JSON.stringify({ ...(code ? { code } : {}), ...(answer !== undefined ? { answer } : {}) });
}

/** The outcome of one send, written to the item. */
async function apply(row: ItemRow, outcome: SendOutcome, before: ItemRow): Promise<void> {
  switch (outcome.kind) {
    case 'sent':
      engine.sentAny = true;
      await setLastSentAt(Date.now()).catch(error => logger.warn('The time of the last send was not kept', loggableError(error)));
      await updateItem(row.id, { state: 'sent', result: JSON.stringify(outcome.result ?? null), sent_day: businessDate(Date.now()), last_error: null });
      for (const photo of await photosOf(row.id)) removePhotoFile(photo.file);
      return;
    case 'refused':
      await updateItem(row.id, { state: 'refused', last_error: outcome.reason, result: refusalResult(outcome) });
      return;
    case 'transient':
    case 'stop':
      // The request never ran: back to what it was, and mergeable again if it had not been tried.
      await updateItem(row.id, { state: before.state, attempts: before.attempts, first_sent_at: before.first_sent_at, last_sent_at: before.last_sent_at });
      return;
    case 'lost':
      return;
  }
}

/** Marks an attempt before the request leaves (a kill in flight must find it) and sends it. */
async function sendOnce(row: ItemRow, kind: SendKind, byId: Map<string, ItemRow>): Promise<SendOutcome> {
  const before = row;
  await markMissingPhotos(row);
  const now = Date.now();
  await updateItem(row.id, { state: 'sending', attempts: row.attempts + 1, first_sent_at: row.first_sent_at ?? now, last_sent_at: now });
  const context: SendContext = { itemId: row.id, requestKey: row.request_key, resolved: resolvedFor(row, byId) };
  let outcome: SendOutcome;
  try {
    outcome = await (kind as { send(body: unknown, ctx: SendContext): Promise<SendOutcome> }).send(JSON.parse(row.body) as unknown, context);
  } catch (error) {
    outcome = classify(null, error);
  }
  await apply(row, outcome, before);
  return outcome;
}

/** Asks what became of a request whose answer was lost; sends the identical request once more when the server never had it. */
async function resolveDoubt(id: string, byId: () => Promise<Map<string, ItemRow>>): Promise<void> {
  const { signal } = engine.abort;
  try {
    for (;;) {
      const row = await itemById(id);
      if (row?.state !== 'sending') return;
      const kind = getSendKind(row.kind);
      if (!kind) return;
      const answer = await checkSubmission(row.request_key, row.last_sent_at ?? Date.now(), signal);
      if (answer.found) {
        const outcome = kind.outcomeOf ? kind.outcomeOf(answer.response) : classify(answer.response, null);
        if (outcome.kind === 'sent' || outcome.kind === 'refused') {
          await apply(row, outcome, row);
          return;
        }
      }
      const outcome = await sendOnce(row, kind, await byId());
      if (outcome.kind === 'sent' || outcome.kind === 'refused') return;
      if (outcome.kind === 'stop') return;
      // Lost again, or the request did not leave: ask again (each round waits at least 10 s after the send).
    }
  } catch (error) {
    if (!isAbortError(error)) logger.warn('A lost answer could not be settled', loggableError(error));
  } finally {
    engine.active.delete(id);
    void sendNow('retry-timer');
  }
}

const rowsById = async (scope: string): Promise<Map<string, ItemRow>> => new Map((await itemsOfScope(scope)).map(row => [row.id, row]));

/** Sends one item that is `saved` (or takes up the question about one that is `sending`). False ends the lane. */
async function handle(row: ItemRow, pass: Pass, byId: Map<string, ItemRow>): Promise<boolean> {
  const kind = getSendKind(row.kind);
  if (!kind) return false;
  if (row.state === 'sending') {
    if (!engine.active.has(row.id)) {
      engine.active.add(row.id);
      void resolveDoubt(row.id, () => rowsById(pass.scope));
    }
    return false;
  }
  // Still the same person, and still connected: the answer to either may have changed while an earlier item was sent.
  if (isCopyOffline() || (await getSessionCacheScope()) !== pass.scope) {
    pass.stop = true;
    return false;
  }
  engine.active.add(row.id);
  let outcome: SendOutcome;
  try {
    outcome = await sendOnce(row, kind, byId);
  } finally {
    engine.active.delete(row.id);
  }
  switch (outcome.kind) {
    case 'sent':
    case 'refused':
      return true;
    case 'transient':
      pass.transient = true;
      return false;
    case 'stop':
      pass.stop = true;
      return false;
    case 'lost':
      engine.active.add(row.id);
      void resolveDoubt(row.id, () => rowsById(pass.scope));
      return false;
  }
}

/** Starts the waiting photos whose record is sent, up to the slots free. */
async function pumpPhotos(pass: Pass): Promise<void> {
  if (pass.stop) return;
  const rows = await itemsOfScope(pass.scope);
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const row of rows) {
    if (pass.stop || pass.tasks.size >= PHOTO_LANE_SLOTS) return;
    if (row.state !== 'saved' && row.state !== 'sending') continue;
    if (getSendKind(row.kind)?.lane !== 'photo' || engine.active.has(row.id)) continue;
    const verdict = settle(row, byId);
    if (verdict === 'refused') {
      await updateItem(row.id, { state: 'refused', last_error: dependsOnRefusedReason() });
      continue;
    }
    if (verdict === 'wait') continue;
    const task = handle(row, pass, byId)
      .then(() => undefined)
      .catch(error => logger.warn('A photo item failed', loggableError(error)))
      .finally(() => {
        pass.tasks.delete(task);
        // A transient answer waits for the next trigger; trying again here would loop.
        if (!pass.transient) void pumpPhotos(pass);
      });
    pass.tasks.add(task);
  }
}

/** The next record to send: a row, `null` when nothing is left, `'again'` after a dependant was refused (read the list again). */
async function nextRecord(pass: Pass): Promise<{ row: ItemRow; byId: Map<string, ItemRow> } | null | 'again'> {
  const rows = await itemsOfScope(pass.scope);
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const row of rows) {
    if (row.state !== 'saved' && row.state !== 'sending') continue;
    const kind = getSendKind(row.kind);
    if (!kind) {
      logger.warn('An item of an unknown kind is waiting; the lane stops here');
      return null;
    }
    if (kind.lane !== 'record') continue;
    const verdict = settle(row, byId);
    if (verdict === 'refused') {
      // A dependant goes with what it depended on (contract section 3).
      await updateItem(row.id, { state: 'refused', last_error: dependsOnRefusedReason() });
      return 'again';
    }
    if (verdict === 'ready') return { row, byId };
  }
  return null;
}

async function recordLane(pass: Pass): Promise<void> {
  while (!pass.stop) {
    const next = await nextRecord(pass);
    if (next === 'again') continue;
    if (next === null) return;
    if (!(await handle(next.row, pass, next.byId))) return;
    await pumpPhotos(pass);
  }
}

/** Drops a waiting retry and its back-off: a retry belongs to the session that armed it. */
function clearRetry(): void {
  if (engine.retryTimer) {
    clearTimeout(engine.retryTimer);
    engine.retryTimer = null;
  }
  engine.retryStep = 0;
}

/** Arms a retry for the session `abort` belongs to; the timer looks again at that session before it sends. */
function armRetry(abort: AbortController, wait: number): void {
  const timer = setTimeout(() => {
    if (engine.retryTimer === timer) engine.retryTimer = null;
    if (engine.abort !== abort || abort.signal.aborted) return;
    void sendNow('retry-timer');
  }, wait);
  // Under Node (tests) a waiting retry must not keep the process alive.
  (timer as { unref?: () => void }).unref?.();
  engine.retryTimer = timer;
}

/** True when the pass ended clean: a trigger that arrived meanwhile may be answered with one more look. */
async function onePass(): Promise<boolean> {
  if (engine.retryTimer) {
    clearTimeout(engine.retryTimer);
    engine.retryTimer = null;
  }
  // The session this pass starts in: a session change replaces `engine.abort`, so a pass that ended in another one arms nothing.
  const sessionAbort = engine.abort;
  if (isCopyOffline() || cannotSendUnsent()) return false;
  const scope = await getSessionCacheScope();
  if (!scope) return false;
  try {
    await getUnsentDb();
  } catch {
    return false;
  }
  await sweepSentRows(businessDate(Date.now()));
  const pass: Pass = { scope, transient: false, stop: false, tasks: new Set(), deferMs: null };
  // Refused items go to the server's holding list at the start of a pass (a hand-over that failed is tried again) and at its end.
  await handOver(pass);
  await pumpPhotos(pass);
  await recordLane(pass);
  await pumpPhotos(pass);
  while (pass.tasks.size > 0) await Promise.all([...pass.tasks]);
  if (!pass.transient && !pass.stop) await handOver(pass);
  const sameSession = engine.abort === sessionAbort && !sessionAbort.signal.aborted;
  if (!sameSession) return false;
  if (pass.deferMs !== null && !pass.transient && !pass.stop) {
    // A form is still waiting for its record's answer: look again when that wait is over.
    armRetry(sessionAbort, pass.deferMs + 50);
  }
  if (pass.transient && !pass.stop) {
    const wait = ROLE_RECHECK_BACKOFF_MS[Math.min(engine.retryStep, ROLE_RECHECK_BACKOFF_MS.length - 1)];
    engine.retryStep += 1;
    armRetry(sessionAbort, wait);
  } else {
    engine.retryStep = 0;
  }
  return !pass.transient && !pass.stop;
}

// The unsent-only bar says "Sending…" only while a pass runs. Session state: `sendingShown` is reset on a session or server
// change and the subscribers are told; the subscriber set holds components (not session data), so it is kept.
const sendingListeners = new Set<() => void>();
let sendingShown = false;
export const isSendingUnsent = (): boolean => sendingShown;
export const subscribeSendingUnsent = (listener: () => void): (() => void) => {
  sendingListeners.add(listener);
  return () => {
    sendingListeners.delete(listener);
  };
};
const tellSending = (): void => {
  for (const listener of [...sendingListeners]) listener();
};
registerSessionScoped('unsent-sending-flag', () => {
  clearRetry();
  sendingShown = false;
  tellSending();
});

/**
 * Sends what can be sent now. Single flight: a second call while a pass runs joins it (and asks for one more look when it
 * ends). It never rejects; what it could not do is tried again by the retry timer and by the next trigger.
 */
export function sendNow(reason: SendTrigger): Promise<void> {
  if (engine.running) {
    engine.again = true;
    return engine.running;
  }
  const run = (async () => {
    try {
      do {
        engine.again = false;
        logger.debug(`Send pass (${reason})`);
        if (!(await withoutWriteNote(onePass))) engine.again = false;
      } while (engine.again);
    } catch (error) {
      logger.warn('A send pass failed', loggableError(error));
    } finally {
      engine.running = null;
      sendingShown = false;
      tellSending();
    }
    // What was sent changes the numbers and stock the copy holds: ask for a sync (C298 6.6).
    // A write made during the pass was not noted (the pass is quiet), so a pass that sent nothing still asks once.
    const foreignWrite = takeWriteSeenWhileQuiet();
    if (engine.sentAny || foreignWrite) {
      engine.sentAny = false;
      void syncNow('after-send');
    }
  })();
  engine.running = run;
  sendingShown = true;
  tellSending();
  return run;
}

/** Wires the triggers that are not a call: the connection coming back, and the end of a session. Once. */
export function startSendEngine(): void {
  if (engine.started) return;
  engine.started = true;
  subscribeCopyOffline(() => {
    if (!isCopyOffline()) void sendNow('reconnect');
  });
  subscribeSyncRunEnd(() => void sendNow('sync'));
  onSessionChange(() => {
    clearRetry();
    engine.abort.abort();
    engine.abort = new AbortController();
  });
}
