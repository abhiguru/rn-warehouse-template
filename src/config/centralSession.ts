/**
 * The central session: who the person is at the association's identity
 * service (docs/CENTRAL_LOGIN.md). The contract for every call here is the
 * central service's docs/API.md.
 *
 * Kept apart from a facility session on purpose:
 * - its own SecureStore keys (prefix `secure_central_`), never the `secure_*`
 *   keys of src/config/supabaseConfig.ts, and that file never reads these;
 * - plain `fetch` with a time limit and `redirect: 'error'`. These calls go to
 *   the association, not to a facility, so they do not pass through
 *   `gatedFetch`: a server switch or a facility identity check must neither
 *   hold them back nor end them.
 *
 * Nothing here logs a token, a code or a full phone number.
 */
import * as SecureStore from 'expo-secure-store';
import { getCentralLoginConfig, type CentralLoginConfig } from './envConfig';
import { getCentralState, setCentralState, type CentralUser } from './centralState';
import { localizeDigits, t } from '@/i18n';

export const CENTRAL_SECURE_KEYS = {
  ACCESS_TOKEN: 'secure_central_access_token',
  REFRESH_TOKEN: 'secure_central_refresh_token',
  /** Written last: the completion marker of the three session values. */
  ACCESS_EXPIRES: 'secure_central_access_expires',
  USER: 'secure_central_user',
} as const;

/** How long a central call may wait for its answer. */
export const CENTRAL_REQUEST_TIMEOUT_MS = 15000;
/** The access token (15 minutes) is replaced this long before it expires. */
const RENEW_AHEAD_MS = 60 * 1000;
/** A failed refresh is repeated only this soon after it was sent (the service's grace is 10 s). */
export const REFRESH_REPEAT_WINDOW_MS = 8000;
/** A secure store that did not answer at start is read again this much later. */
export const RESTORE_RETRY_MS = 2000;
/** The catalogue may be reused for this long (the service says `max-age=600`). */
const CATALOGUE_CACHE_MS = 10 * 60 * 1000;
/** The longest wait the app will name; anything longer is not a wait the service sends. */
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

export type CentralErrorCode =
  | 'not_configured'
  | 'network'
  | 'timeout'
  | 'unavailable'
  | 'resend_wait'
  | 'rate_limited'
  | 'invalid_code'
  | 'too_many_attempts'
  | 'sms_unavailable'
  | 'unknown_facility'
  | 'invalid_request'
  | 'session_ended'
  | 'catalogue_invalid'
  | 'failed';

export type CentralFailure = {
  ok: false;
  code: CentralErrorCode;
  /** In the app's language, ready to show. */
  message: string;
  /** The wait the service named with a 429. */
  retryAfterSeconds?: number;
};
export type CentralResult<T> = ({ ok: true } & T) | CentralFailure;

export type CatalogueFacility = {
  id: string;
  name: string;
  city: string;
  /** The value sent as `audience` and the facility's server address. */
  origin: string;
  operator: string;
};

type StoredSession = { accessToken: string; refreshToken: string; expiresAt: number };

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const waitText = (seconds: number, perSecond: 'errors.auth.otpWaitSeconds' | 'central.errors.rateLimitedSeconds', perMinute: 'errors.auth.otpWaitMinutes' | 'central.errors.rateLimitedMinutes'): string =>
  seconds < 120
    ? t(perSecond, { seconds: localizeDigits(String(seconds)) })
    : t(perMinute, { minutes: localizeDigits(String(Math.ceil(seconds / 60))) });

/** The app's sentence for a failure of a central call. */
export function centralErrorMessage(code: CentralErrorCode, retryAfterSeconds?: number): string {
  switch (code) {
    case 'resend_wait':
      return retryAfterSeconds
        ? waitText(retryAfterSeconds, 'errors.auth.otpWaitSeconds', 'errors.auth.otpWaitMinutes')
        : t('errors.auth.otpWait');
    case 'rate_limited':
      return retryAfterSeconds
        ? waitText(retryAfterSeconds, 'central.errors.rateLimitedSeconds', 'central.errors.rateLimitedMinutes')
        : t('central.errors.rateLimited');
    case 'invalid_code':
      return t('central.errors.invalidCode');
    case 'too_many_attempts':
      return t('central.errors.tooManyAttempts');
    case 'sms_unavailable':
      return t('central.errors.smsUnavailable');
    case 'unknown_facility':
      return t('central.errors.unknownFacility');
    case 'invalid_request':
      return t('central.errors.invalidRequest');
    case 'session_ended':
      return t('central.errors.sessionEnded');
    case 'catalogue_invalid':
      return t('central.errors.catalogueInvalid');
    case 'network':
    case 'timeout':
      return t('central.errors.network');
    case 'not_configured':
    case 'unavailable':
    case 'failed':
    default:
      return t('central.errors.unavailable');
  }
}

const failure = (code: CentralErrorCode, retryAfterSeconds?: number): CentralFailure => ({
  ok: false,
  code,
  message: centralErrorMessage(code, retryAfterSeconds),
  ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
});

/** The stable `code` of an error answer, mapped to what the app distinguishes. */
function codeOf(status: number, serviceCode: unknown): CentralErrorCode {
  switch (serviceCode) {
    case 'resend_wait':
    case 'rate_limited':
    case 'invalid_code':
    case 'too_many_attempts':
    case 'sms_unavailable':
    case 'unknown_facility':
      return serviceCode;
    case 'invalid_request':
    case 'invalid_json':
    case 'payload_too_large':
    case 'unsupported_media_type':
      return 'invalid_request';
    case 'invalid_token':
    case 'invalid_refresh_token':
      return 'session_ended';
    case 'timeout':
    case 'unavailable':
    case 'internal_error':
      return 'unavailable';
    default:
      if (status === 429) return 'rate_limited';
      if (status === 401) return 'session_ended';
      return status >= 500 ? 'unavailable' : 'failed';
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

type Answer =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'error'; status: number; serviceCode: unknown; retryAfterSeconds?: number }
  | { kind: 'transport'; code: 'network' | 'timeout' | 'not_configured' };

function retryAfterOf(response: Response): number | undefined {
  const header = typeof response.headers?.get === 'function' ? response.headers.get('Retry-After') : null;
  if (typeof header !== 'string' || !/^\d+$/.test(header.trim())) return undefined;
  const seconds = Number(header);
  return seconds > 0 ? Math.min(seconds, MAX_RETRY_AFTER_SECONDS) : undefined;
}

async function centralFetch(
  config: CentralLoginConfig | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: { body?: Record<string, unknown>; accessToken?: string } = {}
): Promise<Answer> {
  if (!config) return { kind: 'transport', code: 'not_configured' };
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
    // The race ends the wait even when the platform's fetch does not settle on abort.
    const response = await Promise.race([
      fetch(`${config.origin}${path}`, {
        method,
        headers,
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
        redirect: 'error',
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error('Request timeout'));
          controller.abort();
        }, CENTRAL_REQUEST_TIMEOUT_MS);
        // Under Node (tests) a waiting request must not keep the process alive.
        (timer as { unref?: () => void }).unref?.();
      }),
    ]);
    // React Native follows redirects whatever `redirect` says. Where the final
    // address is known, an answer from another origin is not the service's.
    if (response.url && !response.url.startsWith(`${config.origin}/`)) return { kind: 'transport', code: 'network' };
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const serviceCode = (body as { error?: { code?: unknown } } | null)?.error?.code;
      return { kind: 'error', status: response.status, serviceCode, retryAfterSeconds: retryAfterOf(response) };
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return { kind: 'error', status: response.status, serviceCode: undefined };
    return { kind: 'ok', body: body as Record<string, unknown> };
  } catch {
    return { kind: 'transport', code: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

const failureOf = (answer: Exclude<Answer, { kind: 'ok' }>): CentralFailure =>
  answer.kind === 'transport'
    ? failure(answer.code)
    : failure(codeOf(answer.status, answer.serviceCode), answer.retryAfterSeconds);

// ---------------------------------------------------------------------------
// Stored session
// ---------------------------------------------------------------------------

/** Moves on at every sign-in and sign-out; an answer for an older epoch is dropped. */
let epoch = 0;
let writes: Promise<unknown> = Promise.resolve();
const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = writes.then(operation, operation);
  writes = result.catch(() => {});
  return result;
};

function parseUser(value: unknown): CentralUser | null {
  const user = value as { id?: unknown; phone_number?: unknown; name?: unknown; created_at?: unknown } | null;
  if (!user || typeof user !== 'object' || typeof user.id !== 'string' || !user.id || typeof user.phone_number !== 'string')
    return null;
  return {
    id: user.id,
    phoneNumber: user.phone_number,
    name: typeof user.name === 'string' && user.name ? user.name : null,
    createdAt: typeof user.created_at === 'string' ? user.created_at : '',
  };
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const binary = atob(segment.replace(/-/g, '+').replace(/_/g, '/'));
    // The payload is UTF-8 (a facility name may be written in Gujarati).
    const text = decodeURIComponent(
      Array.from(binary, char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    );
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * When an access token received just now expires, on the device's clock.
 * `iat` and `exp` are on the service's clock; the token was issued at `iat`
 * and received now, so the difference is how far the device clock is off.
 */
function deviceExpiry(session: { access_token: string; access_expires_at?: unknown }, receivedAt: number): number {
  const claims = decodeSegment(session.access_token.split('.')[1] ?? '');
  const exp = Number(claims?.exp);
  const iat = Number(claims?.iat);
  if (Number.isFinite(exp) && Number.isFinite(iat) && iat > 0 && exp > iat) return exp * 1000 + (receivedAt - iat * 1000);
  const stated = typeof session.access_expires_at === 'string' ? Date.parse(session.access_expires_at) : NaN;
  if (Number.isFinite(stated) && stated > receivedAt) return stated;
  // No lifetime that can be read: the service's 15 minutes.
  return receivedAt + 15 * 60 * 1000;
}

function parseSession(value: unknown, receivedAt: number): StoredSession | null {
  const session = value as { access_token?: unknown; refresh_token?: unknown; access_expires_at?: unknown } | null;
  if (!session || typeof session.access_token !== 'string' || !session.access_token) return null;
  if (typeof session.refresh_token !== 'string' || !session.refresh_token) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: deviceExpiry({ access_token: session.access_token, access_expires_at: session.access_expires_at }, receivedAt),
  };
}

/**
 * The stored session, or null when there is none. `UNREADABLE` when the secure
 * store did not answer: that is not "no session", and nothing is decided on it.
 */
const UNREADABLE = Symbol('unreadable');
type ReadSession = StoredSession | null | typeof UNREADABLE;

async function readSession(): Promise<ReadSession> {
  try {
    const accessToken = await SecureStore.getItemAsync(CENTRAL_SECURE_KEYS.ACCESS_TOKEN);
    const refreshToken = await SecureStore.getItemAsync(CENTRAL_SECURE_KEYS.REFRESH_TOKEN);
    const expires = Number(await SecureStore.getItemAsync(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES));
    // The expiry is written last; without it the pair is a write that did not finish.
    if (!accessToken || !refreshToken || !Number.isFinite(expires) || expires <= 0) return null;
    return { accessToken, refreshToken, expiresAt: expires };
  } catch {
    return UNREADABLE;
  }
}

async function writeSession(session: StoredSession): Promise<void> {
  await SecureStore.deleteItemAsync(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES);
  await SecureStore.setItemAsync(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, session.accessToken);
  await SecureStore.setItemAsync(CENTRAL_SECURE_KEYS.REFRESH_TOKEN, session.refreshToken);
  await SecureStore.setItemAsync(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, String(session.expiresAt));
}

async function writeUser(user: CentralUser): Promise<void> {
  await SecureStore.setItemAsync(CENTRAL_SECURE_KEYS.USER, JSON.stringify(user));
}

async function clearStored(): Promise<void> {
  for (const key of Object.values(CENTRAL_SECURE_KEYS)) await SecureStore.deleteItemAsync(key).catch(() => {});
}

/** Forget the session on this device. `message` is shown once on central sign-in. */
async function endLocally(message: string | null): Promise<void> {
  epoch += 1;
  catalogueCache = null;
  setCentralState({
    status: 'signedOut',
    user: null,
    signInPhone: null,
    endedMessage: message,
    facilitySmsOrigin: null,
    opening: null,
    outcome: null,
    pendingLink: null,
  });
  await serialize(clearStored);
}

function readStoredUser(text: string | null): CentralUser | null {
  try {
    const parsed = text ? (JSON.parse(text) as CentralUser) : null;
    return parsed && typeof parsed.id === 'string' && typeof parsed.phoneNumber === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Reads the stored session at start. No network: an expired access token is
 * replaced when the first call needs it. A session with a refresh token counts
 * as signed in; the service has the last word on the first call.
 */
let restoreRetry: ReturnType<typeof setTimeout> | undefined;
let restorePending = false;
/** The one timed retry has been used; after it only the foreground retries remain. */
let restoreRetried = false;

/**
 * A start whose secure-store read failed is tried again once shortly after,
 * and once more when the app next comes to the foreground, before a sign-in is
 * asked for: one keystore hiccup must not cost a new sign-in and an SMS.
 */
export async function retryCentralRestoreIfNeeded(): Promise<void> {
  if (!restorePending) return;
  await restoreCentralSession();
}

export async function restoreCentralSession(): Promise<void> {
  if (!getCentralLoginConfig()) {
    setCentralState({ status: 'signedOut', user: null });
    return;
  }
  if (restoreRetry) {
    clearTimeout(restoreRetry);
    restoreRetry = undefined;
  }
  const started = epoch;
  const [session, userText] = await serialize(
    async (): Promise<[ReadSession, string | null | typeof UNREADABLE]> => [
      await readSession(),
      await SecureStore.getItemAsync(CENTRAL_SECURE_KEYS.USER).catch(() => UNREADABLE),
    ]
  );
  if (started !== epoch) return;
  if (session === UNREADABLE || userText === UNREADABLE) {
    // The store did not answer: nothing stored is touched, and a session already
    // in memory is kept. Until something is known the guard treats the person
    // as signed out; the store is read again shortly, on the next foreground,
    // and on the next call.
    if (getCentralState().status === 'unknown') setCentralState({ status: 'signedOut', user: null });
    if (getCentralState().status !== 'signedIn') {
      restorePending = true;
      if (!restoreRetried) {
        restoreRetried = true;
        restoreRetry = setTimeout(() => {
          restoreRetry = undefined;
          void restoreCentralSession();
        }, RESTORE_RETRY_MS);
        // Under Node (tests) a waiting retry must not keep the process alive.
        (restoreRetry as { unref?: () => void }).unref?.();
      }
    }
    return;
  }
  restorePending = false;
  restoreRetried = false;
  const user = readStoredUser(userText);
  if (session && user) setCentralState({ status: 'signedIn', user });
  else {
    setCentralState({ status: 'signedOut', user: null });
    if (session || userText) await serialize(clearStored);
  }
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

/** Ten digits, or `91` / `+91` and ten digits: the forms the service accepts. */
const phoneForService = (phone: string): string => phone.replace(/\D/g, '');

/** `POST /v1/otp/request`: sends a six-digit code by SMS. */
export async function requestCentralCode(
  phone: string
): Promise<CentralResult<{ resendAfterSeconds: number; expiresAt: string | null }>> {
  const answer = await centralFetch(getCentralLoginConfig(), 'POST', '/v1/otp/request', {
    body: { phone_number: phoneForService(phone) },
  });
  if (answer.kind !== 'ok') return failureOf(answer);
  const wait = Number(answer.body.resend_after_seconds);
  return {
    ok: true,
    resendAfterSeconds: Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 60,
    expiresAt: typeof answer.body.expires_at === 'string' ? answer.body.expires_at : null,
  };
}

/** `POST /v1/otp/verify`: checks the code and starts the central session. */
export async function verifyCentralCode(
  phone: string,
  code: string,
  termsVersion: string
): Promise<CentralResult<{ user: CentralUser }>> {
  const started = ++epoch;
  const answer = await centralFetch(getCentralLoginConfig(), 'POST', '/v1/otp/verify', {
    body: { phone_number: phoneForService(phone), otp_code: code, terms_version: termsVersion },
  });
  if (answer.kind !== 'ok') return failureOf(answer);
  const user = parseUser(answer.body.user);
  const session = parseSession(answer.body.session, Date.now());
  if (!user || !session) return failure('failed');
  if (started !== epoch) return failure('failed');
  try {
    await serialize(async () => {
      await writeSession(session);
      await writeUser(user);
    });
  } catch {
    // Never keep a session that could not be stored securely.
    await serialize(clearStored);
    return failure('failed');
  }
  if (started !== epoch) return failure('failed');
  setCentralState({ status: 'signedIn', user, endedMessage: null });
  return { ok: true, user };
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

type RefreshOutcome = { kind: 'ok'; session: StoredSession } | { kind: 'refused' } | { kind: 'unavailable'; failure: CentralFailure };

/**
 * One refresh at a time. The service revokes the whole session family when a
 * refresh token is presented again more than a short grace period (10 seconds)
 * after its first use, so two callers must never each send the stored token:
 * the second one waits for the first.
 */
type RefreshFailure = { kind: 'unavailable'; failure: CentralFailure };
const unreadable = (): RefreshFailure => ({ kind: 'unavailable', failure: failure('unavailable') });
let refreshInFlight: { epoch: number; promise: Promise<RefreshOutcome> } | null = null;

export function refreshCentralSession(): Promise<RefreshOutcome> {
  if (refreshInFlight?.epoch === epoch) return refreshInFlight.promise;
  const started = epoch;
  const promise = runRefresh(started).finally(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  });
  refreshInFlight = { epoch: started, promise };
  return promise;
}

async function runRefresh(started: number): Promise<RefreshOutcome> {
  const stored = await serialize(readSession);
  if (started !== epoch) return { kind: 'unavailable', failure: failure('session_ended') };
  if (stored === UNREADABLE) return unreadable();
  if (!stored) {
    await endLocally(null);
    return { kind: 'refused' };
  }
  const send = () =>
    centralFetch(getCentralLoginConfig(), 'POST', '/v1/session/refresh', { body: { refresh_token: stored.refreshToken } });
  const sentAt = Date.now();
  let answer = await send();
  // A connection failure gets one immediate repeat of the same token: the
  // service may have rotated it and lost the answer, and it answers a repeat
  // with a new session only within 10 seconds of the first use. The repeat is
  // sent only while the first send is clearly inside that window; a request
  // the app gave up waiting for, or a connection that was reset late, is
  // already outside it, and a repeat would count as reuse and revoke the
  // family.
  if (answer.kind === 'transport' && answer.code === 'network' && Date.now() - sentAt < REFRESH_REPEAT_WINDOW_MS && started === epoch)
    answer = await send();
  if (started !== epoch) return { kind: 'unavailable', failure: failure('session_ended') };
  if (answer.kind === 'transport') return { kind: 'unavailable', failure: failureOf(answer) };
  if (answer.kind === 'error') {
    // The service's definitive word: the refresh token is unknown, expired,
    // revoked or was used before (401), or is not a refresh token at all (400).
    // Everything else (429, 5xx) keeps the session for a later attempt.
    if (answer.status === 401 || answer.status === 400) {
      await endLocally(centralErrorMessage('session_ended'));
      return { kind: 'refused' };
    }
    return { kind: 'unavailable', failure: failureOf(answer) };
  }
  // A success without both tokens is not stored: nothing stored is replaced by half an answer.
  const session = parseSession(answer.body.session, Date.now());
  if (!session) return { kind: 'unavailable', failure: failure('unavailable') };
  try {
    await serialize(() => writeSession(session));
  } catch {
    // The old refresh token is spent and the new one could not be kept.
    await endLocally(centralErrorMessage('session_ended'));
    return { kind: 'refused' };
  }
  if (started !== epoch) return { kind: 'unavailable', failure: failure('session_ended') };
  return { kind: 'ok', session };
}

/** A usable access token: the stored one, or a new one when it is about to expire. */
async function accessToken(): Promise<{ token: string } | CentralFailure> {
  if (!getCentralLoginConfig()) return failure('not_configured');
  const stored = await serialize(readSession);
  if (stored === UNREADABLE) return failure('unavailable');
  if (stored && stored.expiresAt - Date.now() > RENEW_AHEAD_MS) return { token: stored.accessToken };
  if (!stored && getCentralState().status !== 'signedIn') return failure('session_ended');
  const refreshed = await refreshCentralSession();
  if (refreshed.kind === 'ok') return { token: refreshed.session.accessToken };
  if (refreshed.kind === 'refused') return failure('session_ended');
  return refreshed.failure;
}

/** A call that needs sign-in: refreshes ahead of expiry, and once when the service answers 401. */
async function signedCall(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<{ kind: 'ok'; body: Record<string, unknown> } | CentralFailure> {
  const config = getCentralLoginConfig();
  const first = await accessToken();
  if ('ok' in first) return first;
  let answer = await centralFetch(config, method, path, { body, accessToken: first.token });
  if (answer.kind === 'error' && answer.status === 401) {
    // Another call may have replaced the token while this one was in flight.
    const current = await serialize(readSession);
    let next: string | null = current && current !== UNREADABLE && current.accessToken !== first.token ? current.accessToken : null;
    if (!next) {
      const refreshed = await refreshCentralSession();
      if (refreshed.kind === 'refused') return failure('session_ended');
      if (refreshed.kind === 'unavailable') return refreshed.failure;
      next = refreshed.session.accessToken;
    }
    answer = await centralFetch(config, method, path, { body, accessToken: next });
    if (answer.kind === 'error' && answer.status === 401) {
      // A fresh token refused as well: the session has ended at the service.
      await endLocally(centralErrorMessage('session_ended'));
      return failure('session_ended');
    }
  }
  if (answer.kind !== 'ok') return failureOf(answer);
  return answer;
}

// ---------------------------------------------------------------------------
// Signed-in calls
// ---------------------------------------------------------------------------

async function keepUser(user: CentralUser, started: number): Promise<void> {
  if (started !== epoch) return;
  setCentralState({ user });
  await serialize(() => writeUser(user)).catch(() => {});
}

/** `GET /v1/me`. */
export async function fetchCentralProfile(): Promise<CentralResult<{ user: CentralUser }>> {
  const started = epoch;
  const answer = await signedCall('GET', '/v1/me');
  if ('ok' in answer) return answer;
  const user = parseUser(answer.body.user);
  if (!user) return failure('unavailable');
  await keepUser(user, started);
  return { ok: true, user };
}

/** `PATCH /v1/me`: sets the name (1 to 80 characters). */
export async function updateCentralName(name: string): Promise<CentralResult<{ user: CentralUser }>> {
  const started = epoch;
  const answer = await signedCall('PATCH', '/v1/me', { name: name.trim() });
  if ('ok' in answer) return answer;
  const user = parseUser(answer.body.user);
  if (!user) return failure('unavailable');
  await keepUser(user, started);
  return { ok: true, user };
}

/**
 * `DELETE /v1/me`: deletes the person at the central service and every session
 * of that person. Each facility keeps its own profile and records. On success
 * the device forgets the central session; the caller removes the person's
 * device-local facility list (centralFacilities.ts) with the returned id.
 */
export async function deleteCentralAccount(): Promise<CentralResult<{ userId: string | null }>> {
  const userId = getCentralState().user?.id ?? null;
  const answer = await signedCall('DELETE', '/v1/me');
  if ('ok' in answer) return answer;
  await endLocally(null);
  return { ok: true, userId };
}

/** `POST /v1/facility-token`: a token for one facility, valid for a few minutes and usable once. */
export async function requestFacilityToken(audience: string): Promise<CentralResult<{ identityToken: string }>> {
  const answer = await signedCall('POST', '/v1/facility-token', { audience });
  if ('ok' in answer) return answer;
  const token = answer.body.identity_token;
  if (typeof token !== 'string' || !token) return failure('unavailable');
  return { ok: true, identityToken: token };
}

/**
 * `POST /v1/session/signout`, then forget the session on this device. The
 * device is signed out whatever the service answers: without a connection the
 * family lives on at the service until its refresh token expires.
 */
export async function signOutCentral(): Promise<void> {
  const config = getCentralLoginConfig();
  const stored = await serialize(readSession);
  await endLocally(null);
  if (!stored || stored === UNREADABLE || !config) return;
  let token = stored.accessToken;
  if (stored.expiresAt <= Date.now()) {
    // The revocation needs an access token; an expired one is replaced first.
    // The new refresh token is never stored: the family is about to be revoked.
    const refreshed = await centralFetch(config, 'POST', '/v1/session/refresh', {
      body: { refresh_token: stored.refreshToken },
    });
    const session = refreshed.kind === 'ok' ? parseSession(refreshed.body.session, Date.now()) : null;
    if (!session) return;
    token = session.accessToken;
  }
  await centralFetch(config, 'POST', '/v1/session/signout', { accessToken: token });
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

let catalogueCache: { at: number; facilities: CatalogueFacility[] } | null = null;

/**
 * A bare lower-case `https://` origin: host and optional port, nothing else.
 * Written as a pattern on purpose: React Native's `URL` does not validate, so
 * `new URL(x).origin === x` would let a query or a user name through.
 */
const FACILITY_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/;
const isFacilityOrigin = (origin: unknown): origin is string => typeof origin === 'string' && FACILITY_ORIGIN.test(origin);

/**
 * Reads the facility catalogue out of its token.
 *
 * KNOWN LIMIT: the signature is NOT verified here. The token is signed with
 * ES256 and Hermes has no ES256 (no WebCrypto), so the app checks only what it
 * can read: the header `typ` and `alg`, the issuer and the expiry. What
 * protects the catalogue for now is the transport: TLS to the origin this
 * build was configured with. A facility backend, not the app, is what decides
 * access, and it verifies its own tokens with the key set.
 */
export function readCatalogueToken(token: unknown, issuer: string, now = Date.now()): CatalogueFacility[] | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = decodeSegment(parts[0]);
  const claims = decodeSegment(parts[1]);
  if (!header || !claims) return null;
  if (header.typ !== 'facility-catalogue+jwt' || header.alg !== 'ES256') return null;
  if (claims.iss !== issuer) return null;
  const exp = Number(claims.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
  if (!Array.isArray(claims.facilities)) return null;
  const seen = new Set<string>();
  const facilities: CatalogueFacility[] = [];
  for (const entry of claims.facilities as unknown[]) {
    const item = entry as { id?: unknown; name?: unknown; city?: unknown; origin?: unknown; operator?: unknown } | null;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim()) continue;
    if (!isFacilityOrigin(item.origin) || seen.has(item.origin)) continue;
    seen.add(item.origin);
    facilities.push({
      id: item.id,
      name: item.name.trim(),
      city: typeof item.city === 'string' ? item.city.trim() : '',
      origin: item.origin,
      operator: typeof item.operator === 'string' ? item.operator.trim() : '',
    });
  }
  return facilities;
}

/** `GET /v1/facilities`: the association's list of member facilities. */
export async function fetchFacilityCatalogue(
  options: { force?: boolean } = {}
): Promise<CentralResult<{ facilities: CatalogueFacility[] }>> {
  const config = getCentralLoginConfig();
  if (!config) return failure('not_configured');
  if (!options.force && catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_CACHE_MS && Date.now() >= catalogueCache.at)
    return { ok: true, facilities: catalogueCache.facilities };
  const answer = await centralFetch(config, 'GET', '/v1/facilities');
  if (answer.kind !== 'ok') return failureOf(answer);
  const facilities = readCatalogueToken(answer.body.catalogue, config.issuer);
  if (!facilities) return failure('catalogue_invalid');
  catalogueCache = { at: Date.now(), facilities };
  return { ok: true, facilities };
}

/** Tests only. */
export function resetCentralSessionForTests(): void {
  epoch += 1;
  refreshInFlight = null;
  catalogueCache = null;
  writes = Promise.resolve();
  restorePending = false;
  restoreRetried = false;
  if (restoreRetry) clearTimeout(restoreRetry);
  restoreRetry = undefined;
}
