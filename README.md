# rn-warehouse-template

The operator branch connects to an independent warehouse backend through its
canonical HTTPS origin. Start with the [current developer handoff](docs/DEVELOPER_HANDOFF.md)
and [fresh operator installation notes](docs/OPERATOR_INSTALL_NOTES.md).
The operator changes are under review; the source-demo evidence below does not
validate the changed runtime.

## Local production-readiness work

The provider-independent backend operations and Android artifact work are
implemented and reproducible. The local Android debug APK build/audit, exact
permission result, Expo public-certificate handling, and remaining signed-store
boundary are recorded in
[LOCAL_PRODUCTION_READINESS.md](docs/LOCAL_PRODUCTION_READINESS.md). Production
SMS, public DNS/TLS, external alerts, operator policies/SLOs, final signing and
stores, payments/telemetry, and hardware still require their actual services,
credentials, infrastructure, or owner decisions. Existing demo tags do not move.

## Historical source-demo release

The Android-first source-demo acceptance is complete. Matching
`v0.2.2-demo` source-only GitHub prereleases were published on 2026-09-18.
Those historical tags remain immutable. Use the reviewed operator commit pair
for the fresh VM integration test.

The public acceptance summary is in
[SOURCE_DEMO_ACCEPTANCE.md](docs/SOURCE_DEMO_ACCEPTANCE.md). Ownership and
third-party review evidence is in
[ATTRIBUTION_REVIEW.md](docs/ATTRIBUTION_REVIEW.md). A post-release physical
Android run now covers USB, camera, picker, permission, offline/retry, role,
deep-link, restoration, and PDF workflows. Physical iPhone source-demo
acceptance, including the later order/cart and gateway retest, is recorded in
[NATIVE_ACCEPTANCE.md](docs/NATIVE_ACCEPTANCE.md). Production operations,
signed/native distribution, printing, sensors, and unsupported integrations
remain separate gates.

Open-source React Native warehouse application source, built with Expo,
Supabase, Redux Toolkit, and Expo Router.

The operator branch connects to a warehouse-owned installation. At first
launch, enter or scan its **HTTPS origin**. The app checks the server identity,
API compatibility and minimum client version before restoring any session. It
stores one active operator server; switching clears the previous session and
business caches. The [v0.2.2-demo prerelease](https://github.com/abhiguru/rn-warehouse-template/releases/tag/v0.2.2-demo)
remains the historical source-demo pair.

## Start locally

Prerequisites: Node.js **22.18+** and npm. Native Android builds also need Android
Studio, Android SDK, and a compatible JDK. iOS builds require macOS and Xcode
16.1+ for this SDK; app-store submission requirements should be checked separately.
This tree uses Expo SDK 54 / React Native 0.81.

For command-line Android work, set `ANDROID_HOME` to the SDK root and add
`$ANDROID_HOME/emulator` and `$ANDROID_HOME/platform-tools` to `PATH`. Verify
`emulator -list-avds` and `adb devices -l` before selecting a device; do not
implicitly adopt an emulator owned by another checkout or user.

```bash
git clone https://github.com/abhiguru/rn-warehouse-template.git
cd rn-warehouse-template
git switch --detach 8240cce9121a797fd0cf2e00e568a61985814ddb
git rev-parse HEAD
git status --porcelain
npm ci
node scripts/create-env.mjs
npm run typecheck
npm run lint
npm test
npm run test:setup
```

`bash setup.sh` installs locked dependencies and creates `.env` only if absent.
It never inspects Docker, reads service-role credentials, or overwrites an existing
environment file.

Require a clean checkout of this exact candidate: it is published in draft
[PR #33](https://github.com/abhiguru/rn-warehouse-template/pull/33), not mobile
`main`. The backend baseline is `f18f51d4625e7f8c0d977ac69645804e318a9d49`
(merged PR #68). Stop if either commit is unavailable; explain before substituting.
Complete backend local/public doctor before beginning Android installation.
Use the immutable `v0.2.2-demo` tag only to reproduce the historical demo.

## Connect a compatible backend

Install the companion backend in operator mode using its
[`OPERATOR_INSTALL.md`](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/OPERATOR_INSTALL.md).
The mobile app requires the operator's canonical HTTPS origin, reachable from
the device, and a real SMS code sent to the entered phone. No fixed OTP or demo
account is available on current `main`. A new customer's verified phone enters
pending enrollment; an administrator opens **Settings → Enrollment Review**,
selects one or more existing customer records and approves or rejects it. After
approval, the customer requests a new code to sign in. Rejected or disabled
accounts cannot sign in.

```bash
npm run check:backend
```

For the CLI check, set `EXPO_PUBLIC_CONFIG_API_URL` to the selected operator
origin. The app itself uses the server chosen on its first screen. This read-only
check fetches public bootstrap configuration and detects wrong URLs,
missing configuration, and accidental service-role keys. It does **not** prove
that login or warehouse APIs work. No keys need to be copied into the app: it
fetches its public anon key dynamically. `update-supabase-keys` is a deprecated
alias for this check and no longer reads Docker.

## Build a standalone operator test app

Follow the [local standalone APK sequence](docs/OPERATOR_INSTALL_NOTES.md#reproducible-local-standalone-test-apk)
for JDK/SDK installation, a separate native test identity, bundled release-variant
build, artifact audit and device acceptance without Metro. This is a local test
artifact; production signing and distribution remain open.

## Run a native debug build

```bash
npm run android
# Or, on macOS:
npm run ios
```

Expo generates the ignored native directories as needed. Use `npm start` for
subsequent Metro sessions. Use native builds as the baseline; the latest Expo Go
app may not support this older SDK, and Expo Go does not validate native plugins,
permissions, or build settings. The API-36 emulator debug build and supported
source-demo workflows were verified on the historical pair. Physical Samsung Android 15/API-35 and
iPhone 15/iOS 26.6.2 runs are recorded separately. See
[NATIVE_ACCEPTANCE.md](docs/NATIVE_ACCEPTANCE.md).
Dated operator authentication, server-selection and provider results are in
[OPERATOR_INSTALL_NOTES.md](docs/OPERATOR_INSTALL_NOTES.md). Each result applies
only to its recorded source, artifact and device; consult its current matrix
and [next acceptance plan](docs/OPERATOR_NEXT_ACCEPTANCE.md) for open cases.

For a bundle-only check:

```bash
npx expo export --platform android
```

For cloud builds, first configure your own EAS project and signing credentials.
No original signing assets or project ownership are included.

## Application code

Screens cover GRN, dispatch, invoices, customer orders, stock, reports, sensor
monitoring, and role-based views. Their presence is not a claim of backend
completeness. All statically identified RPC names, four PDF endpoints, and
companion preprinted print endpoints match the backend template contract (0 missing);
physical printer/sensor hardware testing and broader runtime acceptance remain incomplete.

- `app/`: Expo Router routes and forms.
- `src/services/`: backend calls and configuration.
- `src/store/`: Redux state.
- `src/components/`, `src/features/`, `src/hooks/`: UI/features.
- `src/theme/`, `src/types/`, `src/utils/`: shared code.

Customize app identity in `app.json` (name, slug, scheme, bundle/package IDs).
Use `.env` for displayed app/company names and optional Sentry DSN. Replace
placeholder assets in `assets/` and review privacy/legal text and data collection
before distributing a branded build. Never put private server keys in
`EXPO_PUBLIC_*` variables: those are bundled into the app.

## Checks and release status

The mobile test suite includes 165 automated Jest tests across 20 suites, covering
fail-closed secure storage, token refresh, OTP verification, and client-side
telemetry redaction (URLs, headers, user PII, breadcrumbs). See [READINESS.md](docs/READINESS.md)
and [TELEMETRY_AND_PRIVACY.md](docs/TELEMETRY_AND_PRIVACY.md).
Dependency audit findings are tracked in [DEPENDENCY_SECURITY.md](docs/DEPENDENCY_SECURITY.md).

GitHub Actions CI runs lint, typecheck, tests and a high-severity dependency gate
on pushes and pull requests to `main`; dependency remediation is documented.
Tag validation is separate. Demo releases are explicitly published as prereleases
after validation, without production signing assets or unreviewed app binaries.

MIT — see [LICENSE](LICENSE). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
Security reports: [SECURITY.md](SECURITY.md).

Order/cart live-update behavior and its acceptance scope are documented in
[ORDER_LIVE_UPDATES.md](docs/ORDER_LIVE_UPDATES.md).
