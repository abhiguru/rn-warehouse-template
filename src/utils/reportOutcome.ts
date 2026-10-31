/**
 * One small, redacted event for the outcomes of a save that the operator of the app needs to see in
 * error reporting (GlitchTip/Sentry) and cannot see from a crash: a save the server refused, a save that
 * failed, an answer that was lost, and a lost answer that was settled.
 *
 * What leaves the phone is a single line of text and a level: the kind, and when known the refusal code,
 * the connection path (public or LAN), the HTTP status and the request code (a SHA-256-derived code; it names no
 * person, customer, item or amount). Never a request or answer body, a name, a phone number or a token.
 * See docs/TELEMETRY_AND_PRIVACY.md section 1.
 *
 * Nothing is sent without a DSN (the operator who builds the app sets EXPO_PUBLIC_SENTRY_DSN), so in tests
 * and in builds without one this is a no-op that loads nothing. It never throws: reporting must not change
 * what a save does.
 */
export type OutcomeKind = 'save_refused' | 'lost_answer' | 'lost_answer_settled' | 'save_failed';

export interface OutcomeDetail {
  /** The request code the save carried. */
  requestKey?: string;
  /** The server's refusal or error code, e.g. STALE_RECORD, PGRST202. */
  code?: string;
  /** The connection the request went over; the current one when left out. */
  path?: 'public' | 'lan';
  httpStatus?: number;
}

const LEVEL: Record<OutcomeKind, 'info' | 'warning'> = {
  save_refused: 'info',
  lost_answer: 'warning',
  lost_answer_settled: 'info',
  save_failed: 'warning',
};

const MAX_CODE = 64;

/**
 * A field value as one token: secrets and phone numbers redacted, then only plain characters. `max` cuts a code to a
 * sensible length; the request key is sent whole (it is a hash, and cutting it would no longer match the server's).
 */
function token(value: string, redact: (text: string) => string, max = Infinity): string {
  return redact(value)
    .replace(/[^A-Za-z0-9_.:\-[\]]+/g, '_')
    .slice(0, max);
}

/**
 * The request code, whole. It is a hash with a prefix, so it names nothing, but its 64 hex digits are exactly what the
 * redaction of session tokens removes (and a long digit run can look like a phone number). The hash is therefore written
 * in groups of eight joined by dots; remove the dots to get the server's `p_idempotency_key` back.
 */
function keyToken(key: string): string {
  return key
    .replace(/[^A-Za-z0-9_.:-]+/g, '_')
    .replace(/[A-Fa-f0-9]{24,}/g, run => run.match(/.{1,8}/g)!.join('.'));
}

/** The text sent for an outcome; exported for the tests. */
export function outcomeMessage(
  kind: OutcomeKind,
  detail: OutcomeDetail,
  path: 'public' | 'lan' | undefined,
  redact: (text: string) => string
): string {
  const parts: string[] = [`outcome ${kind}`];
  if (detail.code) parts.push(`code=${token(detail.code, redact, MAX_CODE)}`);
  if (path) parts.push(`path=${path}`);
  if (typeof detail.httpStatus === 'number' && Number.isInteger(detail.httpStatus)) parts.push(`http=${detail.httpStatus}`);
  if (detail.requestKey) parts.push(`key=${keyToken(detail.requestKey)}`);
  return parts.join(' ');
}

export function reportOutcome(kind: OutcomeKind, detail: OutcomeDetail = {}): void {
  try {
    if (!process.env.EXPO_PUBLIC_SENTRY_DSN) return;
    let path = detail.path;
    if (path === undefined) {
      // Loaded here, not at the top: this file is imported by modules whose tests stand neither in.
      const { getConnectionPath } = require('@/config/lanTransport') as typeof import('@/config/lanTransport');
      path = getConnectionPath();
    }
    const { captureMessage, redactErrorText } = require('@/config/sentryConfig') as typeof import('@/config/sentryConfig');
    captureMessage(outcomeMessage(kind, detail, path, redactErrorText), LEVEL[kind]);
  } catch {
    // Reporting must never change what a save does.
  }
}

/**
 * Errors the save services throw for a refusal by the server's own rules (as opposed to a failure). Two ways to be
 * one, shared by the three services: carry the marker set by `markRefusal`, or be one of the named classes below
 * (they set `name` themselves, which survives minification; a class name does not).
 */
const REFUSAL_CLASS_NAMES: readonly string[] = ['RateRefusal', 'NumberTakenRefusal', 'PossibleDuplicateRefusal', 'ServerRefusalError'];

/** Marks `error` as a refusal by the server's rules, with the refusal's code when known. Returns the same error. */
export function markRefusal<E extends Error>(error: E, code?: string): E {
  Object.defineProperty(error, 'isServerRefusal', { value: true, enumerable: false });
  if (code) Object.defineProperty(error, 'refusalCode', { value: code, enumerable: false });
  return error;
}

export function isServerRefusal(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const source = error as { name?: unknown; isServerRefusal?: unknown };
  return source.isServerRefusal === true || (typeof source.name === 'string' && REFUSAL_CLASS_NAMES.includes(source.name));
}

/**
 * Reports the end of a save that did not succeed: `lost` when its answer never came, else a refusal (a marked error
 * or one of the named classes) or a plain failure. The code is the error's `code`, its refusal's `reason` or the
 * code given to `markRefusal` when it has a string one; the error message is never sent.
 */
export function reportSaveError(error: unknown, context: { requestKey?: string; lost?: boolean } = {}): void {
  try {
    const source = (typeof error === 'object' && error !== null ? error : {}) as {
      name?: unknown;
      code?: unknown;
      refusalCode?: unknown;
      isServerRefusal?: unknown;
      refusal?: { reason?: unknown };
    };
    const code = [source.code, source.refusalCode, source.refusal?.reason].find(value => typeof value === 'string');
    reportOutcome(context.lost ? 'lost_answer' : isServerRefusal(source) ? 'save_refused' : 'save_failed', {
      requestKey: context.requestKey,
      code: typeof code === 'string' ? code : undefined,
    });
  } catch {
    // Reporting must never change what a save does.
  }
}
