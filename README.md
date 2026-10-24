# rn-warehouse-template

Open-source React Native warehouse client built with Expo SDK 57 / React Native
0.86, Expo Router and Redux Toolkit. It connects to one installation of the
companion backend, [supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template),
through that installation's canonical HTTPS origin. MIT licensed.

## Quickstart

Prerequisites:

- Node.js **22.18+** and npm.
- JDK 17 (Temurin) and an Android SDK with exactly the packages CI pins:
  `platform-tools`, `platforms;android-36`, `build-tools;36.0.0`,
  `build-tools;35.0.0`, `ndk;27.1.12297006`, `ndk;27.0.12077973` and
  `cmake;3.22.1`. Set `ANDROID_HOME` to the SDK root;
  `node scripts/check-android-sdk.mjs` verifies the set.
- iOS builds need macOS and Xcode 16.1+; see [IOS_USB_DEVELOPMENT.md](docs/IOS_USB_DEVELOPMENT.md).
- An installed backend. Follow the backend's
  [operator install guide](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/OPERATOR_INSTALL.md)
  and note its HTTPS origin; the app needs it at first launch.

```bash
git clone https://github.com/abhiguru/rn-warehouse-template.git
cd rn-warehouse-template
npm ci                       # runs the three postinstall patches
node scripts/create-env.mjs  # creates .env only if it is absent
npm run typecheck && npm run typecheck:tests && npm run lint && npm test && npm run test:setup
npm run doctor               # read-only check against an installed backend
npm run android              # native debug build on a device or emulator
```

`npm ci` applies three postinstall patches to installed packages
(`scripts/patch-expo-metro.mjs`, `scripts/patch-navigation-decoder.mjs` and
`scripts/patch-security-backports.mjs`); `npm run verify:backports` re-checks
them against `scripts/security-backports.json`. An install with npm scripts
turned off (`--ignore-scripts`) skips them silently, so `npm start`,
`npm run android`, `npm run ios`, `npm run web` and `npm test` first run
`scripts/check-install.mjs`, which stops when a patch is missing. `bash setup.sh` runs the same
install and `.env` steps and never inspects Docker or service credentials.

For `npm run doctor` (or the narrower `npm run check:backend`) set
`EXPO_PUBLIC_CONFIG_API_URL` to the operator's HTTPS origin. The check fetches
the public bootstrap configuration and detects wrong URLs, missing configuration
and accidental service-role keys; it does not prove that login or warehouse APIs
work. The app itself uses the server chosen on its first screen, and no keys are
copied into the app: it fetches its public anon key dynamically.

## How the app connects

- First launch asks for the operator's **HTTPS origin**, typed or scanned from a
  QR code. The app checks the server identity, API compatibility and minimum
  client version before restoring any session. It re-verifies the identity on
  return from the background, but not after a camera, picker or share round trip.
- Sign-in is a one-time SMS code; the backend returns a custom JWT pair that the
  app keeps in SecureStore. Token refresh is single-flight, and a definitive
  rejection ends the device session exactly once. Logout, switching servers and a
  forced logout clear the business caches, form drafts and shared documents.
- The configuration error screen offers **Change server**. Choosing the origin
  already in use returns to Settings without a prompt or a sign-out.
- There is no fixed OTP or demo account. A new customer's verified phone enters
  pending enrollment until an administrator approves it in
  **Settings → Enrollment Review**; rejected or disabled accounts cannot sign in.

## Native builds

```bash
npm run android
# Or, on macOS:
npm run ios
```

`npm run ios` generates a development project (it sets `WAREHOUSE_IOS_LOCAL_NETWORKING=1`, so the
Debug build can reach Metro over http). Never archive that project for release: regenerate it without
the flag first (see [RELEASE_PREPARATION.md](docs/RELEASE_PREPARATION.md)).

`npm run ios` reuses an existing `ios/` folder, so a folder that was generated for release keeps
the release policy in Debug (Metro over http is refused), because `expo run:ios` prebuilds only
when `ios/` is missing. Regenerate it with
`WAREHOUSE_IOS_LOCAL_NETWORKING=1 npx expo prebuild --platform ios --clean` (or delete `ios/`)
and run `npm run ios` again. The other way round, a
local Release build through `npm run ios` fails on purpose: the project it generates is a
development one, and a Release Run Script phase refuses it (it also fails when it cannot read
the built `Info.plist`).

Expo generates the ignored native directories as needed; use `npm start` for
later Metro sessions. Native builds are the baseline: Expo Go may not support
this SDK and does not validate native plugins, permissions or build settings.
Expo Go (the store app, whose SDK must match `expo` in `package.json`) loads the bundle for a quick look, but it
never applies the config plugins in `app.config.js` and `plugins/`, and uses its own permission strings. A phone on another network than
the Metro host cannot use `--lan`; `expo start --tunnel` (ngrok) may fail to start, and a public tunnel puts an
unauthenticated development server on the internet, so stop it when you are done. Network, tunnel and
Expo Go errors are covered in [Running Metro for a phone](docs/DEVICE_ACCEPTANCE.md#running-metro-for-a-phone).
For a bundle-only check run `npx expo export --platform android`. Cloud builds
need your own EAS project and signing credentials; no signing assets or project
ownership are included.

`npm run android` installs a **debug** build that loads its JavaScript from
Metro, so it cannot run on its own on a phone. For device acceptance build a
standalone release APK (debug-signed, test only); see
[DEVICE_ACCEPTANCE.md](docs/DEVICE_ACCEPTANCE.md) for the steps, the Gradle heap
setting and `adb` practicalities.

## Application code

Screens cover GRN, dispatch, invoices, customer orders, stock, reports, sensor
monitoring and role-based views. Every statically identified RPC name, the four
PDF endpoints and the preprinted print endpoints match the backend contract.

- `app/`: Expo Router routes and forms.
- `src/services/`: backend calls and configuration.
- `src/store/`: Redux state.
- `src/components/`, `src/features/`, `src/hooks/`: UI and features.
- `src/theme/`, `src/types/`, `src/utils/`: shared code.

Customize the app identity in `app.json` (name, slug, scheme, bundle and package
IDs). Use `.env` for displayed app and company names and the optional Sentry DSN.
Replace the placeholder assets in `assets/` and review the privacy and legal text
before distributing a branded build. Never put private server keys in
`EXPO_PUBLIC_*` variables: they are bundled into the app.

Central login (one sign-in at the association, then a list of facilities) is off
unless the build sets `EXPO_PUBLIC_CENTRAL_ORIGIN`; see
[docs/CENTRAL_LOGIN.md](docs/CENTRAL_LOGIN.md).

## Checks and releases

GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs expo-doctor (a locked
devDependency), lint (it fails above a fixed warning count), typecheck, the
test-file typecheck, Jest, the setup tests and an Android bundle export with an
audit of the exported directory, a pinned JDK 17 / SDK 36 debug build with an
APK audit, the dependency gate and a secrets scan on pushes and pull requests to
`main`. There are no git hooks; CI enforces lint and typecheck.
[release.yml](.github/workflows/release.yml) validates any semantic `v*` tag
with the same gates; publishing a GitHub release stays a manual step after the
validation run passes.

## Further reading

- [DEVELOPER_HANDOFF.md](docs/DEVELOPER_HANDOFF.md): contributor guide (server
  selection, credentials, session-scoped state, CI).
- [DEVICE_ACCEPTANCE.md](docs/DEVICE_ACCEPTANCE.md): building the standalone
  APK and exercising it on a phone (release vs debug build, Gradle heap, `adb`).
- [DEPENDENCY_SECURITY.md](docs/DEPENDENCY_SECURITY.md): dependency audit and
  the local security backports.
- [TELEMETRY_AND_PRIVACY.md](docs/TELEMETRY_AND_PRIVACY.md): optional telemetry
  and client-side redaction.
- [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) and
  [RELEASE_PREPARATION.md](docs/RELEASE_PREPARATION.md): release gates and the
  values an operator must decide.
- [ORDER_LIVE_UPDATES.md](docs/ORDER_LIVE_UPDATES.md): order and sensor refresh
  on a timer.
- [ATTRIBUTION_REVIEW.md](docs/ATTRIBUTION_REVIEW.md): ownership and third-party
  attribution.
- Project history, the source-demo release and the pilot: [HISTORY.md](docs/HISTORY.md).

MIT — see [LICENSE](LICENSE). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
Security reports: [SECURITY.md](SECURITY.md). Questions: [SUPPORT.md](SUPPORT.md).
