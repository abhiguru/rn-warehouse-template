# Mobile local production-readiness evidence

**Evidence date:** 2026-09-22  
**Scope:** provider-independent checks and a locally signed Android development
APK. No native binary, signing credential, or store artifact is published.

The companion backend's eleven-area matrix is in
[`docs/LOCAL_PRODUCTION_READINESS.md`](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/LOCAL_PRODUCTION_READINESS.md).
Items 1–10 are implemented and exercised locally there, subject to the recorded
container-scan and production/provider gates. This repository supplies item 11.

## Android artifact and attribution result

A fresh Expo Android project and debug APK built successfully on Linux. The
artifact audit checked all archive paths, selected embedded text-bearing entries,
manifest permissions, known public certificates, and applicable notices. It
rejected private-key/database/environment filenames, path traversal, private-key
text, service-role environment text, and developer workstation paths.

The audited APK contained 1,350 entries and requested:

- network and Wi-Fi state;
- camera and internet;
- Android's debug system-alert-window permission;
- biometric/fingerprint access; and
- vibration.

The blocked audio, SMS, media-library, and external-storage permissions were
absent. `assets/expo-root.pem` is Expo Updates' public root certificate and is
explicitly reported; unrecognized certificate/key files remain blocked. The
debug APK contained no font file entries because it loads its development bundle
from Metro. The separate Android export contained the expected Expo vector icon
fonts, whose upstream notices remain in `THIRD_PARTY_NOTICES.md`.

The local APK SHA-256 was
`f5b6eadab73bd2d47e968e0c54901a73e33dce4739cf8e2afd55c43debbf210f`.
This identifies only the locally generated development artifact. A release AAB
or APK must be rebuilt with owned credentials and audited again.

## Reproduce

```bash
npm ci
npm test -- --runInBand
npm run test:setup
npm run lint
npm run typecheck
npm audit --omit=dev
npx expo install --check
npx expo-doctor
npx expo export --platform android
npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleDebug)
npm run audit:artifact -- android/app/build/outputs/apk/debug/app-debug.apk
```

The 2026-09-22 run passed 20 Jest suites / 165 tests, setup checks, typecheck,
lint with no errors, dependency audit, Expo Doctor 18/18, SDK dependency check,
Android export, native debug assembly, and artifact audit. CI now repeats the
debug build and audit without uploading the APK.

## Remaining external or distribution gates

The existing physical Android and iPhone source-demo acceptance remains valid
and is recorded in [NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md). Production still
requires an operator-owned application identity, release signing, final AAB/APK
and iOS archive inspection, privacy/store declarations, Play/App Store or
enterprise distribution, and enabled telemetry delivery tests. Production SMS,
public DNS/TLS, alert receivers, payments, and printer/sensor hardware belong to
their backend/deployment integration gates. None is needed to reproduce this
local artifact evidence.

This work does not change or republish the immutable `v0.2.2-demo` tag.
