# Native and physical-device acceptance

## Physical Android acceptance — 2026-09-18

Post-release acceptance passed on a user-connected, USB-authorized physical
Samsung SM-A346E (serial `RZC…56FB`), Android 15/API 35, with
`ro.kernel.qemu=0`.
The freshly installed debug package was `com.example.warehousemanager`, version
`0.1.0`/code `1`, built from mobile
`7a9c6449c01600ccbbe92b1071df845a63d0f861` and paired with backend
`1898dc79588f5db0a6d6dae520d5fa663548eb8f` in the checkout-owned
`warehouse-v021-review` project.

| Case | Result |
| --- | --- |
| Fresh install and demo login | PASS — package was absent before install; admin and customer OTP login succeeded. |
| Secure restoration and logout | PASS — force-stop/cold launch restored the encrypted admin session; logout cleared session/user caches and re-login succeeded. |
| Offline and retry | PASS — removing only the API reverse mapping produced the fail-closed configuration screen; restoring it and retrying returned to authenticated Orders. |
| Deep link and roles | PASS — authenticated cold `warehousemanager://customers` launch succeeded; customer `/users` access rendered Access Denied. |
| Camera and picker | PASS — denial produced the permission explanation, retry/grant opened the physical Samsung camera, a captured photo returned, and Android Photo Picker returned a second image without broad media permission. |
| PDF | PASS — invoice PDF generation/download opened Android's native share sheet with `Invoice_483303912_FY2026-2027.pdf`; no share target was selected. |
| USB cleanup | PASS — only `tcp:28000` and `tcp:8081` were added for the isolated run; both were removed and Metro was stopped. |

This run closes the physical Android core matrix. It does not establish iOS,
production deployment, signed distribution, printer/sensor hardware, native
telemetry delivery, or app-store acceptance.

## Source-demo emulator acceptance — 2026-09-18

The source-demo release baseline was built from fresh public sibling clones on
Linux with Android SDK/API 36 and installed on `Medium_Phone_API_36.1`. That build
completed 608 Gradle tasks, bundled 3,072 modules, fetched loopback bootstrap
configuration, logged in through the native UI, and restored an authenticated
cold start to Orders. Earlier acceptance on the same reviewed code line covered
theme/status-bar and modal restoration, protected navigation, Android photo
picker upload/reopen/delete/storage cleanup, and native PDF share/open flows.
Clean onboarding proved setup rerun, owned stop/restart, configuration/data
preservation, and ownership-scoped shutdown.

The development-client bootstrap URL is explicitly ignored as an application
deep link; three regressions and the fresh native cold-start scenario pass. This
is emulator evidence for the supported source demo. The later physical Android
record above supplies separate device evidence. iOS, printing, and sensors remain
unverified gates and are not implied by the emulator result.

## Historical pre-release evidence

See [the dated verification ledger](RESUME_VERIFICATION_2026-09-15.md)
for current local checks and open native/review gates. Evidence below dated
2026-09-14 or earlier describes the historical release checkpoint. The
pending mobile authentication/privacy fixes and backend follow-up commits
are outside the immutable `v0.2.1-demo` tags. Local follow-up results do
not establish merged-main CI or physical-device acceptance.

## Historical compile evidence — 2026-09-13

Source baseline: `75e42324b6c9317d8432c1caebe122e4cafa4fdf`, Expo SDK 54,
React Native 0.81.5. The Linux public-clone test passes dependency installation,
75 Jest tests, typecheck, lint, bootstrap and dependency tests.

Native follow-up at `96d92a287f2ce8a27b2587fcebe482eb4fe988b2` explicitly
aligns Expo Font and NetInfo with SDK 54. A fresh public fetch and `npm ci`, Expo's
SDK compatibility check, and all eight bootstrap/dependency tests pass. The
Android ARM64 debug build below also passes at this commit.

| Evidence | Status |
| --- | --- |
| Android native generation (`expo prebuild --platform android --no-install`) | Pass in a fresh scratch clone |
| ARM64 debug APK compilation | Pass on Linux; `:app:assembleDebug`, 594 tasks, 6m 57s |
| Physical Android device | Not run: no device listed by `adb devices -l` |
| iOS native compilation | Not run: this host is Linux, without Xcode |
| Camera, reboot, offline and deep-link acceptance | Pending physical-device execution |
| Printer, sensors, Realtime | Unsupported/unverified for the default demo; keep disabled |

An Android JavaScript/Hermes export or successful native generation is **not** a
compiled APK or a physical-device test. Use this runbook to record real evidence,
not to mark device checks complete automatically.

### Recorded Android compile evidence

- Node 22.23.2, npm 10.9.8, OpenJDK 21.0.12, Gradle 8.14.3.
- SDK platform 36; Build Tools 36.0.0 and 35.0.0; NDK 27.1.12297006 and
  27.0.12077973 (Worklets Core); CMake 3.22.1. Missing components in the initial
  scratch SDK copy caused two prerequisite failures before the successful build.
- SDK files were copied from installed public tools into an isolated scratch SDK;
  Gradle used a new cache, two workers and disabled SDK auto-downloads. Existing
  SDK files, private repositories and production signing assets were not changed.
- APK: `app-debug.apk`, 79,543,019 bytes, ARM64 only, application ID
  `com.example.warehousemanager`, min SDK 24 / target SDK 36.
- SHA-256: `b3a9c69e73daec23be4d5ddfa9852d127a6108853d4d723e0d821153a0fb05e2`.
- This local debug artifact is **not attached to the source release** and was
  not installed or launched. Build/deprecation warnings remain. The template's
  app/runtime version is still `0.1.0`; the `v0.2.0-demo` source tag is not an
  app-store binary version or a production signing approval.

## Build using your own environment

Start with a fresh public clone, Node 22.18+, `bash setup.sh`, and a local-demo
backend. Android requires Android Studio/SDK, the SDK/NDK versions selected by the
generated Gradle project, and a compatible JDK. iOS requires a supported Mac,
Xcode and CocoaPods. Do not reuse private signing credentials or EAS ownership.

```bash
# Generate in a fresh clone; do not use --clean on native work you need to keep.
npx expo prebuild --platform android --no-install

# Compile and install on your explicitly selected Android test device.
npx expo run:android --device

# On a Mac, compile and install on an iOS simulator/device.
npx expo run:ios --device
```

An APK-only check, run from `android/`, is:

```bash
./gradlew :app:assembleDebug --no-daemon --max-workers=2 \
  -PreactNativeArchitectures=arm64-v8a
```

Record target architectures. A debug build uses test signing and usually needs
Metro; it is not a signed app-store release. Do not publish generated signing
files, `.env`, Gradle credentials, logs or unreviewed binary attachments.

If using EAS, configure a **new project you own** and authorize any cloud build
costs explicitly. This repository does not supply production signing assets.

For the standard USB-connected Android demo:

```bash
adb devices -l
adb -s YOUR_TEST_DEVICE reverse tcp:18000 tcp:18000
adb -s YOUR_TEST_DEVICE reverse tcp:8081 tcp:8081
npx expo start --localhost
```

Use the corresponding port if running an isolated scratch backend. Keep demo OTP
authentication on loopback; do not make it LAN/public merely to connect a phone.
For iOS, use a backend reachable through the Mac's local development arrangement;
physical iOS does not support Android's `adb reverse` mechanism.

## Manual acceptance matrix

Use only fictional demo data. Record pass/fail/not-applicable per platform, app
commit, backend commit, OS, build ID, device model and test timestamp.

1. **Fresh install and roles:** login as demo admin and assigned customer. Confirm
   correct screens and data boundaries; anonymous/other-customer access is denied.
2. **Persistence:** force-close and reopen, then reboot/unlock the device. Check
   session recovery/renewal and profile reload. Exercise secure-storage failure in
   an instrumented test build: no AsyncStorage credential fallback or false login
   success. Confirm logout and restart do not resurrect a revoked session.
3. **Refresh races:** test expiry during parallel requests, logout during refresh,
   refresh replay, revoked account and changed assignments. Existing unit tests
   do not establish every device/race outcome.
4. **Camera/images:** allow and deny camera access, capture a real image, upload,
   confirm/read and delete it. Verify customer access before/after confirmation
   and deletion. Test only barcode features actually present in the checkout.
5. **Offline/retry:** interrupt connectivity during reads, OTP, uploads and a stock
   mutation. Ensure accurate error/pending state, no false success, no data loss,
   and no duplicate stock change on retry/reconnect. Do not assume automatic
   SQLite synchronization: no SQLite dependency or general offline-sync engine
   has been established in this release.
6. **Deep links:** cold/warm launch, Unicode and repeated parameters, redirects,
   malformed percent encodings and unauthorized routes. Decoder 0.5.0 and
   navigation regressions are included in `v0.2.2-demo`; this still requires actual
   native route acceptance. Use only the isolated test app for adversarial input.
7. **Documents:** open/share all four generated PDFs; verify private URLs expire
   and cannot disclose another customer's document through the API.
8. **Privacy:** default-empty telemetry DSN emits no crash events. If enabled in a
   dedicated test project, inspect actual received payloads, native crashes and
   breadcrumbs for redaction. Verify permissions/privacy declarations against
   observed collection; the server retention policy is an operator requirement,
   not automatically configured by this mobile code.
9. **Business acceptance:** prices, taxes, invoice totals, payments, order states,
   idempotency and recovery require independently specified expected results.
   A successful save or malformed-input rejection does not verify calculations.

## Result record

```text
App commit / backend commit:
Platform, OS, model, architecture:
Build type, application ID, artifact SHA-256:
Tester / timestamp:
Each case: PASS | FAIL | NOT RUN | NOT APPLICABLE
Observed result and redacted evidence:
Remaining defects and release limitations:
```

Keep device identifiers, tokens and customer information out of published logs.
Do not mark overall native acceptance complete while either platform or required
physical-device flows remain untested.

References: [Expo local builds](https://docs.expo.dev/guides/local-app-development/),
[native generation](https://docs.expo.dev/workflow/continuous-native-generation/).
