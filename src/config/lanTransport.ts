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
 * Where the LAN path may be used (review H1, owner decision 2026-10-26): ONLY while the phone is on Wi-Fi or
 * Ethernet AND the LAN address lies inside the phone's own subnet (NetInfo's `ipAddress` and `subnet` mask,
 * fed by `noteNetworkState` from src/config/netReachability.ts). When the subnet cannot be determined the
 * LAN path is not used: nothing is probed and nothing is sent to it. Every change of network (type, address
 * or subnet) puts the phone back on the public path and forgets what was found, so the identity check below
 * runs again before a credential goes to the LAN address on the new network.
 *
 * The switching rule:
 *
 *  - Stay on the current path. The app starts on the public path every time.
 *  - A request fails on the current path when its fetch rejects, when no response headers arrive within
 *    `PUBLIC_HEADERS_TIMEOUT_MS` (4 s), or when the tunnel, not the facility, answers: Cloudflare's HTTP 530
 *    or a 5xx without the gateway's `X-Warehouse-Path` header. A 429 or a 5xx that carries the header is
 *    the facility's own answer and is no failure. On the LAN path it also fails when the answer is not the
 *    fallback listener's own (no `X-Warehouse-Path: lan`), is a 403 of the listener (this phone's address
 *    is outside the allowed range), or is the gateway's key rejection 401.
 *  - A slow WRITE never starts a path check: it waits for its own answer. Only a read that is slow, or a
 *    request that was rejected, asks. While a photo upload is going out over the public path, a failed
 *    probe of NetInfo or a slow read starts no check either (the upload may be what makes the probe slow).
 *  - When the failure did not prove the path down (a slow or rejected request), the app first asks the
 *    current path's own `hello`; if that answers, the request was at fault, not the path, and the app
 *    stays, having sent nothing to the other address. Otherwise it asks `GET /functions/v1/hello` of the
 *    other path (`PROBE_TIMEOUT_MS`, 3 s). Before it sends any credential to the LAN address it also
 *    checks, without credentials, that the address belongs to this warehouse (`get-public-config`:
 *    header `X-Warehouse-Path: lan` and the saved `instanceId`). If the other path answers, the app
 *    switches and sticks to it for `LAN_STICK_MS` (10 min).
 *  - The phone leaves the LAN path at once, WHETHER OR NOT the public path answers, when the LAN address
 *    does not answer as the server: another device (no `X-Warehouse-Path: lan`), a 403, or a request that
 *    failed while the identity probe fails too. Requests then fail on the public path, which sends nothing
 *    anywhere unexpected, and a fresh identity probe is needed before any credential goes to the LAN again.
 *    Only the gateway's key rejection (the real server, holding old keys) may keep the phone on the LAN.
 *  - The failed READ is sent once more on the new path. A WRITE is never sent again, here or anywhere
 *    below this module: it ends as a lost answer and the screen re-asks through the lost-answer rule
 *    (src/utils/lostAnswer.ts).
 *  - On the LAN path the app returns to the public path only after the stick has expired, by asking the
 *    public `hello`, at most once per `PUBLIC_PROBE_INTERVAL_MS` (10 min).
 *  - A 401 with the gateway's key-rejection body that arrives over the LAN path never ends the session: a
 *    LAN listener that was not recreated after a key rotation answers with the old keys. It counts as a
 *    failure of the LAN path (the app goes back to the public path when that works, or reports an "old
 *    configuration" when it does not), and the 401 is never handed to the session code.
 *  - Not proved by the identity check: it compares the server's public `instanceId`, so it tells this
 *    warehouse from another one but not from a device that copies the answer. An authenticated proof (a
 *    challenge answered with an HMAC) is a recorded follow-up (docs/RELEASE_PREPARATION.md).
 *
 * This module imports nothing from the session code, so `supabaseConfig.ts` and `operatorServer.ts` can
 * use it.
 */
import { isGatewayKeyRejection } from './gatewayRejection';
import { lanAddressInSubnet, parseIPv4, subnetPrefixLength } from './lanAddress';

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
/**
 * A cold start asks the server before NetInfo has said where the phone is (its first reading takes a moment). A
 * failure of that first request waits this long for the reading before it decides there is no LAN path to try.
 */
export const NETWORK_KNOWN_WAIT_MS = 1500;

export const WAREHOUSE_PATH_HEADER = 'x-warehouse-path';
const HELLO_PATH = '/functions/v1/hello';
const IDENTITY_PATH = '/functions/v1/get-public-config';
/** The association sign-in exchange is never sent over the LAN (the central service needs the internet anyway). */
const PUBLIC_ONLY = /^\/functions\/v1\/central-exchange(?:[/?#]|$)/;
/** Storage requests (a WRITE here is an upload, a copy or a delete). */
const STORAGE_REQUEST = /^\/storage\/v1(?:[/?#]|$)/;
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

/**
 * `other-network`: the phone is not on Wi-Fi or Ethernet, or the address is outside its subnet. `network-unknown`:
 * NetInfo has not said where the phone is, or could not read its Wi-Fi address or subnet. Nothing was asked in
 * either case.
 */
export type LanProbeResult =
  | { ok: true; ms: number }
  | { ok: false; reason: 'not-set' | 'other-network' | 'network-unknown' | 'unreachable' | 'refused' | 'wrong-server' };

/** What the app knows of the phone's network (NetInfo, src/config/netReachability.ts). */
export type NetworkSnapshot = {
  connected: boolean | null;
  type: string | null;
  ipAddress: string | null;
  subnet: string | null;
};

/** `tunnel`: Cloudflare or the tunnel answered (a 530, or a 5xx without the gateway's header), not the facility. */
type FailureReason = 'rejected' | 'slow' | 'tunnel' | 'lan-key' | 'lan-refused' | 'lan-other-device' | 'netinfo';
type Attempt =
  | { ok: true; response: Response }
  | { ok: false; why: FailureReason; response?: Response; error?: unknown; switched?: boolean };

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

let context: LanContext | null = null;
/** The phone's network as last reported; null until NetInfo has said (then the LAN path is not used). */
let network: NetworkSnapshot | null = null;
let networkKey: string | null = null;
let networkWaiters: Array<() => void> = [];
/** Bumped by every change of facility, address or network: a question asked before it is about something else. */
let generation = 0;
/** Photo uploads going out over the public path now. */
let uploadsInFlight = 0;
/** A failed NetInfo probe was ignored because an upload was in flight: ask once the upload is over. */
let netInfoCheckSkipped = false;
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

/** Back on the public path with nothing remembered about either path; a question still out is made void. */
function resetPath(): void {
  generation += 1;
  path = 'public';
  failure = null;
  stickUntil = 0;
  lastPublicProbeAt = 0;
  lastProbeFailureAt.public = lastProbeFailureAt.lan = 0;
  lastFoundWorkingAt.public = lastFoundWorkingAt.lan = 0;
  decision = null;
  stopReturnTimer();
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
  resetPath();
  publish();
}

/**
 * The phone's network, from NetInfo (src/config/netReachability.ts calls this for every event). A change of
 * type, address or subnet, or of whether there is a connection, puts the phone back on the public path and
 * forgets what was found, so the identity check of the LAN address runs again before any credential goes
 * there on the new network (review H1). An event that repeats the same network changes nothing.
 */
export function noteNetworkState(next: NetworkSnapshot): void {
  const key = [next.connected, next.type, next.ipAddress, next.subnet].join('|');
  if (key === networkKey) return;
  const first = networkKey === null;
  network = next;
  networkKey = key;
  // The first reading only says where the phone has been all along: nothing was remembered about another network.
  if (!first) resetPath();
  for (const waiter of [...networkWaiters]) waiter();
  publish();
}

/** Resolves when NetInfo has told the phone's network, or after `ms`. */
function whenNetworkKnown(ms: number): Promise<void> {
  if (network) return Promise.resolve();
  return new Promise<void>(resolve => {
    const done = () => {
      clearTimeout(timer);
      networkWaiters = networkWaiters.filter(waiter => waiter !== done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    (timer as { unref?: () => void }).unref?.();
    networkWaiters.push(done);
  });
}

/**
 * True when the LAN address may be used from where the phone is now: Wi-Fi or Ethernet, and the address lies in
 * the phone's own subnet. False when the network or its subnet is unknown. Nothing is probed or sent to the LAN
 * address otherwise.
 */
export function lanUsableHere(): boolean {
  return lanUnusableReason() === null;
}

/** Why the LAN address cannot be used from where the phone is (null when it can), for Help's "Check now". */
export function lanUnusableReason(): 'other-network' | 'network-unknown' | null {
  const lan = context?.lan;
  if (!lan) return 'other-network'; // no address to use: nothing to say about the network
  if (!network || network.connected === null) return 'network-unknown';
  if (network.connected !== true || (network.type !== 'wifi' && network.type !== 'ethernet')) return 'other-network';
  // On Wi-Fi or Ethernet but the platform did not tell the address or the mask (a mask of /32 or 0.0.0.0 is "unknown" too).
  if (parseIPv4(network.ipAddress) === null || subnetPrefixLength(network.subnet) === null) return 'network-unknown';
  return lanAddressInSubnet(lan, network.ipAddress, network.subnet) ? null : 'other-network';
}

/** Back to the start: no facility, no network known, public path, nothing remembered. For tests. */
export function resetLanTransport(): void {
  context = null;
  network = null;
  networkKey = null;
  for (const waiter of [...networkWaiters]) waiter();
  uploadsInFlight = 0;
  netInfoCheckSkipped = false;
  resetPath();
  returning = false;
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
    // The warning about the LAN listener belongs to the LAN path (review L3).
    path = 'public';
    failure = null;
    stickUntil = 0;
    stopReturnTimer();
  }
  publish();
}

/** The LAN address did not answer as this warehouse's server: stop sending anything there until it is asked again. */
function leaveLan(): void {
  lastProbeFailureAt.lan = Date.now();
  switchTo('public');
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
  if (path !== 'lan' || !ctx?.lan || typeof url !== 'string' || !lanUsableHere()) return url;
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

type StatusAndHeaders = Pick<Response, 'status' | 'headers'>;

/**
 * Cloudflare or the tunnel answered, not the facility's gateway: HTTP 530, or any 5xx WITHOUT the gateway's
 * `X-Warehouse-Path` header (the gateway sets it on every answer it makes, a 502/503/504 included; contract item 5).
 * A 429 or a 5xx that carries the header is the facility's own answer (contract item 8).
 */
export const isTunnelFailure = (response: StatusAndHeaders): boolean =>
  response.status === 530 || (response.status >= 500 && pathOf(response as Response) === null);

/**
 * True when the facility's public address answered a `hello`: a 200, a 429 (the functions limit, shared by every
 * phone behind the facility's address), or any answer that carries the gateway's header. Only a rejected fetch, no
 * headers in time, a 530 or a 5xx without the header (the tunnel) count as down.
 */
export const publicAnswered = (response: StatusAndHeaders): boolean =>
  !isTunnelFailure(response) &&
  (response.status === 200 || response.status === 429 || pathOf(response as Response) === 'public');

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

/** True when the facility's public `hello` answers within the probe time (`publicAnswered`: a 429 or a 5xx of the gateway counts). */
export async function probePublic(): Promise<boolean> {
  const canonical = context?.canonical;
  if (!canonical) return false;
  try {
    const response = await timedFetch(`${canonical}${HELLO_PATH}`, PROBE_TIMEOUT_MS);
    dropBody(response);
    return publicAnswered(response);
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
  // Mobile data, another Wi-Fi, no subnet known: nothing is sent to a private address there.
  const unusable = lanUnusableReason();
  if (unusable) return { ok: false, reason: unusable };
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
  // A 530, the gateway's own refusals on the LAN path and the like prove the path down; a rejected or slow
  // request, or NetInfo's probe having failed once, may be the request's or the moment's fault.
  const definitive = why !== 'rejected' && why !== 'slow' && why !== 'netinfo';
  const started = generation;
  let run: Promise<boolean> | undefined;
  run = (async () => {
    try {
      return from === 'public' ? await decideFromPublic(why, definitive, started) : await decideFromLan(why, started);
    } finally {
      if (decision === run) decision = null;
    }
  })();
  decision = run;
  return run;
}

/** The public path failed: move to the LAN path when it is usable here, answers and is this warehouse. */
async function decideFromPublic(why: FailureReason, definitive: boolean, started: number): Promise<boolean> {
  // Nothing to fall back to: no address, or a network that cannot hold it (mobile data, another Wi-Fi, an unknown
  // subnet). Nothing is probed, so a phone on mobile data pays no 3 s for a question that cannot help.
  if (!context?.lan) return false;
  if (!network) {
    await whenNetworkKnown(NETWORK_KNOWN_WAIT_MS);
    if (generation !== started) return false;
  }
  if (!lanUsableHere()) return false;
  if (!definitive && uploadsInFlight > 0) {
    // Our own upload may be what makes the public path slow: it is no evidence that the path is down.
    if (why === 'netinfo') netInfoCheckSkipped = true;
    return false;
  }
  const now = Date.now();
  if (now - lastProbeFailureAt.lan < PROBE_BACKOFF_MS) return false;
  if (!definitive && now - lastFoundWorkingAt.public < PROBE_BACKOFF_MS) return false;
  // The path in use is asked first, unless the failure already proved it down. While it works nothing is sent
  // to the LAN address: a slow request must not make the phone probe the warehouse network.
  if (!definitive) {
    const publicWorks = await probePublic();
    // The network or the selected facility changed while the probe was out: its answer is about something else.
    if (generation !== started) return false;
    if (publicWorks) {
      lastFoundWorkingAt.public = Date.now();
      return false;
    }
  }
  const lan = await probeLan();
  if (generation !== started) return false;
  if (!lan.ok) {
    lastProbeFailureAt.lan = Date.now();
    return false;
  }
  switchTo('lan');
  return true;
}

/**
 * A request on the LAN path failed. The phone leaves the LAN path unless the failure is the real server's own
 * key rejection, whether or not the public path answers: a wrong device, a refusal, or a failure the identity
 * probe cannot explain must not keep receiving credentials (review H1).
 */
async function decideFromLan(why: FailureReason, started: number): Promise<boolean> {
  if (why === 'lan-other-device' || why === 'lan-refused') {
    leaveLan();
    return true;
  }
  if (why === 'lan-key') {
    // The real server, holding old keys: the public path is used when it answers; otherwise the phone stays,
    // with the warning that the banner and Help show.
    const publicWorks = await probePublic();
    if (generation !== started || !publicWorks) return false;
    switchTo('public');
    return true;
  }
  // Rejected or slow: the LAN's own identity probe is asked first. While it answers as this warehouse the
  // request was at fault, not the address.
  if (Date.now() - lastFoundWorkingAt.lan < PROBE_BACKOFF_MS) return false;
  const lan = await probeLan();
  if (generation !== started) return false;
  if (lan.ok) {
    lastFoundWorkingAt.lan = Date.now();
    return false;
  }
  leaveLan();
  return true;
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
  const started = generation;
  try {
    const works = await probePublic();
    if (generation !== started || path !== 'lan') return;
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

function endUpload(): void {
  uploadsInFlight = Math.max(0, uploadsInFlight - 1);
  if (uploadsInFlight === 0 && netInfoCheckSkipped) {
    // NetInfo's probe failed while our own upload was going out: ask now that the uplink is free again.
    netInfoCheckSkipped = false;
    notePublicUnreachable();
  }
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
  if (on === 'public') return isTunnelFailure(response) ? { ok: false, why: 'tunnel', response } : { ok: true, response };
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
      // A slow WRITE is no evidence that the path is down (a photo on a slow tunnel takes longer than 4 s): it
      // waits for its own answer, and only a rejected write or a tunnel failure judges the path.
      if (!mayFailOver || !read) result = await outcome;
      else {
        // No headers yet. The path is judged in the background; this read is not given up until the verdict is in.
        const winner = await Promise.race([
          outcome.then(value => ({ value }) as const),
          failOver(on, 'slow').then(switched => ({ switched }) as const),
        ]);
        if ('value' in winner) result = winner.value;
        else if (winner.switched) {
          // The other path answers and this one does not: stop this read and let the caller send it there.
          own.abort();
          return { ok: false, why: 'slow', switched: true };
        } else result = await outcome;
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
  // On the LAN path but no longer on a network that can hold the address (NetInfo has not said so yet, or the
  // subnet is unknown): no credential goes there.
  if (path === 'lan' && !lanUsableHere()) switchTo('public');
  void returnToPublicIfDue();
  const started = path;
  // A photo going out over the public path: the uplink is busy with it, so a slow probe proves nothing.
  const upload = started === 'public' && !options.read && STORAGE_REQUEST.test(url.slice(ctx.canonical.length));
  if (upload) uploadsInFlight += 1;
  try {
    const first = await send(started, input, url, init, ctx, options.read, true);
    if (first.ok) return first.response;
    const switched = first.switched ?? (await failOver(started, first.why));
    if (switched && options.read && context === ctx) {
      const second = await send(path, input, url, init, ctx, options.read, false);
      if (second.ok) return second.response;
      return giveUp(second);
    }
    return giveUp(first);
  } finally {
    if (upload) endUpload();
  }
}
