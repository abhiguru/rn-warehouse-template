# Fresh operator Android installation notes

## Source and phase boundary — 2026-09-30

Backend baseline: `f18f51d4625e7f8c0d977ac69645804e318a9d49`, merged backend
[PR #68](https://github.com/abhiguru/supabase-warehouse-template/pull/68).
[Post-merge backend CI 36591024357](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36591024357)
passed all seven jobs. Mobile candidate:
`8240cce9121a797fd0cf2e00e568a61985814ddb`, available on `codex/operator-mobile`
and [draft PR #33](https://github.com/abhiguru/rn-warehouse-template/pull/33).
Remote refs and GitHub PR status were verified before installation. Mobile
`main` was `272e434844b58d68fd714023a6ae11885a0f1a21`; it is not the candidate.

Clean detached installation sources and separate review worktrees preserve the
exact version boundary. Android dependency and native-tool installation began only after backend
local/public doctor passed. Read the README, developer handoff,
NATIVE_ACCEPTANCE, LOCAL_PRODUCTION_READINESS and CI workflow first. No AGENTS.md
was found in either checkout or their workspace parents.

Begin Android installation only after this independent backend passes local and
public doctor and identity discovery. The fresh host is Ubuntu 24.04.3 x86-64
VMware with 5.7 GiB RAM, 4 GiB swap and initially 63 GiB free disk. Backend host
preparation installed Node 22.23.3/npm 10.9.9. OpenJDK 17.0.20.1, command-line tools 22.0 and ADB 37.0.1 are now installed.
The operator selected a physical Android phone; its USB debugging authorization
is pending. Historical phones, APKs and successful compilation do not
count as this attempt's device acceptance.

## Reproducible local standalone test APK

Complete backend local/public doctor first. Use a separate, clean source checkout
and a private evidence/artifact directory outside Git. The corrected native
identity workflow requires this review branch's `app.config.js` in addition to
the candidate; record its full commit after fetching. Do not attribute that build
to candidate HEAD alone. Clone public source with `umask 022`; create private
files with `umask 077`. Never delete a native directory in someone else's checkout.

On this Ubuntu 24.04 guest, install JDK 17 with `sudo apt-get install openjdk-17-jdk
unzip`. Verify `java -version` and `javac -version`. Download Android command-line
tools from [Google's Android tools page](https://developer.android.com/studio),
verify its published SHA-256 before extracting, and install the archive's
`cmdline-tools` directory at `$HOME/Android/Sdk/cmdline-tools/22.0`. This attempt
used `commandlinetools-linux-15859902_latest.zip`, SHA-256
`4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583`.
The actual tools revision is 22.0. Do not assume the archive revision from its
filename or copy another installation's private state.

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$HOME/.local/opt/node-v22.23.3-linux-x64/bin:$ANDROID_HOME/cmdline-tools/22.0/bin:$ANDROID_HOME/platform-tools:$PATH"
sdkmanager --licenses
sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' \
  'build-tools;35.0.0' 'ndk;27.1.12297006' 'ndk;27.0.12077973' 'cmake;3.22.1'
sdkmanager --list_installed
adb version
npm ci
node scripts/create-env.mjs
npm run test:setup
npm test
npm run lint
npm run typecheck
npx expo install --check
npx expo-doctor
npm audit
EXPO_PUBLIC_CONFIG_API_URL=https://YOUR-DEDICATED-API-HOST npm run check:backend
```

Review and accept SDK licenses locally. sdkmanager 22 emits a deprecation warning
recommending Android CLI; keep the warning in evidence. Both NDK revisions above
are installed for this RN/Worklets tree; use the versions requested by Gradle,
not an unreviewed latest revision. Preserve failures before retrying.

Choose an unused test package ID, display name and URI scheme. Check selected
device package occupancy before installation. These optional environment settings
change native identity, preserve permissions/plugins, and leave the normal
`app.json` defaults intact. An existing package must not be overwritten without
explicit operator approval. The package below is the identity for this exercise;
a later operator must choose their own unused identity.

```bash
export WAREHOUSE_ANDROID_PACKAGE=in.gurucold.warehouse.test1
export WAREHOUSE_APP_NAME='Test Warehouse 1'
export WAREHOUSE_APP_SCHEME=warehouse-test1
export WAREHOUSE_ANDROID_VERSION_CODE=2026093001
npx expo config --type public
# Only in the dedicated disposable build checkout:
npx expo prebuild --platform android --clean --no-install
cd android
./gradlew :app:assembleRelease --no-daemon --max-workers=2 \
  '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m' \
  -PreactNativeArchitectures=arm64-v8a
cd ..
npm run audit:artifact -- android/app/build/outputs/apk/release/app-release.apk
sha256sum android/app/build/outputs/apk/release/app-release.apk
```

This is Expo's [local release build workflow](https://docs.expo.dev/guides/local-app-production/)
for a bundled test APK. A debug build needing Metro cannot close standalone
acceptance. Inspect generated `android/app/build.gradle` signing configuration;
Expo may use the generated **debug signing key for release**. That permits a local
test, not production distribution or signing acceptance. Keep signing material
out of Git. This exercise targets arm64-v8a only after confirming the selected
phone ABI; other architectures need their own artifact. Record Gradle/JDK/SDK
versions, source pair, native identity, signing certificate, command, artifact
SHA-256 and build ID. Audit that exact APK before installing it.

Authorize USB debugging on the operator-selected phone. Keep its serial in
private evidence, select it explicitly for every adb command, and record only
model/OS in shared notes. Install the APK with `adb -s "$SELECTED_DEVICE" install
"$APK"` after confirming package absence; do not uninstall another app or clear
its data. Choose the new HTTPS server manually, verify the displayed warehouse
identity, and test QR, malformed origins, cold launch, background/foreground and
server persistence. Disconnect USB, keep Metro stopped and launch from the phone
icon before claiming standalone acceptance. Test Wi-Fi and cellular separately.
Real authentication needs explicit SMS permission and owned phones; input OTPs
locally, never in chat/logs. Historical device tests do not count for this APK.

## Findings

| Environment / trigger | Expected versus actual | Correction | Verification and limitation |
| --- | --- | --- | --- |
| Candidate README `git clone` sequence | Candidate changes expected; clone defaults to a different main commit | Pin full candidate before npm/setup; record both sources and clean status | Remote candidate availability PASS; Android installation not started |
| Mobile handoff at candidate | Backend branch/PR described as current review dependency; backend PR #68 has merged | Link pinned backend merge documentation and distinguish mobile draft | GitHub backend merge and seven CI jobs PASS; no fresh backend/device acceptance inherited |
| Review-worktree `npm run test:setup` before `npm ci` | Expected setup tests; missing Expo/Metro modules caused 7 failures | Run locked dependency installation in every checkout before checks | Corrected review checkout: 33/33 setup tests PASS; original failed log preserved privately |
| Optional native identity configuration | Existing default package could collide with another warehouse app | Add validated package/name/scheme/version-code overrides; no default permission/plugin changes | 3 new guard/default/identity tests PASS; artifact/device checks pending |
| Read historical Android build workflow | Standalone warehouse operation required; documented debug APK normally requires Metro | Treat debug compilation/audit as limited evidence; establish a supported bundled test build and test without Metro/USB in phase 2 | No standalone artifact or device pass claimed yet |

## Current acceptance matrix

| Required case | Status | Evidence / next resource |
| --- | --- | --- |
| Exact source availability and version record | PASS | Full SHAs and remote PR refs above |
| Backend local/public installation | PASS | New warehouse local/public doctor and identity discovery; independent tunnel |
| npm ci, SDK compatibility, Expo Doctor, unit/setup, lint, typecheck, contract, dependency and secret checks | PASS | Candidate: 217 Jest tests / 33 suites, 30 setup tests, lint 0 errors / 1468 warnings, typecheck, SDK compatibility, Expo Doctor 18/18, npm audit 0 findings, public backend and static contract, redacted source/history scan |
| Android SDK/JDK/native generation and build | NOT TESTED | Install documented native prerequisites in phase 2 |
| Artifact hash/build ID/audit | NOT TESTED | No current artifact |
| Selected physical Android model/OS/install | BLOCKED | Selected phone USB debugging unauthorized; keep serial private |
| Emulator alternative | NOT TESTED | Emulator results cannot close physical acceptance |
| Manual server selection and displayed identity | NOT TESTED | Test on exact installed artifact and independent origin |
| QR selection | NOT TESTED | Requires selected device camera |
| Malformed origins, cold launch, foreground/background, selected-server persistence | NOT TESTED | Current native run required |
| Standalone operation without Metro/USB | NOT TESTED | Bundled artifact and disconnected-device launch required |
| Administrator/customer native login, pending approval and approval | NOT TESTED | Operator permitted real SMS for this warehouse only; current backend real administrator login, Customer A pending enrollment/approval/login PASS; not native evidence |
| Logout, expired/revoked sessions, offline/reconnect, Realtime, images and authorized PDFs | BLOCKED | Requires permitted authentication and exact native artifact |
| Wi-Fi | NOT TESTED | Actual selected device/network observation required |
| Cellular | NOT TESTED | Record unavailable cellular separately |
| Cross-instance and replacement-instance isolation | BLOCKED | Needs second isolated running instance; never use the live pilot |

Keep phones, credentials, sessions, device serials, raw logs and signing material
outside Git in private storage. Do not introduce a fixed OTP or auth bypass.
Printing, sensors, iPhone, external alerts, rotation, image-security research,
recovery rehearsal, host reboot, release publication and unrelated PR merges stay
outside this exercise. Existing release gates and unresolved findings remain.

This is an in-progress record, not a reproducible-build or end-to-end acceptance
claim. Revised instructions still require clean-source verification with separate
owned state before the final handoff.
