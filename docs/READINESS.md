# Readiness — 2026-09-12

Current main pairs with a tested **local-demo backend**. This is not a
production-ready or native-device-accepted release. Use current main in both
repositories; the old v0.1.0 backend tag remains incomplete.

## Verified

- 75 Jest tests (6 suites) pass, including Sentry/GlitchTip telemetry redaction
  (URLs, query params, headers, user PII, recursive payloads, and real-time breadcrumbs),
  secure-storage write/migration failure paths, expired access-token renewal, single-flight
  refresh, transient network failure, refresh rejection, custom logout,
  legacy-token migration, expired profile-cache reload, and OTP authentication without GoTrue.
- TypeScript and ESLint error checks pass. Backend public configuration is
  reachable from this checkout.
- The companion backend's live API tests pass for admin/customer login,
  customer isolation, GRN, dispatch stock updates, oversell rejection, invoice
  saving, four PDF/signed-download flows, refresh replay, and logout revocation.
- Removed raw OTP/session-response and token-prefix logging from the central
  session manager. PDF/print services now use the central refreshing token
  getter. Fixed the paginated customer-item response adapter.
- Setup preserves an existing environment file and retrieves no private backend
  keys. Original repositories and credentials remain unchanged.
- Session persistence no longer falls back to Base64/AsyncStorage. Legacy
  credentials are used only after secure migration succeeds. Token helpers share
  the same session manager; incomplete writes cannot supply a refresh token.

- Gitleaks 8.30.1 scans of the publishable mobile tree and its Git history find
  no secrets. The backend publication scan removed a legacy SMS initializer
  before release, without changing the original credential.

Follow the [ordered release tracker](RELEASE_CHECKLIST.md) for ongoing work.

The 2026-09-12 Android JavaScript export passed (2,934 modules, 45 assets).
It is not a native APK or physical-device test.

## Local demo

Start current backend main with `bash setup.sh --demo`. API defaults to
`http://localhost:18000`; set the mobile `EXPO_PUBLIC_CONFIG_API_URL` to that
origin and run `npm run check:backend`. For an Android device attached to the
backend host, `adb reverse tcp:18000 tcp:18000` keeps the API loopback-only.
Use `adb reverse tcp:8081 tcp:8081` if Metro also runs on that host.

Demo admin: 0000000001. Demo customer: 0000000002. OTP: 123456.
Only the backend's explicit local demo permits these impossible subscriber
numbers; no SMS is sent. Do not expose demo authentication publicly.

## Remaining acceptance work

1. Complete native Android/iOS builds and fresh install, login, app restart,
   cache-expiry, offline/error, camera, secure-storage, deep-link and role flows.
   Local Jest/API tests do not establish that every mobile screen works.
2. Complete image upload/deletion, pricing/invoice calculations, payments,
   cart/order lifecycle, reports and concurrency tests against the backend.
   Backend inventory finds all 100 called RPC names, but not every signature or
   business result has been verified.
3. Export/review optional preprinted-print endpoints and dynamic print-job
   management. Validate actual printer/sensor hardware and Realtime before
   enabling them. Four generic PDF endpoints are now implemented and API-tested.
4. Implement production SMS and operator onboarding without fixed-code fallback.
   Production setup remains gated.
5. Resolve remaining dependency findings (2026-09-12: 0 high, 8 moderate,
   0 critical) through navigation-compatible fixes and native regression tests.
   Reviewed Metro/PostCSS/UUID overrides removed the high findings; see
   [dependency review](DEPENDENCY_SECURITY.md). Avoid exposing Metro.
6. CI workflows are activated in `.github/workflows/` and verified passing on GitHub Actions
   (Lint, Typecheck, 59 tests, dependency audit, and bundle export all green).
   Complete remaining rights/assets/privacy, secret/history and release-artifact checks.

See the backend [readiness checklist](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/READINESS.md)
for the full integration/deployment boundary.
