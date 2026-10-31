# rn-warehouse-template

Open-source React Native warehouse client built with Expo SDK 58 / React Native
0.88, Expo Router and Redux Toolkit. It connects to one installation of the
companion backend, [supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template),
through that installation's canonical HTTPS origin. MIT licensed.

## Quickstart

Prerequisites:

- Node.js **22.18+, 24.3+ or 26+** (not 23 or 25) and npm.
- For native builds only (not needed for [Expo Go](#try-the-app-on-a-phone-with-expo-go)): JDK 17 (Temurin) and an Android SDK with exactly the packages CI pins:
  `platform-tools`, `platforms;android-37.0`, `build-tools;37.0.0`,
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
npm ci                       # runs the two postinstall patches
node scripts/create-env.mjs  # creates .env only if it is absent
npm run typecheck && npm run typecheck:tests && npm run lint && npm test && npm run test:setup
npm run doctor               # read-only check against an installed backend
npm run android              # native debug build on a device or emulator
```

`npm ci` applies two postinstall patches to installed packages
(`scripts/patch-expo-metro.mjs` and
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

## Try the app on a phone with Expo Go

The quickest look needs only Node.js (22.18+, 24.3+ or 26+) and npm: no JDK and no Android SDK. It also needs an installed backend and its HTTPS origin.

```bash
git clone https://github.com/abhiguru/rn-warehouse-template.git
cd rn-warehouse-template
npm ci                       # keep npm scripts on: the two postinstall patches are needed
node scripts/create-env.mjs  # creates .env only if it is absent
# in .env set EXPO_PUBLIC_CONFIG_API_URL=https://warehouse.example.com (the backend origin), then:
npm run check:backend        # read-only check of that backend (no JDK or Android SDK needed)
npm start -- --lan --clear
```

- Set `EXPO_PUBLIC_CENTRAL_ORIGIN` in `.env` only if the facility was set up with central sign-in (see `.env.example`).
- The phone must be on the same Wi-Fi as the Metro host (a NAT'd virtual machine is not reachable: bridge its adapter); with `ufw`, allow port 8081 from the LAN only (the rule needs `sudo`: an agent gives the operator the command).
- An agent keeps Metro running in `tmux` (or in the background) and gives the operator the `exp://<LAN IP>:8081` address to enter in Expo Go. Do not use `--tunnel` or any public tunnel without the operator's say-so.
- Scan the QR code with Expo Go, whose SDK (Settings in Expo Go) must match `expo` in `package.json`. On the first screen enter the backend's HTTPS origin and sign in (SMS code, or the central sign-in when it is set).
- Limits: Expo Go never applies the config plugins in `app.config.js` and `plugins/` and uses its own permission strings, and it may not support this SDK. Native builds
  ([below](#native-builds)) are the baseline. Errors: [Running Metro for a phone](docs/DEVICE_ACCEPTANCE.md#running-metro-for-a-phone).

## Install with an AI agent

Point an AI coding agent at this repository and tell it to set the app up. These are its instructions.
**First ask the operator, one question at a time:**

1. A quick look in Expo Go, or a native build on a device (`npm run android`, which needs the JDK and Android SDK from the Quickstart)?
2. Is a backend installed already? If so, its HTTPS origin. If not, install it first on the facility host with the backend's
   [Install with an AI agent](https://github.com/abhiguru/supabase-warehouse-template#install-with-an-ai-agent) section.
3. Was the facility set up with central sign-in? If so, the association's issuer (the same https origin the backend has as `--central-issuer`) for `EXPO_PUBLIC_CENTRAL_ORIGIN`. `EXPO_PUBLIC_CENTRAL_ISSUER` defaults to that origin; set it only if the operator says the issuer name differs.

Then follow the matching section: [Try the app on a phone with Expo Go](#try-the-app-on-a-phone-with-expo-go), or the [Quickstart](#quickstart)
and [Native builds](#native-builds). Never ask for a secret value in chat. Stop and ask when an input is missing or a step fails the same way twice.

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

Every iOS build, Debug and Release, has the same App Transport Security policy
(`plugins/with-ios-transport-policy.js`): `NSAllowsArbitraryLoads = false` and
`NSAllowsLocalNetworking = true`, nothing else. Local networking is what lets a Debug build reach
Metro over http and what lets the app fall back to the server's address on the warehouse network
when the internet is down. A Release Run Script phase fails an archive whose built `Info.plist`
allows arbitrary loads or has an exception domain (it also fails when it cannot read the plist).
An `ios/` folder generated before this policy (Release builds refused local networking) has the
older Run Script phase: regenerate it with `npx expo prebuild --platform ios --clean` (or delete `ios/`).
On Android the same fallback needs cleartext to a private address; `plugins/with-android-lan-cleartext.js`
writes the network security config (see [RELEASE_PREPARATION.md](docs/RELEASE_PREPARATION.md)).

Expo generates the ignored native directories as needed; use `npm start` for
later Metro sessions. Native builds are the baseline: Expo Go may not support
this SDK and does not validate native plugins, permissions or build settings.
Expo Go limits and network errors: [Try the app on a phone with Expo Go](#try-the-app-on-a-phone-with-expo-go).
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
audit of the exported directory, a pinned JDK 17 / compile SDK 37 (target SDK 36) debug build with an
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
