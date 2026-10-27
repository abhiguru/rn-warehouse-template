# Telemetry, Privacy and Data Redaction Policy

## Overview

The mobile application includes optional centralized crash reporting via Sentry / GlitchTip (`@sentry/react-native`). GlitchTip is an open-source, Sentry-compatible error tracking service.

This document outlines the consent model (reporting is switched on by the operator who builds the app, not by the person using it), what a report contains, client-side redaction rules, and server-side data retention requirements.

---

## 1. Consent Model: Operator-Controlled Reporting

Decision D22 (owner, 2026-10-17; review finding M09). Crash reporting is **switched on by the operator, not chosen by the person using the app**. The operator is the organisation that builds and distributes the app (the association, or a cold storage that builds its own copy). Earlier versions of this document and of the privacy screen called reporting "opt-in", which read as the person's own choice. It never was: "opt-in" meant that the operator sets a DSN at build time. The app has **no setting** for it.

What this means in practice:

- **Default off.** In `.env.example`, `EXPO_PUBLIC_SENTRY_DSN` is blank. A build without a DSN never initializes Sentry and sends nothing. The template ships this way.
- **On for everyone running that build.** A build made with a DSN reports from every phone that runs it, from the first launch. There is no per-person switch, no consent prompt and no setting under Settings. A person cannot turn it off from inside the app.
- **Withdrawal means asking the operator.** A person who does not want crash reports contacts the organisation that distributes their copy and asks for a build without a DSN, or for the reports to be deleted at the server (section 3). The privacy screen (`app/privacy-policy.tsx`, sections 1, 3, 6 and 9) says this in these words.
- **A per-person consent (a Settings toggle, the handoff's option B) was considered and not chosen.** If the operator ever presents crash reporting as the user's choice, that decision is to be reopened, and the privacy screen and the store declarations (below) change with it.
- **The disclosures must stay true.** The operator is responsible for four statements matching the build: the privacy screen, the Apple privacy declarations, the Google Play Data safety form and this document. The store declarations are an operator step, written in [RELEASE_PREPARATION.md](RELEASE_PREPARATION.md), "Crash-reporting declarations".

### What a report contains

Sent, after the redaction of section 2:

- the app version, build and environment, the platform, the operating system version and the phone model, with the device details the SDK attaches (memory, boot time, orientation and the like; the SDK decides the exact list);
- the **role** of the signed-in person (`admin`, `supervisor`, `staff` or `customer`). **No account id is sent** (`setSentryUser(role)` has no id parameter and `beforeSend` removes any `user.id`), and the phone number, e-mail and IP address are replaced by `[REDACTED]` should anything put them on the report;
- the **error text** and the stack trace. The text passes `redactErrorText`: phone numbers, e-mail addresses, JWTs, bearer tokens, 64-character session tokens, API keys, one-time codes and the row values PostgreSQL quotes in a constraint error are removed. **Ordinary words are not recognised.** A business name, a person's name, an item or a place that appears in an error message is sent. This is why the privacy screen says the text "may contain names from your records";
- a **trail of recent activity** (the SDK's breadcrumbs, up to `maxBreadcrumbs: 50`): the messages the app writes to its console (in a release build the app's logger writes errors only, but direct `console.warn` calls exist), the requests the app made (method, status and the address **without its query string and fragment**, so the host and the path, for example `/rest/v1/customers`, are sent but search text and record ids in the query are not) and the touches recorded by `Sentry.wrap` (component names only; no `sentry-label` is used). No navigation integration is registered, so screen changes are not recorded as such. Console message text passes the same pattern filter as error text, so a word the app logs can appear. The privacy screen says "a short trail of what the App did just before it (such as requests made)".

- **save outcomes** (`src/utils/reportOutcome.ts`): when a GRN, dispatch or invoice save is refused by the server or fails, when its answer is lost, and when a lost answer is settled, one captured message is sent at level info (refused, settled) or warning (failed, lost). Its text is `outcome <kind>` followed by whichever of these are known: `code=` (the server's refusal or error code, redacted by `redactErrorText`, reduced to plain characters and cut to 64; present when the error carries one), `path=` (`public` or `lan`), `http=` (the status number) and `key=` (the save's request code: a SHA-256-derived hash of the request with the form's random nonce, or a random id for an update; it names no person or record; the hash is written in groups of eight digits joined by dots so that the redaction of session tokens does not remove it, and removing the dots gives the server's code back). The error message, the request or answer body, names, amounts and phone numbers are never part of it. With no DSN nothing is sent.

Never sent:

- **the request body** (`event.request.data` is deleted in `beforeSend`, whatever it holds and however deep; nothing in the app fills it today);
- the query string and fragment of any request address, in breadcrumbs and in the event's request, and `request.query_string`;
- request cookies (values are replaced by `[REDACTED]`), authorization and API-key headers (matched by substring), anything nested deeper than the cap of section 2.C, and any key whose name contains a secret word;
- an account id, a phone number, the records of the cold storage (customers, GRNs, dispatches, invoices, stock), photos, screenshots and view hierarchies (the SDK options for them are not set).

Two limits to state plainly when the operator answers a question about this:

- **Native layer.** The SDK removes `beforeSend` and `beforeBreadcrumb` from the options it hands to the native iOS and Android SDKs (`@sentry/react-native` `dist/js/wrapper.js`), so a report that the native crash handler itself creates (a native crash, not a JavaScript error) does not pass through the filters of section 2. It holds the device details, the stack and the app version, not the app's business text. Native code may also attach a random identifier created at install, which is not derived from the account. Neither was checked on a device build here; the operator's received-event test (RELEASE_PREPARATION.md, "Evidence to attach") should look for it.
- **Server side.** The service receiving the report sees the IP address of the phone as the request arrives. Section 3 asks for scrubbing of it, and the Apple and Google declarations depend on it.

### Technical activation

- **Empty DSN by Default**: In `.env.example`, `EXPO_PUBLIC_SENTRY_DSN` is blank. If unconfigured, Sentry is never initialized (`app/_layout.tsx`).
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

- **User Object**: `id` is deleted. `phone`, `email`, and `ip_address` are explicitly replaced with `[REDACTED]`. Only the coarse application role (`role`) is retained; `setSentryUser(role)` sets nothing else.
- **Request**: the URL is cut at its query and fragment (host and path stay) and `query_string` is deleted. Headers are redacted by name, matched as a substring against the header words (`authorization`, `apikey`, `x-supabase-auth`, `cookie`, `set-cookie`, `proxy-authorization`, `x-api-key`, `authentication`) and against the secret words of section 2.C, so `x-session-token` is caught. Cookie values become `[REDACTED]`, `request.env` is sanitized like any other data, and the **request body (`request.data`) is deleted** (section 1).
- **Extra Context**: Context dictionaries passed to `captureException` are scanned; keys matching sensitive credential names and values matching regex patterns are sanitized.
- **Tags & Metadata**: Custom tags matching sensitive identifiers are redacted.
- **Message and Exception Text**: `event.message`, the log entry and the message of every exception in the chain are redacted with the pattern registry, plus the row values PostgreSQL quotes in a constraint error (`Key (mobile)=(...)`, `Failing row contains (...)`) and 64-character session tokens. `captureMessage` applies the same redaction before the SDK is called.
- **Contexts**: Context objects undergo the same deep recursive sanitization; the trace context (generated ids only) is passed through.

### C. Recursive Sanitization: Depth Cap and Key Names

`sanitizeData` walks `request.env`, `extra`, contexts, breadcrumb data and log-entry parameters (a request body is not walked: it is deleted, section 1):

- **Depth cap (`MAX_DEPTH`, 8 levels)**: it fails closed. An object or array nested deeper than the cap is not returned as it came in. It is replaced by the marker `[TRUNCATED]`, so nothing below the cap leaves the phone. A string below the cap is still scrubbed with the patterns of the next section (a number or boolean is kept, since it carries no secret). Seeing `[TRUNCATED]` in a stored event means the payload was too deep to inspect; send shallower data if you need it in the report.
- **Strings**: every string leaf is scrubbed with the error-text patterns (the registry below plus 64-character session tokens and quoted row values), at any depth.
- **Key names**: a key is redacted (`[REDACTED]`, its value is not inspected) when it contains `token`, `secret`, `passw`, `otp`, `authorization`, `cookie`, `credential` or `phone` in any letter case (`identity_token`, `newPassword`, `client_secret`, `Set-Cookie`, `userPhone`), or when the whole name is one of the short names `jwt`, `apikey`, `api_key`, `code` or `auth`. The words are matched anywhere in the name on purpose; a harmless key that happens to contain one (`footprint` contains `otp`) is redacted as well. Keys the app and the Sentry SDK put into events (`isFatal`, `source`, `componentStack`, `statusCode`, `model`, `memory_size`, `boot_time` and the like) do not contain these words, so no allow-list is kept; the tests in `src/config/__tests__/sentryConfig.test.ts` pin a sample of both groups.
- **Circular references** are replaced by `[CIRCULAR]`.

The Sentry SDK itself normalizes breadcrumb data, contexts and `extra` to its own `normalizeDepth` before `beforeSend`, but not log-entry parameters, and an operator can raise that setting. The cap here does not depend on it.

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
