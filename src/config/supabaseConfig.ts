import { operatorResumeGate } from './operatorResume';
import {
  createClient,
  SupabaseClient,
  Session,
  User,
} from '@supabase/supabase-js';
import type { UserProfile } from '@/types/user.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { digestOf } from '@/utils/tokenDigest';
import { clearSecureSessionMarker } from '@/utils/secureSessionMarker';
import { checkOTPRateLimit, recordOTPRequest } from '@/utils/otpRateLimiter';
import { CACHE_DURATION_LONG_MS } from '@/config/cacheConfig';
import { getActiveOperatorServer } from '@/config/operatorServer';
import {
  advanceSessionGeneration,
  credentialQueueStamp,
  getSessionGeneration,
  renewAheadMs,
  serializeCredentials,
} from './sessionLifecycle';
import { AppError, getAppErrorCode } from '@/utils/appError';
import { localizeDigits, t } from '@/i18n';
import { serverText } from '@/utils/serverText';

// S2/S3 Fix: SecureStore keys for encrypted token storage
const SECURE_KEYS = {
  AUTH_TOKEN: 'secure_auth_token',
  REFRESH_TOKEN: 'secure_refresh_token',
  TOKEN_EXPIRES: 'secure_token_expires',
  ENROLLMENT_TOKEN: 'secure_enrollment_token',
  OPERATOR_IDENTITY: 'secure_operator_identity',
  /**
   * Written when a sign-out starts and removed once the session keys are really gone: a digest
   * of the refresh token being removed, or `*` when it could not be read. A start that finds it
   * next to a session with that refresh token (or `*`) removes the session again and stays
   * signed out. Not a session key on purpose; clearStoredTokensRaw never deletes it.
   */
  SIGNED_OUT: 'secure_signed_out',
} as const;

// The backend uses custom OTP sessions, not GoTrue. Keep the bootstrap client anonymous.
let __supabaseInstance: SupabaseClient | undefined;
let __currentConfig: { url: string; anonKey: string } | undefined;
let __authenticatedClientInstance: SupabaseClient | undefined;
let __cachedAuthToken: string | undefined;
let operatorSwitching = false;
const activeRequests = new Set<{ controller: AbortController; mutation: boolean }>();
let activeMutationOperations = 0;

// Hold the switch gate across a workflow with local work between several
// requests, such as register -> image conversion -> Storage upload -> confirm.
export function beginOperatorMutation(): () => void {
  if (operatorSwitching) throw new AppError('SERVER_SWITCH', t('errors.auth.serverSwitchInProgress'));
  activeMutationOperations += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeMutationOperations -= 1;
  };
}

// True while a multi-request workflow holds the switch gate; the resume
// lifecycle defers identity suspension until such a workflow has finished.
export const hasActiveOperatorMutation = () => activeMutationOperations > 0;

type GatedFetchOptions = {
  /** Session generation the request belongs to. */
  generation: number;
  /** Mutations block a server switch until they settle; reads are aborted by one. */
  mutation: boolean;
  /**
   * Application traffic (true) is refused during a server switch and its
   * response is discarded once its session generation has been replaced.
   * Session lifecycle traffic (false: token refresh, revocation, enrollment
   * signout) still waits for identity verification and is dropped when its
   * generation moved before sending, but a switch may use it and its caller
   * reconciles a late response (refreshSession revokes obsolete tokens).
   */
  honorSwitch: boolean;
};

// Every credentialed request waits for the foreground identity check, then
// refuses to continue for a session generation replaced while it waited.
//
// The two errors below, and every 'Session changed' thrown from the gated fetch,
// are signals rather than messages: the PostgREST client turns an error thrown
// inside fetch into plain text ("Error: Session changed"), so a code would be
// lost and isOfflineFailure has to recognize the text. They stay English.
// Results that are returned to a screen use t('errors.auth.sessionChanged').
export async function awaitIdentityGate(generation: number): Promise<void> {
  if (!operatorResumeGate.isVerified() && !(await operatorResumeGate.ensureVerified()))
    throw new Error('Warehouse identity verification required');
  if (generation !== getSessionGeneration()) throw new Error('Session changed');
}

// The gateway (Kong 3) answers a request whose apikey it does not know with one
// of these bodies. After rotate-keys.sh every installed app still holds the old
// key and the server has revoked every session, so no request can succeed until
// the session ends and the app reloads the public configuration. Kong 2 used
// "Invalid authentication credentials"; PostgREST's own 401s (an expired or
// foreign access token) carry other messages and stay with the refresh path.
const GATEWAY_KEY_REJECTIONS = new Set([
  'Unauthorized',
  'Invalid authentication credentials',
  'No API key found in request',
]);
const keysChangedMessage = () => t('errors.auth.keysChanged');

export const isGatewayKeyRejection = (body: unknown): boolean =>
  typeof body === 'object' &&
  body !== null &&
  GATEWAY_KEY_REJECTIONS.has(String((body as { message?: unknown }).message));

// Inspects a copy of a 401 response without delaying or consuming the original.
function noteUnauthorized(response: Response, generation: number): void {
  if (response.status !== 401 || typeof response.clone !== 'function') return;
  let copy: Response;
  try {
    copy = response.clone();
  } catch {
    return;
  }
  void copy
    .json()
    .then(body => {
      if (isGatewayKeyRejection(body)) return rejectSession(generation, keysChangedMessage());
    })
    .catch(() => {});
}

/**
 * How long a request may wait for the server's answer before it is aborted.
 * Without a limit a request on a connection that never answers stays in
 * flight until the app is killed, and a write in flight holds a server switch
 * back. Uploads and the document and print functions get longer.
 */
export const REQUEST_TIME_LIMIT_MS = { read: 30000, write: 60000, transfer: 120000 } as const;

function requestTimeLimit(input: RequestInfo | URL, mutation: boolean): number {
  if (!mutation) return REQUEST_TIME_LIMIT_MS.read;
  const url = typeof input === 'object' && input !== null && 'url' in input ? input.url : String(input);
  return /\/(storage\/v1\/object|functions\/v1)\//.test(url.split(/[?#]/)[0])
    ? REQUEST_TIME_LIMIT_MS.transfer
    : REQUEST_TIME_LIMIT_MS.write;
}

/**
 * A request the gated fetch gave up waiting for and aborted. Like 'Session
 * changed' it is a signal: the PostgREST client turns it into the text
 * "TimeoutError: Request timeout", which the error tables class as a timeout,
 * so the message stays English. `code` is what postgrest-js reads to leave an
 * aborted request alone; without it a GET would be sent three more times.
 * A write that timed out may still have been applied by the server.
 */
export class RequestTimeoutError extends Error {
  readonly appErrorCode = 'TIMEOUT' as const;
  readonly code = 'ABORT_ERR';

  constructor() {
    super('Request timeout');
    this.name = 'TimeoutError';
  }
}

const BODY_METHODS = new Set(['json', 'text', 'arrayBuffer', 'blob', 'formData']);
/** Statuses whose answer never has a body. */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/** True when nothing follows the headers: a HEAD request, a status without a body, or a null body. */
function answerHasNoBody(input: RequestInfo | URL, init: RequestInit | undefined, response: Response): boolean {
  const request = typeof input === 'object' && input !== null && 'url' in input ? input : undefined;
  const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
  return method === 'HEAD' || NULL_BODY_STATUSES.has(response.status) || response.body === null;
}

/** What a body read aborted by a server switch or the caller's signal rejects with; the text whatwg-fetch uses. */
function abortedRead(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

async function gatedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  { generation, mutation, honorSwitch }: GatedFetchOptions
): Promise<Response> {
  // A verified identity is the common case; keep it synchronous so a server
  // switch sees this request registered before the first await.
  if (!operatorResumeGate.isVerified()) await awaitIdentityGate(generation);
  const invalidated = () => (honorSwitch && operatorSwitching) || generation !== getSessionGeneration();
  if (invalidated()) throw new Error('Session changed');
  const controller = new AbortController();
  const request = { controller, mutation };
  const abort = () => controller.abort();
  if (init?.signal?.aborted) controller.abort();
  else init?.signal?.addEventListener('abort', abort, { once: true });
  activeRequests.add(request);
  // The request is in flight, holds a server switch back (a write) or is aborted by one (a
  // read), and runs against its time limit until its answer is complete: the body as well as
  // the headers, since a streaming fetch resolves at the headers. `release` ends all of that.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    activeRequests.delete(request);
    init?.signal?.removeEventListener('abort', abort);
  };
  // One limit for the whole answer, headers and body.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Rejected first, so the caller hears "timeout" and not the abort it causes.
      reject(new RequestTimeoutError());
      controller.abort();
      release();
    }, requestTimeLimit(input, mutation));
    // Under Node (tests) a waiting request must not keep the process alive.
    (timer as { unref?: () => void }).unref?.();
  });
  // A body read stops at an abort (a switch ends a read, or the caller's signal), even when
  // the platform's read does not.
  const aborted = new Promise<never>((_, reject) => {
    if (controller.signal.aborted) reject(abortedRead());
    else controller.signal.addEventListener('abort', () => reject(abortedRead()), { once: true });
  });
  // Nobody may be waiting on either any more (a body that is never read); that is not an error.
  deadline.catch(() => {});
  aborted.catch(() => {});
  let response: Response;
  try {
    // The race ends the wait even when the platform's fetch does not settle on abort.
    response = await Promise.race([fetch(input, { ...init, signal: controller.signal }), deadline]);
  } catch (error) {
    release();
    throw error;
  }
  // A copy, read outside the request's tracked life: it must not hold a switch back.
  noteUnauthorized(response, generation);
  if (honorSwitch && invalidated()) {
    release();
    throw new Error('Session changed');
  }
  if (answerHasNoBody(input, init, response)) release();
  // Session lifecycle traffic (honorSwitch false) gets the same tracking and limit, but no
  // check after the body: its caller reconciles a late answer (refreshSession revokes it).
  // Application traffic checks again before callers can use a late document, print result,
  // or warehouse response. A body that is never read stays tracked until the limit.
  return new Proxy(response, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      if (BODY_METHODS.has(String(property))) {
        return async (...args: unknown[]) => {
          const read = Promise.race([
            new Promise<unknown>(resolve => resolve(value.apply(target, args))),
            deadline,
            aborted,
          ]);
          const body = await read.finally(release);
          if (honorSwitch && invalidated()) throw new Error('Session changed');
          return body;
        };
      }
      return value.bind(target);
    },
  });
}

// RPCs that only read. PostgREST sends every RPC as POST, so the method cannot
// tell a list query from a save; the name does. A name that is not listed here
// counts as a write, which is the safe side: a write blocks a server switch
// and is never sent twice.
const READ_RPC = /^(get_(?!or_create_)|search_|check_|list_|count_|generate_invoice_data_|user_accessible_customers$)/;

/**
 * True for a request that changes nothing on the server: GET and HEAD, a read
 * RPC, and the Storage calls that sign or list objects. A read is aborted by a
 * server switch and may be sent again; everything else is a write.
 */
export function isReadRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const request = typeof input === 'object' && input !== null && 'url' in input ? input : undefined;
  const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return true;
  if (method !== 'POST') return false;
  const path = String(request?.url ?? input).split(/[?#]/)[0];
  const rpcName = /\/rest\/v1\/rpc\/([A-Za-z0-9_]+)$/.exec(path)?.[1];
  if (rpcName) return READ_RPC.test(rpcName);
  return /\/storage\/v1\/object\/(sign|list)\//.test(path);
}

const headerValue = (headers: RequestInit['headers'] | undefined, name: string): string | undefined => {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined;
  const entries = Array.isArray(headers) ? headers : Object.entries(headers as Record<string, string>);
  return entries.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
};

const bearerOf = (init: RequestInit | undefined): string | undefined =>
  /^Bearer (.+)$/.exec(headerValue(init?.headers, 'Authorization') ?? '')?.[1];

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const source = init?.headers;
  const entries: [string, string][] = [];
  if (source && typeof (source as Headers).forEach === 'function')
    (source as Headers).forEach((value, key) => entries.push([key, value]));
  else if (Array.isArray(source)) entries.push(...(source as [string, string][]));
  else if (source) entries.push(...Object.entries(source as Record<string, string>));
  const headers: Record<string, string> = {};
  for (const [key, value] of entries) if (key.toLowerCase() !== 'authorization') headers[key] = value;
  headers.Authorization = `Bearer ${token}`;
  return { ...init, headers };
}

// The server, not the device clock, has the last word on whether an access
// token is still good. PostgREST answers an expired one with 401 "JWT expired",
// the edge functions with 401 "Invalid or expired access token", and Storage
// with "jwt expired" under a 400 or 403.
async function isExpiredTokenResponse(response: Response): Promise<boolean> {
  if (![400, 401, 403].includes(response.status) || typeof response.clone !== 'function') return false;
  try {
    const body = (await response.clone().json()) as { message?: unknown; error?: unknown } | null;
    const text = String(body?.message ?? body?.error ?? '');
    return /^jwt expired$/i.test(text) || text === 'Invalid or expired access token';
  } catch {
    return false;
  }
}

// The access token the server refused as expired is replaced once. A token that
// was itself just issued is not replaced again: the server would refuse the
// next one too, and every request would rotate the session.
let lastIssued: { token: string; at: number } | undefined;
const JUST_ISSUED_MS = 60 * 1000;
async function accessTokenAfterExpiry(refused: string, generation: number): Promise<string | null> {
  if (generation !== getSessionGeneration()) return null;
  const stored = await getStoredToken();
  // Another request has renewed the session while this one was in flight.
  if (stored.authToken && stored.authToken !== refused) return stored.authToken;
  if (lastIssued?.token === refused && Math.abs(Date.now() - lastIssued.at) < JUST_ISSUED_MS) return null;
  return (await refreshCustomJWT())?.accessToken ?? null;
}

// Application traffic that carries the access token. When the server says the
// token has expired the session is renewed once. A read is then sent again
// with the new token; a write is not replayed (its caller reports the failure
// and the next attempt uses the renewed session).
async function sessionFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  generation: number,
  mutation: boolean
): Promise<Response> {
  const response = await gatedFetch(input, init, { generation, mutation, honorSwitch: true });
  const refused = bearerOf(init);
  if (!refused || !(await isExpiredTokenResponse(response))) return response;
  const renewed = await accessTokenAfterExpiry(refused, generation);
  if (!renewed || mutation) return response;
  // The refused answer is set aside: reading its body ends its tracked life now, not at its limit.
  void Promise.resolve().then(() => response.text()).catch(() => {});
  return gatedFetch(input, withBearer(init, renewed), { generation, mutation, honorSwitch: true });
}

// The document, print and download services call these directly and show the
// error's message, so a timeout reaches them in the app's own words: while
// the headers are awaited and while the body is read.
const inOwnWords = (error: unknown): never => {
  if (error instanceof RequestTimeoutError) throw new AppError('TIMEOUT', t('errors.network.requestTimedOut'));
  throw error;
};

const bodyInOwnWords = (response: Response): Response =>
  new Proxy(response, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      if (!BODY_METHODS.has(String(property))) return value.bind(target);
      return (...args: unknown[]) => (value.apply(target, args) as Promise<unknown>).catch(inOwnWords);
    },
  });

export function createAuthenticatedFetch() {
  const generation = getSessionGeneration();
  return (input: RequestInfo | URL, init?: RequestInit) =>
    sessionFetch(input, init, generation, true).then(bodyInOwnWords, inOwnWords);
}

export function createSessionReadFetch() {
  const generation = getSessionGeneration();
  return (input: RequestInfo | URL, init?: RequestInit) =>
    sessionFetch(input, init, generation, false).then(bodyInOwnWords, inOwnWords);
}

/**
 * Registers a read that does not go through `gatedFetch` (a native file download) so a server
 * switch aborts it like any other read. Returns false while a switch is running: the read must
 * not begin. Call the returned `release` when the read ends.
 */
export function trackReadRequest(controller: AbortController): { started: boolean; release: () => void } {
  if (operatorSwitching) return { started: false, release: () => {} };
  const request = { controller, mutation: false };
  activeRequests.add(request);
  return { started: true, release: () => void activeRequests.delete(request) };
}

export function beginOperatorSwitch(): boolean {
  if (operatorSwitching || activeMutationOperations > 0 || [...activeRequests].some(request => request.mutation)) return false;
  operatorSwitching = true;
  for (const request of activeRequests) if (!request.mutation) request.controller.abort();
  return true;
}

export function endOperatorSwitch(): void { operatorSwitching = false; }

/** True when a server switch could begin now: no switch running and no write in flight. */
export const isOperatorSwitchFree = (): boolean =>
  !operatorSwitching && activeMutationOperations === 0 && ![...activeRequests].some(request => request.mutation);

export const clearAuthenticatedClientCache = () => {
  __authenticatedClientInstance = undefined;
  __cachedAuthToken = undefined;
};

export const initializeSupabase = (
  url: string,
  anonKey: string
): SupabaseClient => {
  if (
    !__supabaseInstance ||
    __currentConfig?.url !== url ||
    __currentConfig?.anonKey !== anonKey
  ) {
    if (__currentConfig && __currentConfig.url !== url)
      void clearStoredTokens();
    clearAuthenticatedClientCache();
    __currentConfig = { url, anonKey };
    __supabaseInstance = createClient(url, anonKey, {
      global: {
        // Refresh and revocation carry the refresh credential: they wait for
        // foreground identity verification like every other credentialed call,
        // but a server switch signs out through them and must not be refused.
        fetch: (input, init) =>
          gatedFetch(input, init, {
            generation: getSessionGeneration(),
            mutation: true,
            honorSwitch: false,
          }),
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return __supabaseInstance;
};

export const getSupabaseClient = (): SupabaseClient => {
  if (!__supabaseInstance)
    throw new Error(t('errors.server.configNotLoaded'));
  return __supabaseInstance;
};

export const getCurrentConfig = () => {
  if (!__currentConfig) throw new Error(t('errors.server.configNotLoaded'));
  return __currentConfig;
};

export const getSupabaseRPCClient = getSupabaseClient;

export const getAuthenticatedClient = async (): Promise<SupabaseClient> => {
  if (operatorSwitching) throw new AppError('SERVER_SWITCH', t('errors.auth.serverSwitchInProgress'));
  const generation = getSessionGeneration();
  const session = await acquireValidSession();
  if (!session) {
    clearAuthenticatedClientCache();
    // A refresh credential that survived the failed refresh means the failure
    // was transient (offline, timeout), not a definitive rejection: report it
    // as connectivity so callers may serve their offline caches.
    const remaining = await getStoredToken();
    if (generation === getSessionGeneration() && remaining.refreshToken) {
      // Kept in English on purpose: callers outside this module still look for
      // the words "Network request failed" (the image upload services). The
      // code says the same thing to everything that reads codes.
      throw new AppError('NETWORK', 'Network request failed: session refresh unavailable');
    }
    throw new AppError('SIGN_IN_REQUIRED', t('errors.auth.signInRequired'));
  }
  // The session just validated is the one used: no second read of the store.
  if (
    generation !== getSessionGeneration() ||
    session.generation !== generation ||
    operatorSwitching
  )
    throw new AppError('SIGN_IN_REQUIRED', t('errors.auth.signInRequired'));
  if (!__authenticatedClientInstance || __cachedAuthToken !== session.authToken) {
    const config = getCurrentConfig();
    __authenticatedClientInstance = createClient(config.url, config.anonKey, {
      global: {
        headers: { Authorization: 'Bearer ' + session.authToken },
        // Only a write holds a server switch back; a read is aborted by it.
        fetch: (input, init) =>
          sessionFetch(input, init, generation, !isReadRequest(input, init)),
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    __cachedAuthToken = session.authToken;
  }
  return __authenticatedClientInstance;
};

export const getSupabaseWithJWT = getAuthenticatedClient;

const AUTH_RPC_TIMEOUT_MS = 15000;

async function boundedAuthRPC(
  name: string,
  args: Record<string, unknown>,
  generation = getSessionGeneration(),
  timeoutMs = AUTH_RPC_TIMEOUT_MS
) {
  // The anonymous client's fetch is gated as well; waiting here first keeps the
  // refresh credential out of the request until identity verification passes.
  if (!operatorResumeGate.isVerified()) await awaitIdentityGate(generation);
  else if (generation !== getSessionGeneration())
    throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = getSupabaseRPCClient().rpc(name, args);
    const pending =
      typeof request.abortSignal === 'function'
        ? request.abortSignal(controller.signal)
        : request;
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AppError('TIMEOUT', t('errors.network.authTimedOut')));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** A limit the server applied to a sign-in code request or check (backend migration 44). */
export type OtpLimitCode = 'otp_wait' | 'otp_rate_limited' | 'enrollment_limited';

type OperatorEnvelope = {
  success: boolean;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
  /** Set on a refusal the app has its own words for; `error` is then already translated. */
  errorCode?: OtpLimitCode;
  /** How long the server said to wait, when it said (the 60 s resend wait or the 15 minute slow lane). */
  retryAfterSeconds?: number;
};

/** The longest wait the app will count down; anything longer is not a wait the server sends. */
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

/** `retry_after_seconds` of the answer, or its Retry-After header, as whole seconds. */
function retryAfterSecondsOf(response: Response, body: unknown): number | undefined {
  const fromBody = (body as { retry_after_seconds?: unknown } | null)?.retry_after_seconds;
  const fromHeader = typeof response.headers?.get === 'function' ? response.headers.get('Retry-After') : null;
  for (const candidate of [fromBody, fromHeader]) {
    const seconds = typeof candidate === 'number' ? candidate : typeof candidate === 'string' && /^\d+$/.test(candidate.trim()) ? Number(candidate) : NaN;
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
  }
  return undefined;
}

/** "Wait 42 seconds" or "wait 15 minutes" before asking for another code. */
export function otpWaitText(seconds: number): string {
  return seconds < 120
    ? t('errors.auth.otpWaitSeconds', { seconds: localizeDigits(String(seconds)) })
    : t('errors.auth.otpWaitMinutes', { minutes: localizeDigits(String(Math.ceil(seconds / 60))) });
}

/**
 * The limits the sign-in endpoint answers with HTTP 429, in the app's words.
 * The endpoint sends a sentence and no code, so the sentence is what is read.
 */
function otpLimit(status: number, serverError: unknown, retryAfterSeconds: number | undefined): { errorCode: OtpLimitCode; error: string } | undefined {
  if (status !== 429) return undefined;
  const text = typeof serverError === 'string' ? serverError.toLowerCase() : '';
  if (text.includes('new access requests')) return { errorCode: 'enrollment_limited', error: t('errors.auth.enrollmentLimited') };
  if (retryAfterSeconds !== undefined) return { errorCode: 'otp_wait', error: otpWaitText(retryAfterSeconds) };
  if (text.includes('please wait')) return { errorCode: 'otp_wait', error: t('errors.auth.otpWait') };
  return { errorCode: 'otp_rate_limited', error: t('errors.auth.otpTooMany') };
}

/**
 * POST to one of the facility's public sign-in functions (the caller has only
 * the anon key). A facility call: it goes through the gated fetch.
 */
async function operatorFunctionPost(
  path: string,
  body: Record<string, unknown>,
  gate: { mutation: boolean; honorSwitch: boolean },
  generation = getSessionGeneration()
): Promise<{ response: Response; result: OperatorEnvelope & { code?: unknown } }> {
  const { url, anonKey } = getCurrentConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const request = `${url}/functions/v1/${path}`;
    const options: RequestInit = {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    };
    const response = await gatedFetch(request, options, { generation, ...gate });
    const result = (await response.json()) as OperatorEnvelope & { code?: unknown };
    return { response, result };
  } finally {
    clearTimeout(timeout);
  }
}

async function operatorOtpRequest(
  action: 'request' | 'verify' | 'status' | 'signout',
  body: Record<string, unknown>
): Promise<OperatorEnvelope> {
  // Enrollment signout is part of a server switch, so it may run during one.
  const { response, result } = await operatorFunctionPost(`operator-otp/${action}`, body, {
    mutation: action !== 'status',
    honorSwitch: action !== 'signout',
  });
  if (!response.ok || result.success !== true) {
    const retryAfterSeconds = retryAfterSecondsOf(response, result);
    const limit = otpLimit(response.status, result.error || result.message, retryAfterSeconds);
    if (limit) return { success: false, ...limit, retryAfterSeconds };
    return { success: false, error: serverText(result.error || result.message, t('errors.auth.requestFailedHttp', { status: String(response.status) })) };
  }
  return result;
}

export const getPendingEnrollmentToken = () =>
  SecureStore.getItemAsync(SECURE_KEYS.ENROLLMENT_TOKEN);

export const clearPendingEnrollment = () =>
  SecureStore.deleteItemAsync(SECURE_KEYS.ENROLLMENT_TOKEN);

export const getEnrollmentStatus = async () => {
  const enrollmentToken = await getPendingEnrollmentToken();
  if (!enrollmentToken) return { success: false as const, error: t('errors.auth.enrollmentUnavailable') };
  try {
    const result = await operatorOtpRequest('status', { enrollment_token: enrollmentToken });
    if (!result.success) return { success: false as const, error: serverText(result.error, t('errors.auth.enrollmentCheckFailed')) };
    const status = result.data?.status;
    if (!['pending', 'approved', 'rejected', 'disabled'].includes(String(status)))
      return { success: false as const, error: t('errors.auth.enrollmentInvalidStatus') };
    return { success: true as const, status: status as 'pending' | 'approved' | 'rejected' | 'disabled' };
  } catch {
    return { success: false as const, error: t('errors.auth.enrollmentCheckFailed') };
  }
};

export const signOutPendingEnrollment = async () => {
  const enrollmentToken = await getPendingEnrollmentToken();
  try {
    if (enrollmentToken) await operatorOtpRequest('signout', { enrollment_token: enrollmentToken });
  } finally {
    await clearPendingEnrollment();
  }
};

// Request a one-time code from the operator authentication edge function.
export const signInWithPhone = async (phone: string) => {
  const generation = getSessionGeneration();
  try {
    // Format phone number for backend (ensure 12 digits with country code 91)
    let formattedPhone = phone.replace(/^\+/, ''); // Remove + if present

    // If phone doesn't start with 91, add it
    if (!formattedPhone.startsWith('91')) {
      formattedPhone = `91${formattedPhone}`;
    }

    // Check rate limit before sending OTP (persistent, survives app restart)
    const rateLimit = await checkOTPRateLimit(formattedPhone);
    if (!rateLimit.allowed) {
      const retryAfterSec = rateLimit.retryAfterSeconds || 60;
      const reason =
        rateLimit.reason === 'daily'
          ? t('errors.auth.otpDailyLimit')
          : t('errors.auth.otpWaitSeconds', { seconds: localizeDigits(String(retryAfterSec)) });

      console.warn('[Auth] OTP rate limit exceeded:');

      // The wait is returned as a number so the sign-in screens can start their
      // countdown from it (handleRateLimitError(result)) instead of reading it
      // back out of the translated sentence. The daily limit has no countdown,
      // as before: its message is shown as an ordinary error.
      return {
        success: false,
        error: reason,
        rateLimited: true as const,
        rateLimitReason: rateLimit.reason,
        retryAfterSeconds: rateLimit.reason === 'daily' ? undefined : retryAfterSec,
      };
    }

    const responseData = await operatorOtpRequest('request', { phone_number: formattedPhone });
    const isSuccess = responseData.success === true;

    if (isSuccess) {
      // Record successful OTP request for rate limiting
      await recordOTPRequest(formattedPhone);
      if (generation !== getSessionGeneration() || operatorSwitching)
        return { success: false, error: t('errors.auth.sessionChanged') };

      return { success: true, data: responseData };
    } else {
      console.error('[Auth] Send OTP failed:');
      // A limit of the server: its wait (60 seconds, or 15 minutes for a number
      // that has used up its hourly codes) is returned as a number, so the
      // screens count down from it. "Try again later" has no wait to count.
      if (responseData.errorCode) {
        return {
          success: false,
          error: responseData.error ?? t('errors.auth.otpSendFailed'),
          errorCode: responseData.errorCode,
          rateLimited: true as const,
          rateLimitReason: 'server' as const,
          retryAfterSeconds: responseData.retryAfterSeconds,
        };
      }
      const errorMsg = serverText(responseData.error || responseData.message, t('errors.auth.otpSendFailed'));
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error('[Auth] Send OTP exception:');
    return { success: false, error: t('errors.auth.otpSendFailed') };
  }
};

// ============================================================================
// AUTH HELPER FUNCTIONS (extracted for clarity - Issue #9, #28)
// ============================================================================

interface AuthSuccessResult {
  success: true;
  data: {
    session: Session | null;
    user: User | null;
    userProfile: UserProfile | null;
    action: 'login';
    customAuth?: boolean;
    accessToken?: string;
  };
}

interface AuthPendingResult {
  success: true;
  data: { action: 'pending'; pendingEnrollment: true; userProfile: null };
}

interface AuthFailureResult {
  success: false;
  error: string;
  /** Set when `error` is the app's own sentence for a server limit: show it as it is. */
  errorCode?: OtpLimitCode;
}

type AuthResult = AuthSuccessResult | AuthPendingResult | AuthFailureResult;

/**
 * Format phone number to standard format (12 digits with country code 91)
 */
const formatPhoneNumber = (phone: string): string => {
  let formatted = phone.replace(/^\+/, '');
  if (!formatted.startsWith('91')) {
    formatted = `91${formatted}`;
  }
  return formatted;
};

/**
 * S9 Fix: Validate JWT token structure.
 * Whether a token has expired is not judged here: `exp` is on the server's
 * clock, and a token the server has just issued is good whatever the device
 * clock says (see deviceExpiry).
 */
const validateJWTToken = (
  token: string
): { valid: boolean; exp?: number; iat?: number; sub?: string } => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[Auth] Invalid JWT: Expected 3 parts, got');
      return { valid: false };
    }

    // Decode the payload (middle part) - Base64URL decode
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);

    // Check required claims
    if (!payload.exp) {
      console.warn('[Auth] Invalid JWT: Missing exp claim');
      return { valid: false };
    }

    return {
      valid: true,
      exp: payload.exp,
      iat: payload.iat,
      sub: payload.sub,
    };
  } catch (error) {
    console.warn('[Auth] Invalid JWT: Failed to parse token');
    return { valid: false };
  }
};

// With neither `iat` nor `expires_in` and an `exp` the device clock already
// calls past, the token is still used for a short while: the server decides.
const UNKNOWN_LIFETIME_MS = 10 * 60 * 1000;

/**
 * When a token received just now expires, on the device's clock.
 *
 * `exp` and `iat` are both on the server's clock. The token was issued at
 * `iat` and received now, so (now - iat) is how far the device clock is from
 * the server's, and the expiry moves by the same amount. A device that is two
 * hours fast or thirty minutes slow then renews its token at the right moment.
 * The stored expiry is always on the device clock.
 */
export function deviceExpiry(
  claims: { exp?: number; iat?: number },
  session: { expires_in?: unknown },
  receivedAt = Date.now()
): number {
  const exp = Number(claims.exp);
  const iat = Number(claims.iat);
  if (Number.isFinite(exp) && Number.isFinite(iat) && iat > 0 && exp > iat) {
    const clockSkewMs = receivedAt - iat * 1000;
    return exp * 1000 + clockSkewMs;
  }
  const expiresIn = Number(session.expires_in);
  if (Number.isFinite(expiresIn) && expiresIn > 0) return receivedAt + expiresIn * 1000;
  if (Number.isFinite(exp) && exp * 1000 > receivedAt) return exp * 1000;
  return receivedAt + UNKNOWN_LIFETIME_MS;
}

// ============================================================================
// MAIN AUTH FUNCTIONS
// ============================================================================

/**
 * The start of every sign-in at a facility. A session that is still stored
 * (the sign-in screen opened by a link while signed in) is ended on the server
 * too, not only forgotten by this device.
 */
async function startNewSession(): Promise<number> {
  const previous = serializeCredentials(readStoredToken);
  const generation = advanceSessionGeneration();
  await serializeCredentials(clearStoredTokensRaw);
  const replaced = (await previous).refreshToken;
  if (replaced) void revokeSession(replaced);
  return generation;
}

/**
 * What a facility's successful sign-in answer leads to, whichever way the
 * person proved who they are (the facility's SMS code in `operator-otp/verify`,
 * or the association's identity token in `central-exchange`):
 * `action: "pending"` keeps the enrollment token for the waiting screen;
 * `action: "login"` stores the session and caches the profile.
 */
async function completeOperatorSignIn(data: Record<string, unknown>, generation: number): Promise<AuthResult> {
  if (data.action === 'pending') {
    const enrollmentToken = data.enrollment_token;
    if (typeof enrollmentToken !== 'string' || !enrollmentToken)
      return { success: false, error: t('errors.auth.enrollmentInvalidResponse') };
    // Written in the credential queue and checked again afterwards, like storeTokens: a switch
    // that began meanwhile must not leave this facility's enrollment token under the next one.
    const kept = await serializeCredentials(async () => {
      if (generation !== getSessionGeneration()) return false;
      await SecureStore.setItemAsync(SECURE_KEYS.ENROLLMENT_TOKEN, enrollmentToken);
      if (generation === getSessionGeneration()) return true;
      await clearPendingEnrollment().catch(() => {});
      return false;
    });
    if (!kept) return { success: false, error: t('errors.auth.sessionChanged') };
    return { success: true, data: { action: 'pending', pendingEnrollment: true, userProfile: null } };
  }
  if (data.action !== 'login')
    return { success: false, error: t('errors.auth.invalidResponse') };

  // Extract standardized response structure:
  // { success: true, message: "...", data: { user: {...}, session: {...}, action: "..." } }
  const responseData = data as unknown as {
    user: UserProfile;
    session: {
      access_token: string;
      refresh_token: string;
      expires_at: string;
      expires_in: number;
      token_type: string;
    };
    action: string;
  };

  // =========================================================================
  // AUTH: Extract JWT tokens from session object
  // =========================================================================
  const { session, user } = responseData;

  if (!session?.access_token || !session?.refresh_token) {
    console.error('[Auth] No JWT tokens in session object');
    return { success: false, error: t('errors.auth.noTokens') };
  }

  const accessTokenStr = String(session.access_token);
  const refreshTokenStr = String(session.refresh_token);

  // Validate JWT structure and expiration
  const validation = validateJWTToken(accessTokenStr);
  if (!validation.valid) {
    console.error('[Auth] ❌ Invalid JWT token received from backend');
    return { success: false, error: t('errors.auth.invalidToken') };
  }

  // Expiry on the device clock
  const expiresAt = deviceExpiry(validation, session);

  // Store the JWT tokens
  await storeTokens(accessTokenStr, refreshTokenStr, expiresAt, generation);
  lastIssued = { token: accessTokenStr, at: Date.now() };
  await clearPendingEnrollment();

  // Clear cached authenticated client so it picks up the new token
  clearAuthenticatedClientCache();

  // Fetch customer assignments and cache profile with them
  let userProfileWithCustomers = user;
  if (user) {
    try {
      const authClient = await getAuthenticatedClient();
      const { data: customerIds, error: rpcError } = await authClient.rpc(
        'user_accessible_customers'
      );

      if (!rpcError && customerIds) {
        userProfileWithCustomers = {
          ...user,
          assignedCustomerIds: customerIds,
        };
      }
    } catch (err) {
      console.warn('[Auth] Failed to fetch customer assignments:');
    }
    await cacheUserProfile(userProfileWithCustomers, generation);
  }

  if (generation !== getSessionGeneration())
    return { success: false, error: t('errors.auth.sessionChanged') };
  return {
    success: true,
    data: {
      session: null,
      user: null,
      userProfile: userProfileWithCustomers,
      action: 'login',
      customAuth: true,
      accessToken: accessTokenStr,
    },
  };
}

/**
 * OTP verification through the operator authentication edge function.
 *
 * Standardized backend response format:
 * {
 *   success: true,
 *   message: "Login successful",
 *   data: {
 *     user: { id, auth_user_id, name, mobile, role, ... },
 *     session: { access_token, refresh_token, expires_at, ... },
 *     action: "login"
 *   }
 * }
 *
 * @param phone - Phone number to verify
 * @param token - OTP code entered by user
 * @param userName - Optional name for a new pending enrollment
 */
export const verifyOTP = async (
  phone: string,
  token: string,
  userName?: string
): Promise<AuthResult> => {
  const generation = await startNewSession();
  try {
    const formattedPhone = formatPhoneNumber(phone);

    const rpcResponse = await operatorOtpRequest('verify', {
      phone_number: formattedPhone,
      otp_code: token,
      ...(userName ? { name: userName } : {}),
    });

    if (generation !== getSessionGeneration()) {
      const refresh = (rpcResponse.data?.session as { refresh_token?: unknown } | undefined)?.refresh_token;
      if (typeof refresh === 'string') await revokeSession(refresh);
      return { success: false, error: t('errors.auth.sessionChanged') };
    }
    const isSuccess = rpcResponse?.success === true;

    if (!isSuccess || !rpcResponse?.data) {
      console.error('[Auth] OTP verification failed:');
      if (rpcResponse?.errorCode) {
        return { success: false, error: rpcResponse.error ?? t('errors.auth.verificationFailed'), errorCode: rpcResponse.errorCode };
      }
      const errorMsg = serverText(rpcResponse?.error || rpcResponse?.message, t('errors.auth.verificationFailed'));
      return { success: false, error: errorMsg };
    }

    return await completeOperatorSignIn(rpcResponse.data, generation);
  } catch (error) {
    console.error('[Auth] OTP verification exception:');
    return { success: false, error: t('errors.auth.otpVerificationFailed') };
  }
};

/** The `code` of a `central-exchange` refusal (backend docs/CENTRAL_LOGIN.md), and the app's own for no answer. */
export type CentralExchangeCode =
  | 'central_unavailable'
  | 'invalid_identity_token'
  | 'identity_token_used'
  | 'account_unavailable'
  | 'link_required'
  | 'invalid_otp'
  | 'rate_limited'
  | 'identity_conflict'
  | 'enrollment_limited'
  | 'central_keys_unavailable'
  | 'invalid_request'
  | 'unavailable'
  /** No answer from the facility: no connection, or the app gave up waiting. */
  | 'network'
  /** The session was replaced while the answer was on its way. */
  | 'session_changed'
  /** An answer the app cannot use. */
  | 'failed';

const CENTRAL_EXCHANGE_CODES: readonly string[] = [
  'central_unavailable', 'invalid_identity_token', 'identity_token_used', 'account_unavailable', 'link_required',
  'invalid_otp', 'rate_limited', 'identity_conflict', 'enrollment_limited', 'central_keys_unavailable',
  'invalid_request', 'unavailable',
];

export interface CentralExchangeFailure {
  success: false;
  code: CentralExchangeCode;
  /** The wait the facility named with a 429. */
  retryAfterSeconds?: number;
}

export type CentralExchangeResult = AuthSuccessResult | AuthPendingResult | CentralExchangeFailure;

/**
 * Hands the association's identity token for THIS facility to the facility
 * (`POST /functions/v1/central-exchange`, backend migration 49). The answer has
 * the shape of `operator-otp/verify` and is handled by the same code:
 * a session for an approved profile, an enrollment token for a request that
 * waits. `otpCode` is the facility's own SMS code, sent only to link a profile
 * that existed here before (the answer to `link_required`).
 *
 * Every token is spent by the call, whatever the answer: the caller asks the
 * central service for a fresh one each time. The token is never logged.
 */
export const exchangeCentralIdentity = async (
  identityToken: string,
  options?: { otpCode?: string }
): Promise<CentralExchangeResult> => {
  const generation = await startNewSession();
  try {
    const { response, result } = await operatorFunctionPost(
      'central-exchange',
      { identity_token: identityToken, ...(options?.otpCode ? { otp_code: options.otpCode } : {}) },
      { mutation: true, honorSwitch: true },
      generation
    );
    if (generation !== getSessionGeneration()) {
      const refresh = (result?.data?.session as { refresh_token?: unknown } | undefined)?.refresh_token;
      if (typeof refresh === 'string') await revokeSession(refresh);
      return { success: false, code: 'session_changed' };
    }
    if (!response.ok || result?.success !== true || !result.data) {
      const code = typeof result?.code === 'string' && CENTRAL_EXCHANGE_CODES.includes(result.code)
        ? (result.code as CentralExchangeCode)
        : response.status === 429 ? 'rate_limited' : 'failed';
      const retryAfterSeconds = response.status === 429 ? retryAfterSecondsOf(response, result) : undefined;
      return { success: false, code, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
    }
    // A session that could not be stored is not a lost connection.
    const completed = await completeOperatorSignIn(result.data, generation).catch(() => null);
    if (completed?.success) return completed;
    return { success: false, code: generation !== getSessionGeneration() ? 'session_changed' : 'failed' };
  } catch (error) {
    if (isGateSignal(error) || getAppErrorCode(error) === 'SESSION_CHANGED') return { success: false, code: 'session_changed' };
    return { success: false, code: 'network' };
  }
};

// Sign out helper - clear stored tokens and Supabase session
export const signOut = async (options?: { localOnly?: boolean }) => {
  // Queue the read before invalidating pending work; preserve the credential for
  // server revocation while local cleanup proceeds independently of the network.
  // Discovery of a replacement at the same URL must never disclose the old
  // refresh credential to the new instance through a revocation request.
  const storedPromise = options?.localOnly ? undefined : serializeCredentials(readStoredToken);
  advanceSessionGeneration();
  const cleanup = serializeCredentials(async () => {
    const cleared = await clearEndedSession();
    await clearSecureSessionMarker();
    return cleared;
  });
  const stored = await storedPromise;
  const cleared = await cleanup;
  if (stored?.refreshToken) await revokeSession(stored.refreshToken);
  // `success` says whether this phone really removed the session from its secure storage.
  return { success: cleared };
};

/**
 * Ends the stored session (run inside the credential queue): the sign-out marker first, then
 * the session keys; the marker is removed once they are all gone. True when they are. If not,
 * the marker stays and the next start removes the session (readStoredToken).
 */
async function clearEndedSession(): Promise<boolean> {
  let digest: string | null = null;
  try {
    const refreshToken = await SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
    if (refreshToken) digest = digestOf(refreshToken);
  } catch {
    digest = '*';
  }
  let marked = false;
  if (digest !== null) {
    try {
      await SecureStore.setItemAsync(SECURE_KEYS.SIGNED_OUT, digest);
      marked = true;
    } catch {
      // Without the marker the clear below is still tried; its result is what is reported.
    }
  }
  const cleared = await clearStoredTokensRaw();
  if (cleared && marked) await SecureStore.deleteItemAsync(SECURE_KEYS.SIGNED_OUT).catch(() => {});
  return cleared;
}

async function revokeSession(refreshToken: string) {
  try {
    await boundedAuthRPC('logout_session', { p_refresh_token: refreshToken });
  } catch {
    console.warn(
      '[Auth] Server logout unavailable; local credentials cleared.'
    );
  }
}

// ============================================================================
// CUSTOM JWT TOKEN REFRESH
// ============================================================================

const sessionRejectedMessage = () => t('errors.auth.sessionEnded');

// Backend contract: refresh_jwt_token answers every definitive rejection with
// a data payload {success:false, message:'Invalid refresh token'}; the only
// definitive exception is issue_session's RAISE 'Session expired' (P0001).
// Every other PostgREST error is transport and keeps the credential.
export const isDefinitiveRefreshException = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'P0001' &&
  (error as { message?: unknown }).message === 'Session expired';

export const isDefinitiveRefreshRejection = (payload: unknown): boolean =>
  typeof payload === 'object' &&
  payload !== null &&
  (payload as { success?: unknown }).success === false;

// The Redux store depends on this module; resolve it lazily, as the service
// error handler does, so a rejected refresh can end the Redux session too.
function dispatchForcedLogout(reason: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { store } = require('@/store') as typeof import('@/store');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { forceLogoutOnInvalidToken } = require('@/store/slices/authSlice') as typeof import('@/store/slices/authSlice');
    store.dispatch(forceLogoutOnInvalidToken(reason));
  } catch {
    console.warn('[Auth] Forced logout could not be dispatched.');
  }
}

// One forced logout per rejected session generation: the credential is cleared
// first so no later refresh can resend it, then Redux ends the session.
// A refused refresh token is also reported to the server (best effort):
// logout_session ends the session the token belonged to, so a copy of a later
// token of that session stops working.
let rejectedGeneration = -1;
async function rejectSession(generation: number, reason: string, refusedRefreshToken?: string): Promise<void> {
  if (generation !== getSessionGeneration() || rejectedGeneration === generation) return;
  rejectedGeneration = generation;
  clearRefreshRetry();
  await clearStoredTokens();
  dispatchForcedLogout(reason);
  if (refusedRefreshToken) void revokeSession(refusedRefreshToken);
}

/**
 * Refresh custom JWT tokens using the stored refresh token.
 * Calls backend RPC to get new access/refresh tokens.
 *
 * @returns New token data if successful, null if refresh failed
 */
type RefreshedSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
let refreshInFlight: {
  generation: number;
  promise: Promise<RefreshedSession | null>;
} | null = null;

// A refresh whose answer is lost (the app gave up waiting, or the connection
// dropped) may have rotated the token on the server. The server answers a
// repeat of the same token with the same successor only inside its grace
// period (refresh_grace_seconds, 60 by default); after that the stored token is
// refused and the person is signed out. So the same token is sent again at
// once, and if that fails too, a few more times in the background while the
// grace period can still be running. The stored session is never touched by a
// connectivity failure, and no caller waits for the background attempts.
const REFRESH_REPEAT_TIMEOUT_MS = 5000;
export const REFRESH_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000] as const;
export const REFRESH_RETRY_WINDOW_MS = 50 * 1000;
let refreshRetry: {
  generation: number;
  token: string;
  /** When the first unanswered refresh of this token was sent. */
  since: number;
  attempt: number;
  timer?: ReturnType<typeof setTimeout>;
} | null = null;

function clearRefreshRetry(): void {
  if (refreshRetry?.timer) clearTimeout(refreshRetry.timer);
  refreshRetry = null;
}

function scheduleRefreshRetry(generation: number, token: string, sentAt: number): void {
  if (refreshRetry && (refreshRetry.generation !== generation || refreshRetry.token !== token)) clearRefreshRetry();
  const state = refreshRetry ?? (refreshRetry = { generation, token, since: sentAt, attempt: 0 });
  if (state.timer) return;
  const delay = REFRESH_RETRY_DELAYS_MS[state.attempt];
  if (delay === undefined || Date.now() + delay - state.since > REFRESH_RETRY_WINDOW_MS) {
    clearRefreshRetry();
    return;
  }
  state.attempt += 1;
  state.timer = setTimeout(() => {
    state.timer = undefined;
    void (async () => {
      if (refreshRetry !== state || generation !== getSessionGeneration()) return;
      // Another request may have renewed the session meanwhile.
      const stored = await getStoredToken();
      if (refreshRetry !== state) return;
      if (stored.refreshToken !== token) return clearRefreshRetry();
      await refreshCustomJWT();
    })();
  }, delay);
  // Under Node (tests) a waiting attempt must not keep the process alive.
  (state.timer as { unref?: () => void }).unref?.();
}

// Raised inside the gated fetch and turned into text by the PostgREST client:
// not connectivity, so not a reason to send the refresh token again.
const isGateSignal = (error: unknown): boolean =>
  /session changed|identity verification/i.test(String((error as { message?: unknown } | null)?.message ?? ''));
export const refreshCustomJWT = (): Promise<RefreshedSession | null> => {
  const generation = getSessionGeneration();
  if (refreshInFlight?.generation === generation)
    return refreshInFlight.promise;
  const promise = refreshSession(generation).finally(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  });
  refreshInFlight = { generation, promise };
  return promise;
};
const refreshSession = async (
  generation: number
): Promise<RefreshedSession | null> => {
  try {
    // Get stored refresh token from SecureStore
    let { refreshToken } = await getStoredToken();

    if (!refreshToken || generation !== getSessionGeneration()) {
      return null;
    }

    const sentAt = Date.now();
    // One immediate repeat per token: a background attempt is itself a repeat.
    let repeated = refreshRetry?.generation === generation && refreshRetry.token === refreshToken;
    let successorTried = false;
    for (;;) {
      // Call backend RPC to refresh tokens
      let answer: { data: unknown; error: unknown };
      try {
        answer = await boundedAuthRPC(
          'refresh_jwt_token',
          { p_refresh_token: refreshToken },
          generation,
          // The repeat gets a short limit: the server answers it from what it
          // stored, and a start of the app must not wait twice as long.
          repeated ? REFRESH_REPEAT_TIMEOUT_MS : AUTH_RPC_TIMEOUT_MS
        );
      } catch (error) {
        if (getAppErrorCode(error) !== 'TIMEOUT' || generation !== getSessionGeneration()) throw error;
        // A refresh the app gave up waiting for: the same token is sent once
        // more, then left to the background attempts.
        if (!repeated) {
          repeated = true;
          continue;
        }
        scheduleRefreshRetry(generation, refreshToken, sentAt);
        return null;
      }
      const { data, error } = answer;
      // Handle array response from RPC
      const responseData = (Array.isArray(data) ? data[0] : data) as
        | { success?: unknown; access_token?: unknown; refresh_token?: unknown; expires_in?: unknown }
        | null
        | undefined;

      if (generation !== getSessionGeneration()) {
        if (responseData?.success && responseData.refresh_token)
          await revokeSession(String(responseData.refresh_token));
        return null;
      }
      if (error && isGatewayKeyRejection(error)) {
        // A gateway key rejection is definitive: the keys were rotated.
        console.error('[Auth] Token refresh RPC error:');
        await rejectSession(generation, keysChangedMessage());
        return null;
      }
      // Only the backend's definitive rejection ends the device session; a
      // transport or serialization failure keeps the credential for retry.
      const refused = error
        ? isDefinitiveRefreshException(error)
        : (!responseData?.success || !responseData?.access_token) &&
          isDefinitiveRefreshRejection(responseData);
      if (refused) {
        // The stored token may no longer be the one that was refused: another
        // refresh can have stored its successor meanwhile. Look before ending
        // the session.
        const current = await getStoredToken();
        if (generation !== getSessionGeneration()) return null;
        if (current.refreshToken && current.refreshToken !== refreshToken) {
          if (current.authToken && current.expiresAt && current.isValid)
            return {
              accessToken: current.authToken,
              refreshToken: current.refreshToken,
              expiresAt: current.expiresAt,
            };
          if (!successorTried) {
            successorTried = true;
            refreshToken = current.refreshToken;
            continue;
          }
        }
        console.error('[Auth] Token refresh failed:');
        await rejectSession(generation, sessionRejectedMessage(), refreshToken);
        return null;
      }
      if (error) {
        console.error('[Auth] Token refresh RPC error:');
        if (isGateSignal(error)) return null;
        // No answer, or one that is not the server's decision: the token is
        // kept and sent again, like after a timeout.
        if (!repeated) {
          repeated = true;
          continue;
        }
        scheduleRefreshRetry(generation, refreshToken, sentAt);
        return null;
      }

      // A success without both tokens is not stored: the old refresh token is
      // never paired with a new access token, and nothing stored is replaced
      // by half an answer.
      const validation =
        responseData?.success === true &&
        typeof responseData.access_token === 'string' &&
        typeof responseData.refresh_token === 'string' &&
        responseData.refresh_token
          ? validateJWTToken(responseData.access_token)
          : { valid: false };
      if (!validation.valid) {
        console.error('[Auth] Token refresh answer is incomplete');
        return null;
      }
      const newAccessToken = String(responseData!.access_token);
      const newRefreshToken = String(responseData!.refresh_token);

      // Expiry on the device clock
      const expiresAt = deviceExpiry(validation, responseData!);

      // Store the new tokens
      await storeTokens(newAccessToken, newRefreshToken, expiresAt, generation);
      lastIssued = { token: newAccessToken, at: Date.now() };
      clearRefreshRetry();

      // Clear cached authenticated client so it picks up new token
      clearAuthenticatedClientCache();

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt,
      };
    }
  } catch (error) {
    console.error('[Auth] Token refresh exception:');
    return null;
  }
};

/** A stored session that is usable now, and the session generation it belongs to. */
export type ValidSession = {
  authToken: string;
  refreshToken: string;
  expiresAt: number;
  generation: number;
};

/**
 * The stored session, renewed first when its access token is expired or about
 * to expire. Null when there is no usable session (none stored, the renewal
 * failed and the stored token has expired, or the session changed meanwhile).
 * Callers use the returned token directly instead of reading the store again.
 */
export const acquireValidSession = async (): Promise<ValidSession | null> => {
  try {
    const generation = getSessionGeneration();
    const tokenData = await getStoredToken();
    const usable = (stored: typeof tokenData): ValidSession | null =>
      stored.authToken && stored.refreshToken && stored.expiresAt
        ? {
            authToken: stored.authToken,
            refreshToken: stored.refreshToken,
            expiresAt: stored.expiresAt,
            generation,
          }
        : null;

    // JWT tokens - check if we need to refresh
    if (tokenData.type === 'jwt') {
      const expiresAt = tokenData.expiresAt || 0;
      const now = Date.now();

      // Token still valid with its renew-ahead margin
      if (expiresAt > now + renewAheadMs(tokenData.authToken)) {
        return usable(tokenData);
      }
      // A token issued within the last minute is used, not renewed again: with
      // a lifetime the margin cannot be read from, every request would
      // otherwise rotate the session.
      const issued = lastIssued;
      if (
        tokenData.isValid &&
        issued !== undefined &&
        issued.token === tokenData.authToken &&
        Math.abs(now - issued.at) < JUST_ISSUED_MS
      ) {
        return usable(tokenData);
      }

      // Token expired or about to expire - try refresh

      const refreshResult = await refreshCustomJWT();

      if (refreshResult) {
        // The renewed session is used only by the session that asked for it.
        return generation === getSessionGeneration()
          ? {
              authToken: refreshResult.accessToken,
              refreshToken: refreshResult.refreshToken,
              expiresAt: refreshResult.expiresAt,
              generation,
            }
          : null;
      }

      // Refresh failed - tokens are invalid

      // A temporary network error must not destroy an otherwise unexpired session.
      const remaining = await getStoredToken();
      return remaining.isValid && remaining.authToken ? usable(remaining) : null;
    }

    return null;
  } catch (error) {
    console.error('[Auth] ensureValidTokens error:');
    return null;
  }
};

/**
 * Check if stored tokens are expired and try to refresh them
 *
 * @returns true if tokens are valid (or were successfully refreshed), false otherwise
 */
export const ensureValidTokens = async (): Promise<boolean> =>
  (await acquireValidSession()) !== null;

// Session Management (supports both JWT tokens and session markers)
// S2/S3 Fix: Now uses SecureStore for encrypted token storage
const readStoredToken = async (): Promise<{
  authToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  isValid: boolean;
  type?: 'jwt' | 'session';
}> => {
  try {
    // S2/S3 Fix: First check SecureStore for tokens
    let authToken = await SecureStore.getItemAsync(SECURE_KEYS.AUTH_TOKEN);
    let refreshToken = await SecureStore.getItemAsync(
      SECURE_KEYS.REFRESH_TOKEN
    );
    let expiresAtStr = await SecureStore.getItemAsync(
      SECURE_KEYS.TOKEN_EXPIRES
    );
    // A session that an earlier sign-out could not remove is removed now and stays signed out.
    // A marker for another session, or with no session, is old and is removed.
    const marker = await SecureStore.getItemAsync(SECURE_KEYS.SIGNED_OUT);
    if (marker != null) {
      if (refreshToken && (marker === '*' || marker === digestOf(refreshToken))) {
        if (await clearStoredTokensRaw()) await SecureStore.deleteItemAsync(SECURE_KEYS.SIGNED_OUT).catch(() => {});
        return { isValid: false };
      }
      if (!authToken && !refreshToken) await SecureStore.deleteItemAsync(SECURE_KEYS.SIGNED_OUT).catch(() => {});
    }
    const operator = getActiveOperatorServer();
    if (operator && authToken) {
      const identity = await SecureStore.getItemAsync(SECURE_KEYS.OPERATOR_IDENTITY);
      if (identity !== `${operator.origin}|${operator.instanceId}`) {
        await clearStoredTokensRaw();
        return { isValid: false };
      }
    }

    // Migration: If no tokens in SecureStore, check AsyncStorage and migrate
    if (!operator && (!authToken || !refreshToken)) {
      const legacyAuthToken = await AsyncStorage.getItem('auth_token');
      const legacyRefreshToken = await AsyncStorage.getItem('refresh_token');
      const legacyExpiresAt = await AsyncStorage.getItem('token_expires_at');

      if (legacyAuthToken && legacyRefreshToken) {
        // Decode legacy tokens and migrate to SecureStore
        authToken = decodeToken(legacyAuthToken);
        refreshToken = decodeToken(legacyRefreshToken);
        expiresAtStr = legacyExpiresAt;

        // Never use legacy credentials until secure persistence succeeds.
        await storeTokensRaw(authToken, refreshToken, Number(expiresAtStr));
      }
    }

    if (authToken && refreshToken) {
      const expires = Number(expiresAtStr);
      // Expiry is written last as the completion marker. Reject partial writes.
      if (!Number.isFinite(expires) || expires <= 0) return { isValid: false };
      const now = Date.now();

      // Expired access tokens still carry a usable refresh token. Never delete it here.
      return {
        authToken,
        refreshToken,
        expiresAt: expires,
        isValid: expires > now,
        type: 'jwt',
      };
    }

    return { isValid: false };
  } catch {
    console.error('[Auth] Unable to read a securely persisted session.');
    return { isValid: false };
  }
};

type StoredToken = Awaited<ReturnType<typeof readStoredToken>>;

// Reads that start together share one queued read. A caller joins the read in
// flight only when nothing has been queued after it (credentialQueueStamp), the
// session generation and the selected server are the same: its own read would
// have come next in the queue and found the same values. The slot is emptied
// as soon as the read settles; nothing is kept. Sign-in (startNewSession) and
// sign-out queue their own reads and never share.
let sharedRead: {
  generation: number;
  stamp: number;
  operator: string;
  promise: Promise<StoredToken>;
} | null = null;
const operatorKey = (): string => {
  const operator = getActiveOperatorServer();
  return operator ? `${operator.origin}|${operator.instanceId}` : '';
};

export const getStoredToken = async (): Promise<StoredToken> => {
  const generation = getSessionGeneration();
  const operator = operatorKey();
  let slot = sharedRead;
  if (
    !slot ||
    slot.generation !== generation ||
    slot.stamp !== credentialQueueStamp() ||
    slot.operator !== operator
  ) {
    const promise = serializeCredentials(readStoredToken);
    const own = { generation, stamp: credentialQueueStamp(), operator, promise };
    sharedRead = slot = own;
    const release = () => {
      if (sharedRead === own) sharedRead = null;
    };
    void promise.then(release, release);
  }
  const stored = await slot.promise;
  // Every caller checks its own generation and gets its own copy.
  return generation === getSessionGeneration()
    ? { ...stored }
    : ({ isValid: false } as StoredToken);
};

// Read-only compatibility for migrating old sessions; never encode new tokens.
const decodeToken = (encoded: string): string => {
  try {
    // Check if it looks like base64 (contains only valid base64 characters)
    // Valid JWT tokens have periods, so if it has a period, it's likely already decoded/plain
    if (encoded.includes('.') || /^[a-f0-9]{64}$/i.test(encoded)) {
      return encoded; // Already a plain JWT token
    }
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    // Fallback for legacy plain-text tokens during migration
    return encoded;
  }
};

// Expiry is the completion marker for the three SecureStore values. Invalidate it
// before replacing either token, then write it only after the pair is persisted.
const storeTokensRaw = async (
  accessToken: string,
  refreshToken: string,
  expiresAt: number
) => {
  try {
    if (
      !accessToken ||
      !refreshToken ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= 0
    ) {
      throw new Error(t('errors.auth.incompleteSession'));
    }
    clearAuthenticatedClientCache();
    await SecureStore.deleteItemAsync(SECURE_KEYS.TOKEN_EXPIRES);
    await AsyncStorage.multiRemove([
      'auth_token',
      'refresh_token',
      'token_expires_at',
    ]);
    await SecureStore.setItemAsync(SECURE_KEYS.AUTH_TOKEN, accessToken);
    await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    const operator = getActiveOperatorServer();
    if (operator) await SecureStore.setItemAsync(SECURE_KEYS.OPERATOR_IDENTITY, `${operator.origin}|${operator.instanceId}`);
    await SecureStore.setItemAsync(
      SECURE_KEYS.TOKEN_EXPIRES,
      expiresAt.toString()
    );
    // A sign-out marker of an earlier session is not this one's. If it cannot be removed it is
    // overwritten with an empty value, which matches no session (a `*` marker would end this one).
    try {
      await SecureStore.deleteItemAsync(SECURE_KEYS.SIGNED_OUT);
    } catch {
      await SecureStore.setItemAsync(SECURE_KEYS.SIGNED_OUT, '');
    }
  } catch {
    // Never downgrade to unencrypted storage or log native errors that may echo
    // the value being written. Login/refresh must fail when persistence fails.
    await clearStoredTokensRaw();
    throw new Error(t('errors.auth.saveSessionFailed'));
  }
};

export const storeTokens = (
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  expectedGeneration?: number
) => {
  const generation = expectedGeneration ?? advanceSessionGeneration();
  return serializeCredentials(async () => {
    if (generation !== getSessionGeneration())
      throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
    await storeTokensRaw(accessToken, refreshToken, expiresAt);
    if (generation !== getSessionGeneration()) {
      await clearStoredTokensRaw();
      throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
    }
  });
};

export const clearStoredTokens = () => {
  advanceSessionGeneration();
  return serializeCredentials(clearStoredTokensRaw);
};

// Clear all stored tokens
// S2/S3 Fix: Clears from both SecureStore and AsyncStorage
const clearStoredTokensRaw = async (): Promise<boolean> => {
  clearAuthenticatedClientCache();
  // True only when every session key was really deleted (a delete that rejects is retried once).
  let all = true;
  const remove = async (key: string) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await SecureStore.deleteItemAsync(key);
        return;
      } catch {
        // tried once more, then reported
      }
    }
    all = false;
  };
  for (const key of [
    SECURE_KEYS.AUTH_TOKEN,
    SECURE_KEYS.REFRESH_TOKEN,
    SECURE_KEYS.TOKEN_EXPIRES,
    SECURE_KEYS.OPERATOR_IDENTITY,
    // Obsolete alternate helper used this expiry spelling.
    'secure_token_expires_at',
    'cached_user_profile',
  ])
    await remove(key);
  try {
    // Also clear any legacy tokens from AsyncStorage
    await AsyncStorage.multiRemove([
      'auth_token',
      'refresh_token',
      'token_expires_at',
      'cached_user_profile',
      'session_marker',
    ]);
  } catch (error) {
    console.error('[Auth] Error clearing tokens:');
  }
  return all;
};

/// S8 Fix: Cache TTL for user profile - using centralized config
const PROFILE_CACHE_TTL_MS = CACHE_DURATION_LONG_MS;

interface CachedProfile {
  profile: unknown;
  cachedAt: number;
  scope: string;
}

// Get cached user profile
// S8 Fix: Now uses SecureStore with TTL validation
export const getCachedUserProfile = async () => {
  const generation = getSessionGeneration();
  try {
    const scope = await profileScope();
    if (!scope || generation !== getSessionGeneration()) return null;
    // Try SecureStore first
    const cached = await SecureStore.getItemAsync('cached_user_profile');
    if (cached) {
      const parsed: CachedProfile = JSON.parse(cached);
      // Validate TTL
      if (
        parsed.scope === scope &&
        Date.now() >= parsed.cachedAt &&
        Date.now() - parsed.cachedAt < PROFILE_CACHE_TTL_MS
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let profile = parsed.profile as any;

        // If cached profile is missing assignedCustomerIds, fetch them
        if (profile && !profile.assignedCustomerIds) {
          try {
            const authClient = await getAuthenticatedClient();
            const { data: customerIds, error: rpcError } = await authClient.rpc(
              'user_accessible_customers'
            );

            if (!rpcError && customerIds) {
              profile = { ...profile, assignedCustomerIds: customerIds };
              // Update cache with customer assignments
              await cacheUserProfile(profile, generation);
            }
          } catch (err) {
            console.warn(
              '[Auth] Failed to fetch customer assignments for cached profile:'
            );
          }
        }

        return generation === getSessionGeneration() ? profile : null;
      } else {
        // Cache expired, clean up
        await SecureStore.deleteItemAsync('cached_user_profile');
      }
    }

    // A profile cache timeout is not a session timeout. Reload the active profile
    // through RLS instead of discarding a still-refreshable login.
    return await loadUserProfile(generation, false);
  } catch (error) {
    console.error('[Auth] Error getting cached profile:');
  }
  return null;
};

// The signed-in person's profile and customer assignments as the server has
// them now; the result replaces the cached copy. `strict` gives nothing when
// the assignments could not be read, instead of a profile without any.
async function loadUserProfile(generation: number, strict: boolean) {
  const client = await getAuthenticatedClient();
  const stored = await getStoredToken();
  const subject = stored.authToken
    ? validateJWTToken(stored.authToken).sub
    : undefined;
  if (!subject) return null;
  const { data: profile, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('auth_user_id', subject)
    .eq('active', true)
    .single();
  if (error || !profile) return null;
  const { data: customerIds, error: customersError } = await client.rpc('user_accessible_customers');
  if (customersError && strict) return null;
  const result = { ...profile, assignedCustomerIds: customerIds || [] };
  await cacheUserProfile(result, generation);
  return generation === getSessionGeneration() ? result : null;
}

/**
 * Reads the profile from the server after a start from the cached copy, so a
 * role or customer assignment the facility changed shows without a new
 * sign-in. Null when the server could not be asked; the cached copy stays.
 */
export const reloadUserProfile = async () => {
  try {
    return await loadUserProfile(getSessionGeneration(), true);
  } catch {
    return null;
  }
};

// Decode JWT claims without validating expiry; callers decide what to accept.
const decodeClaims = (token: string): Record<string, unknown> | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
};

export type SessionIdentity = { origin: string; instanceId: string; subject: string };

// Identity of the signed-in session on the selected server, for scoping local
// caches. Null without a selected server or a stored session: no scope, no cache.
export const getSessionIdentity = async (): Promise<SessionIdentity | null> => {
  const operator = getActiveOperatorServer();
  if (!operator) return null;
  const stored = await getStoredToken();
  if (!stored.authToken) return null;
  const subject = decodeClaims(stored.authToken)?.sub;
  if (typeof subject !== 'string' || !subject) return null;
  return { origin: operator.origin, instanceId: operator.instanceId, subject };
};

// Store user profile in cache
// S8 Fix: Now uses SecureStore with TTL tracking
async function profileScope(): Promise<string | null> {
  const stored = await getStoredToken();
  if (!stored.authToken || !stored.isValid) return null;
  const claims = decodeClaims(stored.authToken);
  if (!claims?.sub || !claims.session_id) return null;
  try {
    return JSON.stringify([
      getCurrentConfig().url,
      claims.sub,
      claims.session_id,
    ]);
  } catch {
    return null;
  }
}

export const cacheUserProfile = async (
  profile: unknown,
  generation = getSessionGeneration()
) => {
  const scope = await profileScope();
  if (!scope || generation !== getSessionGeneration()) return;
  const subject = JSON.parse(scope)[1];
  if (
    !profile ||
    typeof profile !== 'object' ||
    !('auth_user_id' in profile) ||
    profile.auth_user_id !== subject
  )
    return;
  await serializeCredentials(async () => {
    if (generation !== getSessionGeneration()) return;
    try {
      const entry: CachedProfile = { profile, cachedAt: Date.now(), scope };
      await SecureStore.setItemAsync(
        'cached_user_profile',
        JSON.stringify(entry)
      );
    } catch {
      /* Profile caching is optional; never persist an unscoped fallback. */
    }
  });
};

// Export types for convenience
export type { User, Session } from '@supabase/supabase-js';
