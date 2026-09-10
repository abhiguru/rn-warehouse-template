# rn-warehouse-template

Open-source React Native warehouse application source, built with Expo,
Supabase, Redux Toolkit, and Expo Router.

**Backend integration is not yet ready.** The companion
[supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template)
export is incomplete. You can install, check, and bundle this app, but cannot yet
complete login/warehouse flows against that backend. See
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

After the backend export is complete, set `EXPO_PUBLIC_CONFIG_API_URL` in `.env`
and the backend's `SUPABASE_PUBLIC_URL` to the same device-reachable origin:

| Client | Example URL |
| --- | --- |
| iOS simulator / desktop on the backend host | `http://localhost:18000` |
| Android emulator on the backend host | `http://10.0.2.2:18000` |
| Physical phone | `http://YOUR_LAN_IP:18000` |

The backend binds to loopback by default. A physical phone requires an explicit
LAN binding/firewall choice; never expose test OTP mode to the internet. For
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
completeness. Many required RPC/PDF/print implementations are still missing.

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
