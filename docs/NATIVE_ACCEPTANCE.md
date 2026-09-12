# Native and physical-device acceptance

## Status — 2026-09-12

Source baseline: `75e42324b6c9317d8432c1caebe122e4cafa4fdf`, Expo SDK 54,
React Native 0.81.5. The Linux public-clone test passes dependency installation,
75 Jest tests, typecheck, lint, bootstrap and dependency tests.

| Evidence | Status |
| --- | --- |
| Android native generation (`expo prebuild --platform android --no-install`) | Pass in a fresh scratch clone |
| ARM64 debug APK compilation | In progress; no binary acceptance claimed yet |
| Physical Android device | Not run: no device listed by `adb devices -l` |
| iOS native compilation | Not run: this host is Linux, without Xcode |
| Camera, reboot, offline and deep-link acceptance | Pending physical-device execution |
| Printer, sensors, Realtime | Unsupported/unverified for the default demo; keep disabled |

An Android JavaScript/Hermes export or successful native generation is **not** a
compiled APK or a physical-device test. Use this runbook to record real evidence,
not to mark device checks complete automatically.

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

An APK-only check can use `android/gradlew :app:assembleDebug` from `android/`.
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
   malformed percent encodings and unauthorized routes. The remaining decoder
   advisory requires isolated, time-bounded testing and remediation; do not send
   adversarial URLs to real users or treat this checklist as a fix.
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
