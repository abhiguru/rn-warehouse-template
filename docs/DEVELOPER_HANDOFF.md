# Developer handoff — v0.2.2-demo

## Current source-demo checkpoint — 2026-09-23

The gateway follow-up is merged at mobile
`f818c325b4d314b308187e3d12fd8d2e16d59db1` / backend
`f96f49f94e61bd7a57d7758c93b07c1324728d89` through
[mobile PR #28](https://github.com/abhiguru/rn-warehouse-template/pull/28) and
[backend PR #42](https://github.com/abhiguru/supabase-warehouse-template/pull/42).
Their [mobile exact-main CI](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35866779110)
and [backend exact-main CI](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35868837880)
passed. These SHAs identify the reviewed source checkpoint even if later
documentation-only commits advance `main`. The full earlier phone matrix and
affected gateway retest remain attributed to their exact tested SHAs in
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md#current-gateway-merge-closure--2026-09-23);
the phone did not run on these merge SHAs. The source-demo handoff is complete.

For further work, clone current sibling `main` branches into an isolated local
workspace and check for later commits before following the setup instructions
below. Production security inventory/scans, operator policies and services,
native signing/distribution, and hardware integrations remain open. The earlier
configuration HTTP 500 has no established cause; the subsequent green CI is
not a diagnosis of it. Existing demo tags remain immutable.

## Remaining work after the source-demo handoff — 2026-09-24

The accepted source-demo flows, physical Android/iPhone records, affected gateway
retest, and local debug APK audit do not need another run solely because this
documentation changed. Their tested commits and limits remain in
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md) and
[LOCAL_PRODUCTION_READINESS.md](LOCAL_PRODUCTION_READINESS.md). Test affected
cases if runtime or native configuration changes.

The companion backend's
[remaining production work](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/PRODUCTION_DEPENDENCIES.md#remaining-production-work)
is the canonical tracker for the unexplained historical configuration HTTP 500,
component security evidence, SMS, public hosting, alerts, off-host recovery,
retention, billing policy, and target capacity. Its dated findings are recorded
evidence, not a fresh scan. Mobile work remains:

| Stage | Owner and task | Completion evidence |
| --- | --- | --- |
| Inputs before distribution | Operator/product owner: choose app name, bundle/package IDs and scheme, artwork, supported platforms and distribution route; supply owned signing and store accounts. Review privacy/legal text, actual data collection and store declarations. | Reviewed app identity, assets, privacy declarations and distribution plan; signing material stays outside Git. See [README.md](../README.md#application-code) and [LOCAL_PRODUCTION_READINESS.md](LOCAL_PRODUCTION_READINESS.md#remaining-external-or-distribution-gates). |
| Signed release artifacts | Mobile release owner, after those inputs: build final release AAB/APK and iOS archive with owned credentials; audit each artifact for contents, permissions, certificates, secrets and applicable third-party notices. | Artifact hashes, audit results, notices, build IDs and signing provenance for the exact intended builds. The 2026-09-22 debug APK audit is only a development baseline. See [ATTRIBUTION_REVIEW.md](ATTRIBUTION_REVIEW.md#development-artifact-follow-up--2026-09-22). |
| Telemetry decision and acceptance | Operator decides whether to enable optional Sentry/GlitchTip and supplies an owned test destination and retention/access policy if enabled. Mobile/operations owners then test delivery and received-payload redaction, including native crashes and breadcrumbs. | Disabled configuration remains empty, or a reviewed report shows received payloads, scrubbing, access and retention for the chosen service; reconcile store privacy declarations with observed collection. See [TELEMETRY_AND_PRIVACY.md](TELEMETRY_AND_PRIVACY.md) and [NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md#manual-acceptance-matrix). |
| Distribution acceptance | Mobile release owner and operator: submit or distribute the exact reviewed builds through the chosen Play/App Store/TestFlight or enterprise path, then accept required platform/device behavior on those builds. | Store/enterprise review outcome, final artifact/build IDs and targeted device results tied to the submitted versions. Historical source-demo phone SHAs and a compiled Android debug APK do not establish release-build acceptance. |

Printing, sensors, payments, customer document uploads, barcode scanning and
automatic offline synchronization are outside the default source-demo contract.
Only if an operator adopts one should its owner specify the hardware/provider,
behavior and acceptance cases, implement the integration, and record real
hardware/service results. The [unsupported-features boundary](#unsupported-and-separately-untested)
describes the present behavior. Existing demo tags remain immutable.

## Current continuation point — local readiness 1–11

The local Android artifact work is complete and recorded in
[LOCAL_PRODUCTION_READINESS.md](LOCAL_PRODUCTION_READINESS.md); companion backend
evidence covers the other ten areas. Mobile CI now creates and audits a debug APK
without publishing it.

Do not describe this as production distribution. Final Android/iOS release
signing, artifact/store/privacy review, production telemetry, external services,
operator policies/SLOs, and the backend image-scan blocker remain open. Existing
source-demo tags are immutable.

## Final post-release closure — 2026-09-22

The physical-iPhone source-demo handoff is complete. Mobile PR
[#18](https://github.com/abhiguru/rn-warehouse-template/pull/18) merged as
`9ba56ff122dc38dc57d6100de4c27599023d22b1`; backend PR
[#13](https://github.com/abhiguru/supabase-warehouse-template/pull/13) merged as
`cf18f1e43ab613310b1b13339ab97e8533861f9b`. Exact-main CI passed in mobile run
[`35686164009`](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35686164009)
and backend run
[`35686198287`](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35686198287).

An iPhone 15 on iOS 26.6.2 passed the complete local source-demo matrix,
including tracked USB-only onboarding, secure-session failure and revocation,
admin/customer roles, customer GRN/dispatch history, camera/picker/image
lifecycle, GRN/dispatch/stock/cart/pricing/invoice flows, all four private PDF
share paths, and protected/malformed deep links. Shared runtime/navigation work
also has Android coverage: the earlier merged customer-history pair passed a
fresh API-36 emulator smoke, while the final pair passed Android JS export and
shared regression tests. This Mac had no Android SDK, so the exact final pair
was not rerun in an emulator. See
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md) for the complete evidence and
[the closed review](HANDOFF_REVIEW_2026-09-21.md) for the decision.

The release-tag commands below reproduce the immutable published baseline, not
these post-release fixes. Existing `v0.2.2-demo` tags remain unchanged.

## Active source-demo release — 2026-09-18

Source-demo acceptance and publication are complete. Use `v0.2.2-demo` in
both sibling repositories for the verified release pair. The mobile tag targets
`6e6885786912fe9186285103e19de762e4ba88f8`; the backend tag targets
`2959881d0e46a8797a98d10da8c7139217477476`. At publication, the backend's
active and documented CI copies pinned that mobile tag commit. Their later
paired source-demo workflow pin is mobile runtime `c127ef6`; it was not repinned
for documentation-only or squash-equivalent changes.

Follow the backend `docs/CLEAN_INSTALL.md` isolation procedure with a unique
Compose project and unused loopback ports. Run backend setup/doctor/health first;
then create the mobile environment with its repository script, point it at the
same localhost API origin, and run doctor, bootstrap check, Android export, and
the native debug build. Do not copy configuration or credentials from another
checkout. Prove setup rerun, stop, restart, configuration preservation, and
Android login/connectivity before treating onboarding as reproducible.

This is a source-demo release, not a production or all-platform release.
Post-release physical Android and iOS acceptance now cover USB connectivity,
camera, picker, permission lifecycle, offline/retry, roles, deep links, secure
restoration, warehouse mutations, and all four private PDF share paths.
Production SMS/TLS/operations, distribution, enabled native telemetry,
printing, sensors, and unsupported integrations remain separate gates. The
reviewed merges, default-branch CI, exact-tag validation, and
matching source-only prerelease publication completed on 2026-09-18.

The 2026-09-18 fresh-clone rehearsal now passes dependency install, generated
configuration, backend bootstrap, Android debug build/install, login, native
picker and PDF sharing, setup rerun, owned stop/restart, and authenticated cold
restoration. The acceptance-discovered development-client route defect is fixed
and regression-tested. The durable result is summarized in
[SOURCE_DEMO_ACCEPTANCE.md](SOURCE_DEMO_ACCEPTANCE.md), and ownership/attribution
evidence is in [ATTRIBUTION_REVIEW.md](ATTRIBUTION_REVIEW.md).

The post-release physical-iOS run also fixed Item Pricing customer search for
the backend's standardized `{ success, data }` response while retaining support
for the legacy direct-array shape. A focused parser regression test and a real
iPhone search for the fictional `Example` customers passed.

The customer history repair does not move or amend `v0.2.2-demo`. Its merged
evidence covers assigned-customer results, cross-customer denial, pagination,
explicit mobile error handling, hosted CI, and the post-merge Android emulator
smoke. Physical-device behavior remains covered by the separate recorded
Android/iOS matrices.

## Historical `v0.2.1-demo` record

See [the dated verification ledger](RESUME_VERIFICATION_2026-09-15.md)
for current local checks and open native/review gates. Evidence below dated
2026-09-14 or earlier describes the historical release checkpoint. The
pending mobile authentication/privacy fixes and backend follow-up commits
are outside the immutable `v0.2.1-demo` tags. Local follow-up results do
not establish merged-main CI or physical-device acceptance.

This pair is a local warehouse development demo, Android first. Production setup
remains blocked. Release notes identify the exact commit pair and verification:
[mobile](https://github.com/abhiguru/rn-warehouse-template/releases/tag/v0.2.1-demo),
[backend](https://github.com/abhiguru/supabase-warehouse-template/releases/tag/v0.2.1-demo).
The tags were published on 2026-09-14. See [release verification](RELEASE_CHECKLIST.md)
for the backend CI checkout failure and subsequent follow-up evidence.

## Prerequisites and paired checkout

Use Node.js 22.18+ with npm, Git, Docker with Compose v2, and OpenSSL. Android
native development needs a compatible JDK (17 or 21), SDK platform 36, build tools
36.0.0, platform tools, and an emulator or USB device. Expo SDK 54 / React Native
0.81.5 remain selected by the lockfile. Allow space for Docker images, npm,
the Android SDK/NDK, and Gradle caches. iOS requires macOS, full Xcode and
CocoaPods; the physical-device evidence is recorded in `NATIVE_ACCEPTANCE.md`.

For command-line Android work, export the installed SDK root as `ANDROID_HOME`
and add `$ANDROID_HOME/emulator` and `$ANDROID_HOME/platform-tools` to `PATH`.
Run `emulator -list-avds`, select a suitable API-36 AVD, start it with
`emulator -avd "$AVD_NAME"`, discover its serial with `adb devices -l`, and
confirm ownership/identity with `adb -s "$EMULATOR_SERIAL" emu avd name` before
adding reverse mappings. Record whether the rehearsal started that emulator;
never stop an emulator the rehearsal did not start.

```bash
git clone --branch v0.2.2-demo https://github.com/abhiguru/supabase-warehouse-template.git
git clone --branch v0.2.2-demo https://github.com/abhiguru/rn-warehouse-template.git
cd supabase-warehouse-template
npm ci
bash setup.sh --demo
npm run doctor
```

Setup exclusively creates `docker/.env` with mode 0600. Reruns preserve its bytes
and permissions. It starts the database, applies checksummed migrations and demo
authorization, then starts the API. Do not copy keys from another installation.
The scripts check both Compose project name and owning checkout before operating.

```bash
cd ../rn-warehouse-template
npm ci
node scripts/create-env.mjs
npm run doctor
adb reverse tcp:18000 tcp:18000
adb reverse tcp:8081 tcp:8081
npm run android
```

The app's `.env` must contain `EXPO_PUBLIC_CONFIG_API_URL=http://localhost:18000`.
Both backend public URL settings must use that exact origin. Android USB devices
and emulators use `adb reverse`; the supported demo does not use a LAN origin.
With several attached devices, select one using `adb -s SERIAL reverse ...`.
Run `npm start -- --localhost` for later Metro sessions. Doctor is read-only; it
checks prerequisites/configuration/connectivity without starting services or
printing credentials. It does not start ADB or prove device connectivity: inspect
`adb devices` and `adb reverse --list` yourself. `doctor -- --backend-only` checks
the mobile bootstrap without requiring the Android SDK.

For iOS, generate the native project on the Mac and select your own development
team/device. The simulator can use the Mac's loopback API. A physical iPhone
requires the tracked USB-only connection procedure in
[IOS_USB_DEVELOPMENT.md](IOS_USB_DEVELOPMENT.md). Its checkout-owned helper
handles API/Metro relay status, reconnect/address changes and scoped shutdown.
The Android commands above do not provide an iOS connection.

## First login and warehouse walkthrough

Enter admin **0000000001**, then demo OTP **123456**. For the assigned customer,
use **0000000002** and the same code. No SMS is sent. Only fictional numbers
0000000001–0000000009 work in explicit demo mode. OTP limits still apply (five
requests/hour, twenty/day); repeated automated runs consume those allowances.

1. As admin, open the seeded customer and create a GRN with the example item,
   100 bags at 10 kg each, a receipt date, and a rack. Note the GRN number.
2. Dispatch 20 bags from that GRN. Stock should be 80 bags / 800 kg. Reopening
   stock and customer reports should show the committed movement.
3. Sign out, then sign in as the assigned customer. View that customer's stock,
   add an item to a cart, change its quantity, and remove it. Customers cannot
   create GRNs, dispatch stock, or access another customer's images.
4. Sign back in as admin. Configure a monthly item price using `price_type` and
   `unit_price`. Dispatch the remaining stock before generating an invoice
   preview; preview requires a fully dispatched, uninvoiced GRN. Review rates,
   duration, labour, tax and rounding before saving.
5. Download a GRN, dispatch, invoice or customer-stock PDF. Documents use generic
   starter layouts. GRN/dispatch images use register → upload → confirm;
   deletion revokes metadata access and removes stored bytes. A storage cleanup
   failure is reported, not treated as complete deletion.

### Pricing and document customization

This is a customizable source template. Authorized warehouse staff can maintain
default or customer-specific item rates, pricing type, weight bands, labour,
tax and effective dates through Item Pricing. The billing-day calculation is a
code-level business-policy extension point, not a runtime end-user setting in
this release: customize the backend `calculate_invoice_duration` contract and
its invoice-preview/save consumers when onboarding a cold-storage operator that
uses different day, fortnight or month boundaries. Update `docs/INVOICE_RULES.md`
and the duration, preview and rounding fixtures with every policy change.

Generated PDFs are also starter templates. `COMPANY_NAME` supplies the displayed
cold-storage name, while `functions/_shared/document-html.ts` defines the shared
header, styling, metadata, table and footer used by GRN, dispatch, invoice and
stock PDFs. Customize that template for the operator's name, logo, address,
registration/tax details, terms and document header, then redeploy the PDF Edge
functions and verify all four private-document flows. This customization is
source/deployment work; the current app does not provide a branding editor.

`npm run test:api` in the backend creates fictional fixtures for these API flows.
The test uses a customer-specific monthly rate of 5, labour rate 2 and tax 5%.
For 100 units dispatched after 31 days in legacy duration mode, preview asserts
1.5 periods, storage 750, labour 200, subtotal 950, rounded tax 48 and total 998.
Existing invoice save accepts client-supplied totals and rounds total/tax upward
to whole units; it does not independently recalculate all supplied business values.
These are preserved demo rules. See the backend
[formula reference](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/INVOICE_RULES.md)
for duration boundaries, row/header rounding and unsupported contracts.

## Architecture and contribution workflow

`app/` contains Expo Router screens. Mobile services call PostgREST RPCs and
private Storage; Redux holds UI state. Public bootstrap discovers the anon key.
Only SecureStore restores session identity. Public configuration is cached by
origin for one hour; full configuration uses origin/user/session for 60 seconds.
Logout/account changes invalidate pending work and authenticated configuration.
Server session checks, current roles and RLS remain authoritative.

The backend runs Kong, PostgREST, PostgreSQL, Storage, Edge functions and the PDF
renderer in a checkout-owned Compose project. Custom OTP sessions use opaque,
rotating refresh credentials; GoTrue is not the demo login path. PDF Edge
functions authorize the caller before rendering and private signed download.

For changes, branch from current main in both public repositories. Use `npm ci`;
commit lockfile changes deliberately. Mobile checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:setup`, `npx expo install --check`,
`npm audit`, and Android export/native validation when applicable. Backend
checks: `npm test`, `npm run test:migrations`, `npm run test:api`, and
`node scripts/check-mobile-contract.mjs ../rn-warehouse-template --live`.
Migration tests create/remove their own disposable database. Add a migration;
never edit an already applied migration or broaden grants to satisfy a screen.
Submit PRs and wait for required checks. Source-only demo releases retain the
separate production gate and preserve historical tags.

## Troubleshooting and shutdown

| Symptom | Action |
| --- | --- |
| Missing prerequisite | Run doctor; install prerequisites yourself, then retry. |
| Project belongs to another checkout | Export a unique `WAREHOUSE_PROJECT_NAME=warehouse-your-name` for every backend command. |
| Port conflict | Before starting a fresh checkout, select distinct unused API/HTTPS/Studio/DB/renderer ports in its generated env. Update both backend public URLs, the mobile origin and ADB reverse mapping. |
| Phone cannot fetch bootstrap | Verify USB authorization, selected device, reverse mappings, API health, and matching localhost origins. |
| Existing env rejected | Inspect only your checkout's settings; setup intentionally preserves them. Never overwrite another installation's credentials. |
| OTP throttled | Wait for the limit window; do not disable auth protections or reset a production database. |
| Session expired/offline | Restore connectivity and retry; definitive authorization rejection requires login. Logout clears local credentials even if server revocation cannot be reached. |
| Image cleanup failed | Metadata access is revoked, but a maintainer must inspect remaining bytes in this demo's private bucket before claiming complete removal. |
| Invoice preview unavailable | Fully dispatch the GRN, check its pricing configuration and ensure it is not already invoiced. |
| Decoder installation refused | Dependency version/content changed. Review the adapter and consumer tests; do not bypass postinstall or suppress the advisory. |

Stop Metro with Ctrl-C. In the backend checkout run `bash stop.sh`; restart with
`bash start.sh --demo`. Keep the same `WAREHOUSE_PROJECT_NAME` when customized.
Stop preserves database/files. Remove only the reverse mappings you created:
`adb reverse --remove tcp:18000` and `adb reverse --remove tcp:8081`.

## Unsupported and separately untested

Physical printing, sensors, customer document uploads, production SMS, barcode
scanning and automatic offline/SQLite synchronization are unsupported. Default
source-demo Realtime covers order/cart invalidation and authorized refetch, with
recorded Android emulator and physical-iPhone acceptance in
[ORDER_LIVE_UPDATES.md](ORDER_LIVE_UPDATES.md) and
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md). Stock/invoice subscriptions are
outside that scope; target-deployment capacity/resilience remains a production
gate in the companion backend's
[remaining work](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/PRODUCTION_DEPENDENCIES.md#remaining-production-work).
Printing/sensor UI explains unavailability; hardware Edge endpoints return 503.
The imported dual-rate pricing overload is not the mobile contract and currently
fails its legacy table constraints; combined-rate semantics require a separate
review. Change-category filtering is unavailable; other change-log filters remain.
Payments/accounting integrations are not part of the documented demo workflow.

iOS production distribution, production scale/security, enabled native telemetry
delivery, retention enforcement, and privacy declarations remain separate
checks. Physical Android core acceptance and the complete physical-iPhone
source-demo matrix passed after publication; see NATIVE_ACCEPTANCE.md. The scoped
ownership and attribution review is complete; see ATTRIBUTION_REVIEW.md.
A successful bundle still does not replace platform-specific device evidence.
