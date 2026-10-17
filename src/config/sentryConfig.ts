/**
 * Sentry/GlitchTip Configuration
 *
 * GlitchTip is a Sentry-compatible error tracking service.
 * This module provides centralized crash reporting using the @sentry/react-native SDK.
 *
 * Consent model (review 2026-10-17, M09, decision D22): reporting is switched on
 * by the organisation that builds the app (it sets EXPO_PUBLIC_SENTRY_DSN), not by
 * the person using it; the app has no switch. What leaves the phone is kept small:
 * the app version, the phone model, the role (never an account id or phone number)
 * and the error text after redactErrorText. A request body is never sent. See
 * docs/TELEMETRY_AND_PRIVACY.md section 1.
 */

import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

/**
 * Patterns to detect and redact sensitive strings in telemetry payloads
 */
export const SENSITIVE_STRING_PATTERNS = [
  // JWT tokens: header.payload.signature
  {
    pattern: /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9-_.]*/g,
    replacement: '[REDACTED_JWT]',
  },
  // Bearer authentication tokens
  {
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  // Indian and international phone numbers (10 digits, +91, etc.)
  {
    pattern: /(?:\+?91[\s-]?)?[6-9]\d{9}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  // Keyed OTP / verification codes
  {
    pattern: /\b(?:otp|code|pin|verification)[\s:=]+['"]?(\d{4,6})['"]?/gi,
    replacement: 'otp: [REDACTED_OTP]',
  },
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
  // API keys (e.g. Supabase, Stripe, Sentry prefixes)
  {
    pattern: /\b(sk|pk|sbp)_[a-zA-Z0-9]{20,}\b/g,
    replacement: '[REDACTED_API_KEY]',
  },
];

// Whole-name matches: short names that are only a secret when they are the
// entire key (`code`, `auth`, `jwt`), so they are not matched as a substring
// (`statusCode`, `errorCode` and `author` must survive).
const SENSITIVE_KEY_REGEX =
  /^(token|access_token|accessToken|refresh_token|refreshToken|auth_token|authToken|password|secret|jwt|apikey|api_key|apiKey|otp|phoneNumber|phone_number|phone|code|credential|cookie|authorization|auth)$/i;

// Substring matches: a key that contains one of these words holds a secret,
// whatever the rest of the name is (`identity_token`, `newPassword`,
// `client_secret`, `Set-Cookie`, `userPhone`). The words are deliberately
// broad; a harmless key that contains one (`footprint` contains `otp`) is
// redacted too, which is the safe direction. Review 2026-10-17, M01.
const SENSITIVE_KEY_SUBSTRING_REGEX =
  /token|secret|passw|otp|authorization|cookie|credential|phone/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_REGEX.test(key) || SENSITIVE_KEY_SUBSTRING_REGEX.test(key);
}

const SENSITIVE_PARAM_NAMES = [
  'token',
  'access_token',
  'refresh_token',
  'apikey',
  'api_key',
  'code',
  'secret',
  'auth',
  'password',
  'key',
  'credential',
  'otp',
];

const SENSITIVE_HEADERS = [
  'authorization',
  'apikey',
  'x-supabase-auth',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'authentication',
];

/**
 * Redact sensitive patterns from a raw string
 */
export function redactSensitiveString(str: string): string {
  if (!str || typeof str !== 'string') return str;
  let result = str;
  for (const { pattern, replacement } of SENSITIVE_STRING_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// What an error text can carry beyond the patterns above: the row values that
// PostgreSQL quotes in a constraint error, and the app's 64-character session
// tokens (refresh and enrollment tokens are opaque hex, not JWTs).
const ERROR_TEXT_PATTERNS = [
  { pattern: /\b[a-f0-9]{64}\b/gi, replacement: '[REDACTED_TOKEN]' },
  // Key (mobile)=(98xxxxxxxx) already exists.
  { pattern: /(Key \([^)]*\)=)\((?:[^()]|\([^()]*\))*\)/g, replacement: '$1([REDACTED])' },
  // Failing row contains (id, name, mobile, ...).
  { pattern: /(Failing row contains) \((?:[^()]|\([^()]*\))*\)/g, replacement: '$1 ([REDACTED])' },
];

/**
 * Redact the text of an error or a captured message: everything
 * redactSensitiveString hides, plus server row values and session tokens.
 */
export function redactErrorText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const { pattern, replacement } of ERROR_TEXT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return redactSensitiveString(result);
}

/**
 * Sanitize query parameters and sensitive URL fragments
 */
export function sanitizeUrl(urlString: string): string {
  if (!urlString || typeof urlString !== 'string') return urlString;
  try {
    const hasProtocol = urlString.includes('://');
    const dummyBase = 'http://localhost';
    const parsed = new URL(urlString, hasProtocol ? undefined : dummyBase);

    let modified = false;
    parsed.searchParams.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (/ey[A-Za-z0-9_-]{10,}\./.test(val)) {
        parsed.searchParams.set(key, '[REDACTED_JWT]');
        modified = true;
      } else if (
        SENSITIVE_PARAM_NAMES.some(param => lowerKey.includes(param))
      ) {
        parsed.searchParams.set(key, '[REDACTED]');
        modified = true;
      }
    });

    if (!modified) return urlString;

    if (hasProtocol) {
      return parsed.toString();
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // Fallback regex replacement if URL parsing fails
    return urlString.replace(
      /([?&](?:token|access_token|refresh_token|apikey|api_key|code|secret|auth|password|key|otp)=)[^&#]*/gi,
      '$1[REDACTED]'
    );
  }
}

/**
 * A request address without its query and fragment. A list search puts typed
 * text and record ids there (`or=(name.ilike."%…%")`, `id=eq.<uuid>`), which no
 * pattern filter can tell from other text. Scheme, host and path stay: the path
 * names the table or function, which is enough to debug (review 2026-10-17,
 * Opus finding 2, M09).
 */
export function stripUrlQuery(urlString: string): string {
  if (!urlString || typeof urlString !== 'string') return urlString;
  const cut = urlString.search(/[?#]/);
  return cut === -1 ? urlString : urlString.slice(0, cut);
}

/**
 * A header is redacted when its name contains one of the SENSITIVE_HEADERS
 * words or one of the secret words isSensitiveKey looks for, so
 * `x-session-token`, `X-Auth-Cookie` and `x-api-key-v2` are caught, not only
 * the exact names. The safe direction: a harmless header that contains a word
 * is redacted too.
 */
function isSensitiveHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    SENSITIVE_HEADERS.some(word => lower.includes(word)) || isSensitiveKey(name)
  );
}

/**
 * Sanitize HTTP headers to remove authentication tokens and secrets
 */
export function sanitizeHeaders(
  headers: Record<string, unknown>
): Record<string, unknown> {
  if (!headers || typeof headers !== 'object') return headers;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveHeader(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = redactErrorText(value);
    } else {
      sanitized[key] = sanitizeData(value);
    }
  }

  return sanitized;
}

/**
 * How deep sanitizeData looks into a value. Anything nested deeper than this is
 * not inspected key by key: it is replaced by TRUNCATED_MARKER (strings are still
 * scrubbed, numbers and booleans are kept). The cap fails closed, so a secret
 * cannot ride out below it.
 */
export const MAX_DEPTH = 8;

/** What sanitizeData puts in place of an object or array below MAX_DEPTH. */
const TRUNCATED_MARKER = '[TRUNCATED]';

/**
 * Recursively redact sensitive keys and values from objects and arrays
 */
export function sanitizeData(
  data: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  if (data === null || data === undefined) return data;

  // Past the depth limit nothing is returned as it came in. A string leaf is
  // still scrubbed, a plain number or boolean carries no secret, and a
  // container is dropped because its keys are no longer looked at.
  if (depth > MAX_DEPTH) {
    if (typeof data === 'string') return redactErrorText(data);
    if (typeof data === 'number' || typeof data === 'boolean') return data;
    return TRUNCATED_MARKER;
  }

  if (typeof data === 'string') {
    return redactErrorText(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, depth + 1, seen));
  }

  if (typeof data === 'object') {
    if (seen.has(data as object)) return '[CIRCULAR]';
    seen.add(data as object);

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = sanitizeData(v, depth + 1, seen);
      }
    }
    return result;
  }

  return data;
}

/**
 * Sanitize breadcrumbs before recording
 */
export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb) return breadcrumb;

  const sanitized: Breadcrumb = { ...breadcrumb };

  if (sanitized.message) {
    sanitized.message = redactErrorText(sanitized.message);
  }

  if (sanitized.data && typeof sanitized.data === 'object') {
    const dataCopy = { ...sanitized.data };

    // fetch and xhr breadcrumbs carry `url`; navigation breadcrumbs `from` and `to`
    for (const key of ['url', 'from', 'to']) {
      if (typeof dataCopy[key] === 'string') {
        dataCopy[key] = stripUrlQuery(dataCopy[key] as string);
      }
    }
    if (dataCopy.headers && typeof dataCopy.headers === 'object') {
      dataCopy.headers = sanitizeHeaders(
        dataCopy.headers as Record<string, unknown>
      );
    }

    sanitized.data = sanitizeData(dataCopy) as Record<string, unknown>;
  }

  return sanitized;
}

/**
 * Sanitize error event before sending to GlitchTip / Sentry
 */
export function sanitizeEvent(event: ErrorEvent): ErrorEvent {
  if (!event) return event;

  // The text of the event itself: a captured message, and the message of
  // every exception in the chain. This is where a server error text (a phone
  // number in a duplicate-key detail, a token echoed by a proxy) would travel.
  if (typeof event.message === 'string') {
    event.message = redactErrorText(event.message);
  }
  if (event.logentry) {
    if (typeof event.logentry.message === 'string') {
      event.logentry.message = redactErrorText(event.logentry.message);
    }
    if (Array.isArray(event.logentry.params)) {
      event.logentry.params = event.logentry.params.map(param =>
        typeof param === 'string' ? redactErrorText(param) : sanitizeData(param)
      );
    }
  }
  if (Array.isArray(event.exception?.values)) {
    for (const exception of event.exception.values) {
      if (typeof exception.value === 'string') {
        exception.value = redactErrorText(exception.value);
      }
    }
  }

  // Redact Contexts (device and app details stay; keyed secrets and strings
  // that match a sensitive pattern do not)
  // The trace context holds only generated ids, which the phone pattern
  // could damage; it is passed through.
  if (event.contexts && typeof event.contexts === 'object') {
    const { trace, ...rest } = event.contexts;
    event.contexts = {
      ...(sanitizeData(rest) as ErrorEvent['contexts']),
      ...(trace ? { trace } : {}),
    };
  }

  // Redact User details. The account id is never sent (decision D22): the role
  // is enough to tell a staff crash from a customer one, and an id would let a
  // report be tied to one person. setSentryUser no longer sets it; this drops
  // it should anything else put one on the scope.
  if (event.user) {
    delete event.user.id;
    if (event.user.phone) {
      event.user.phone = '[REDACTED]';
    }
    if (event.user.email) {
      event.user.email = '[REDACTED]';
    }
    if (event.user.ip_address) {
      event.user.ip_address = '[REDACTED]';
    }
    if (event.user.username) {
      event.user.username = redactErrorText(event.user.username);
    }
  }

  // Redact Request details (URL without query, headers; no query string, no payload)
  if (event.request) {
    if (event.request.url) {
      event.request.url = stripUrlQuery(event.request.url);
    }
    if (event.request.headers) {
      event.request.headers = sanitizeHeaders(
        event.request.headers as Record<string, unknown>
      ) as Record<string, string>;
    }
    // The query string is never sent: it holds typed search text and record ids.
    delete event.request.query_string;
    // The request body is never sent (decision D22). Pattern filtering cannot
    // tell an ordinary business name from any other text, so the only safe
    // content is none. Nothing in the app fills it today.
    delete event.request.data;
    // Cookie values are credentials; the names are kept, like header names.
    const cookies: unknown = event.request.cookies;
    if (cookies && typeof cookies === 'object') {
      event.request.cookies = Object.fromEntries(
        Object.keys(cookies).map(name => [name, '[REDACTED]'])
      );
    } else if (cookies) {
      // A raw cookie string: nothing in it is worth keeping.
      event.request.cookies = '[REDACTED]' as unknown as Record<string, string>;
    }
    if (event.request.env) {
      event.request.env = sanitizeData(event.request.env) as Record<string, string>;
    }
  }

  // Redact Extra context
  if (event.extra) {
    event.extra = sanitizeData(event.extra) as Record<string, unknown>;
  }

  // Redact attached Breadcrumbs
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb);
  }

  // Redact Tags
  if (event.tags && typeof event.tags === 'object') {
    const sanitizedTags: Record<string, string | number | boolean> = {};
    for (const [tagKey, tagVal] of Object.entries(event.tags)) {
      if (isSensitiveKey(tagKey)) {
        sanitizedTags[tagKey] = '[REDACTED]';
      } else if (typeof tagVal === 'string') {
        sanitizedTags[tagKey] = redactErrorText(tagVal);
      } else {
        sanitizedTags[tagKey] = tagVal as string | number | boolean;
      }
    }
    event.tags = sanitizedTags;
  }

  return event;
}

/**
 * Filter and sanitize events before transmission
 */
export function beforeSend(event: ErrorEvent): ErrorEvent | null {
  return sanitizeEvent(event);
}

/**
 * Filter and sanitize breadcrumbs before recording
 */
export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return sanitizeBreadcrumb(breadcrumb);
}

/**
 * Initialize Sentry/GlitchTip crash reporting
 * Call this at app startup before any React code runs
 */
export function initializeSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    release: Constants.expoConfig?.version || '1.0.0',
    dist: Constants.expoConfig?.android?.versionCode?.toString() || '1',

    // Switched on by the operator who builds the app with a DSN; there is no
    // per-person switch (docs/TELEMETRY_AND_PRIVACY.md section 1)
    enabled: !__DEV__ && !!SENTRY_DSN,

    // Sample rate for performance monitoring (0 = disabled to reduce overhead)
    tracesSampleRate: 0,

    // Don't send PII by default (GDPR compliance)
    sendDefaultPii: false,

    // Attach stack traces to all messages for better debugging
    attachStacktrace: true,

    // Limit breadcrumb buffer
    maxBreadcrumbs: 50,

    // Filter sensitive data before sending
    beforeSend,

    // Sanitize breadcrumbs as they occur
    beforeBreadcrumb,
  });
}

/**
 * Set the user context for error reports: the role only (decision D22). The
 * account id is not sent, so a report cannot be tied to one person. Call after a
 * successful sign-in; without a role there is nothing to send and the context
 * is cleared.
 */
export function setSentryUser(role?: string): void {
  Sentry.setUser(role ? { role } : null);
}

/**
 * Clear user context on logout
 */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/**
 * Capture an exception with optional context
 * Use this to manually report errors to GlitchTip
 */
export function captureException(
  error: Error,
  context?: Record<string, unknown>
): void {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message with severity level
 * Use for non-error events that should still be logged
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info'
): void {
  // Scrubbed here as well as in beforeSend: a message is often built from a
  // raw rejection reason or server text.
  Sentry.captureMessage(redactErrorText(message), level);
}

/**
 * Add breadcrumb for debugging context
 * Breadcrumbs appear in error reports to show what happened before the error
 */
export function addBreadcrumb(
  message: string,
  category: string = 'app',
  level: Sentry.SeverityLevel = 'info'
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    timestamp: Date.now() / 1000,
  });
}

// Re-export Sentry for advanced usage (e.g., Sentry.wrap)
export { Sentry };
