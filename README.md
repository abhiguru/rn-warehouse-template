# rn-warehouse-template

Open-source React Native warehouse application source, built with Expo,
Supabase, Redux Toolkit, and Expo Router.

**Current main supports a local-demo backend.** The companion
[supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template)
now passes API tests for custom login, customer isolation, GRN, dispatch,
invoice saving and PDF downloads. Native-device acceptance and production
readiness are still incomplete; use current main in both repositories. See
[READINESS.md](docs/READINESS.md) for verified results and remaining work.

## Start contributing

Prerequisites: Node.js **22.18+** and npm. Native Android builds also need Android
Studio, Android SDK, and a compatible JDK. iOS builds require macOS and Xcode
16.1+ for this SDK; app-store submission requirements should be checked separately.
This tree uses Expo SDK 54 / React Native 0.81.

```bash
git clone https://github.com/abhiguru/rn-warehouse-template.git
cd rn-warehouse-template
npm ci
cp .env.example .env
npm run typecheck
npm run lint
npm test
npm run test:setup
```

`bash setup.sh` installs locked dependencies and creates `.env` only if absent.
It never inspects Docker, reads service-role credentials, or overwrites an existing
environment file.

## Connect a compatible backend

Start the companion backend with `bash setup.sh --demo`. Set
`EXPO_PUBLIC_CONFIG_API_URL` in this app's `.env` to `http://localhost:18000`.
Demo admin: **0000000001**; customer: **0000000002**; OTP: **123456** (no SMS).
For Android attached to the backend host, use `adb reverse tcp:18000 tcp:18000`
and, if Metro runs there, `adb reverse tcp:8081 tcp:8081`.

Other development arrangements require matching backend `SUPABASE_PUBLIC_URL`
and device-reachable app configuration. Examples for separately configured setups:

| Client | Example URL |
| --- | --- |
| iOS simulator / desktop on the backend host | `http://localhost:18000` |
| Android emulator on the backend host | `http://10.0.2.2:18000` |
| Physical phone | `http://YOUR_LAN_IP:18000` |

The supported demo stays loopback-only; USB port reversal avoids a LAN binding.
Do not expose test OTP mode to the internet. For
remote deployment, use HTTPS. Do not copy the original deployment's credentials.

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
permissions, or build settings. Native builds/device workflows have not yet been
verified by this release.

For a bundle-only check:

```bash
npx expo export --platform android
```

For cloud builds, first configure your own EAS project and signing credentials.
No original signing assets or project ownership are included.

## Application code

Screens cover GRN, dispatch, invoices, customer orders, stock, reports, sensor
monitoring, and role-based views. Their presence is not a claim of backend
completeness. All statically identified RPC names and four PDF endpoints are now
present; optional preprinted printing/print-job management and broader runtime
acceptance remain incomplete.

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

The second pass added regression tests for SecureStore-based config authentication,
legacy token decoding, and bootstrap validation. See [READINESS.md](docs/READINESS.md).
Dependency audit findings remain and require a tested SDK/dependency update.

GitHub Actions definitions are in `docs/github-workflows/` but **inactive**.
A maintainer with workflow permission must copy them to `.github/workflows/`.
The original publication credential cannot manage workflows; enabling CI does
not require revoking or rotating existing credentials.

MIT — see [LICENSE](LICENSE). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
Security reports: [SECURITY.md](SECURITY.md).
