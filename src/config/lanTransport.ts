/**
 * The warehouse network fallback transport (WS-L, owner decision 2026-10-26).
 *
 * When the public address of the facility's server fails (the internet or the tunnel is down), the app
 * retries over the server's LAN address, plain http (`urls.lan`, src/config/lanAddress.ts), and goes back to
 * the public address when that works again. Only the HOST of a request changes: the supabase client URL,
 * the token store key (`origin|instanceId`), the caches and every header stay as they are, so a session,
 * its tokens and its caches do not know which path carried a request. A response's `X-Warehouse-Path`
 * header ("lan" or "public") says which path answered.
 *
 * The rewrite happens only inside the request path, at the call sites that send or follow a
 * canonical-origin URL: `gatedFetch` (supabaseConfig.ts), `discoverOperator` (operatorServer.ts),
 * `fetchConfig` (configService.ts), `shareDocument.ts` and the signed-URL builders (`viaCurrentPath`).
 * `src/config/__tests__/lanTransport.test.ts` lists them and fails when one is missing or a new one appears.
 *
 * The switching rule:
 *
 *  - Stay on the current path. The app starts on the public path every time.
 *  - A request fails on the current path when its fetch rejects, when no response headers arrive within
 *    `PUBLIC_HEADERS_TIMEOUT_MS` (4 s), or when Cloudflare answers HTTP 530. On the LAN path it also fails
 *    when the answer is not the fallback listener's own (no `X-Warehouse-Path: lan`), is a 403 of the
 *    listener (this phone's address is outside the allowed range), or is the gateway's key rejection 401.
 *  - When the failure did not prove the path down (a slow or rejected request), the app first asks the
 *    current path's own `hello`; if that answers, the request was at fault, not the path, and the app
 *    stays, having sent nothing to the other address. Otherwise it asks `GET /functions/v1/hello` of the
 *    other path (`PROBE_TIMEOUT_MS`, 3 s). Before it sends any credential to the LAN address it also
 *    checks, without credentials, that the address belongs to this warehouse (`get-public-config`:
 *    header `X-Warehouse-Path: lan` and the saved `instanceId`). If the other path answers, the app
 *    switches and sticks to it for `LAN_STICK_MS` (10 min).
 *  - The failed READ is sent once more on the new path. A WRITE is never sent again, here or anywhere
 *    below this module: it ends as a lost answer and the screen re-asks through the lost-answer rule
 *    (src/utils/lostAnswer.ts).
 *  - On the LAN path the app returns to the public path only after the stick has expired, by asking the
 *    public `hello`, at most once per `PUBLIC_PROBE_INTERVAL_MS` (10 min).
 *  - A 401 with the gateway's key-rejection body that arrives over the LAN path never ends the session: a
 *    LAN listener that was not recreated after a key rotation answers with the old keys. It counts as a
 *    failure of the LAN path (the app goes back to the public path, or reports an "old configuration"
 *    when that is down too), and the 401 is never handed to the session code.
 *
 * This module imports nothing from the session code, so `supabaseConfig.ts` and `operatorServer.ts` can
 * use it.
 */
import { isGatewayKeyRejection } from './gatewayRejection';

export type ConnectionPath = 'public' | 'lan';
/** `old-configuration`: the LAN listener answered a REST call with the gateway's key-rejection 401. */
export type LanFailure = 'old-configuration' | null;

/** No response headers within this long counts as a failure of the path. */
export const PUBLIC_HEADERS_TIMEOUT_MS = 4000;
/** A `hello` probe is given this long. */
export const PROBE_TIMEOUT_MS = 3000;
/** After a switch to the LAN path the app stays on it at least this long. */
export const LAN_STICK_MS = 10 * 60 * 1000;
/** On the LAN path the public `hello` is asked at most this often. */
export const PUBLIC_PROBE_INTERVAL_MS = 10 * 60 * 1000;
/**
 * Not part of the owner's rule: a probe that failed (or a path that was found working) is not repeated
 * for this long, so a phone with both paths down, or a slow server, does not probe on every request.
 */
export const PROBE_BACKOFF_MS = 15 * 1000;

export const WAREHOUSE_PATH_HEADER = 'x-warehouse-path';
const HELLO_PATH = '/functions/v1/hello';
const IDENTITY_PATH = '/functions/v1/get-public-config';
/** The association sign-in exchange is never sent over the LAN (the central service needs the internet anyway). */
const PUBLIC_ONLY = /^\/functions\/v1\/central-exchange(?:[/?#]|$)/;
/** The gateway checks the key on REST only. */
const REST_PATH = /^\/rest\/v1(?:[/?#]|$)/;

export type LanContext = {
  /** The facility's public origin: identity, token store key and caches use it. */
  canonical: string;
  /** The LAN address to fall back to (`http://192.168.1.20:8080`), or null when the server offers none. */
  lan: string | null;
  /** The facility's `instanceId`: the LAN address must answer with it before a credential is sent. */
  instanceId: string;
};

export type LanStatus = {
  /** The path requests go over now. */
  path: ConnectionPath;
  failure: LanFailure;
  /** The LAN address in use, or null. */
  lan: string | null;
};

export type LanProbeResult =
  | { ok: true; ms: number }
  | { ok: false; reason: 'not-set' | 'unreachable' | 'refused' | 'wrong-server' };

type FailureReason = 'rejected' | 'slow' | '530' | 'lan-key' | 'lan-refused' | 'lan-other-device' | 'netinfo';
type Attempt =
  | { ok: true; response: Response }
  | { ok: false; why: FailureReason; response?: Response; error?: unknown; switched?: boolean };

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

let context: LanContext | null = null;
let path: ConnectionPath = 'public';
let failure: LanFailure = null;
let stickUntil = 0;
let lastPublicProbeAt = 0;
let returnTimer: ReturnType<typeof setTimeout> | undefined;
let returning = false;
let decision: Promise<boolean> | null = null;
const lastProbeFailureAt: Record<ConnectionPath, number> = { public: 0, lan: 0 };
const lastFoundWorkingAt: Record<ConnectionPath, number> = { public: 0, lan: 0 };

let status: LanStatus = { path: 'public', failure: null, lan: null };
const listeners = new Set<() => void>();

function publish(): void {
  const next: LanStatus = { path, failure, lan: context?.lan ?? null };
  if (next.path === status.path && next.failure === status.failure && next.lan === status.lan) return;
  status = next;
  for (const listener of [...listeners]) listener();
}

/** The path requests go over now, whether the LAN fallback has a problem, and the address in use. Stable between changes. */
export const getLanStatus = (): LanStatus => status;
export const getConnectionPath = (): ConnectionPath => path;
export const getLanContext = (): LanContext | null => context;

export function subscribeLanStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function stopReturnTimer(): void {
  if (returnTimer) clearTimeout(returnTimer);
  returnTimer = undefined;
}

/**
 * Tells the transport which facility is selected and which LAN address it offers (called by
 * operatorServer.ts whenever the selected server or its address changes). A change resets the path to
 * public: a new facility, a new address or a removed one never inherits a stick.
 */
export function setLanContext(next: LanContext | null): void {
  const same =
    context === next ||
    (context !== null &&
      next !== null &&
      context.canonical === next.canonical &&
      context.lan === next.lan &&
      context.instanceId === next.instanceId);
  if (same) return;
  context = next;
  path = 'public';
  failure = null;
  stickUntil = 0;
  lastPublicProbeAt = 0;
  lastProbeFailureAt.public = lastProbeFailureAt.lan = 0;
  lastFoundWorkingAt.public = lastFoundWorkingAt.lan = 0;
  stopReturnTimer();
  publish();
}

/** Back to the start: no facility, public path, nothing remembered. For tests and sign-out of the last facility. */
export function resetLanTransport(): void {
  context = null;
  path = 'public';
  failure = null;
  stickUntil = 0;
  lastPublicProbeAt = 0;
  lastProbeFailureAt.public = lastProbeFailureAt.lan = 0;
  lastFoundWorkingAt.public = lastFoundWorkingAt.lan = 0;
  decision = null;
  returning = false;
  stopReturnTimer();
  listeners.clear();
  status = { path: 'public', failure: null, lan: null };
}

function setFailure(next: LanFailure): void {
  if (failure === next) return;
  failure = next;
  publish();
}

function switchTo(next: ConnectionPath): void {
  const now = Date.now();
  if (next === 'lan') {
    stickUntil = now + LAN_STICK_MS;
    lastPublicProbeAt = now;
    if (path !== 'lan') {
      path = 'lan';
      failure = null;
    }
    scheduleReturn();
  } else {
    path = 'public';
    stickUntil = 0;
    stopReturnTimer();
  }
  publish();
}

// -----------------------------------------------------------------------------
// URLs
// -----------------------------------------------------------------------------

function startsWithOrigin(url: string, origin: string): boolean {
  if (!origin || url.length < origin.length) return false;
  if (url.slice(0, origin.length).toLowerCase() !== origin.toLowerCase()) return false;
  const next = url.charAt(origin.length);
  return next === '' || next === '/' || next === '?' || next === '#';
}

function swapOrigin(url: string, from: string, to: string): string | null {
  return startsWithOrigin(url, from) ? `${to}${url.slice(from.length)}` : null;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && 'url' in input && typeof input.url === 'string') return input.url;
  return String(input);
}

function retarget(input: RequestInfo | URL, target: string): RequestInfo | URL {
  if (typeof input === 'string' || typeof input !== 'object' || input === null || !('url' in input)) return target;
  try {
    return new Request(target, input as Request);
  } catch {
    return target;
  }
}

/**
 * A URL of the facility's canonical origin, as the path in use reaches it: on the LAN path the host
 * becomes the LAN address, on the public path the URL is returned as it is. For URLs the server hands
 * out or the client builds (storage signed URLs, `pdf_url`) that the app then opens itself. A URL of
 * another origin, or the association exchange, is never changed.
 */
export function viaCurrentPath(url: string): string {
  const ctx = context;
  if (path !== 'lan' || !ctx?.lan || typeof url !== 'string') return url;
  if (PUBLIC_ONLY.test(url.slice(ctx.canonical.length))) return url;
  return swapOrigin(url, ctx.canonical, ctx.lan) ?? url;
}

/** The canonical form of a URL that may carry the LAN address (a response's `url`); other URLs come back unchanged. */
export function toCanonicalUrl(url: string): string {
  const ctx = context;
  if (!ctx?.lan || typeof url !== 'string') return url;
  return swapOrigin(url, ctx.lan, ctx.canonical) ?? url;
}

const pathOf = (response: Response): 'lan' | 'public' | null => {
  const value = typeof response.headers?.get === 'function' ? response.headers.get(WAREHOUSE_PATH_HEADER) : null;
  return value === 'lan' || value === 'public' ? value : null;
};

/** Which path answered a response, by its `X-Warehouse-Path` header; a server that does not send it is the public path. */
export const answeredPath = (response: Response): ConnectionPath => (pathOf(response) === 'lan' ? 'lan' : 'public');

function dropBody(response: Response): void {
  try {
    void Promise.resolve(response.body?.cancel?.()).catch(() => {});
  } catch {
    // Nothing to release.
  }
}

// -----------------------------------------------------------------------------
// Probes
// -----------------------------------------------------------------------------

async function timedFetch(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The race ends the wait even when the platform's fetch does not settle on abort.
    return await Promise.race([
      fetch(url, { method: 'GET', signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('probe timed out'));
        }, ms);
        (timer as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** True when the facility's public `hello` answers 200 within the probe time. */
export async function probePublic(): Promise<boolean> {
  const canonical = context?.canonical;
  if (!canonical) return false;
  try {
    const response = await timedFetch(`${canonical}${HELLO_PATH}`, PROBE_TIMEOUT_MS);
    dropBody(response);
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Asks the LAN address, without any credential, whether it is there and is this warehouse: `hello` for
 * liveness (and the time it took), and `get-public-config` for who answers (`X-Warehouse-Path: lan` and
 * the saved `instanceId`), at the same time. A 403 of the listener means this phone's address is outside
 * the range the operator allowed.
 */
export async function probeLan(): Promise<LanProbeResult> {
  const ctx = context;
  if (!ctx?.lan) return { ok: false, reason: 'not-set' };
  const lan = ctx.lan;
  const started = Date.now();
  const hello = timedFetch(`${lan}${HELLO_PATH}`, PROBE_TIMEOUT_MS).then(
    response => ({ response, ms: Date.now() - started }),
    () => null
  );
  const identity = timedFetch(`${lan}${IDENTITY_PATH}`, PROBE_TIMEOUT_MS).then(
    response => response,
    () => null
  );
  const [helloAnswer, identityAnswer] = await Promise.all([hello, identity]);
  if (helloAnswer) dropBody(helloAnswer.response);
  if (!helloAnswer || !identityAnswer) {
    if (identityAnswer) dropBody(identityAnswer);
    return { ok: false, reason: 'unreachable' };
  }
  const { response, ms } = helloAnswer;
  if (response.status === 403 && pathOf(response) === 'lan') {
    dropBody(identityAnswer);
    return { ok: false, reason: 'refused' };
  }
  if (response.status !== 200) {
    dropBody(identityAnswer);
    return { ok: false, reason: 'unreachable' };
  }
  if (pathOf(response) !== 'lan' || identityAnswer.status !== 200 || pathOf(identityAnswer) !== 'lan') {
    dropBody(identityAnswer);
    return { ok: false, reason: 'wrong-server' };
  }
  try {
    const body = (await identityAnswer.json()) as { data?: { instanceId?: unknown } } | null;
    if (body?.data?.instanceId !== ctx.instanceId) return { ok: false, reason: 'wrong-server' };
  } catch {
    return { ok: false, reason: 'wrong-server' };
  }
  return { ok: true, ms };
}

// -----------------------------------------------------------------------------
// Switching
// -----------------------------------------------------------------------------

/**
 * A path failed. Decides, once for everyone who asks at the same time, whether to move to the other
 * path. True: the path has changed (or had already changed). False: stay.
 */
function failOver(from: ConnectionPath, why: FailureReason): Promise<boolean> {
  if (path !== from) return Promise.resolve(true);
  if (decision) return decision;
  const to: ConnectionPath = from === 'public' ? 'lan' : 'public';
  // A 530, the gateway's own refusals on the LAN path and the like prove the path down; a rejected or slow
  // request, or NetInfo's probe having failed once, may be the request's or the moment's fault.
  const definitive = why !== 'rejected' && why !== 'slow' && why !== 'netinfo';
  const now = Date.now();
  if (now - lastProbeFailureAt[to] < PROBE_BACKOFF_MS) return Promise.resolve(false);
  if (!definitive && now - lastFoundWorkingAt[from] < PROBE_BACKOFF_MS) return Promise.resolve(false);
  const asked = context;
  decision = (async () => {
    try {
      // The path in use is asked first, unless the failure already proved it down. While it works nothing
      // is sent to the other address: a slow request must not make the phone probe the warehouse network.
      const fromWorks = definitive ? false : from === 'public' ? await probePublic() : (await probeLan()).ok;
      // The selected facility changed while the probes were out: their answers are about another server.
      if (context !== asked) return false;
      if (fromWorks) {
        lastFoundWorkingAt[from] = Date.now();
        return false;
      }
      const toWorks = to === 'lan' ? (await probeLan()).ok : await probePublic();
      if (context !== asked) return false;
      if (!toWorks) {
        lastProbeFailureAt[to] = Date.now();
        return false;
      }
      switchTo(to);
      return true;
    } finally {
      decision = null;
    }
  })();
  return decision;
}

function scheduleReturn(): void {
  stopReturnTimer();
  const due = Math.max(stickUntil, lastPublicProbeAt + PUBLIC_PROBE_INTERVAL_MS);
  returnTimer = setTimeout(() => {
    void returnToPublicIfDue();
  }, Math.max(0, due - Date.now()));
  (returnTimer as { unref?: () => void }).unref?.();
}

/** On the LAN path, after the stick, at most once per interval: ask the public `hello`, and go back when it answers. */
async function returnToPublicIfDue(): Promise<void> {
  if (path !== 'lan' || returning) return;
  const now = Date.now();
  if (now < stickUntil || now - lastPublicProbeAt < PUBLIC_PROBE_INTERVAL_MS) return;
  returning = true;
  lastPublicProbeAt = now;
  const asked = context;
  try {
    const works = await probePublic();
    if (context !== asked || path !== 'lan') return;
    if (works) switchTo('public');
    else scheduleReturn();
  } finally {
    returning = false;
  }
}

/**
 * A read the app makes without `transportFetch` (a native file download) failed. Asks, as for a failed
 * fetch, whether the other path works; true means the path changed and the caller may try the read once
 * more with `viaCurrentPath`. `startedOn` is the path the failed read used.
 */
export function noteNativeReadFailed(startedOn: ConnectionPath): Promise<boolean> {
  if (!context?.lan) return Promise.resolve(false);
  return failOver(startedOn, 'rejected');
}

/**
 * NetInfo's own probe of the public `hello` found the internet unreachable (src/config/netReachability.ts).
 * That is a failure of the public path as good as a request's: the app asks the public `hello` once more
 * (a single lost probe must not move the phone), then the LAN address, and uses it when it answers.
 */
export function notePublicUnreachable(): void {
  if (context?.lan && path === 'public') void failOver('public', 'netinfo');
}

// -----------------------------------------------------------------------------
// The fetch
// -----------------------------------------------------------------------------

const networkFailure = (why: FailureReason): Error => {
  // The words of a fetch that got no answer, so every screen treats it like one.
  const error = new TypeError('Network request failed');
  (error as { lanReason?: FailureReason }).lanReason = why;
  return error;
};

async function refusesKey(response: Response): Promise<boolean> {
  try {
    return isGatewayKeyRejection(await response.clone().json());
  } catch {
    return false;
  }
}

async function classify(on: ConnectionPath, response: Response, url: string, ctx: LanContext): Promise<Attempt> {
  if (on === 'public') return response.status === 530 ? { ok: false, why: '530', response } : { ok: true, response };
  if (pathOf(response) !== 'lan') {
    // Not the fallback listener: the address belongs to another device now.
    dropBody(response);
    return { ok: false, why: 'lan-other-device' };
  }
  if (response.status === 403) {
    dropBody(response);
    return { ok: false, why: 'lan-refused' };
  }
  if (response.status === 401 && (await refusesKey(response))) {
    // H1: the listener still holds the old keys. This is NOT a reason to end the session.
    dropBody(response);
    setFailure('old-configuration');
    return { ok: false, why: 'lan-key' };
  }
  if (failure && REST_PATH.test(url.slice(ctx.canonical.length)) && response.status !== 401) setFailure(null);
  return { ok: true, response };
}

async function send(
  on: ConnectionPath,
  input: RequestInfo | URL,
  url: string,
  init: RequestInit | undefined,
  ctx: LanContext,
  read: boolean,
  mayFailOver: boolean
): Promise<Attempt> {
  const lan = ctx.lan as string;
  const outer = init?.signal ?? undefined;
  const own = new AbortController();
  const forward = () => own.abort();
  if (outer?.aborted) own.abort();
  else outer?.addEventListener('abort', forward, { once: true });
  const request = fetch(on === 'lan' ? retarget(input, swapOrigin(url, ctx.canonical, lan) ?? url) : input, {
    ...init,
    signal: own.signal,
  });
  const outcome = request.then(
    response => ({ response }),
    (error: unknown) => ({ error })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<'slow'>(resolve => {
    timer = setTimeout(() => resolve('slow'), PUBLIC_HEADERS_TIMEOUT_MS);
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    let result = await Promise.race([outcome, slow]);
    if (result === 'slow') {
      if (!mayFailOver) result = await outcome;
      else {
        // No headers yet. The path is judged in the background; this request is not given up until the verdict is in.
        const verdict = failOver(on, 'slow');
        if (!read) result = await outcome; // a write is never sent again; the verdict only decides the NEXT request
        else {
          const winner = await Promise.race([
            outcome.then(value => ({ value }) as const),
            verdict.then(switched => ({ switched }) as const),
          ]);
          if ('value' in winner) result = winner.value;
          else if (winner.switched) {
            // The other path answers and this one does not: stop this read and let the caller send it there.
            own.abort();
            return { ok: false, why: 'slow', switched: true };
          } else result = await outcome;
        }
      }
    }
    if ('error' in result) {
      if (outer?.aborted) throw result.error; // the caller stopped it: not a failure of the path
      return { ok: false, why: 'rejected', error: result.error };
    }
    return await classify(on, result.response, url, ctx);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', forward);
  }
}

function giveUp(attempt: Extract<Attempt, { ok: false }>): Response {
  if (attempt.response) return attempt.response; // Cloudflare's 530 reaches the callers as it always did
  if (attempt.error !== undefined) throw attempt.error;
  throw networkFailure(attempt.why);
}

/**
 * `fetch` for a request to the facility's canonical origin, with the fallback rule above. With no LAN
 * address known (the server offers none, or nobody is signed in) this is exactly `fetch(input, init)`.
 * `read` is true for a request that changes nothing on the server and may be sent again.
 */
export async function transportFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: { read: boolean }
): Promise<Response> {
  const ctx = context;
  const url = urlOf(input);
  if (!ctx?.lan || !startsWithOrigin(url, ctx.canonical) || PUBLIC_ONLY.test(url.slice(ctx.canonical.length)))
    return fetch(input, init);
  void returnToPublicIfDue();
  const started = path;
  const first = await send(started, input, url, init, ctx, options.read, true);
  if (first.ok) return first.response;
  const switched = first.switched ?? (await failOver(started, first.why));
  if (switched && options.read && context === ctx) {
    const second = await send(path, input, url, init, ctx, options.read, false);
    if (second.ok) return second.response;
    return giveUp(second);
  }
  return giveUp(first);
}
