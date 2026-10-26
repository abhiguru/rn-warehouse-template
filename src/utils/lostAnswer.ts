/**
 * One rule for an answer that never came (owner decision D22, 2026-10-20).
 *
 * A change (a create, an edit, a delete, a line on an order) whose request may have reached the server
 * but whose answer did not come back is a lost answer. The screen then:
 *
 *   1. locks at once (no field, button or tap that could leave or send the change again);
 *   2. waits until the phone is online AND at least 10 s have passed since the request was sent
 *      (`waitForServer`);
 *   3. asks the server what became of THAT request (`checkSubmission` for creates and edits that
 *      carry a request code; a read of the record for deletes; a read of the order for order lines);
 *   4. keeps asking, with a pause that doubles up to 30 s, while the question itself gets no answer.
 *
 * Nothing here finds a record "by customer, date or lines": the server is asked about the request code.
 *
 * Online state: the app's one source of it is NetInfo (`useNetworkStatus` and `ensureNetworkConnection` in
 * `@/hooks/useNetworkStatus` read it). These helpers are not hooks, so they read NetInfo directly. It is
 * loaded on first use, not when this file is imported: a screen's test that does not stand NetInfo in
 * (a native module) still imports this file, and there NetInfo cannot be had, which counts as online.
 * "Offline" is the phone saying it has no network at all (`isConnected === false`); a connection whose
 * internet is "not reachable" can still reach a facility's own server, so it is asked. The one hook here,
 * `useIsDisconnected`, is that same test for the notices ("Waiting for the connection…"), so what a screen says is
 * what the wait waits for.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isLostAnswer } from '@/utils/serverText';
import { getNetInfoGeneration, subscribeNetInfoGeneration } from '@/config/netInfoGeneration';

/** How long after a request was sent the app waits before it asks what became of it. */
export const LOST_ANSWER_MIN_WAIT_MS = 10_000;
/** The first pause between two questions that got no answer; it doubles up to the longest. */
export const LOST_ANSWER_FIRST_RETRY_MS = 2_000;
export const LOST_ANSWER_LONGEST_RETRY_MS = 30_000;

/**
 * True when a change failed with no answer after the request may have reached the server (a timeout, a dropped
 * connection, a gateway's error answer). The definition lives in `@/utils/serverText` (and `executeRPC` returns the
 * result as `lostAnswer`); it is re-exported here for the screens and services that already import it from this file.
 */
export { isLostAnswer };

/** What `waitForServer` and `checkSubmission` reject with when their signal is aborted. */
export function abortedError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/** True for the rejection of an aborted wait or check. */
export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortedError();
}

/** Resolves after `ms`; rejects at once when the signal is aborted. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

type NetInfoModule = typeof import('@react-native-community/netinfo').default;
let netInfoModule: NetInfoModule | null | undefined;

function netInfo(): NetInfoModule | null {
  if (netInfoModule === undefined) {
    try {
      netInfoModule = (require('@react-native-community/netinfo') as typeof import('@react-native-community/netinfo')).default ?? null;
    } catch {
      netInfoModule = null;
    }
  }
  return netInfoModule;
}

/** The phone says it has no network at all. An unknown reading is not "offline": the question is asked then. */
const hasNoNetwork = (state: { isConnected: boolean | null }): boolean => state.isConnected === false;

/**
 * True while the phone says it has no network at all (`isConnected === false`): the one online test of the lost-answer
 * rule. The notices ("Waiting for the connection…") read this, so what they say is what `waitForServer` waits for. An
 * unknown reading (`isConnected === null`), a connection whose internet is "not reachable", and a phone whose state
 * cannot be read all count as online: the server is asked then. (`useIsOffline` in `@/hooks/useNetworkStatus` is
 * stricter, for banners, and is not used for this.)
 */
export function useIsDisconnected(): boolean {
  const [disconnected, setDisconnected] = useState(false);
  // NetInfo.configure (src/config/netReachability.ts) stops the listeners added before it: listen again after one.
  const netInfoGeneration = useSyncExternalStore(subscribeNetInfoGeneration, getNetInfoGeneration, getNetInfoGeneration);
  useEffect(() => {
    const info = netInfo();
    if (!info) return undefined;
    let active = true;
    const apply = (state: { isConnected: boolean | null }) => {
      if (active) setDisconnected(hasNoNetwork(state));
    };
    // Subscribed first: an event that arrives while the first reading is pending is newer than it.
    let received = false;
    const unsubscribe = info.addEventListener(state => {
      received = true;
      apply(state);
    });
    void info.fetch().then(state => {
      if (!received) apply(state);
    }).catch(() => {
      // Failure to observe connectivity does not prove the server is down: stay "online".
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [netInfoGeneration]);
  return disconnected;
}

/** Resolves once the phone is online; at once when it is, or when its state cannot be read. */
async function waitUntilOnline(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const info = netInfo();
  if (!info) return;
  try {
    if (!hasNoNetwork(await info.fetch())) {
      throwIfAborted(signal);
      return;
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Failure to observe connectivity does not prove the server is down: ask.
    return;
  }
  await new Promise<void>((resolve, reject) => {
    let done = false;
    let unsubscribe: (() => void) | undefined;
    let stopGeneration: (() => void) | undefined;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', onAbort);
      unsubscribe?.();
      stopGeneration?.();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(abortedError());
    signal?.addEventListener('abort', onAbort);
    const listen = () => {
      unsubscribe?.();
      unsubscribe = info.addEventListener(state => {
        if (!hasNoNetwork(state)) finish();
      });
      // The listener may have answered before `unsubscribe` was set.
      if (done) unsubscribe();
    };
    listen();
    // NetInfo.configure stops the listener added above (a change of facility does it): add it again after one.
    stopGeneration = subscribeNetInfoGeneration(() => {
      if (!done) listen();
    });
    // `finish` may have run before `stopGeneration` was set.
    if (done) stopGeneration();
  });
}

/**
 * Waits until the phone is online AND at least 10 s have passed since the request was sent (`sentAt`, a
 * `Date.now()` reading taken just before it went out). A connection lost while waiting is waited out too.
 * Rejects with an AbortError (see `isAbortError`) when the signal is aborted.
 */
export async function waitForServer(sentAt: number, signal?: AbortSignal): Promise<void> {
  // What is left of the 10 s, worked out once from the wall clock (clamped, so a clock that was set back or forward never
  // makes the wait longer than the rule says), then counted on a monotonic clock: a change of the wall clock during the
  // wait does not move the end.
  const remainingAtStart = Math.min(Math.max(sentAt + LOST_ANSWER_MIN_WAIT_MS - Date.now(), 0), LOST_ANSWER_MIN_WAIT_MS);
  const deadline = monotonicNow() + remainingAtStart;
  for (;;) {
    await waitUntilOnline(signal);
    const remaining = deadline - monotonicNow();
    if (remaining <= 0) return;
    await sleep(remaining, signal);
  }
}

/** Milliseconds on a clock that does not jump with the wall clock (`performance.now()`, else `Date.now()`). */
function monotonicNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

/**
 * Asks `read` until it answers (anything but null or undefined): the phone must be online for each try, and
 * a try that gets no answer is followed by a pause of 2 s, doubled each time up to 30 s. A `read` that
 * throws counts as no answer. Rejects with an AbortError when the signal is aborted (also while a read is in
 * flight: its answer is then ignored), or when `read` itself throws one (a screen that has been left says so
 * that way).
 */
export async function readUntilAnswered<T>(
  read: () => Promise<T | null | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  let pause = LOST_ANSWER_FIRST_RETRY_MS;
  for (;;) {
    await waitUntilOnline(signal);
    let value: T | null | undefined;
    try {
      value = await read();
    } catch (error) {
      if (isAbortError(error)) throw error;
      value = null;
    }
    // The person left while the read was in flight: its answer is not wanted (it may belong to a form that is gone).
    throwIfAborted(signal);
    if (value !== null && value !== undefined) return value;
    await sleep(pause, signal);
    pause = Math.min(pause * 2, LOST_ANSWER_LONGEST_RETRY_MS);
  }
}

/** What `get_submission_result` answers: the stored answer of the request, when the server has it. */
export interface SubmissionResult {
  found: boolean;
  /** The answer the lost request was given by the server; treat it exactly like the answer that was lost. */
  // The stored answer is the server's own JSON for whichever RPC was sent; its shape is the caller's.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response?: any;
}

/**
 * One question to the server: the stored success answer of the request code, for the calling user, when the
 * record it made still exists. undefined when the question itself got no answer. An older server that has
 * no `get_submission_result` (before backend migration 120) cannot say: `found: false`, so the caller sends
 * the identical request once, which its own request code (or its own refusal of a duplicate) makes safe.
 */
async function askServer(key: string, serverWithoutFunction: SubmissionResult | undefined = { found: false }): Promise<SubmissionResult | undefined> {
  // Loaded when asked, like NetInfo above: a screen's test does not need the whole data layer to import this file.
  const { executeRPC } = require('@/utils/serviceErrorHandler') as typeof import('@/utils/serviceErrorHandler');
  const { getAuthenticatedClient } = require('@/config/supabaseConfig') as typeof import('@/config/supabaseConfig');
  const result = await executeRPC<Record<string, unknown>>(
    getAuthenticatedClient,
    'get_submission_result',
    { p_key: key },
    { context: 'LostAnswer.checkSubmission', unwrapNested: false, validateSuccess: false },
  );
  if (result.success) {
    const data = result.data;
    if (data && typeof data === 'object' && typeof data.found === 'boolean') {
      return data.found ? { found: true, response: data.response } : { found: false };
    }
    return undefined;
  }
  // PostgREST: PGRST202 (function not in the schema cache), Postgres: 42883 (undefined function).
  if (result.errorCode === 'PGRST202' || result.errorCode === '42883') return serverWithoutFunction;
  return undefined;
}

/**
 * One question, with no waiting and no retry: what became of the request that carried `key`, asked of the server
 * once. For the check at app start of a save that was in flight when the app closed (src/services/unfinishedSaveCheck.ts).
 * `undefined` when the question got no answer, and also when the server is too old to have `get_submission_result`
 * (it cannot say whether the request was applied, so nothing may be told about it); `{ found: false }` only when the
 * server itself says there is no stored answer for the code.
 */
export function askSubmission(key: string): Promise<SubmissionResult | undefined> {
  return askServer(key, undefined);
}

/**
 * Asks the server what became of the request that carried `key` (its request code): waits first
 * (`waitForServer`), then calls `get_submission_result` with `{ p_key: key }`, and asks again, with a pause
 * that doubles up to 30 s, while the question gets no answer. `{ found: true, response }` says the request
 * was applied: treat `response` exactly like the answer that was lost. `{ found: false }` says it was not:
 * the caller sends the identical request once, with the same body and the same request code.
 * Rejects with an AbortError (see `isAbortError`) when the signal is aborted.
 */
export async function checkSubmission(key: string, sentAt: number, signal?: AbortSignal): Promise<SubmissionResult> {
  await waitForServer(sentAt, signal);
  return readUntilAnswered(() => askServer(key), signal);
}
