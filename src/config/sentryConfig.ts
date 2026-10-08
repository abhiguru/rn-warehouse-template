/**
 * Sentry/GlitchTip Configuration
 *
 * GlitchTip is a Sentry-compatible error tracking service.
 * This module provides centralized crash reporting using the @sentry/react-native SDK.
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

const SENSITIVE_KEY_REGEX =
  /^(token|access_token|accessToken|refresh_token|refreshToken|auth_token|authToken|password|secret|jwt|apikey|api_key|apiKey|otp|phoneNumber|phone_number|phone|code|credential|cookie|authorization|auth)$/i;

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
 * Sanitize HTTP headers to remove authentication tokens and secrets
 */
export function sanitizeHeaders(
  headers: Record<string, unknown>
): Record<string, unknown> {
  if (!headers || typeof headers !== 'object') return headers;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.includes(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = redactSensitiveString(value);
    } else {
      sanitized[key] = sanitizeData(value);
    }
  }

  return sanitized;
}

/**
 * Recursively redact sensitive keys and values from objects and arrays
 */
export function sanitizeData(
  data: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  if (depth > 8 || data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return redactSensitiveString(data);
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
      if (
        SENSITIVE_KEY_REGEX.test(k) ||
        /password|secret|credential/i.test(k)
      ) {
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
    sanitized.message = redactSensitiveString(sanitized.message);
  }

  if (sanitized.data && typeof sanitized.data === 'object') {
    const dataCopy = { ...sanitized.data };

    if (dataCopy.url && typeof dataCopy.url === 'string') {
      dataCopy.url = sanitizeUrl(dataCopy.url);
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

  // Redact User details
  if (event.user) {
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
      event.user.username = redactSensitiveString(event.user.username);
    }
  }

  // Redact Request details (URL, headers, query string, payload)
  if (event.request) {
    if (event.request.url) {
      event.request.url = sanitizeUrl(event.request.url);
    }
    if (event.request.headers) {
      event.request.headers = sanitizeHeaders(
        event.request.headers as Record<string, unknown>
      ) as Record<string, string>;
    }
    if (event.request.query_string) {
      if (typeof event.request.query_string === 'string') {
        event.request.query_string = sanitizeUrl(
          `?${event.request.query_string}`
        ).replace(/^\?/, '');
      } else if (typeof event.request.query_string === 'object') {
        event.request.query_string = sanitizeData(
          event.request.query_string
        ) as Record<string, string>;
      }
    }
    if (event.request.data) {
      event.request.data = sanitizeData(event.request.data);
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
      if (SENSITIVE_KEY_REGEX.test(tagKey)) {
        sanitizedTags[tagKey] = '[REDACTED]';
      } else if (typeof tagVal === 'string') {
        sanitizedTags[tagKey] = redactSensitiveString(tagVal);
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

    // Only enabled when DSN is provided (opt-in)
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
 * Set user context for error reports
 * Call after successful login to associate errors with users
 */
export function setSentryUser(userId: string, role?: string): void {
  Sentry.setUser({
    id: userId,
    role: role,
  });
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
  Sentry.captureMessage(message, level);
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
