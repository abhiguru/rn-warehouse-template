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
is now complete. Historical phones, APKs and successful compilation do not
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
Native build completion has not been established
on the initial 5.7 GiB VM; the resumed build host has 17.2 GiB RAM. Record actual
memory/disk, and finish unit/static checks before heavy native compilation.
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
npx expo-doctor@1.20.4
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

This attempt locked Expo 54.0.37 / RN 0.81.5 / Expo CLI 54.0.27; the
separately invoked Expo Doctor was 1.20.4 (pinned above for repetition). Gradle
8.14.3 emitted deprecated-feature warnings; do not replace the wrapper with
Gradle 9 to silence them.

This is Expo's [local release build workflow](https://docs.expo.dev/guides/local-app-production/)
for a bundled test APK. A debug build needing Metro cannot close standalone
acceptance. Inspect generated `android/app/build.gradle` signing configuration;
Expo may use the generated **debug signing key for release**. That permits a local
test, not production distribution or signing acceptance. Keep signing material
out of Git. This exercise targets arm64-v8a only after confirming the selected
phone ABI; other architectures need their own artifact. Record Gradle/JDK/SDK
versions, source pair, native identity, signing certificate, command, artifact
SHA-256 and build ID. Audit that exact APK before installing it.

Authorize USB debugging on the operator-selected phone and attach it to the
VMware guest. Use the SDK's one pinned ADB executable throughout; record
`adb version` and `adb server-status`. Distinguish `unauthorized` (operator must
accept Android's RSA prompt), `offline`, and an absent device. Keep the serial
private. When ADB loses a phone that remains visible in `lsusb`, capture the
private ADB server log and guest kernel USB events before restarting anything.
Check the selected USB device's `power/control` and `power/runtime_status`;
do not disable power saving globally when this device already reports `on` and
`active`.

On this Ubuntu/VMware/ADB 37.0.1 installation, the native backend repeatedly
reported transport read failures while Samsung MTP remained present. With no
other task using this owned server, test the supported alternative backend:

```bash
export ADB_LIBUSB=1
adb kill-server
adb start-server
adb server-status
adb devices -l
```

Require `usb_backend: LIBUSB` in server status, then exercise the selected phone
for at least five minutes without automatic restarts. Record failures as failures;
a recovered connection is not evidence of uninterrupted stability. This setting
must also be present if a later ADB command automatically starts a server; keep
the export in the private local Android-tools environment used for this test.
This VM records it in `/home/jay/warehouse-install-private/android-tools.env`
and its owned test helper. It does not alter
the installed APK. To revert this diagnostic choice, stop the owned server and
start it with `ADB_LIBUSB=0`, then check its reported backend. Never restart a
server another operator's device test is using.

The earlier `ADB_USB_LEGACY=1` attempt restored detection after a restart, but
[Google's version-specific release notes](https://developer.android.com/tools/releases/platform-tools)
describe that variable under Windows. That attempt does not establish a Linux
fix. The release notes also document Linux hotplug and historical backend
instability; [ADB's backend documentation](https://developer.android.com/tools/adb#adb-usb-backends)
explains `ADB_LIBUSB`. The observed cause on this VM remains unproven.
If the USB device itself disappears, reconnect only the selected phone through
VMware's removable-device menu. Host-side autoconnect changes and host logs need
separate host access; do not edit another system or power off this warehouse VM
as an undocumented workaround. Do not delete debugging keys or bypass a phone's
lock screen. Android 11+ paired wireless debugging is a possible operator-assisted
fallback on a trusted shared network, not evidence that USB was repaired.

Authorize USB debugging on the operator-selected phone. Keep its serial in
private evidence, select it explicitly for every adb command, and record only
model/OS in shared notes. Install the APK with `adb -s "$SELECTED_DEVICE" install
"$APK"` after confirming package absence; do not uninstall another app or clear
its data. Choose the new HTTPS server manually, verify the displayed warehouse
identity, and test QR, malformed origins, cold launch, background/foreground and
server persistence. Disconnect USB, keep Metro stopped and launch from the phone
icon before claiming standalone acceptance. Test Wi-Fi and cellular separately.
For a local QR test, install `qrencode` (this VM used 4.1.1), then generate
`qrencode -s 24 -m 6 -o /private/path/origin-qr.png https://YOUR-DEDICATED-API-HOST`.
On Ubuntu, install `qrencode eog` if missing. Open the image explicitly with
`eog --new-instance --fullscreen --disable-gallery /private/path/origin-qr.png`.
If another window covers it, use Alt+Tab on the VM to select Image Viewer; verify
the operator can actually see it before asking for a scan. `xdg-open` success
alone did not make the image visible in this attempt. Scan with the app camera; the
payload is only the HTTPS origin, not JSON, credentials or a deep link. Camera
permission and an actual successful scan remain separate acceptance steps.
This attempt required the explicit fullscreen viewer before scanning passed.

Real authentication needs explicit SMS permission and owned phones; input OTPs
locally, never in chat/logs. Historical device tests do not count for this APK.

## Findings

| Environment / trigger | Expected versus actual | Correction | Verification and limitation |
| --- | --- | --- | --- |
| Candidate README `git clone` sequence | Candidate changes expected; clone defaults to a different main commit | Pin full candidate before npm/setup; record both sources and clean status | Remote candidate availability PASS; Android installation not started |
| Mobile handoff at candidate | Backend branch/PR described as current review dependency; backend PR #68 has merged | Link pinned backend merge documentation and distinguish mobile draft | GitHub backend merge and seven CI jobs PASS; no fresh backend/device acceptance inherited |
| Review-worktree `npm run test:setup` before `npm ci` | Expected setup tests; missing Expo/Metro modules caused 7 failures | Run locked dependency installation in every checkout before checks | Corrected review checkout: 33/33 setup tests PASS; original failed log preserved privately |
| Physical UI probe after first APK install | App process alive; device keyguard showing, so no warehouse UI accepted | Operator must unlock locally; automatic approval review rejected programmatic keyguard dismissal as crossing a device-security boundary; that command did not run | Operator subsequently unlocked locally; manual warehouse selection passed on the exact corrected artifact; never treat install/launch intent alone as accepted UI |
| Full Jest run alongside Gradle/Metro native compilation | 216/217 passed; one GRN history-render test exceeded its unchanged five-second timeout | Preserve failure; rerun after the heavy native build finishes, without loosening assertions or timeouts | Cause not established; CPU contention is an inference. Idle review rerun 217/217 PASS; clean corrected checkout 217/217 PASS. Initial candidate pass remains separate evidence |
| New `app.config.js`, `npm run lint` | 5 no-undef errors for Node globals, plus existing warnings | Scope CommonJS/module/process globals to this config in ESLint | Corrected lint: 0 errors, 1468 existing warnings; 33/33 setup tests PASS |
| SDK/ADB 37.0.1 on VMware, reconnect | Initially unauthorized; later native transport read failures and absent ADB device while Samsung MTP remained visible | Operator accepted RSA prompt; preserve earlier restart/legacy-variable attempt; switch owned server using supported `ADB_LIBUSB=1` and verify server status | Authorization PASS; libusb trial PASS: 61 shell probes over 300.06 seconds, no failed probe, automatic restart, kernel reset or disconnect; app UI reads and server selection also responded. Guest device power already on/active. Root cause not established; no host edits or reboot |
| First standalone build on 5.7 GiB VM | Build started; process interrupted before an APK existed | Preserve first log; resumed VM reports 17.2 GiB RAM; rerun same command | Resumed first build and independent corrected clean build passed on 17.2 GiB; 5.7 GiB completion not established; no agent-issued reboot |
| Optional native identity configuration | Existing default package could collide with another warehouse app | Add validated package/name/scheme/version-code overrides; no default permission/plugin changes | 3 new guard/default/identity tests PASS; exact corrected APK audited and installed; later UI cases remain separate |
| Read historical Android build workflow | Standalone warehouse operation required; documented debug APK normally requires Metro | Treat debug compilation/audit as limited evidence; establish a supported bundled test build and test without Metro/USB in phase 2 | Bundled test APK built and audited; operation with USB disconnected remains untested |

## Current acceptance matrix

| Required case | Status | Evidence / next resource |
| --- | --- | --- |
| Exact source availability and version record | PASS | Full SHAs and remote PR refs above |
| Backend local/public installation | PASS | New warehouse local/public doctor and identity discovery; independent tunnel |
| npm ci, SDK compatibility, Expo Doctor, unit/setup, lint, typecheck, contract, dependency and secret checks | PASS | Candidate: 217 Jest tests / 33 suites, 30 setup tests, lint 0 errors / 1468 warnings, typecheck, SDK compatibility, Expo Doctor 18/18, npm audit 0 findings, public backend and static contract, redacted source/history scan |
| Android SDK/JDK/native generation and build | PASS | JDK 17.0.20.1, CLI tools 22.0, Gradle 8.14.3, build-tools/compile/target 36, minimum API 24, Kotlin 2.1.20, NDK 27.1.12297006; arm64 bundled release variant; corrected 8d9da8e clean build passed, 983 tasks executed |
| Artifact hash/build ID/audit | PASS | Current source 8d9da8ecb3afb873422011cce4c6615b63163a88; package in.gurucold.warehouse.test1; version 0.1.0/code 2026093001; SHA-256 969d4fba6f21b7940897fb67aa8d09174f9e33cf376c964f4798ff96b15c25d4; exact APK audit and signature verified; Android Debug test certificate, not production signing |
| Selected physical Android model/OS/install | PASS | Authorized Samsung SM-A346E, Android 15/API 35, arm64-v8a; package absence checked before first install; corrected APK updated only this owned package with matching signer; pulled installed APK SHA-256 equals audited artifact |
| Emulator alternative | NOT TESTED | Emulator results cannot close physical acceptance |
| Manual server selection and displayed identity | PASS | Corrected artifact discovers Test Warehouse 1 and dedicated HTTPS origin, then Use This Server reaches login. Login retains generic Warehouse Manager branding; chooser is where warehouse identity is verified |
| QR selection | PASS | Operator allowed camera and scanned public-origin QR; preview displayed Test Warehouse 1 and canonical origin before selection |
| Malformed origins | PASS, scoped | HTTP origin and HTTPS origin with /extra path rejected; other malformed cases remain open |
| Cold launch, foreground/background, selected-server persistence | PASS, unauthenticated scope | Home/launcher and force-stop/launcher returned to login without requiring server selection; authenticated restore remains untested |
| Standalone operation without Metro/USB | NOT TESTED | Bundled artifact and disconnected-device launch required |
| Administrator/customer native login | NOT TESTED | SMS permitted for this warehouse only; native administrator verification now waiting for local operator OTP entry. Backend real administrator/Customer A login passes are separate evidence |
| Native pending enrollment/approval and reciprocal Customer B | BLOCKED | Existing owned Customer A already approved; operator has no third owned phone. Do not reset an existing user or send SMS to a fictional number to manufacture this case |
| Logout, expired/revoked sessions, offline/reconnect, Realtime, images and authorized PDFs | NOT TESTED | Exact APK installed; native authenticated verification pending local OTP entry |
| Wi-Fi | NOT TESTED | Actual selected device/network observation required |
| Cellular | NOT TESTED | Record unavailable cellular separately |
| Cross-instance and replacement-instance isolation | BLOCKED | Needs second isolated running instance; never use the live pilot |

Keep phones, credentials, sessions, device serials, raw logs and signing material
outside Git in private storage. Do not introduce a fixed OTP or auth bypass.
Printing, sensors, iPhone, external alerts, rotation, image-security research,
recovery rehearsal, host reboot, release publication and unrelated PR merges stay
outside this exercise. Existing release gates and unresolved findings remain.

Clean corrected source `8d9da8ecb3afb873422011cce4c6615b63163a88` was cloned
from the pushed review branch into a separate disposable build checkout with no
tracked edits. npm ci, 33 setup tests, 217 Jest tests, lint (0 errors / 1468
warnings), typecheck, Expo compatibility/Doctor 18/18, npm audit, public bootstrap
and static contract checks all passed before native generation. The clean build
passed in 9m46s with 983 tasks executed. Its exact audited APK was installed and
read back with a matching SHA-256. Shared notes contain no phone, session, serial
or raw log. The earlier 5bee797 artifact (SHA-256
`f6a3738b7441c40087ba8466415091fd191cc5859e27abc46ffe15778cf91f0d`)
is retained as historical build evidence; it is not the current installed APK.

The libusb trial establishes five minutes of current stability, not a permanent
USB repair. Native-backend read failures coincided with USB resets; guest power
was already on/active and only ADB held the selected USB node. VMware/USB reset
cause is unresolved; the host was not modified. Preserve both failed native
periods and the bounded successful trial.

This is an in-progress record, not current end-to-end acceptance. Physical
authenticated lifecycle, standalone disconnected operation and native
authenticated workflows remain open; no historical device result closes them.
