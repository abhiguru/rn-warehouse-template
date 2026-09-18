# rn-warehouse-template

## Current source-demo release

The Android-first source-demo acceptance is complete. Matching
`v0.2.2-demo` source-only GitHub prereleases were published on 2026-09-18.
Use `v0.2.2-demo` in both this repository and its backend sibling for the
verified release pair. Existing tags remain immutable; use current `main`
branches for contribution work.

The public acceptance summary is in
[SOURCE_DEMO_ACCEPTANCE.md](docs/SOURCE_DEMO_ACCEPTANCE.md). Ownership and
third-party review evidence is in
[ATTRIBUTION_REVIEW.md](docs/ATTRIBUTION_REVIEW.md). A post-release physical
Android run now covers USB, camera, picker, permission, offline/retry, role,
deep-link, restoration, and PDF workflows. iOS, production operations,
signed/native distribution, printing, sensors, and unsupported integrations
remain separate gates.

Open-source React Native warehouse application source, built with Expo,
Supabase, Redux Toolkit, and Expo Router.

**Current main supports the verified local-demo backend.** The companion
[supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template)
now passes API tests for custom login, customer isolation, GRN, dispatch,
invoice saving and PDF downloads. The supported API-36 emulator workflow and the
post-release physical Android matrix are accepted; production readiness remains
separate. The [v0.2.2-demo prerelease](https://github.com/abhiguru/rn-warehouse-template/releases/tag/v0.2.2-demo)
records the final compatible pair and publishes generated source archives only.

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
git clone --branch v0.2.2-demo https://github.com/abhiguru/rn-warehouse-template.git
cd rn-warehouse-template
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

For contribution work instead of the pinned demo, branch from current `main`.

## Connect a compatible backend

Start the companion backend with `bash setup.sh --demo`. Set
`EXPO_PUBLIC_CONFIG_API_URL` in this app's `.env` to `http://localhost:18000`.
Demo admin: **0000000001**; customer: **0000000002**; OTP: **123456** (no SMS).
For Android attached to the backend host, use `adb reverse tcp:18000 tcp:18000`
and, if Metro runs there, `adb reverse tcp:8081 tcp:8081`.

The supported demo uses the same `http://localhost:18000` origin on the host,
emulator and USB device. Both backend public URLs must match it. Keep demo
authentication bound to loopback; LAN access is outside this supported path.
For an isolated second checkout, change both backend public URLs and its API port,
then use the matching app URL and `adb reverse tcp:PORT tcp:PORT`.

```bash
npm run check:backend
```

This read-only check fetches public bootstrap configuration and detects wrong URLs,
missing configuration, and accidental service-role keys. It does **not** prove
that login or warehouse APIs work. No keys need to be copied into the app: it
fetches its public anon key dynamically. `update-supabase-keys` is a deprecated
alias for this check and no longer reads Docker.

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
source-demo workflows are verified. A physical Samsung Android 15/API-35 run is
recorded separately; iOS remains untested. See
[NATIVE_ACCEPTANCE.md](docs/NATIVE_ACCEPTANCE.md).

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
