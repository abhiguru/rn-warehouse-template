# Readiness

## Current source-demo status — 2026-09-18

The Android-first source-demo scope is accepted. Matching `v0.2.2-demo` tags
remain forthcoming until both reviewed changes merge, default-branch CI passes,
the exact tags pass release validation, and both source-only prereleases are
published. Use matching current `main` branches during preparation and matching
`v0.2.2-demo` tags after publication.

The verified scope and separate gates are recorded in
[SOURCE_DEMO_ACCEPTANCE.md](SOURCE_DEMO_ACCEPTANCE.md). The scoped maintainer
redistribution attestation and reconciled third-party inventory are recorded in
[ATTRIBUTION_REVIEW.md](ATTRIBUTION_REVIEW.md). There is no unresolved
source-only attribution blocker.

Physical Android hardware/camera, iOS, production SMS/TLS/operations,
app-store/native-binary distribution, printing, sensors, payments, Realtime, and
unsupported integrations remain separate gates.

## Historical readiness records

### Source-demo handoff candidate — 2026-09-18 (historical pre-merge record)

PR #10 is the reviewed Android source-demo handoff candidate. Its companion
backend PR #7 pins the exact remotely available mobile commit in both
byte-identical workflow copies. The current candidate passes 20 Jest suites / 165
tests, typecheck, five setup checks, dependency and redacted source/history CI,
Android export, a fresh API-36 debug build/install, login, authenticated cold
restoration, offline/reconnect/auth isolation, GRN/dispatch/stock, cart/order,
invoice, all four PDF flows, Android photo picker upload/display/delete, document
sharing, navigation/deep links, status-bar lifecycle, and clean-clone onboarding.

This establishes source-demo developer handoff only after both PRs merge and the
resulting default-branch pair passes required CI and compatibility checks.
Physical camera/hardware, iOS, production SMS/TLS/operations, distribution,
printing, sensors, and unsupported integrations remain separate release gates.
The immutable `v0.2.1-demo` material below is historical and its tags do not move.

**Follow-up status — 2026-09-15:** See [the dated verification ledger](RESUME_VERIFICATION_2026-09-15.md)
for current local checks and open native/review gates. Evidence below dated
2026-09-14 or earlier describes the historical release checkpoint. The
pending mobile authentication/privacy fixes and backend follow-up commits
are outside the immutable `v0.2.1-demo` tags. Local follow-up results do
not establish merged-main CI or physical-device acceptance.

Current main pairs with a tested **local-demo backend**. This is not a
production-ready or native-device-accepted release. Use matching `v0.2.1-demo` source tags for onboarding; the old v0.1.0 backend tag remains incomplete.

## Verified

- 100 Jest tests (9 suites) pass, including Sentry/GlitchTip telemetry redaction
  (URLs, query params, headers, user PII, recursive payloads, and real-time breadcrumbs),
  secure-storage write/migration failure paths, expired access-token renewal, single-flight
  refresh, transient network failure, refresh rejection, custom logout,
  legacy-token migration, expired profile-cache reload, and OTP authentication without GoTrue.
- TypeScript and ESLint error checks pass. Backend public configuration is
  reachable from this checkout.
- The companion backend's live API tests pass for admin/customer login,
  customer isolation, dynamic assignment lifecycle, staff privilege boundaries,
  storage image registration/upload/confirmation/read/deletion, GRN,
  concurrent dispatch race prevention with exact stock decrement, oversell rejection,
  invoice saving, operational KPI reports, four PDF/signed-download flows, refresh replay,
  and logout revocation.
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

Start the paired backend checkout with `bash setup.sh --demo`. API defaults to
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
   Live contract inventory covers 95 literal RPC names and 128 typed calls with
   zero missing names or mismatches; three dynamic forwarding sites are reported.
   Explicit financial and storage fixtures pass; payments still need business acceptance.
3. Export/review optional preprinted-print endpoints and dynamic print-job
   management. Validate actual printer/sensor hardware and Realtime before
   enabling them. Four generic PDF endpoints are now implemented and API-tested.
4. Implement production SMS and operator onboarding without fixed-code fallback.
   Production setup remains gated.
5. Keep dependency and native compatibility checks current. Both npm audits
   report zero findings on 2026-09-14 after checked decoder/Metro adapters; see
   [dependency review](DEPENDENCY_SECURITY.md). Avoid exposing Metro.
6. CI workflows are activated in `.github/workflows/` and verified passing on GitHub Actions
   for mobile main (100 tests, typecheck/lint, dependency audit and bundle export).
   The released backend main CI selected an old mobile checkout and failed live
   contracts; the follow-up pins its companion SHA. See RELEASE_CHECKLIST.md.
   Complete remaining rights/assets/privacy, secret/history and release-artifact checks.

See the backend [readiness checklist](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/READINESS.md)
for the full integration/deployment boundary.
