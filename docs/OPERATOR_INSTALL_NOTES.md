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

For the corrected sequence, fetch review PR #34 and pin the tested code source
before installing dependencies:

```bash
export MOBILE_BUILD_CHECKOUT="$HOME/warehouse-mobile-build-2026093006"
test ! -e "$MOBILE_BUILD_CHECKOUT"
umask 022
git clone --branch codex/fresh-vm-operator-notes \
  https://github.com/abhiguru/rn-warehouse-template.git "$MOBILE_BUILD_CHECKOUT"
cd "$MOBILE_BUILD_CHECKOUT"
git checkout --detach 43b832092bb8157e73b012add6a57f2e6dd724a1
git rev-parse HEAD
git status --short
```

This source includes the original candidate plus reviewed identity, lint,
scoped-picker, fixture-overlay and compatible lock corrections. It is not
mobile main or unmodified8240cce. The ordinary arm64 build does not invoke
the optional fixture CA helper. The original installed phone remains on8d9da8e;
code2026093006 is the separate corrected normal-build verification.

On this Ubuntu 24.04 guest, install JDK 17 with `sudo apt-get install openjdk-17-jdk
unzip`. Verify `java -version` and `javac -version`. Download Android command-line
tools from [Google's Android tools page](https://developer.android.com/studio),
verify its published SHA-256 before extracting, and install the archive's
`cmdline-tools` directory at `$HOME/Android/Sdk/cmdline-tools/22.0`. This attempt
used `commandlinetools-linux-15859902_latest.zip`, SHA-256
`4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583`.
Native build completion has not been established
on the initial 5.7 GiB VM; the resumed build host has 17.2 GiB RAM. Record actual
memory/disk, and finish unit/static and disposable-backend health checks before
heavy native compilation. Maintain at least the backend doctor's10GiB free-space
minimum throughout; multiple AVD images and native build trees consume additional
space after initial inventory. Monitor free space before doctor and builds.
Reclaim only your completed generated compiler outputs after verifying every
exact APK is retained outside that tree; preserve state, evidence and signing
files. Never globally prune Docker or delete another checkout to make room.
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
export WAREHOUSE_ANDROID_VERSION_CODE=2026093006
npx expo config --type public
# Only in the dedicated disposable build checkout:
npx expo prebuild --platform android --clean --no-install
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -Porg.gradle.workers.max=2 \
  '-Porg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=768m'
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

## Optional unattended fixture APK and emulator sequence

Use the backend review's [isolated fixture guide](https://github.com/abhiguru/supabase-warehouse-template/blob/codex/fresh-vm-operator-install/docs/UNATTENDED_FIXTURE.md)
first. It provisions a separate guarded Fictional Core Warehouse with a
non-delivery key; leave that fixture and its loopback TLS bridge running. Record
backend source `ee5b4936e2aa644667fe617f79e2a48b2eb67bbb` plus its CI network
overlay. Never attach this harness to a real warehouse or tunnel. The installed
Test Warehouse 1 and the production pilot do not supply fixture authentication.

Start a clean, separate mobile checkout at
`43b832092bb8157e73b012add6a57f2e6dd724a1` from the review branch. Run npm ci,
environment creation and the dependency/setup/unit/lint/typecheck/contract
sequence above **before** heavy compilation. Current source43b8320 passed locked installation, 36 setup tests, 217 Jest
tests, lint (0 errors / 1468 existing warnings), typecheck, SDK compatibility,
Expo Doctor 18/18, public bootstrap and npm audit (0 findings). Earlier results
remain separately dated below; do not transfer an old result to a changed head. The dedicated fixture APK uses a local public CA
generated by the backend sequence; its private key never enters the build tree.

```bash
export WAREHOUSE_ANDROID_PACKAGE=in.gurucold.warehouse.fixture
export WAREHOUSE_APP_NAME='Fictional Core Warehouse'
export WAREHOUSE_APP_SCHEME=warehouse-fixture
export WAREHOUSE_ANDROID_VERSION_CODE=2026093005
export WAREHOUSE_FIXTURE_CA="$FIXTURE_PRIVATE/tls/fixture-ca.pem"
npx expo prebuild --platform android --clean --no-install
node scripts/prepare-emulator-fixture.mjs
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64 \
  -Porg.gradle.workers.max=2 \
  '-Porg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=768m'
cd ..
npm run audit:artifact -- android/app/build/outputs/apk/release/app-release.apk
sha256sum android/app/build/outputs/apk/release/app-release.apk
```

Record the generated certificate/network-security overlay as a local native
modification, even though android/ is ignored by Git. The helper rejects normal
warehouse package IDs, invalid/expired/wrong-hostname CAs and existing trust
policies. Trust is limited to backend-core.example.test; other hosts retain
system trust and cleartext stays disabled. Do not disable TLS validation. Rebuild
with new private CA material after its one-day expiry. This locally signed APK
is a fixture artifact, separate from the physical arm64 test APK.

Check emulator resources before claiming unattended native coverage:

```bash
emulator -version
emulator -accel-check
test -e /dev/kvm
free -h
df -h "$HOME"
```

This VMware guest has no exposed virtualization extensions or /dev/kvm.
[Google documents the acceleration requirements and VM restrictions](https://developer.android.com/studio/run/emulator-acceleration).
Software mode is slow and must be measured; do not promise a full UI suite from
boot completion. No host BIOS/VMware change or host reboot is authorized here.
This run used emulator 37.1.11.0/build 15917651 and API 35 Google APIs x86_64
revision 9. A separate API 30 default x86_64 revision 11 trial was added after
API 35 System UI instability; record it separately rather than substituting
device evidence. Choose an unused private AVD name, directory and emulator
port pair; example 5556/5557 and AVD below were created only for this fixture.
Never use `--force` to replace an existing AVD.

```bash
sdkmanager 'emulator' 'system-images;android-35;google_apis;x86_64'
export ANDROID_AVD_HOME="$FIXTURE_PRIVATE/avd"
export ANDROID_EMULATOR_HOME="$FIXTURE_PRIVATE"
mkdir -m 700 "$ANDROID_AVD_HOME"
printf 'no\n' | avdmanager create avd -n TestWarehouseFixture_API35 \
  -k 'system-images;android-35;google_apis;x86_64' \
  -p "$ANDROID_AVD_HOME/TestWarehouseFixture_API35.avd"
ss -ltn
emulator -avd TestWarehouseFixture_API35 -port 5556 -no-accel \
  -gpu swiftshader -no-window -no-audio -no-boot-anim -no-snapshot \
  -memory 2048 -cores 2 -writable-system
```

Keep emulator output private. In a separate terminal with the same Android
environment, set SELECTED_EMULATOR to the newly created emulator's private ADB
serial. Select it explicitly for **every** command; never fall back to a physical
device. Observe `getprop sys.boot_completed`, actual foreground UI, ANRs and
crash logs with a bounded timeout. API 35 eventually booted, but repeated System
UI stalls prevented dependable automation. A 720x1280/280-dpi trial, disabled
animations and disabled emulated Bluetooth did not establish stability. Preserve
original settings and failed attempts; do not keep dismissing failures and call
the run reliable. Emulator crashes do not prove an application root cause.

On this newly created writable, root-capable fixture emulator only, map the
fictional hostname locally without changing this VM's DNS or a phone:

```bash
adb -s "$SELECTED_EMULATOR" root
adb -s "$SELECTED_EMULATOR" wait-for-device
adb -s "$SELECTED_EMULATOR" shell id
adb -s "$SELECTED_EMULATOR" exec-out cat /system/etc/hosts > "$FIXTURE_PRIVATE/emulator-hosts.before"
cp "$FIXTURE_PRIVATE/emulator-hosts.before" "$FIXTURE_PRIVATE/emulator-hosts.fixture"
printf '\n127.0.0.1 backend-core.example.test\n' >> "$FIXTURE_PRIVATE/emulator-hosts.fixture"
adb -s "$SELECTED_EMULATOR" push "$FIXTURE_PRIVATE/emulator-hosts.fixture" /data/local/tmp/warehouse-fixture-hosts
adb -s "$SELECTED_EMULATOR" shell chown root:root /data/local/tmp/warehouse-fixture-hosts
adb -s "$SELECTED_EMULATOR" shell chmod 0644 /data/local/tmp/warehouse-fixture-hosts
adb -s "$SELECTED_EMULATOR" shell chcon u:object_r:system_file:s0 /data/local/tmp/warehouse-fixture-hosts
adb -s "$SELECTED_EMULATOR" shell mount -o bind /data/local/tmp/warehouse-fixture-hosts /system/etc/hosts
adb -s "$SELECTED_EMULATOR" reverse tcp:443 tcp:18443
adb -s "$SELECTED_EMULATOR" shell getenforce
adb -s "$SELECTED_EMULATOR" shell ping -c 1 -W 2 backend-core.example.test
```

Record the original hosts-file SELinux label before mounting; these stock images
use system_file. Require root UID 0 before the mount and SELinux Enforcing
afterward. A mount/cat success is insufficient: the first API 30 attempt still
failed DNS because netd was denied reading shell_data_file. Set root ownership,
0644 and the stock system_file label on this temporary emulator file; never
disable SELinux. Confirm the name resolves to 127.0.0.1 before app discovery.
This bind mount affects only the owned
emulator session; the system-image file is preserved. `adb remount` timed out
and direct hosts writes were read-only in the original API 35 attempt; the
bind mount and selected reverse mapping passed. Neither is a physical-phone
instruction. On another image, record a failed mount as a blocker, not permission
to modify the VM/production DNS or disable certificate checks.

Confirm the fixture package is absent before first install. Install only the
audited APK, then read back base.apk and compare its SHA-256. This attempt's
install client timed out at 180 seconds while package registration eventually
succeeded; inspect registration/read-back before retrying or replacing anything.
Launch the fixture package and require its **actual** foreground hierarchy. A
zero exit code accompanied by `Status: timeout` is not successful UI acceptance.

A driver can read `uiautomator dump /proc/self/fd/1` through `adb exec-out` into
memory, redact phone/OTP/input values before saving evidence, and use fresh
hierarchy bounds for actions. Require the selected fixture app to be foreground
before each action; stale cached coordinates can hit a System UI dialog instead.
Retrieve newly generated mock codes through the protected local Unix socket
documented by the backend guide and submit via subprocess stdin, never process
arguments, files, screenshots or logs. Do not inject saved sessions or fixed OTPs.

For GRN header images, use the corrected Android scoped-picker path (review
943ab86); broad photo-library permissions remain blocked. Do not add media/storage
permissions to bypass the old header handler. The normal image-upload component
already used the picker without that prerequisite. Rebuild and audit the exact
corrected artifact before accepting upload behavior; the old installed physical
APK is separate evidence.

Record manual origin/identity, malformed origins, server persistence, administrator
and A/B login, pending enrollment/approval, stock/order/dispatch/invoice,
logout/revocation, offline/Realtime, uploads/PDFs and instance-switch cases
individually. API fixture passes do not close native rows. Emulator networking
does not establish cellular, physical Wi-Fi, camera scanning or USB-disconnected
acceptance. If System UI prevents a reliable driver, mark dependent cases BLOCKED
and retain the APK/fixture/API evidence instead of claiming the entire suite ran.
Stop only the selected emulator with `adb -s "$SELECTED_EMULATOR" emu kill`,
then stop the owned bridge and fixture as the backend guide describes. Preserve
the AVD, state and private failure logs; do not kill the shared ADB server.

## Current acceptance matrix

| Required case | Status | Evidence / next resource |
| --- | --- | --- |
| Exact source availability and version record | PASS | Full SHAs and remote PR refs above |
| Backend local/public installation | PASS | New warehouse local/public doctor and identity discovery; independent tunnel |
| npm ci, SDK compatibility, Expo Doctor, unit/setup, lint, typecheck, contract, dependency and secret checks | PASS | Candidate: 217 Jest tests / 33 suites, 30 setup tests, lint 0 errors / 1468 warnings, typecheck, SDK compatibility, Expo Doctor 18/18, npm audit 0 findings, public backend and static contract, redacted source/history scan |
| Android SDK/JDK/native generation and build | PASS | JDK 17.0.20.1, CLI tools 22.0, Gradle 8.14.3, build-tools/compile/target 36, minimum API 24, Kotlin 2.1.20, NDK 27.1.12297006; arm64 bundled release variant; corrected 8d9da8e clean build passed, 983 tasks executed |
| Artifact hash/build ID/audit | PASS | Current source 8d9da8ecb3afb873422011cce4c6615b63163a88; package in.gurucold.warehouse.test1; version 0.1.0/code 2026093001; SHA-256 969d4fba6f21b7940897fb67aa8d09174f9e33cf376c964f4798ff96b15c25d4; exact APK audit and signature verified; Android Debug test certificate, not production signing |
| Selected physical Android model/OS/install | PASS | Authorized Samsung SM-A346E, Android 15/API 35, arm64-v8a; package absence checked before first install; corrected APK updated only this owned package with matching signer; pulled installed APK SHA-256 equals audited artifact |
| Emulator alternative | PASS artifact installation; scoped native results below | API30 owned software emulator has final43b8320/code2026093005 installed with audited matching read-back hash. Initial94ead7e and rebuilt943ab86 audit FAIL; API35 System UI failures retained. Emulator rows below do not close physical acceptance |
| Manual server selection and displayed identity | PASS | Corrected artifact discovers Test Warehouse 1 and dedicated HTTPS origin, then Use This Server reaches login. Login retains generic Warehouse Manager branding; chooser is where warehouse identity is verified |
| QR selection | PASS | Operator allowed camera and scanned public-origin QR; preview displayed Test Warehouse 1 and canonical origin before selection |
| Malformed origins | PASS, scoped | HTTP origin and HTTPS origin with /extra path rejected; other malformed cases remain open |
| Cold launch, foreground/background, selected-server persistence | PASS, scoped | Unauthenticated Home/launcher and force-stop/launcher preserved server selection; authenticated Home/launcher preserved Orders. Authenticated force-stop restore remains NOT TESTED |
| Standalone operation without Metro/USB | NOT TESTED | Bundled artifact and disconnected-device launch required |
| Administrator native login | PASS | Operator entered real SMS OTP locally; exact installed APK displayed Orders, Fictional Customer A and staff tabs |
| Customer native login | NOT TESTED | Real Customer A backend login passed; no current native Customer A login evidence |
| Native pending enrollment/approval and reciprocal Customer B | BLOCKED | Existing owned Customer A already approved; operator has no third owned phone. Do not reset an existing user or send SMS to a fictional number to manufacture this case |
| Native logout, expired/revoked sessions, offline/reconnect, Realtime, images and authorized PDFs | NOT TESTED | Backend API passes are separate evidence; unattended emulator execution has not closed these native cases |
| Wi-Fi | PASS, scoped | Current physical device reported Wi-Fi during successful native administrator login and authenticated foreground check |
| Cellular | NOT TESTED | Record unavailable cellular separately |
| Cross-instance and replacement-instance isolation | BLOCKED for current physical APK; NOT TESTED in fixture APK | A separate private fixture now exists, but its local CA/network overlay is exclusive to the emulator artifact. Current authenticated switch/replacement evidence is unavailable; never use the live pilot |

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

This is a scoped installation record, not complete end-to-end acceptance.
Physical administrator login and foreground persistence passed; authenticated
cold restore, standalone disconnected operation and the remaining native
workflows remain open. No historical device result closes them.

## Unattended fixture/emulator run requested — in progress

The operator selected fixture/emulator automation with real-SMS and physical
hardware gaps reported separately. No further phone/OTP prompts are planned.
Current real administrator native login also passed before this scope change:
the exact installed APK displayed Orders, Fictional Customer A and staff tabs.
Actual current-device Wi-Fi transport was observed, Metro port 8081 was not
listening, and Home/launcher preserved the authenticated Orders screen. This
does not establish disconnected-USB operation or cellular acceptance.

This VMware guest exposes neither CPU virtualization nor /dev/kvm. Emulator
37.1.11.0 / build 15917651 and Google APIs API 35 x86_64 revision 9 were installed
into the SDK. A new private TestWarehouseFixture_API35 AVD uses software
emulation, SwiftShader, 2048 MiB, two cores and no snapshots/window/audio.
Android eventually completed boot; the bounded probe observed completion after
439 seconds, following the earlier creation/start period. Earlier incomplete
probes and instruction-feature mismatch warnings are retained; no CPU flag
substitution, host change or host reboot was performed. The unsupported
`emulator -help-qemu` diagnostic failed without affecting the running AVD.

A separate fictional fixture APK must be built for x86_64; the physical phone's
arm64 artifact is not reused. `scripts/prepare-emulator-fixture.mjs` adds a
generated native trust overlay only when applicationId is exactly
`in.gurucold.warehouse.fixture`. It accepts a valid local CA for
backend-core.example.test and restricts that trust to this domain, preserving
system trust for other hosts and denying cleartext. It refuses normal warehouse
packages and an existing network-security policy. Three guard tests passed,
including normal-package, wrong-hostname and expired-certificate rejection.
The production authentication implementation is unchanged. The clean x86_64 build passed in 13m4s with 983 tasks executed. Package
`in.gurucold.warehouse.fixture`, version 0.1.0/code 2026093002, source
`94ead7e6038706b7a4e2351b855ad3bc3794d2fc` plus the documented generated
certificate overlay produced SHA-256
`5f690161696d0c19a3099d489578819e2ac17c4bccf68997c90b0ef5305fd89a`.
Correction: initial artifact audit FAIL (res/q0.pem); the earlier PASS
statement was inaccurate. Signature verification passed. This initial fixture
APK was installed before its audit gate passed; native observations are retained
as scoped historical evidence, not acceptance of that artifact. Install timed out at 180
seconds, but package registration and a pulled installed-APK hash subsequently
matched; this is installation evidence only. `am start -W` exited zero while
reporting Status: timeout, so launch was not accepted from exit code alone.


### API 30 functional findings — 2026-09-30

API 30 default x86_64 revision 11 booted in the bounded probe at 232.9 seconds.
The exact initial fixture APK installed and its read-back SHA-256 matched. Initial
System UI ANR was retained; Wait recovered the owned emulator UI. Name resolution
then failed despite successful bind-mount/cat: netd AVC records proved read denial
for shell_data_file. Root ownership, 0644 and the original system_file label
restored resolution to 127.0.0.1 with SELinux Enforcing. Native discovery displayed
Fictional Core Warehouse and its canonical origin. Administrator verification used
a newly generated in-memory mock challenge through the real verification route;
Orders displayed both fictional customers and staff tabs. No code/session was
injected or logged, and no provider was contacted.

Streaming hierarchy probes on the OTP countdown screen failed to return a tree;
a blank-code screenshot confirmed the expected fixture screen before submission.
The countdown preventing idle is an inference, not an established platform root
cause. No filled-code screenshot was taken. Foreground Orders afterward established
login. An initial cold-launch hierarchy was empty; a premature aggregate lifecycle
ledger entry was corrected and preserved. Subsequent fresh staff controls navigated
to populated GRN data, establishing restored authenticated state. Loading/empty
trees never count as accepted UI. Home/launcher also preserved Orders.

GRN list/detail displayed BAA01 empty and BAC01 partial: 10 original bags, seven
dispatched, balance three. This is native reading of API-seeded fixture data, not
native receipt/dispatch creation. Selecting Add GRN image did not open the picker.
The header handler requested broad media-library permission despite the native
manifest intentionally blocking it; an attempted emulator-only READ_EXTERNAL_STORAGE
grant failed because that permission is undeclared. Do not add it to the manifest
or use a permission grant as a workaround. Review code commit
`943ab86bfcc9fa4191511c4210f88bbf4381bd64` skips the broad-library prerequisite on
Android and uses the system-selected image's grant; the existing other-platform
branch remains. [Expo SDK 54 ImagePicker guidance](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/)
supports launching the image library without a permission request for images.
Typecheck, targeted lint and 35 setup tests passed; clean corrected artifact and
positive native upload verification subsequently passed on d4540c8 as recorded below. The physical installed
8d9da8e artifact has not been updated by this emulator exercise.


### Fixture artifact audit correction

Raw audit242 for source94ead7e and audit295 for source943ab86 both failed on
res/q0.pem, the generated public fixture CA resource. A previous PASS claim was
incorrect and is explicitly corrected here and in the private ledger; failed
logs/artifacts remain. The first fixture APK had already been installed; it was
stopped after this review. The source943ab86 rebuild (code2026093003) is retained
as AUDIT-FAILED and was not installed. The physical APK audit is separate and
passed. No artifact guard is weakened.

Source d90f934 packages the public certificate with .crt; Android's @raw resource
reference is extension-independent. Source d4540c8 adds a positive generated-overlay
regression test against the unchanged artifact audit and negative key-file/private-key
and existing-policy cases. All six targeted helper/audit tests and targeted lint
passed; all 36 setup tests passed. That correction was verified as d4540c8/build code2026093004; the final main fixture
sequence now pins43b8320/code2026093005 including the compatible lock corrections.
Every clean native build must pass the unchanged exact artifact audit before installation. Old observed UI behavior
does not close the corrected artifact's acceptance cases.


### Corrected artifact and dependency validation

Clean source d4540c8 plus the declared native fixture identity/CA overlay built
in 7m15s (983 tasks: 955 executed, 28 up-to-date). Version code2026093004,
SHA-256 `f8f1ad67bfea96bf3b286b78103f0b9df1b04cff1398ecb0f26eb1f0c5817ed7`,
passed the unchanged artifact audit, signature, package and exact public-CA
fingerprint checks before updating only the owned emulator fixture package.
Installed read-back matched. A metadata writer initially treated the source
string as an object after installation and raised TypeError; correction verified
the already installed hash and saved metadata without reinstalling. All 217
Jest tests, full lint (0 errors / 1468 existing warnings), typecheck, public
bootstrap, SDK compatibility and Expo Doctor 18/18 passed on this correction.

The later required npm audit on the unchanged lockfile failed: brace-expansion
aggregate HIGH, fast-uri MODERATE and moment MODERATE (three affected packages).
The earlier zero-finding report is retained as historical, not current evidence.
Source43b8320 updates only compatible resolutions for these names: eleven lock
entries; brace-expansion 1.1.18→1.1.21 / 2.1.4→2.1.7 / 5.0.9→5.0.12,
fast-uri 3.1.7→3.1.8 and moment 2.30.1→2.31.0. package.json, Expo/RN and native
permission policy are unchanged. Locked installation, 36 setup and 217 unit tests,
full lint/typecheck, SDK compatibility, Expo Doctor, public bootstrap and npm
audit0 all passed. A clean build/code2026093005 and exact-artifact retest are
recorded separately; the phone remains on the earlier physical artifact.

[Brace-expansion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[fast-uri advisory](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj),
[moment advisory](https://github.com/advisories/GHSA-4p3w-j4w9-5jqw). The npm
brace-expansion severity aggregates multiple advisories; the linked quadratic
rewrite advisory alone is moderate. This update does not resolve or change the
backend's deferred container-image findings or other release gates.

On the audited d4540c8 emulator APK, Add GRN image now opens the native system
picker with no broad permission grant. A sole fictional 64×64 PNG was supplied
in the disposable emulator. Tile/body taps and focused-file Enter were dispatched,
but the bounded probes had not returned to the app or established upload
completion. Preserve those attempts; picker launch is a PASS for the corrected
prerequisite, while full native upload remains unproven. Do not count a delivered
ADB input event or unchanged picker hierarchy as successful file selection.


The later fresh d4540c8 hierarchy returned to the app with Images1/Header1 and
Delete warehouse-fixture.webp. The upload transformed the sole fictional PNG
through the normal client pipeline. This establishes native metadata/upload
completion without a broad library permission; thumbnail rendering remains a
separate case. DocumentsUI's initial tile/body taps did not establish selection;
Tab focused the known file and Enter eventually returned the result. Bounded
probes during the concurrent native build expired before completion; retain
those failures and finish heavy builds before UI acceptance. An attempted
list-layout diagnostic refused because the app had already regained foreground.

Native d4540c8 administrator verification age4339s exceeded the configured
access lifetime3600. Private snapshots showed one refresh-session hash rotation
without another OTP verification, while authenticated staff/image operations
continued. This is legitimate native expired-access refresh evidence in the
disposable fixture only, without time manipulation or token injection. The first
read-only snapshot helper had one excess SQL parenthesis and failed before
comparison; its code/error were retained and the corrected query succeeded.
No physical native expiry acceptance follows from this fixture case.


Final tested dependency source43b8320 plus the declared native fixture overlay
built clean in 11m37s with 983 tasks executed. Package in.gurucold.warehouse.fixture,
version0.1.0/code2026093005, SHA-256
`c9a8052dff9834a9450c8afa82a22911cda4332222b7fc128699d15c16dd68fe`
passed the unchanged audit and signature/package checks before updating only
the owned emulator package. Pulled installed bytes matched. No physical phone
was updated in this unattended scope. Source lock and every native overlay are
recorded; do not attribute the fixture behavior to the original candidate HEAD.

On prior audited d4540c8, private native loader diagnostics also confirmed a
REMOTE bitmap drawable loaded for the uploaded thumbnail (226×226); signed
URLs stay private. The final43b8320 artifact requires its own workflow rows,
recorded below as they occur. Repeated initial input/timing failures are retained;
this software emulator is not evidence of a flawless or production-ready run.


### Final audited emulator workflow evidence

Final source43b8320 / code2026093005 / SHA c9a8052dff9834a9450c8afa82a22911cda4332222b7fc128699d15c16dd68fe
was tested against backend ee5b493 with its declared CI network overlay. Native
server/session restore, administrator logout and backend refresh-session
revocation passed. Customer A used a newly generated fixture challenge and
the actual Edge verifier; Orders showed only A. Native Settings identified the
Customer role and omitted staff enrollment/users/customers controls. The native
cart added one bag from BAC01; a guarded database read confirmed quantity1.

A fresh fourth fictional account reached the native pending-enrollment screen
with only Check status/Sign out, and had no refresh session. Administrator
Enrollment Review assigned only existing Customer A and saved approval; the
pending list became empty and a guarded operator-schema read confirmed that
sole assignment. An initial exact-label probe missed Android's uppercase
APPROVE confirmation and timed out. A shell batch also continued after that
failed probe; its premature PASS row is retained and superseded by the fresh
confirmation and database check. Subsequent dependent batches stop on failure.
The first read-only assignment query targeted a legacy table and failed; the
corrected query uses users_customers_new.user_profile_id and active assignment.

Current native GRN list/detail shows API-seeded BAA01 completely dispatched
(100→0) and BAC01 with stock3/10; this is display evidence, not native receipt
or dispatch creation. Normal Share PDF generated BAA01, downloaded a valid
20982-byte PDF in the owned app cache, and opened Android's chooser. Native
authorized download PASS; viewer BLOCKED because PackageManager reports no
application/pdf VIEW activity in the API30 default image. Signed URLs and the
downloaded PDF remain private. No external recipient or printer was invoked.

| Required emulator case | Current status | Scope / missing resource |
| --- | --- | --- |
| Audited artifact and exact installed bytes | PASS | Final43b8320/code3005; public CA .crt overlay; test signing only |
| Server/admin session restore | PASS | Saved fixture selection/session after own package update |
| Native customer login, role and cart add | PASS | Fictional A, actual verifier/RPC; saved one bag from own stock |
| Native fresh pending enrollment and administrator approval | PASS | Fourth fixture identity; no pending session; sole selected assignment verified |
| Native logout/revocation | PASS | Login screen retained server; prior admin refresh session revoked |
| Expired access with legitimate refresh | PASS on prior audited d4540c8 | Age4339s > TTL3600, hash rotation, no extra OTP; not transferred to final43 APK |
| Native GRN stock and dispatch/invoice display | PASS, scoped | API-seeded data; final43 GRN stock display and older artifact invoice display are distinguished |
| Native GRN header image upload | PASS on prior audited d4540c8 | Native scoped picker, transformed WebP and metadata; new final43 upload not repeated |
| Native authorized header-image render | PASS on final43 | BAC01 header1;16500/16500 thumbnail ROI pixels matched known fictional image |
| Native authorized PDF download | PASS | Current43 normal app request, valid cache PDF and chooser |
| Native PDF viewing | BLOCKED | No PDF VIEW activity on disposable API30 image |
| Full native receipt/partial-final dispatch/invoice creation | NOT TESTED | Backend API fixture and real Test1 fictional flow passed; no native creation claim |
| Native reciprocal Customer B after disable/reapproval | NOT TESTED | API A/B isolation and disabled-session revocation passed; native B sequence separate |
| Native unreachable endpoint | FAIL | Removing only emulator reverse443 did not produce an observed error within90s; cause unestablished. Wi-Fi remained enabled; no offline-write claim |
| Native reconnect | PASS, scoped | Restored fixture reverse443, manual refresh recovered saved cart |
| Native Realtime | PASS | Guarded administrator RPC changed A cart1→2; current43 foreground Orders updated without manual refresh/navigation |
| Native cross-instance authenticated switching/replacement | NOT TESTED | No suitable second emulator-authenticated instance prepared; pilot excluded |
| Emulator camera QR/cellular/no-USB | NOT TESTED | Emulator networking and ADB reverse do not establish those hardware cases |
| Real provider and physical acceptance | Separate ledger | No provider calls in fixture; initial physical APK remains8d9da8e |

Real-SMS fault/rate-limit exercises require a separate agreed window and remain
open. Printing, sensors, iPhone, external alert delivery, credential rotation and
deferred image security research remain outside this installation exercise.


The final43 endpoint-loss probe removed only selected-emulator reverse443 and
restored it in finally. Expected read-error feedback was not observed within
the bounded window: FAIL, root cause unestablished (a transient message may
have been missed; this is not a proven explanation). Manual refresh after route
restoration recovered the saved cart: reconnect PASS, scoped. The Wi-Fi link
remained enabled; this is not offline writes or cellular acceptance. A later
guarded administrator RPC changed A cart1→2; the foreground native Orders row
changed to two units without navigation/manual refresh: native Realtime PASS.


Final43 image check: BAC01 displayed Header1 and the saved WebP metadata. A
private fixture-screen capture showed16500/16500 pixels in the known thumbnail
region matching the sole fictional image (compression tolerance5/channel).
Current authorized rendering PASS; no repeated final43 upload is claimed.
Cleanup stopped only the owned emulator, foreground bridge and fixture03
services without deleting state/volumes or restarting shared ADB. An initial
process-selection diagnostic refused because /proc working-directory access
was denied for the sg docker child despite the same uid. The exact absolute
script argument was verified, then Ctrl+C stopped its owned foreground terminal
and its handler removed the private socket. No unrelated process was signaled.


[Consolidated dated installation/test ledger](https://github.com/abhiguru/supabase-warehouse-template/blob/codex/fresh-vm-operator-install/docs/FRESH_VM_INSTALL_LEDGER.md)
records source/artifact boundaries, every required case, failures and open resources.
Consult it before another run; repeat completed checks only when a source,
configuration, artifact, prerequisite or acceptance scope changes, or a failure
needs resolution. Keep raw evidence and prior attempts privately, outside Git.


### Normal arm64 clean build and pause

The main corrected sequence was repeated in a new clean checkout pinned
43b832092bb8157e73b012add6a57f2e6dd724a1. Locked installation and normal native
prebuild PASS; generated Test1 identity/package/scheme/code2026093006 only, no
fixture CA helper/overlay. The documented assembleRelease arm64-v8a/two-worker/
3GiB command completed in10m22s (983 tasks executed). Exact unchanged artifact
audit PASS. Retained normal APK SHA-256
`f4f8dedafb3000bc602fd5c83620c7480d6bb19fa976694f8a3310e4af81befb`, version0.1.0/code2026093006.
This build was archived and NOT INSTALLED; signature inspection, read-back and
physical acceptance for it remain NOT TESTED. The phone still has8d9da8e/code3001.

An independent clean backend guide repeat passed48 unit, migrations, setup, API,
Realtime, final accounts/images, Studio/gateway/retention checks and private
same-input preservation; container audit FAIL unchanged. Its first doctor
failed the disk minimum when concurrent compilation left9.4GiB. Exact retained
APKs were verified before three completed owned app/build output trees were
reclaimed; free space returned to12GiB and doctor passed. Existing state/raw
evidence/APKs/signing/AVDs remain. The revised main sequence includes continuous
resource checks and avoids concurrent heavy build/backend checks on constrained
hosts. This is a preserved failed attempt, not a flawless installation claim.

Operator explicitly requested additional disk capacity and pause before reboot.
All disposable services/bridge/emulator are stopped; installed Test1/tunnel remain
running. No reboot/resize performed. On explicit resume after the operator's
reboot, recheck host prerequisites and health, then reuse the consolidated dated
ledger instead of rerunning completed suites without changed scope/source.
