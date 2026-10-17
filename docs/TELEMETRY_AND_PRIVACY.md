# Telemetry, Privacy and Data Redaction Policy

## Overview

The mobile application includes optional centralized crash reporting via Sentry / GlitchTip (`@sentry/react-native`). GlitchTip is an open-source, Sentry-compatible error tracking service.

This document outlines the privacy design, client-side redaction rules, opt-in mechanism, and server-side data retention requirements.

---

## 1. Opt-In Configuration and Activation

Telemetry is strictly opt-in and disabled by default:

- **Empty DSN by Default**: In `.env.example`, `EXPO_PUBLIC_SENTRY_DSN` is blank. If unconfigured, Sentry is never initialized.
- **Development Mode Isolation**: Sentry is deactivated during local development (`enabled: !__DEV__ && !!SENTRY_DSN`), ensuring local debugging data never leaves the developer's machine.
- **Performance Tracing Disabled**: `tracesSampleRate: 0` disables performance sampling, preventing unnecessary network transmissions and runtime overhead.
- **No Default PII**: `sendDefaultPii: false` instructs the native SDK not to collect device-level identifiers, Wi-Fi networks, or IP addresses.
- **Breadcrumb Buffer Limit**: `maxBreadcrumbs: 50` caps the in-memory history to prevent excessive context accumulation.

---

## 2. Client-Side Redaction Pipeline

Before any packet is emitted over the network, two mandatory client-side gates execute in `src/config/sentryConfig.ts`:

### A. Real-Time Breadcrumb Filter (`beforeBreadcrumb`)

As user actions and network events occur, breadcrumbs are sanitized before being stored:

- **HTTP URLs**: Query parameters containing `token`, `access_token`, `refresh_token`, `apikey`, `api_key`, `code`, `secret`, `auth`, `password`, `key`, `credential`, or `otp` are replaced with `[REDACTED]`. Any parameter value containing a JWT format is redacted to `[REDACTED_JWT]`.
- **HTTP Headers**: Headers including `Authorization`, `apikey`, `x-supabase-auth`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`, and `X-Api-Key` are stripped and replaced with `[REDACTED]`.
- **Breadcrumb Messages & Data**: All strings and structured objects are recursively inspected and redacted for sensitive patterns.

### B. Event Transmission Filter (`beforeSend`)

When an unhandled exception or captured error occurs:

- **User Object**: `phone`, `email`, and `ip_address` are explicitly replaced with `[REDACTED]`. Only opaque user UUIDs (`id`) and coarse application roles (`role`) are retained.
- **Request Payloads**: Request URL, query strings, headers, and request body objects undergo deep recursive sanitization (see the depth cap below).
- **Extra Context**: Context dictionaries passed to `captureException` are scanned; keys matching sensitive credential names and values matching regex patterns are sanitized.
- **Tags & Metadata**: Custom tags matching sensitive identifiers are redacted.
- **Message and Exception Text**: `event.message`, the log entry and the message of every exception in the chain are redacted with the pattern registry, plus the row values PostgreSQL quotes in a constraint error (`Key (mobile)=(...)`, `Failing row contains (...)`) and 64-character session tokens. `captureMessage` applies the same redaction before the SDK is called.
- **Contexts**: Context objects undergo the same deep recursive sanitization; the trace context (generated ids only) is passed through.

### C. Recursive Sanitization: Depth Cap and Key Names

`sanitizeData` walks request bodies, `extra`, contexts, breadcrumb data and log-entry parameters:

- **Depth cap (`MAX_DEPTH`, 8 levels)**: it fails closed. An object or array nested deeper than the cap is not returned as it came in. It is replaced by the marker `[TRUNCATED]`, so nothing below the cap leaves the phone. A string below the cap is still scrubbed with the patterns of the next section (a number or boolean is kept, since it carries no secret). Seeing `[TRUNCATED]` in a stored event means the payload was too deep to inspect; send shallower data if you need it in the report.
- **Strings**: every string leaf is scrubbed with the error-text patterns (the registry below plus 64-character session tokens and quoted row values), at any depth.
- **Key names**: a key is redacted (`[REDACTED]`, its value is not inspected) when it contains `token`, `secret`, `passw`, `otp`, `authorization`, `cookie`, `credential` or `phone` in any letter case (`identity_token`, `newPassword`, `client_secret`, `Set-Cookie`, `userPhone`), or when the whole name is one of the short names `jwt`, `apikey`, `api_key`, `code` or `auth`. The words are matched anywhere in the name on purpose; a harmless key that happens to contain one (`footprint` contains `otp`) is redacted as well. Keys the app and the Sentry SDK put into events (`isFatal`, `source`, `componentStack`, `statusCode`, `model`, `memory_size`, `boot_time` and the like) do not contain these words, so no allow-list is kept; the tests in `src/config/__tests__/sentryConfig.test.ts` pin a sample of both groups.
- **Circular references** are replaced by `[CIRCULAR]`.

The Sentry SDK itself normalizes breadcrumb data, contexts and `extra` to its own `normalizeDepth` before `beforeSend`, but not `request.data` or log-entry parameters, and an operator can raise that setting. The cap here does not depend on it.

### D. Redaction Pattern Registry

| Pattern Category | Target Examples                                | Replacement               |
| ---------------- | ---------------------------------------------- | ------------------------- |
| JWT Tokens       | `eyJhbGciOi...`                                | `[REDACTED_JWT]`          |
| Bearer Tokens    | `Bearer eyJ...` / `Bearer abc...`              | `Bearer [REDACTED_TOKEN]` |
| Phone Numbers    | `+91 9876543210`, `9876543210`, `555-123-4567` | `[REDACTED_PHONE]`        |
| OTP Codes        | `otp: 123456`, `pin: 9876`                     | `otp: [REDACTED_OTP]`     |
| Email Addresses  | `user@example.com`                             | `[REDACTED_EMAIL]`        |
| API Keys         | `sbp_...`, `sk_...`, `pk_...`                  | `[REDACTED_API_KEY]`      |

---

## 3. Server-Side Retention and Cleanup

For deployers hosting GlitchTip or utilizing Sentry Cloud:

1. **Retention Window**: Configure event retention to **30 to 90 days maximum**. Stale error events should be automatically purged by scheduled database maintenance (`glitchtip cleanup` or Sentry TTL workers).
2. **Server-Side Data Scrubbers**: Enable GlitchTip/Sentry server-side data scrubbing rules as a secondary defense layer for IP masking and header scrubbing.
3. **Restricted Access**: Access to the error tracking dashboard should be restricted to authorized operational staff via role-based access control and MFA.
4. **No Marketing / Analytics Use**: Error telemetry events must never be exported, joined with customer analytics datasets, or used for behavioural profiling.

---

## 4. Android Backup

The app is built with `android:allowBackup="false"` (`expo.android.allowBackup` in `app.json`). Nothing the app stores on the phone (the session marker, recent customers and items, cached settings, the chosen facility) is copied to the user's Google account or moved to another phone by Android's backup and device-transfer features. A facility that revokes a user or switches a phone therefore does not leave a restorable copy behind. `npm run audit:artifact` fails for a build whose manifest does not turn backup off.
