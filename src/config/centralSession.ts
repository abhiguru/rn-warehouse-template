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
import { digestOf } from '@/utils/tokenDigest';
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

/**
 * Written when the session is ended on this device and removed once all four keys are gone:
 * a short digest of the refresh token that was being removed, or `*` when it could not be read.
 * A start that finds it next to a session with that refresh token (or `*`) removes the session
 * again and stays signed out, so a sign-out whose deletions failed cannot sign the person back
 * in at the next start. Not one of the four session keys on purpose.
 */
export const CENTRAL_SIGNED_OUT_KEY = 'secure_central_signed_out';

/** How long a central call may wait for its answer. */
export const CENTRAL_REQUEST_TIMEOUT_MS = 15000;
/** The access token (15 minutes) is replaced this long before it expires. */
const RENEW_AHEAD_MS = 60 * 1000;
/** A secure store that did not answer at start is read again this much later. */
export const RESTORE_RETRY_MS = 2000;
/**
 * The catalogue may be reused for this long. It carries whether each facility was reachable a
 * minute ago (central service 0.8.0, `max-age=30`), so it is not kept for long; pull to refresh
 * and "Try again" ask the service again at once.
 */
const CATALOGUE_CACHE_MS = 60 * 1000;
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

/**
 * One member of the association's list (central service docs/API.md). A catalogue from before
 * central service 0.8.0 sends only `id`, `name`, `city`, `origin` and `operator`; the other
 * fields then take the value that shows nothing (no district, no availability).
 */
export type CatalogueFacility = {
  id: string;
  name: string;
  /** The same place as `town` (the service's older name for it). */
  city: string;
  town: string;
  /** '' when the catalogue names none. */
  district: string;
  /**
   * The value sent as `audience` and the facility's server address. null: a member with no
   * app server yet, listed so people can find it, never added or opened.
   */
  origin: string | null;
  operator: string;
  /**
   * Whether the association's service reached the facility at its last check (about once a
   * minute). null: not reported (an older catalogue, or a member with no app server).
   */
  online: boolean | null;
  /** When the service last reached the facility (ISO 8601); null: never, or not reported. */
  lastSeenAt: string | null;
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
  options: { body?: Record<string, unknown>; accessToken?: string; headers?: Record<string, string> } = {}
): Promise<Answer> {
  if (!config) return { kind: 'transport', code: 'not_configured' };
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const headers: Record<string, string> = { ...options.headers, Accept: 'application/json' };
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

/** The person an access token was issued for (`sub`, the central user id), or null when it cannot be read. */
function subjectOf(accessToken: string): string | null {
  const sub = decodeSegment(accessToken.split('.')[1] ?? '')?.sub;
  return typeof sub === 'string' && sub ? sub : null;
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

/**
 * Moves on at every write or removal of the stored token pair (NOT at a write of the user
 * alone: that never changes whose pair is stored). A refresh notes it when it reads the
 * stored pair and writes its answer only if it has not moved since (`stillStored`).
 */
let sessionRevision = 0;

async function writeSession(session: StoredSession): Promise<void> {
  sessionRevision += 1;
  await SecureStore.deleteItemAsync(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES);
  await SecureStore.setItemAsync(CENTRAL_SECURE_KEYS.ACCESS_TOKEN, session.accessToken);
  await SecureStore.setItemAsync(CENTRAL_SECURE_KEYS.REFRESH_TOKEN, session.refreshToken);
  await SecureStore.setItemAsync(CENTRAL_SECURE_KEYS.ACCESS_EXPIRES, String(session.expiresAt));
}

async function writeUser(user: CentralUser): Promise<void> {
  await SecureStore.setItemAsync(CENTRAL_SECURE_KEYS.USER, JSON.stringify(user));
}

/** Deletes one key, and tries once more if that fails. True when the deletion succeeded. */
async function removeKey(key: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch {
      // tried once more, then reported
    }
  }
  return false;
}

/** Removes the four keys. True only when every one of them was removed. */
async function clearStored(): Promise<boolean> {
  sessionRevision += 1;
  let all = true;
  for (const key of Object.values(CENTRAL_SECURE_KEYS)) if (!(await removeKey(key))) all = false;
  return all;
}

/**
 * Ends the stored session (run inside the queue): the sign-out marker first, then the four
 * keys; the marker is removed again once all four are gone. True when all four are gone. If
 * they are not, the marker stays and the next start removes them (restoreCentralSession).
 */
async function clearEnded(): Promise<boolean> {
  let refreshToken: string | null | typeof UNREADABLE;
  try {
    refreshToken = await SecureStore.getItemAsync(CENTRAL_SECURE_KEYS.REFRESH_TOKEN);
  } catch {
    refreshToken = UNREADABLE;
  }
  let marked = false;
  if (refreshToken !== null) {
    try {
      await SecureStore.setItemAsync(CENTRAL_SIGNED_OUT_KEY, refreshToken === UNREADABLE ? '*' : digestOf(refreshToken));
      marked = true;
    } catch {
      // Without the marker the clear below is still tried; its result is what is reported.
    }
  }
  const cleared = await clearStored();
  if (cleared && marked) await removeKey(CENTRAL_SIGNED_OUT_KEY);
  return cleared;
}

/** Forget the person in memory. `message` is shown once on central sign-in. */
function forgetInMemory(message: string | null): void {
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
}

/** Forget the session on this device. True when the four keys were removed. */
async function endLocally(message: string | null): Promise<boolean> {
  forgetInMemory(message);
  return serialize(clearEnded);
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
 * A token pair is another person's when its access token names (`sub`) someone other than the
 * stored user: a pair written under the wrong user, which no call may use for that user.
 */
const pairOfAnother = (session: StoredSession, user: CentralUser): boolean => {
  const subject = subjectOf(session.accessToken);
  return subject !== null && subject !== user.id;
};

/** True when any of the three token keys holds a value: with no whole session, that is a leftover. */
async function anyTokenKeyStored(): Promise<boolean> {
  try {
    for (const key of [CENTRAL_SECURE_KEYS.ACCESS_TOKEN, CENTRAL_SECURE_KEYS.REFRESH_TOKEN, CENTRAL_SECURE_KEYS.ACCESS_EXPIRES])
      if ((await SecureStore.getItemAsync(key)) !== null) return true;
    return false;
  } catch {
    // The store stopped answering: nothing is removed on a guess.
    return false;
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
  const [session, userText] = await serialize(async (): Promise<[ReadSession, string | null | typeof UNREADABLE]> => {
    const found = await readSession();
    const foundUserText: string | null | typeof UNREADABLE = await SecureStore.getItemAsync(
      CENTRAL_SECURE_KEYS.USER
    ).catch((): typeof UNREADABLE => UNREADABLE);
    if (started !== epoch || found === UNREADABLE || foundUserText === UNREADABLE) return [found, foundUserText];
    // The sign-out marker (CENTRAL_SIGNED_OUT_KEY): a session that an earlier sign-out could not
    // remove is removed now, and the person stays signed out. A marker for another session, or
    // with no session at all, is old: it is removed and the rules below apply.
    const marker: string | null | typeof UNREADABLE = await SecureStore.getItemAsync(CENTRAL_SIGNED_OUT_KEY).catch(
      (): typeof UNREADABLE => UNREADABLE
    );
    if (marker === UNREADABLE) return [UNREADABLE, foundUserText];
    if (marker !== null) {
      if (found && (marker === '*' || marker === digestOf(found.refreshToken))) {
        await clearEnded();
        return [null, null];
      }
      await removeKey(CENTRAL_SIGNED_OUT_KEY);
    }
    // A leftover (a session without a user, a user without a session, a user that cannot be
    // read, a token pair whose access token names another person than the stored user, or some
    // token keys but not a whole session) is removed, all four keys, in the same queued
    // operation as the read that found it: no sign-in can store a session between the read and
    // the removal. Not when a sign-in or a sign-out has begun since this start, nor when the
    // store did not answer.
    const foundUser = readStoredUser(foundUserText);
    if (!(found && foundUser && !pairOfAnother(found, foundUser)) && (found || foundUserText || (await anyTokenKeyStored()))) {
      await clearStored();
      return [null, null];
    }
    return [found, foundUserText];
  });
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
  else setCentralState({ status: 'signedOut', user: null });
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
  // Decided and carried out in ONE queued operation: no other reader or writer of
  // the store runs between the check, the write, the second check and the undo.
  const stored = await serialize(async () => {
    // Overtaken before the write (also while waiting in the queue): nothing is written.
    if (started !== epoch) return false;
    let written = true;
    try {
      await writeSession(session);
      await writeUser(user);
    } catch {
      // Never keep a session that could not be stored securely.
      written = false;
    }
    // A sign-out marker of an earlier session is not this one's (and would not match it at
    // the next start anyway). Removed after the first write, never before it. If it cannot be
    // removed it is overwritten with an empty value, which matches no session: a `*` marker
    // (an earlier sign-out that could not read its token) would otherwise end this new
    // session at its first refresh.
    if (written && !(await removeKey(CENTRAL_SIGNED_OUT_KEY)))
      await SecureStore.setItemAsync(CENTRAL_SIGNED_OUT_KEY, '').catch(() => {});
    if (written && started === epoch) {
      setCentralState({ status: 'signedIn', user, endedMessage: null });
      return true;
    }
    // The write failed, or a newer check or a sign-out began during it. This check
    // wrote (or began to write) all four keys, and no later writer has run yet:
    // removing them here cannot remove anyone else's.
    await clearEnded();
    // Its write replaced whatever was stored before: memory must not go on claiming that session.
    if (getCentralState().status === 'signedIn') setCentralState({ status: 'signedOut', user: null });
    return false;
  });
  return stored ? { ok: true, user } : failure('failed');
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

type RefreshOutcome = { kind: 'ok'; session: StoredSession } | { kind: 'refused' } | { kind: 'unavailable'; failure: CentralFailure };

/**
 * One refresh at a time. The service revokes the whole session family when a
 * refresh token is presented a second time, so two callers must never each
 * send the stored token: the second one waits for the first. A caller that
 * comes after a sign-in step began (the epoch moved, also for a code check that
 * then fails) cannot share the running refresh's answer, so it waits for it to
 * end and refreshes after it, with whatever the store holds by then.
 */
type RefreshFailure = { kind: 'unavailable'; failure: CentralFailure };
const unreadable = (): RefreshFailure => ({ kind: 'unavailable', failure: failure('unavailable') });
let refreshInFlight: { epoch: number; promise: Promise<RefreshOutcome> } | null = null;
/**
 * The refresh token the last refresh request carried, and the pair it was answered with (null:
 * no usable pair). Sign-out reads it: a token a refresh has already exchanged for a new pair is
 * not sent again.
 */
let lastRefresh: { sent: string; session: StoredSession | null } | null = null;

export function refreshCentralSession(): Promise<RefreshOutcome> {
  if (refreshInFlight?.epoch === epoch) return refreshInFlight.promise;
  const key = epoch;
  const earlier = refreshInFlight?.promise;
  // It runs for the epoch that is current when it begins, which is later than now if it waits.
  const run = earlier ? earlier.then(() => undefined, () => undefined).then(() => runRefresh(epoch)) : runRefresh(epoch);
  const promise = run.finally(() => {
    if (refreshInFlight?.promise === promise) refreshInFlight = null;
  });
  refreshInFlight = { epoch: key, promise };
  return promise;
}

/**
 * Whether the stored pair is still the one a refresh read (run inside the queue): nothing has
 * written or removed the pair since (`seen` is the revision of that read), and the stored
 * refresh token is the one it sent. A read that fails with the revision unchanged counts as
 * yes: nothing has written or removed anything since.
 */
async function stillStored(seen: number, sent: string): Promise<boolean> {
  if (sessionRevision !== seen) return false;
  try {
    return (await SecureStore.getItemAsync(CENTRAL_SECURE_KEYS.REFRESH_TOKEN)) === sent;
  } catch {
    return true;
  }
}

/**
 * True when the sign-out marker names this session (run inside the queue): it was ended on this
 * device and only its deletion failed. `UNREADABLE` when the marker cannot be read: whether the
 * session was ended is then not known, and nothing is sent on it.
 */
async function endedHere(session: StoredSession): Promise<boolean | typeof UNREADABLE> {
  try {
    const marker = await SecureStore.getItemAsync(CENTRAL_SIGNED_OUT_KEY);
    return marker === '*' || marker === digestOf(session.refreshToken);
  } catch {
    return UNREADABLE;
  }
}

async function runRefresh(started: number): Promise<RefreshOutcome> {
  // A session ended on this device whose deletion failed is no session: its refresh token is
  // not sent, and no new pair can replace the one the marker names (the next start removes it).
  const [stored, seen] = await serialize(async (): Promise<readonly [ReadSession, number]> => {
    const found = await readSession();
    const ended = found && found !== UNREADABLE ? await endedHere(found) : false;
    return [ended === UNREADABLE ? UNREADABLE : ended ? null : found, sessionRevision] as const;
  });
  if (started !== epoch) return { kind: 'unavailable', failure: failure('session_ended') };
  if (stored === UNREADABLE) return unreadable();
  if (!stored) {
    // An empty store ends a session only if the app says there is one: a refresh that began
    // while a sign-out was running (or waited behind another and began during the next
    // sign-in) finds the store empty because nobody is signed in, and ending "the session" then
    // would cancel the sign-in that has begun, or the phone number on its code step.
    if (getCentralState().status === 'signedIn') await endLocally(null);
    return { kind: 'refused' };
  }
  // The refresh token is sent exactly once. The service revokes the whole
  // family when a token is presented a second time, whatever the reason, so a
  // lost answer is never repeated: the session is kept and the next need
  // refreshes again, which the service then treats as reuse and the person
  // signs in again. That is the price of never sending a token twice.
  const answer = await centralFetch(getCentralLoginConfig(), 'POST', '/v1/session/refresh', {
    body: { refresh_token: stored.refreshToken },
  });
  // A success without both tokens is not stored: nothing stored is replaced by half an answer.
  const session = answer.kind === 'ok' ? parseSession(answer.body.session, Date.now()) : null;
  lastRefresh = { sent: stored.refreshToken, session };
  // Only a refusal or a failure is dropped when a sign-in or a sign-out has begun since
  // this refresh did: they would end or leave alone a session that is not the one that was
  // asked about. A new token pair is never dropped for that reason (below): it is the only
  // copy of the session this refresh spent.
  if (answer.kind !== 'ok' && started !== epoch) return { kind: 'unavailable', failure: failure('session_ended') };
  if (answer.kind === 'transport') return { kind: 'unavailable', failure: failureOf(answer) };
  if (answer.kind === 'error') {
    // The service's definitive word: the refresh token is unknown, expired,
    // revoked or was used before (401), or is not a refresh token at all (400).
    // Everything else (429, 5xx) keeps the session for a later attempt.
    // It ends the session only if that is still the stored one: a check for another person
    // that began before this refresh (same epoch) may have stored its session meanwhile. The
    // comparison and the ending are ONE queued operation.
    if (answer.status === 401 || answer.status === 400) {
      const ended = await serialize(async () => {
        if (!(await stillStored(seen, stored.refreshToken))) return false;
        forgetInMemory(centralErrorMessage('session_ended'));
        await clearEnded();
        return true;
      });
      return ended ? { kind: 'refused' } : { kind: 'unavailable', failure: failure('session_ended') };
    }
    return { kind: 'unavailable', failure: failureOf(answer) };
  }
  if (!session) return { kind: 'unavailable', failure: failure('unavailable') };
  // The new pair is written in ONE queued operation, and only if the stored pair is still the
  // one this refresh read: nothing has written or removed it since (the session revision has
  // not moved) and the stored refresh token is the very one this refresh sent. If not (a
  // sign-in stored another session, or a sign-out or an undone check emptied the store, also
  // a sign-out whose deletions failed) the answer belongs to a session that is gone: nothing is
  // written and state and store stay as they are. The epoch plays no part: a code check that
  // began and failed, or an unrelated sign-in step, must not cost the person the new pair (the
  // next refresh would present the spent token and sign them out), and a check that began
  // before this refresh and stored another person must not get this person's pair. One failed
  // read of the stored token does not decide it either: with the revision unchanged nothing
  // has written or removed anything since, so the pair is written.
  let replaced: boolean;
  try {
    replaced = await serialize(async () => {
      if (!(await stillStored(seen, stored.refreshToken))) return false;
      await writeSession(session);
      return true;
    });
  } catch {
    // The old refresh token is spent and the new one could not be kept.
    await endLocally(centralErrorMessage('session_ended'));
    return { kind: 'refused' };
  }
  if (!replaced) return { kind: 'unavailable', failure: failure('session_ended') };
  // Something else began meanwhile (a sign-out, a code check): answer ok only if the pair
  // written above is still the stored session, so a sign-out that came right after is honoured.
  if (started !== epoch) {
    const current = await serialize(readSession);
    if (current === UNREADABLE || current?.refreshToken !== session.refreshToken)
      return { kind: 'unavailable', failure: failure('session_ended') };
  }
  return { kind: 'ok', session };
}

/**
 * The stored session, and whether it is the person asked for, read in ONE queued operation:
 * no sign-in can store another person's session between the two answers. It is that person's
 * only when the stored user is that person AND the access token was issued for that person
 * (`sub`); an access token whose person cannot be read is nobody's.
 * `onlyFor` is the id of that person; `null` means nobody (no stored session is anybody's);
 * `undefined` means no particular person (the second answer is then always true).
 */
const readSessionFor = (onlyFor?: string | null) =>
  serialize(async (): Promise<[ReadSession, boolean]> => {
    const session = await readSession();
    if (onlyFor === undefined) return [session, true];
    if (!session || session === UNREADABLE) return [session, false];
    try {
      const user = readStoredUser(await SecureStore.getItemAsync(CENTRAL_SECURE_KEYS.USER));
      return [session, onlyFor !== null && user?.id === onlyFor && subjectOf(session.accessToken) === onlyFor];
    } catch {
      return [UNREADABLE, false];
    }
  });

/**
 * A usable access token: the stored one, or a new one when it is about to expire.
 * With `onlyFor` the token is given only if the stored session is that person's: the person
 * is checked in the same queued read that takes the token, and once more after a refresh
 * (which may have waited and then served whoever is stored by then). `refused` is a token
 * the service has just refused: it is not given again.
 */
async function accessToken(onlyFor?: string | null, refused?: string): Promise<{ token: string } | CentralFailure> {
  if (!getCentralLoginConfig()) return failure('not_configured');
  const [stored, mine] = await readSessionFor(onlyFor);
  if (stored === UNREADABLE) return failure('unavailable');
  if (stored && !mine) return failure('failed');
  if (stored && stored.accessToken !== refused && stored.expiresAt - Date.now() > RENEW_AHEAD_MS) return { token: stored.accessToken };
  if (!stored && getCentralState().status !== 'signedIn') return failure('session_ended');
  const refreshed = await refreshCentralSession();
  if (refreshed.kind === 'ok' && onlyFor !== undefined) {
    // The stored session must still be this person's and the very pair the refresh stored.
    const [now, stillMine] = await readSessionFor(onlyFor);
    if (now === UNREADABLE) return failure('unavailable');
    if (!now || !stillMine || now.refreshToken !== refreshed.session.refreshToken) return failure('failed');
  }
  if (refreshed.kind === 'ok') return { token: refreshed.session.accessToken };
  if (refreshed.kind === 'refused') return failure('session_ended');
  return refreshed.failure;
}

/**
 * A call that needs sign-in: refreshes ahead of expiry, and once when the service answers 401.
 * `onlyFor` (see `accessToken`) is for a call that acts on one person's behalf and must never
 * carry another person's token: every token it sends is chosen together with that check.
 */
async function signedCall(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  onlyFor?: string | null
): Promise<{ kind: 'ok'; body: Record<string, unknown> } | CentralFailure> {
  const config = getCentralLoginConfig();
  const first = await accessToken(onlyFor);
  if ('ok' in first) return first;
  let answer = await centralFetch(config, method, path, { body, accessToken: first.token });
  if (answer.kind === 'error' && answer.status === 401) {
    let next: string | null;
    if (onlyFor !== undefined) {
      const again = await accessToken(onlyFor, first.token);
      if ('ok' in again) return again;
      next = again.token;
    } else {
      // Another call may have replaced the token while this one was in flight.
      const current = await serialize(readSession);
      next = current && current !== UNREADABLE && current.accessToken !== first.token ? current.accessToken : null;
      if (!next) {
        const refreshed = await refreshCentralSession();
        if (refreshed.kind === 'refused') return failure('session_ended');
        if (refreshed.kind === 'unavailable') return refreshed.failure;
        next = refreshed.session.accessToken;
      }
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

/**
 * Keeps the profile the service answered with, in the store and in memory, in ONE queued
 * operation and only while the stored session still belongs to that person: an answer for
 * a person who has since been replaced or signed out is dropped (true: nothing to keep).
 * False when the secure store could not be read or written: memory is then left as it was,
 * matching the store, and the caller answers `unavailable` (backlog A24).
 */
async function keepUser(user: CentralUser): Promise<boolean> {
  return serialize(async () => {
    const session = await readSession();
    if (session === UNREADABLE) return false;
    const storedUser = readStoredUser(await SecureStore.getItemAsync(CENTRAL_SECURE_KEYS.USER));
    if (!session || storedUser?.id !== user.id) return true;
    await writeUser(user);
    if (getCentralState().status === 'signedIn') setCentralState({ user });
    return true;
  }).catch(() => false);
}

/** `GET /v1/me`. */
export async function fetchCentralProfile(): Promise<CentralResult<{ user: CentralUser }>> {
  const answer = await signedCall('GET', '/v1/me');
  if ('ok' in answer) return answer;
  const user = parseUser(answer.body.user);
  if (!user) return failure('unavailable');
  if (!(await keepUser(user))) return failure('unavailable');
  return { ok: true, user };
}

/** `PATCH /v1/me`: sets the name (1 to 80 characters). */
export async function updateCentralName(name: string): Promise<CentralResult<{ user: CentralUser }>> {
  const answer = await signedCall('PATCH', '/v1/me', { name: name.trim() });
  if ('ok' in answer) return answer;
  const user = parseUser(answer.body.user);
  if (!user) return failure('unavailable');
  if (!(await keepUser(user))) return failure('unavailable');
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
  // The deletion acts on the person whose token is sent, and the caller removes the list of
  // the person named here: they must be the same one. The stored person is checked in the same
  // queued read that takes the token for the request, and again after a refresh; if it is not
  // the person named here (nobody, when memory says signed out) nothing is sent.
  const answer = await signedCall('DELETE', '/v1/me', undefined, userId);
  if ('ok' in answer) return answer;
  await endLocally(null);
  return { ok: true, userId };
}

/**
 * `POST /v1/facility-token`: a token for one facility, valid for a few minutes and usable once.
 * `onlyFor` is the person the facility is being opened for: the token is asked only with that
 * person's stored session (see `accessToken`), never with whoever is stored by then.
 */
export async function requestFacilityToken(audience: string, onlyFor: string): Promise<CentralResult<{ identityToken: string }>> {
  const answer = await signedCall('POST', '/v1/facility-token', { audience }, onlyFor);
  if ('ok' in answer) return answer;
  const token = answer.body.identity_token;
  if (typeof token !== 'string' || !token) return failure('unavailable');
  return { ok: true, identityToken: token };
}

/**
 * `POST /v1/session/signout`, then forget the session on this device. The
 * device is signed out whatever the service answers: without a connection the
 * family lives on at the service until its refresh token expires.
 *
 * Answers whether the device removed its stored session. False: memory is signed out, but
 * the secure store kept (some of) the keys; the sign-out marker makes the next start remove
 * them instead of signing the person back in, and the caller tells the person.
 *
 * The revocation needs an access token. An expired one is replaced first, under the rule of one
 * refresh at a time: the pair is read in the same queued operation that removes it, so it is the
 * last pair stored (no refresh can store a newer one after it); a refresh that is running is
 * waited for; and if a refresh has already sent that refresh token and was answered with a new
 * pair, that pair is used and the token is not sent again. Without such an answer (none came, or
 * a refusal) the token is sent as the next refresh would send it. The new refresh token is never
 * stored: the family is about to be revoked.
 */
export async function signOutCentral(): Promise<boolean> {
  const config = getCentralLoginConfig();
  // Taken before anything changes: the newest refresh, which waits for any older one.
  const running = refreshInFlight?.promise;
  forgetInMemory(null);
  const [stored, cleared] = await serialize(async (): Promise<readonly [ReadSession, boolean]> => {
    const found = await readSession();
    return [found, await clearEnded()] as const;
  });
  if (!stored || stored === UNREADABLE || !config) return cleared;
  let token: string | null = stored.accessToken;
  if (stored.expiresAt <= Date.now()) {
    if (running) await running.catch(() => undefined);
    if (lastRefresh?.sent === stored.refreshToken && lastRefresh.session) token = lastRefresh.session.accessToken;
    else {
      const refreshed = await centralFetch(config, 'POST', '/v1/session/refresh', {
        body: { refresh_token: stored.refreshToken },
      });
      token = refreshed.kind === 'ok' ? (parseSession(refreshed.body.session, Date.now())?.accessToken ?? null) : null;
    }
  }
  // Forgotten only when it is about the token cleared here: a refresh of a session signed in
  // again while this sign-out waited keeps its record for that session's own sign-out.
  if (lastRefresh?.sent === stored.refreshToken) lastRefresh = null;
  if (token) await centralFetch(config, 'POST', '/v1/session/signout', { accessToken: token });
  return cleared;
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
  const seenIds = new Set<string>();
  const seenOrigins = new Set<string>();
  const facilities: CatalogueFacility[] = [];
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  for (const entry of claims.facilities as unknown[]) {
    const item = entry as {
      id?: unknown;
      name?: unknown;
      city?: unknown;
      town?: unknown;
      district?: unknown;
      origin?: unknown;
      operator?: unknown;
      online?: unknown;
      last_seen_at?: unknown;
    } | null;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !item.name.trim()) continue;
    // `null` is a member with no app server yet. Any other address that is not a bare https
    // origin (a typing mistake at the association, a missing field) is dropped, never shown as
    // "no app server yet".
    if (item.origin !== null && !isFacilityOrigin(item.origin)) continue;
    const origin = item.origin;
    if (seenIds.has(item.id) || (origin !== null && seenOrigins.has(origin))) continue;
    seenIds.add(item.id);
    if (origin !== null) seenOrigins.add(origin);
    const lastSeen = text(item.last_seen_at);
    facilities.push({
      id: item.id,
      name: item.name.trim(),
      city: text(item.city) || text(item.town),
      town: text(item.town) || text(item.city),
      district: text(item.district),
      origin,
      operator: text(item.operator),
      // Availability is reported only for a facility with an app server, and only as a real boolean.
      online: origin !== null && typeof item.online === 'boolean' ? item.online : null,
      lastSeenAt: lastSeen && Number.isFinite(Date.parse(lastSeen)) ? lastSeen : null,
    });
  }
  return facilities;
}

/**
 * `GET /v1/facilities`: the association's list of member facilities. Asked with
 * `Cache-Control: no-cache`: Android's HTTP cache would otherwise answer a forced read (pull to
 * refresh, "Try again") with its stored copy for as long as the service's `max-age` allows.
 */
export async function fetchFacilityCatalogue(
  options: { force?: boolean } = {}
): Promise<CentralResult<{ facilities: CatalogueFacility[] }>> {
  const config = getCentralLoginConfig();
  if (!config) return failure('not_configured');
  if (!options.force && catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_CACHE_MS && Date.now() >= catalogueCache.at)
    return { ok: true, facilities: catalogueCache.facilities };
  const answer = await centralFetch(config, 'GET', '/v1/facilities', { headers: { 'Cache-Control': 'no-cache' } });
  if (answer.kind !== 'ok') return failureOf(answer);
  const facilities = readCatalogueToken(answer.body.catalogue, config.issuer);
  if (!facilities) return failure('catalogue_invalid');
  catalogueCache = { at: Date.now(), facilities };
  return { ok: true, facilities };
}

/** Tests only. */
export function resetCentralSessionForTests(): void {
  epoch += 1;
  sessionRevision += 1;
  refreshInFlight = null;
  lastRefresh = null;
  catalogueCache = null;
  writes = Promise.resolve();
  restorePending = false;
  restoreRetried = false;
  if (restoreRetry) clearTimeout(restoreRetry);
  restoreRetry = undefined;
}
