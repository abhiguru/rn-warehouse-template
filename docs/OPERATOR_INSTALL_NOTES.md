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

Before an unattended run, complete the [bounded fixture-run prerequisites](UNATTENDED_RUN.md).
Do not start the overnight suite while its artifact, PDF, device or case-specific
gates remain open. The historical result ledger below preserves failed attempts.

The operator resumed after the VM resource change. The guest now exposes eight
CPUs and usable KVM. See [CPU_UPGRADE_RESUME.md](CPU_UPGRADE_RESUME.md) for the
preserved pause, interrupted attempt and scoped post-reboot results. The first eight-hour attempt FAILED in block05 after its terminal-backed
bridges disappeared. Four blocks passed; later blocks and final reconciliation
did not run. The corrected supervised run started13:17IST1October and remains RUNNING at the saved launch checkpoint. The final reconciliation completed21:18IST1October: all9blocks and21checks PASS
(see completion658 below). Earlier RUNNING observations are historical.

A later source-only GRN-link correction is recorded at the end of this ledger.
Its candidate has not been installed; current native/soak results remain scoped
to the artifact in the table below.

## Exact-artifact launch checkpoint — 2026-10-01 13:17 IST

This is the preserved launch snapshot. Read the later
[acceptance matrix](OPERATOR_ACCEPTANCE_MATRIX.md) for scoped fixes/blockers and
the private soak ledger for live progress. Source audit fixes do not replace
the installed runtime or clear its security/release gates.

| Case | Status | Evidence and scope |
| --- | --- | --- |
| Fresh clean backend7e installation and functional cases | PASS |618; new owned identity/configuration/DB/Storage, documented subnet overlay only; backend dependency audit remains FAIL |
| Same-input setup preservation | PASS |628; private instance/config/catalog hashes and all13 stored-file hashes unchanged |
| Source tests/build/trust/install | PASS |e217;249Jest/48setup/type/lint/Expo/audit, all4CI36821249722, clean620 and exact compiled trust/readback621 |
| Persistent stale Orders warning | PASS |622; retained order marked after5seconds/error expiry, while retry pending, cleared after actual Orders200 |
| Native receipt response-loss/retries | PASS, scoped |Corrected before303/after302 and private images624; initial301 fault FAIL and saved record retained, no replay |
| Saved invoice/private PDF SEND/render/export | PASS, scoped |626; actual new artifact/new exported%PDF number20261005/tax9/discount-2.5/total182/three lines/hash; driver failures preserved |
| Clean authenticated core/switch/core round trip | PASS |623c after natural quota reset: both real mock verifiers, separate profile/data/cache, primary return/invoice and both cold persistence;623a/b failures retained |
| Three cold launches/30minute readiness | PASS |Three cold launches;1802.6seconds/30cycles on current2026100101 artifact, completed629 |
| Final current short read/preflight/frozen plan | PASS633; FAIL630 retained |Bounded owned IPC/listener readiness, preserved baselines/session/OTP reconciliation, full preflight,60second native read/verify,54 frozen bindings |
| New8hour read soak | RUNNING |Actual631 start13:17IST, activePID2211555, two PASS preflights, first native block RUNNING; completion/aggregate pending |
| Physical/provider/cellular/noUSB/revocation/release cases | OPEN |Current run is isolated emulator/mock delivery; backend dependency gate FAIL and documented hardware/auth gaps remain |

Preparation629 completed PASS. Original630 failed at IPC startup readiness;
separate633 final gates PASS and actual631 launch verified. Failed evidence is
retained. The supervised eight-hour unit has Restart=no/KillMode=control-group
and a10-hour cap. No timer or reboot is scheduled. See the renewed launch
record below for exact frozen inputs and remaining acceptance.

## Historical pre-overnight blocker checkpoint — 2026-09-30

| Case | Status | Current evidence and limit |
| --- | --- | --- |
| Invoice arithmetic and saved display | PASS, scoped |239 Jest tests;470 native original179/discount177/surcharge182 checks; final57/code3010 native saved list/overview/breakdown and half-cent review/confirmation/save2 |
| Exact installed fixture artifact | PASS |42a5559b4abcad3ddd7601b2e4885e3c29101c76/code2026093014/x86_64; clean checkout build606/exact audit/readback607; SHA2566e882894ff4a0533b31e755fda6930aad6fea8c875030c083a887d445be5bb17. Earlier results retain their own APK scope |
| Private PDF and local viewing | PASS, scoped |Exact code3014 native SEND/render and copied number/tax9/discount-2.5/total182/three lines/hash609 PASS using approved Librera9.5.7/code7222. Wrong expected net173/9.00 template fields retained as failed assertion/read-only reconciled. Historical half-cent527–529 stays scoped3010 |
| Stacked PR CI trigger | PASS for mobile |Current app42a5559/run36751524355 all4 jobs PASS; earlier failures retained. Backend383 CI dependency audit FAIL and dependent jobs SKIPPED; no release claim |
| Certificate horizon guard | PASS at check time |Requested12-hour horizon verified; CA expires2026-10-01T09:51:45Z; recheck before every actual long run |
| Bounded runner infrastructure | PASS, scoped |Six regression cases;42 full setup checks; guarded read-only fixture smoke/resume514 retained one execution; changed runner bindings require new evidence, not blind reuse |
| Emulator cold-start readiness | PASS on3014 |Three cold launches plus1801.7seconds/28cycles PASS550-20260930T181721Z, no ANR/crash/ADB restart/human. Earlier failures/artifact results retained |
| Lost-response controls and API reconciliation | PASS, scoped |Native3014 receipt before/after loss: independent no-commit/commit before unchanged retries, one line/qty4/stock4/cache and success608; confirmed private images PASS. Native dispatch results582 remain3012, API four-case evidence566/572 retained |
| First overnight fixture/emulator run | FAIL |3014 started00:30:19IST1October; blocks01–04 PASS/208cycles/12801.18seconds, fifth block FAIL after40 further completed cycles. Three dependency listeners/processes disappeared. Blocks06–09/final NOT RUN; no completed eight-hour or physical/provider/release acceptance |
| Current normal arm64/physical acceptance | NOT TESTED |Phone remains8d9da8e/code3001; normal historical e54/code3008 build is separate; corrected native evidence is emulator-only |

Do not rerun successful unchanged cases to obscure these boundaries. Line-level
rounded taxes can differ from the ceiled saved header; compare the documented
header/discount/rounding contract and do not infer storage from total-tax.

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
export MOBILE_BUILD_CHECKOUT="$HOME/warehouse-mobile-build-2026100102"
test ! -e "$MOBILE_BUILD_CHECKOUT"
umask 022
git clone --branch codex/fresh-vm-operator-notes \
  https://github.com/abhiguru/rn-warehouse-template.git "$MOBILE_BUILD_CHECKOUT"
cd "$MOBILE_BUILD_CHECKOUT"
git checkout --detach 2fbf238a270e9806ed055ddfab045b57eb926ab2
git rev-parse HEAD
git status --short
```

This is the unmerged review code through654, including the SDK checker used below,
invoice/stable-key corrections, GRN link/dispatch labels, switching/identity cleanup,
network/banner races and one-attempt query writes. Record both original candidates
and this explicit correction commit; no substitute is attributed to original HEAD.
Its next standalone APK is not yet built or installed. Historical clean builds and
native results remain attached to their actual artifacts in the acceptance matrix.
To reproduce the currently installed soak code instead, pin
`e217c1f2b22f74ea5aaabca5101c27aa166c5f68` in another unused checkout and use its
recorded build prerequisites; it predates `check-android-sdk.mjs`, so do not execute
newer-source commands against that pin. The physical phone remains8d/code3001.
Choose your own unused directory/build identifier if an example is already occupied.

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
node scripts/check-android-sdk.mjs
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
export WAREHOUSE_ANDROID_VERSION_CODE=2026100103
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

For a later warehouse change, open **Settings → Change Warehouse Server** (or
**Change warehouse server** on the login screen), enter the new HTTPS origin,
tap **Check server** and verify the displayed identity. On a build containing
correction649, **Use this server** asks for confirmation when either the origin
or instance identity changes. **Cancel** preserves the current session and drafts;
**Change server** clears them and requires a fresh login. Selecting the same
origin and instance preserves them. Finish any active save before switching.
On builds containing652, a replacement at the same origin clears credentials
locally before adopting its identity; old refresh/enrollment credentials are never
sent to that replacement for logout. Re-authenticate against the displayed new
identity. Ordinary logout and different-origin switching retain old-server
revocation attempts.
See [server-switch acceptance](OPERATOR_SERVER_SWITCH_CASES.md) for unsaved-form
and replacement-instance cases. The installed e217 APK predates this correction;
build/audit the reviewed correction with a new identifier before testing it.

Real authentication needs explicit SMS permission and owned phones; input OTPs
locally, never in chat/logs. Historical device tests do not count for this APK.

For offline checks, keep a valid unsaved form open and distinguish device
disconnection from warehouse unreachability. Current GRN/dispatch forms do not
provide a durable offline queue. Preserve failed or uncertain submissions and
reconcile records/stock before a manual unchanged retry. Use the
[offline/reconnect sequence](OPERATOR_OFFLINE_CASES.md); a banner or airplane-mode
toggle alone is insufficient with an ADB reverse route. Native acceptance of
corrections650–651 requires a newly built and audited APK after the active soak.

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
backend source `7e3f66a34bb729d80e25c6a4a0975f072c05d03a` plus the declared isolated
Compose subnet overlay. Follow the backend guide literally in a new state;
never borrow another instance's state, connector or identity. After the backend
functional checks, supervise core, switching bridge and fault relay using its
persistent, unenabled user-unit procedure. No terminal-backed dependency is
sufficient for a long run.

Clone a clean separate mobile checkout and pin
`2fbf238a270e9806ed055ddfab045b57eb926ab2` from this review branch before npm ci,
environment creation and the dependency/setup/unit/lint/typecheck/contract
sequence above. This is the new unbuilt candidate, including source corrections
through654. The active soak retains e217/code2026100101, clean build620 and compiled
trust/install/readback621 PASS. Do not overwrite it or its config while active.
Earlier artifact results retain their original scope; a new APK requires its own
audit, native prerequisites and soak decision before another overnight launch.

Finish the separate switching fixture first and generate fresh independently
owned private TLS there as well. Set SWITCH_PRIVATE to its protected directory.
Only public certificates enter the build; keep both private keys outside Git.
The dedicated fixture APK uses a
local public CA generated by the backend sequence; its private key never enters
the build tree. Select a fresh build identifier, shown as2026100102 below.

```bash
export WAREHOUSE_ANDROID_PACKAGE=in.gurucold.warehouse.fixture
export WAREHOUSE_APP_NAME='Fictional Core Warehouse'
export WAREHOUSE_APP_SCHEME=warehouse-fixture
export WAREHOUSE_ANDROID_VERSION_CODE=2026100102
export WAREHOUSE_FIXTURE_CA="$FIXTURE_PRIVATE/tls/fixture-ca.pem"
export WAREHOUSE_SWITCH_FIXTURE_CA="$SWITCH_PRIVATE/tls/fixture-ca.pem"
# Cover build/setup + planned run + safety margin; recheck at actual run start.
export WAREHOUSE_FIXTURE_MIN_VALID_HOURS=12
node scripts/prepare-emulator-fixture.mjs --check-certificate
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
policies. Separate trust is limited to the exact backend-core.example.test and
backend-switch.example.test domain entries; other hosts retain
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

Before the operator resource change, this VMware guest had no exposed
virtualization extensions or /dev/kvm. After that change, eight guest CPUs, VT-x,
/dev/kvm and emulator accel-check report usable KVM. Record actual capabilities
instead of assuming either state.
[Google documents the acceleration requirements and VM restrictions](https://developer.android.com/studio/run/emulator-acceleration).
Measure both boot and application readiness; boot completion alone is insufficient.
For the owned API30 emulator, KVM with two emulated cores passed the scoped
code3010 three-launch/30-minute rehearsal. This is observed behavior in VMware,
not a supported-platform or production-readiness claim. No host BIOS/VMware change or host reboot is authorized here.
Use the measured fixture image: emulator37.1.11.0/build15917651 and API30 default
x86_64 revision11. Earlier API35 Google APIs revision9/software failures remain
in the historical findings. Choose a new unused private AVD name/directory and
port pair; these commands must never replace the existing fixture or another
operator's AVD. Match720x1280/density280 if using the recorded UI driver's bounds.
Never use --force.

```bash
sdkmanager 'emulator' 'system-images;android-30;default;x86_64'
export ANDROID_AVD_HOME="$FIXTURE_PRIVATE/avd"
export ANDROID_EMULATOR_HOME="$FIXTURE_PRIVATE"
mkdir -m 700 "$ANDROID_AVD_HOME"
printf 'no\n' | avdmanager create avd -n TestWarehouseFixture_API30 \
  -k 'system-images;android-30;default;x86_64' \
  -p "$ANDROID_AVD_HOME/TestWarehouseFixture_API30.avd"
# Only the newly created, owned AVD; record this configuration overlay:
python3 - <<'CONFIG'
import os, pathlib, re
p = pathlib.Path(os.environ['ANDROID_AVD_HOME']) / 'TestWarehouseFixture_API30.avd/config.ini'
s = p.read_text()
for key, value in {'hw.lcd.width': '720', 'hw.lcd.height': '1280',
                   'hw.lcd.density': '280', 'hw.ramSize': '2048',
                   'hw.cpu.ncore': '2'}.items():
    pattern = r'^' + re.escape(key) + r'=.*$'
    s = re.sub(pattern, key + '=' + value, s, flags=re.M) if re.search(pattern, s, re.M) else s + '\n' + key + '=' + value + '\n'
p.write_text(s)
CONFIG
ss -ltn
# Record the accel-check output. KVM must pass before using on.
if emulator -accel-check; then
  WAREHOUSE_EMULATOR_ACCEL=on
else
  WAREHOUSE_EMULATOR_ACCEL=off
fi
emulator -avd TestWarehouseFixture_API30 -port 5556 \
  -accel "$WAREHOUSE_EMULATOR_ACCEL" -gpu swiftshader \
  -no-window -no-audio -no-boot-anim -no-snapshot \
  -memory 2048 -cores 2 -writable-system
```

Software fallback has not established reliable overnight acceptance here. KVM
availability likewise requires measured cold-start/read/navigation readiness;
never proceed automatically from accel-check or boot-completed alone.

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

## Initial physical acceptance matrix — preserved historical snapshot

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

## Resumed current-artifact acceptance — e54/code2026093007

These rows supersede only their stated scope. Historical phone8d9da8e,
emulator43 and d454 results stay attached to those artifacts. The new normal
arm64 code2026093008 is built/audited but NOT INSTALLED.

| Required current scope | Result | Exact evidence or remaining limitation |
| --- | --- | --- |
| Revised clean normal guide, locked dependencies/setup/unit/lint/type/Expo/audit/bootstrap | PASS |36 setup;217 Jest/33 suites;0 lint errors/1468 existing warnings;Doctor18/18;npm audit0; normal arm64 build11m8s/983 executed |
| Mobile/backend live contract | PASS after FAIL |128 typed calls/94 names/3 dynamic wrappers,106 catalog signatures; first separate-checkout/state mismatch refused, corrected owning checkout guard retained |
| Fixture x86 build/artifact/signature/package/install/read-back | PASS |e54/code3007,11m6s/983 executed; exact SHA recorded above; generated restricted CA/native identity overlay declared |
| Physical corrected-artifact installation/acceptance | NOT TESTED |Phone remains8d9da8e; no new phone/SMS interaction in resumed scope |
| First new-artifact cold Orders launch | FAIL |SystemUI ANR; one explicit owned Wait recovered session separately. No KVM; cold reliability unresolved |
| Recovered administrator session and naturally expired access refresh | PASS |Age10832s>TTL3600; exactly one refresh hash rotated; session IDs and OTP verification count/time unchanged |
| Native logout/backend revocation | PASS |Normal Sign Out; private comparison exactly one refresh session removed, none added, no new OTP |
| Native disabled-B denial | PASS |Actual generated-OTP verifier showed Account unavailable; disabled profile/no active sessions/assignments confirmed |
| Reapproved B native login and Orders/role scope | PASS |Preparation by isolated admin API, then actual native verifier; only B Orders/customer tabs and Settings, no admin controls. Not native reapproval evidence |
| Same-artifact native A/B Orders isolation and switch return | PASS scoped |B-only then A-only through fresh actual verifier logins on e54; returned stored fixture identity matched; no stale B/Queue. Native deep-link/privileged denial not implied |
| Fresh pending enrollment/native approval | NOT TESTED on e54 |Earlier43 native fourth-account pending/sole-A approval PASS retained separately |
| Native cleared dispatch number regression | PASS |Empty field remains enabled/editable; normal I0002 re-entry and named suggestion accepted; private433 |
| Native final dispatch | PASS |I0002 quantity1/BAC01 stock1→0 and empty A cart; normal Submit/success plus guarded rows |
| Native receipt/image upload/partial dispatch | NOT TESTED on e54 |Earlier43 A0001 receipt/upload and I0001 partial2/stock3→1 PASS retained separately |
| Native invoice persistence | PASS scoped |20260930/BAC01,3 lines/10 dispatched; storage150/labour20/saved tax9/total179,stock0 |
| Native invoice preview/persisted financial reconciliation | FAIL |Preview tax8.50/total178.50 versus existing backend CEIL9/179; no rule change; correction/review/new-artifact retest open |
| Native image render, Realtime, PDF download | NOT TESTED on e54 |Earlier exact-artifact passes preserved; no transfer |
| PDF viewing | BLOCKED |Default API30 image has no PDF VIEW application; earlier download proof does not close viewing |
| Link-offline banner and reconnect | PASS scoped |Owned emulator Wi-Fi/data and reverse removed; banner observed; finally restored; manual refresh recovered empty queues |
| Endpoint-only loss and offline writes | FAIL earlier endpoint case; NOT TESTED writes |Keeping Wi-Fi on did not show expected feedback on43; no offline write/replay acceptance |
| Malformed origin rejection | PASS scoped |Actual HTTP and HTTPS-with-path rejection on e54; first keyboard-contacts prompt blocked attempt retained FAIL |
| Owned-instance discovery/switch-out | PASS scoped |Distinct Test1 identity displayed/persisted; prior fixture B refresh count1→0; target login reached without OTP |
| Test1 unauthenticated cold persistence/direct network | PASS scoped |Force-stop/launch retained Test1 public server key; fresh discovery succeeded with fixture reverse absent. No Test1 OTP/Metro; first boot ANR remains FAIL |
| Both-instance authenticated switching/same-origin identity replacement | NOT TESTED |No Test1 OTP in unattended scope; same-origin replacement not exercised; pilot excluded |
| QR/camera, cellular, physical no-USB, complete physical workflows | NOT TESTED current |Historical phone camera/Wi-Fi evidence separate; emulator transport is not hardware acceptance |

## Native fictional workflow prerequisites

Complete builds before UI acceptance on a software emulator. Wait for list
loading, generated document numbers and defaults to settle before entering
values; select inputs by their current labels rather than ordinal positions.
Customer search needs at least one typed character. A GRN create workflow
requires a receipt-book image: attach only a fictional fixture image through
the normal system picker. Save each item before reviewing the receipt.

The current dispatch form requires a registration containing only uppercase
letters, digits and spaces (maximum30 characters); a fictional example is
`GJ01ZZ9999`. Hyphens such as `TEST-ONLY` are rejected. The alert may say only
“Please check: registration”; inspect the field validation. Queue conversion
preloads the customer and order lines, while document number/supervisor arrive
asynchronously. A gray registration suggestion is ghost text, not yet a saved
value: tap the suggestion or enter the value, then verify it on Review. Its
original43 empty TextInput lacked an accessible name while the suggestion was
shown. The pinned e54 correction names Vehicle registration and the normal
Use suggestion button; earlier accessibility failures remain in the ledger.
Current createDispatch sends `p_generate_invoice:true`, but the pinned backend
returns invoice data for enabled customers through this path; it does not itself
persist an invoice. Complete the separate native invoice workflow and verify its
saved header/lines. The actual create UI has three steps: Info, Items, Review.
Choose a fully dispatched, uninvoiced receipt through the GRN picker; wait for
its lines/defaults, review, then Submit Invoice and Create. Existing invoiced
receipts are not eligible for a new invoice. Compare review/confirmation, saved header and invoice/PDF
amounts. The pinned backend rounds header tax/total up to whole rupees; current
mobile e54 preview retains two decimals. A fractional-tax native case failed
reconciliation (178.50 shown versus179 saved); keep financial acceptance FAIL
until a reviewed correction and exact-artifact retest. Do not alter business
rules merely to make the test pass. The service comment “Auto-generate invoice” is misleading;
do not count dispatch success as invoice creation.
Use the documented fictional pricing example for its specific dates and data,
rather than applying its total to new current-date dispatches.

Do not send synthetic Back merely because Android reports an IME input-shown
flag: the software emulator reported it while Back navigated out of the draft.
A fresh default emulator may show an AOSP keyboard contacts prompt. Select
DENY in that ordinary system dialog; warehouse-server selection needs no
keyboard contact access. Inspect the actual foreground before continuing.

Leave keyboard dismissal to ordinary next-step controls in unattended tests.

ADB input delivery alone is not a PASS. Require the actual saved receipt/stock,
dispatch/invoice or guarded metadata result. If accessibility reports an inverted
rectangle, refuse that automated tap; inspect a fresh visible screenshot and
record any ordinary visible tap used. Never inject application state, a stored
session or a fixed OTP to bypass the normal workflow.

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


### Operator-authorized resume after disk expansion — 2026-09-30

The operator's reboot/expansion changed root capacity to157GiB with86GiB free;
RAM17GiB/swap4GiB, sudo/Docker and Test1 local/public health PASS. Completed
locked-dependency/unit/type/lint/contract/build checks were reused at unchanged
sources. The normal arm64 code3006 signature/package checks PASS (private389/390/398),
with its recorded SHA unchanged. This normal artifact is still NOT INSTALLED.

Only owned fixture03/emulator/bridge were restarted. Preserve first restart
FAIL for omitted pinned Node PATH and corrected Node22.23.3 retry PASS. Emulator
ready probe127.4s differs from its full-boot log205.797s. Orders cold probe FAIL
behind SystemUI ANR; explicit owned SystemUI Wait recovered saved staff session
and Orders. Keep these separate results; recovered UI is not reliable cold-boot
acceptance. No physical phone or SMS interaction was requested during resume.

The private automation helper now clears only the observed field length, sends
Back only when the IME is shown, waits for selection sheets to close, and refuses
inverted/zero-area accessibility bounds. Initial empty customer-search wait
FAILed because the sheet requires a query. A subsequent header attempt returned
to the list without creating a receipt; cause not established, retained FAIL.
Retry completed sender/customer A and administrator header normally. Catalog
suggestion bounds were inverted although the freshly captured screen showed
the option. A label-centre tap missed; an ordinary tap on the freshly inspected
visible option selected it. Record this Android automation limitation, not a
source-level app fix or an invisible state injection. Raw screens and private
helper backups are outside Git. Receipt review correctly refused submission
without a GRN-book image; use a fictional image for fixture-only creation.


Current43/code3005 native receipt A0001 PASS through normal header/item/review/
Create. Guarded data confirmed Customer A/MONTHLY/10bags/10kg/stock10 and the
ordinary picker upload confirmed a header WebP plus stored object. Success
dialog showed the same number/customer. Current43 upload now has its own PASS;
the earlier artifact's upload result is still retained separately.

Current43 native queue/partial dispatch I0001 PASS: A queue2 from BAC01 stock3
went to1 and cart cleared. Initial draft navigation/index-selector FAIL retained;
retry waited for asynchronous defaults and targeted Vehicle registration by
label. `TEST-ONLY` was rejected by uppercase/digits/spaces regex; fictional
`GJ01ZZ9999` passed. A private verifier incorrectly expected a persisted invoice
after dispatch and FAILed; preserved null invoice/stock data and helper backup.
The pinned backend's requested invoice data is separate from persisted invoice
creation. Corrected read-only partial-stock/queue assertion PASS; no app source
fix, silent billing-rule change or invoice-creation PASS is claimed here.


### Resumed mobile source correction — e54c826

The final native draft exposed a real recoverability defect in mobile43b8320:
clearing the dispatch number hides its input behind a spinner after generation
has already settled. DispatchHeaderStep rendered loading from `!header.disp_no`
while useDispatchForm's one-shot initializer would not generate again. Review
commit `e54c8268f6f5dd67652d3779d2b4a111292a59fa` tracks actual number generation
(including rejection/finally), leaving an empty field editable after completion.
It also names Dispatch number/Vehicle registration and the normal Use suggestion
button for accessibility. No backend/authentication/billing rule changed.
Typecheck PASS; existing217 Jest tests/33 suites PASS; changed-file lint PASS
0errors/57 existing warnings (private406/407/408). Native verification on a new
audited artifact is required;43/code3005's earlier passes stay on that artifact.
The owned emulator was stopped before the heavy build; fixture state retained.


Resumed backend documentation head18b5317 CI
[36683411636](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36683411636)
FAIL: validate now stops at postgres-meta's dependency audit (brace-expansion
HIGH and fast-uri MODERATE), before reaching Storage's audit. Contract and
redacted source/history scans PASS; dependent migrations/operator/Grafana jobs
SKIPPED. Preserve earlier metadata-clean/Storage-failure observations as dated
evidence, not current clean metadata assurance. The separate historical Storage
undici/ip-address findings remain unresolved. Image-security investigation and
upgrades stay deferred; no dependency gate was relaxed. Private413/414/415 retain
the exact run/job/failed-command evidence.


New e54 fixture APK clean build/audit/signature/identity PASS: version0.1.0/
code2026093007,x86_64,11m6s/983 tasks executed, restricted public CA overlay,
SHA `f8ed582a6e37398cab49c0682c6d377a39f4b17249c1f6d04315b42f8c95dfe7`.
Retained private fixture/fixture-e54c826-build2026093007-x86_64.apk. Installation
and affected native verification remain pending at this dated point; current
physical phone remains8d9da8e.

New-source live contract first attempt FAILed the ownership-checked catalog
request: the driver used the separate backend review checkout with fixture03's
state. Keep the owning checkout and state together, even for `--live` read-only
checks; never disable Compose ownership checks to make a cross-checkout command
work. Retry uses warehouse-reproduce/unattended-backend and its own fixture03.
Private416 preserves failure; corrected421 records the retry.


The corrected e54 live contract check from its owning fixture checkout PASS
(private421):128 typed calls/94 RPC names and3 explicitly reported dynamic wrappers; no
name/overload/argument/grant mismatches. This remains a lower-bound inventory.
Separate clean normal e54 checkout ran the revised main sequence: locked npm ci,
36 setup tests,217 Jest/33 suites, lint0errors/1468 existing warnings, typecheck,
Expo compatibility/Doctor18/18, npm audit0 and Test1 public bootstrap PASS. Native
arm64 compilation remains in progress at this dated point. The prior successful
suites were repeated here because a new shared-hook source change and revised
clean-guide verification required new evidence; backend API suites were reused.


The revised normal mobile guide completed from a separate clean e54 checkout
with only the declared native Test1 identity, no fixture CA overlay. All main
checks above and arm64-v8a assembleRelease PASS in11m8s/983 tasks executed.
Exact artifact audit/signature/package PASS, version0.1.0/code2026093008,
SHA `7ad6e19aee694865a4fdcc9753fddb19ddd5bce317f39e4da56d08464935fb3e`.
Retained /home/jay/warehouse-artifacts/test1/test1-e54c826-build2026093008-arm64.apk
(0600). It is NOT INSTALLED; physical read-back/native acceptance remains open.
The normal clean source/build guide is reproduced; compilation is not E2E
acceptance. New fixture APK installation and the affected native case are next.


New e54/code3007 fixture installation/signature-match/read-back PASS (427–429),
without uninstall/data clear. New emulator ready probe97.7s and full-boot log
169.421s are separate measurements. Temporary labeled hosts/reverse mapping
PASS; SELinux Enforcing. First Orders launch probe FAIL behind SystemUI ANR;
one explicit owned Wait recovered actual Orders A1/Bempty and staff tabs.
Cold-launch reliability remains FAIL; recovered session is a separate PASS.

New e54 native naturally expired-access refresh PASS (430–432): before launch
last administrator OTP verification age10832s exceeded accessTTL3600; after
normal authenticated Orders restore, exactly one refresh hash rotated, session
IDs and OTP verification timestamp/count stayed unchanged. No new challenge,
fixed code, token injection or authentication lifetime change was used. Private
hashes were compared without printing values. Old cached UI was not reused as
new-artifact proof; the private driver now excludes cache predating installation.


### Resumed audited e54 native dispatch and invoice findings

Exact e54c8268f6f5dd67652d3779d2b4a111292a59fa/code2026093007 native
cleared-number recovery PASS (private433): clearing generated I0002 left an
enabled, named empty Dispatch number input. Normal re-entry and the explicit
Use suggestion button restored a valid one-bag draft. Earlier queue navigation
FAIL remains: an expanded recent-dispatch section hid the target below the
viewport; collapse it and inspect a fresh screen before acting. No offscreen
ADB tap or app-state injection was used for the successful case.

Normal native final dispatch I0002 PASS: BAC01 stock1→0, quantity1 saved for
Customer A, order/cart empty, success dialog matched; guarded private404-final
confirmed rows. Prior43/code3005 partial dispatch2/stock3→1 and receipt A0001
are separate artifact evidence, not transferred to e54.

Native invoice creation saved invoice20260930/BAC01 and three dispatch lines
(total quantity10) PASS for persistence, but preview/persisted reconciliation
FAIL. Review and confirmation displayed storage150 + labour20 + tax8.50 =
178.50; saved header tax9/total179. Root cause established: mobile
src/utils/invoiceCalculations.ts rounds money to two decimals, while pinned
backend migration00000000000006_invoice_line_integrity.sql save_invoice
applies CEIL to header tax and total. Saved per-line rate/duration/quantity
calculations reconcile to storage150/labour20; stock remains0 (private434).
The earlier documented950/48/998 API example still passed separately.

A private verifier initially expected178.50 and failed. Its surrounding shell
continued and wrote a premature PASS; this has been explicitly superseded by
FAIL while retaining attempt history. Subsequent action sequences stop on
command failure. A separate guarded persistence check against the existing
backend rule PASSed. Success dialogs and ADB delivery alone cannot establish
financial acceptance. No invoice was deleted/recreated to hide the mismatch.

OPEN: align native review/confirmation/success amounts with the agreed backend
rounding contract and repeat on a newly audited artifact. No billing rule or
production behavior was changed during this installation exercise. Until that
work is reviewed, this case is FAIL; operator/business sign-off remains required
before using financial output beyond fictional tests.


Exact e54/code3007 link-offline banner/reconnect PASS: only the owned emulator's
Wi-Fi/data were disabled and its reverse443 removed; No internet connection was
observed within90s. A finally block restored previous links/reverse. Banner
disappeared and ordinary Refresh orders restored A/B empty queues. This does
not erase prior43 endpoint-only feedback FAIL (Wi-Fi remained on), establish
offline writes, or demonstrate cellular/physical/no-USB behavior.

Current e54 native administrator logout/revocation PASS: normal Sign Out reached
login with selected fixture server retained; private431/437 comparison showed
exactly one refresh session removed, none added, OTP verification count unchanged.
Native disabled fictional B login denial PASS: actual generated challenge went
through the Edge verifier and displayed Verification Failed / Account unavailable;
guarded private435 confirmed disabled profile, empty assignments and no active
refresh session. No real SMS or fixed OTP was used. First immediate OTP-screen
hierarchy attempts FAILed (UIAutomator idle-state unavailable); private436
screenshot established the actual empty-code focused screen before input. A
private read-only verifier's initial nonexistent revoked_at-column assumption
FAILed and was corrected to this schema's deletion-based revocation; backup
retained. No backend/session enforcement was weakened.


Reapproved B native login/Orders scope PASS on e54/code3007. Preparation used
the existing isolated administrator API to approve only B (private435); it is
not native reapproval evidence. Fresh generated code went through the actual
verifier, and settled Orders contained only Customer B; customer tabs and
Settings omitted Queue, Customers, Enrollment Review and Users. A prior43 native
A-only result remains separately dated; same-artifact reciprocal A is not yet
claimed. First denial/OK already returned to login; an extra Back-label attempt
FAILed within90s without a tap. Inspect actual current UI rather than assuming
a particular post-error route.


Malformed-origin attempt initially FAILed because a previously unseen AOSP
keyboard contacts permission dialog took foreground, not a warehouse-camera
prompt. Private439 screenshot established it; ordinary DENY closed it without
grants or app/phone setting changes. The HTTP text was already present but
Check server had not completed. Retain the failed attempt and confirm actual
foreground/keyboard state before retry; a sent tap is not validation evidence.
This was on the disposable emulator only.


Exact e54/code3007 native malformed HTTP and HTTPS-with-path origin rejection
PASS after the established keyboard prompt was declined. No selection/credentials
were substituted and earlier failed attempts remain. Native Check server then
retrieved/displayed Test Warehouse 1 at https://test1.gurucold.in over the
emulator's restored network. Test1 and fixture03 manifests have different
instance IDs and independent state/credentials. This is the second owned test
instance; the production pilot is excluded. Target login/authentication is not
implied by public identity discovery.


Current e54 native cross-instance switch to owned Test1 PASS, scoped:
Check server displayed the distinct Test Warehouse1 identity, Use this server
reached unauthenticated login, the persisted public selected-server key matched
Test1's manifest, and prior fictional B refresh-session count changed1→0. Only
the public selected-server SQLite key was read; no native session values were
retrieved or written. First state-read command FAILed; bounded retry with
SQLite5s busy timeout PASSed. Initial root cause is unestablished; do not infer
database locking from the successful retry. Both attempts remain in private440.
No Test1 OTP, business-data request, pilot contact or old-session injection.
This closes authenticated-fixture switch-out/target-selection only, not login
on both instances or same-origin identity replacement.


Current e54 Test1 unauthenticated cold persistence/direct network PASS (private441):
force-stop/launch with fixture reverse443 absent reached login, read-only
persisted public server identity still matched Test1, and fresh native
Check server retrieved/displayed Test Warehouse1 through the emulator's direct
network. Finally restored only the emulator fixture route. No Metro, target OTP
or native session value used. This scoped successful cold launch does not erase
the first boot/SystemUI failure or establish authenticated Test1, physical
no-USB, cellular or reliable cold behavior across runs.


Current e54 ordinary switch-return/reciprocal native Orders scope PASS:
selected fixture03 again from Test1, public persisted server key matched the
original fixture manifest, login showed no stale B Orders, and fresh generated
A challenge used the actual verifier. Same exact artifact showed only B during
B login and only A during A login; customer tabs omitted Queue. Deep-linked
foreign native records/privileged-RPC denial are not implied; reciprocal API
denial evidence remains separate. No target Test1 OTP/session or source/app-state
injection. Private442 and artifact-scoped native attempt ledger retain proof.

Resumed tests complete to their recorded scope. Bridge stopped with Ctrl+C,
owned emulator stopped through its explicit ADB target, fixture03 ownership-checked
Compose down(no-v) PASS; fixture04 was already stopped. Socket and owned
ports18443/18080/5556/5557 absent (private443). State/AVDs/artifacts/signing/failed
logs retained; shared ADB server and physical phone untouched. Installed Test1
final local/public doctor and active dedicated tunnel PASS (private444/445);
backend source clean at f18f51d. Host root157GiB/free81GiB.

The corrected installation and normal e54 Android build were reproduced from
clean source with separate disposable state and declared overlays. Another
operator can follow those revised sequences on the recorded prerequisites;
the entire current end-to-end suite has not passed. Financial-preview mismatch,
container audit, no-KVM cold reliability, physical corrected-artifact workflows,
cellular/no-USB, PDF viewing, offline writes, both-instance authentication and
same-origin replacement remain open. No skipped/historical/build-only evidence
closes those gates. No release/merge, recovery/cutover or agent reboot.


Review-command findings on Ubuntu24.04.3/Git2.43.0/GitHub CLI2.45.0:
resumed git commit initially FAILed with Author identity unknown (private410).
Supply an explicit local author for review commits, for example
`git -c user.name='Warehouse Installation Agent' -c user.email='warehouse-install-agent@localhost' commit ...`; do not change global operator settings merely for this exercise.
`gh pr edit` again FAILed on deprecated Projects Classic projectCards GraphQL
(private422). Structured REST PATCH with a protected JSON input file updated
only the existing draft PR body; return only number/URL/draft/head. Prior bodies
and failures retained. Do not put credentials, multiline expansions or raw logs
in CLI arguments/PRs. Corrected commits/updates passed; no merge/release.


### Sequential blocker queue — invoice reconciliation in progress

Invoice preview/save reconciliation is the first blocker to fix before long
unattended tasks (estimated 2–4 hours, not a completion promise). The historical
e54 APK result remains FAIL: ₹178.50 displayed, ₹179 saved. Correct the mobile
calculation paths against the existing backend invoice contract, preserve
absolute discounts including negative surcharges, and test fractional tax and
duration boundaries. Closure requires review, confirmation, saved invoice and
PDF reconciliation, a newly built/audited APK, and the affected native case on
that exact artifact. Unit tests or compilation alone do not close this gate.
Production pricing-policy changes remain a separate business decision.

Before generating a fixture APK or starting/resuming its test run, set
WAREHOUSE_FIXTURE_MIN_VALID_HOURS to the planned run plus build/setup and a
safety margin (default12 hours). Run the certificate preflight against the same
private CA used by the bridge and embedded APK:

```bash
WAREHOUSE_FIXTURE_CA=/absolute/private/fixture-ca.pem \
WAREHOUSE_FIXTURE_MIN_VALID_HOURS=12 \
node scripts/prepare-emulator-fixture.mjs --check-certificate
```

The check does not alter Android sources. If it fails, issue a new private
fixture certificate, rebuild/audit/install the matching fixture APK and check
its embedded certificate; never bypass TLS or extend another instance's trust.
Recheck immediately before the run. This closes the missing expiry-horizon
instruction, not actual overnight execution or device stability.

Then resolve the scoped mobile CI trigger, fixture certificate validity and PDF
viewer prerequisites one at a time, with a short smoke check for each before any
dependent long run. Keep the larger runner/fault-injection/two-instance work and
hardware/provider/security limitations distinct. No long task was launched by
adding this queue.


Invoice fix investigation: mobile create calls the three-argument `save_invoice`
wrapper, which delegates to `save_invoice_internal` in the initial schema.
It and `update_invoice` independently CEIL tax and total after NUMERIC(12,2)
conversion. The historical note identifying the one-argument migration has the
same rounding behavior but was not the mobile overload. Mobile initial-load,
duration-toggle and edit reducers also duplicated two-decimal sums. The shared
summary inferred storage backwards from rounded totals, incorrectly assigning
rounding to storage after a fractional discount. The correction shares header
calculation, uses unrounded line-tax bases, preserves fractional durations and
absolute discounts/surcharges, and displays an explicit rounding adjustment.
No backend pricing rule is changed.

Local validation: 230 Jest tests in34 suites PASS (13 new invoice cases),36 setup
checks PASS, typecheck PASS and lint0errors/1468existing warnings. First targeted
run had one erroneous test expectation (ceil9.5 is10, not9); corrected that literal
and retained the failure. First typecheck found the edit-summary caller missing
the new items prop; caller corrected and typecheck rerun. APK/native/save/PDF
validation is still pending; the blocker remains open.


A second invoice display defect was observed on the native saved-invoice list
while preparing the regression: total-tax was labelled Subtotal and negative
discounts were hidden. This is a saved net-before-tax amount, already including
labour, discount/surcharge and rounding; it cannot establish the original storage
subtotal. The correction names that value Net before tax, displays Surcharge
for negative discounts, and marks labour/adjustments as included in details.
Cost percentages are no longer assigned to those overlapping included rows.
Stored values, discount semantics and pricing policy remain unchanged.
233Jest tests/typecheck/lint0errorsPASS for this follow-up; a newly audited
artifact and affected saved-display native check remain required.


Fractional-duration follow-up found a real half-cent defect in the existing
roundMoney helper: binary floating-point multiplication made0.29×1.5 round to0.43
instead of0.44, and0.29×3.5 round to1.01 instead of1.02. Two new expected-value
regressions failed first (private496). The correction compensates binary
round-off at the half-cent and uses PostgreSQL NUMERIC's ties-away-from-zero
rule, including negative adjustments. Six new boundary cases bring the full
suite to239 tests/34 suites PASS; typecheck/lint0errorsPASS499–501. Native
verification and the follow-up APK remain pending; production policy is unchanged.


### Blocker follow-up: stacked review CI trigger

The CI workflow selected only pull requests targeting main, so PR34 targeting
codex/operator-mobile had no current checks. Add that exact candidate branch to
the pull_request filter; keep push/main, read-only permissions and all existing
jobs and release gates. Verify a new run appears on the pushed review head.
No check result is implied by correcting the trigger.

Certificate lifetime follow-up: three fixture regression tests PASS, including
wrong domain/package, expired/not-yet-valid CA, insufficient requested horizon
and invalid horizon inputs. Current private CA expires2026-10-01T09:51:45Z;
12-hour preflight PASS at the time of this check. The lifetime must be checked
again at actual launch. CI trigger verification PASS: review head6fa6553 started
run36705487757; job conclusions are recorded separately, not assumed.


### Bounded runner and PDF prerequisite findings

New scripts/run-fixture-plan.mjs provides private artifact/plan-bound checkpoints,
per-command deadlines, exclusive locking, stop-on-failure and explicit resume.
Six regression tests PASS (private511); successful writes are not repeated, and
failed/interrupted writes require review. See UNATTENDED_RUN.md for the main
sequence, plan schema, read-only postconditions and recovery limitations. No
complete overnight plan has been executed or claimed by these harness tests.

PDF reader prerequisite was more than installing a VIEW handler. MuPDF1.28.5a
was inspected but not installed; MJ PDF3.1.0/code5804 was installed/verified but
its SEND filter accepts text/plain, so it did not appear for application/pdf.
Librera9.6.17/code7306 accepts PDF SEND but crashed on API30 with missing
android.app.PictureInPictureUiState. Verified older Librera9.5.7/code7222 lacks
that class reference and receives the shared content, but its first share failed
with EACCES while copying to its download directory. Initializing the reader
revealed a manage-all-files permission requirement. Automatic approval review
rejected granting that broad permission; it was not granted or bypassed. Native
external viewing remains BLOCKED pending a narrower compatible reader or explicit
permission approval. Private PDF authorization/content API checks are separate
PASS evidence. Preserve all viewer attempts; do not count installation as viewing.


Runner integration smoke514 PASS against the original guarded fixture03: local
and loopback HTTPS identity,12-hour certificate horizon and disk checks; explicit
resume rechecked the postcondition with exactly one case execution retained.
This read-only harness smoke did not repeat a business mutation or establish
native/overnight acceptance. The operator subsequently explicitly approved
Librera's manage-all-files permission on the disposable emulator only; the
initial rejection and failed PDF attempts remain historical evidence. Grant and
actual rendering verification are still pending at this checkpoint.

Main-sequence documentation correction: the fixture build block still pinned
43b8320 while later evidence described e54/invoice follow-ups, and the newly
documented certificate CLI was absent from that old pin. Both primary source
examples now pin812d5ac, which contains the correction and safeguards, and use
a fresh example build identifier3011. Git comparison confirms app/src/config/
dependency equality with the actually built57add44/code3010 artifact; full
clean812 build/physical acceptance remains NOT TESTED rather than inferred.

CI follow-up preserved: run36706535954 on812d5ac failed Lint with eight runner
errors (Node timer globals, empty catch blocks, unused catch binding), despite
behavior tests passing. b22c3b5 imports node:timers, documents already-exited
process catches and removes the unused binding; lint0errors/1468existingwarnings
and six runner regressions PASS523–524. Rules were not weakened. The primary
source examples advance to that correction; the previous CI FAIL remains.


Final invoice artifact verification:57add44/code3010 built7m32s with983tasks
(955executed/28up-to-date), audited, signature-verified, installed and byte-readback
matched. This follow-up reused the owned clean build checkout and unchanged
installed dependencies, with clean Expo regeneration and declared fixture CA/
identity overlays; it was not a fresh npm installation. Native saved overview
and breakdown include surcharge/labour rather than adding them twice. New
IRH01 review storage0.44+labour0+tax1-discount0+rounding0.56=2; confirmation and
saved invoice20261007 match. SQL numeric lines/header/duration and private PDF
metadata PASS528; PDF line fields show quantity1/duration1.5/days31/charge0.29/
tax25, while header tax1/total2. No production billing-policy change.

After explicit operator approval, Librera7222 storage permission verified520.
Normal final-APK SharePDF selected Librera and Scroll mode; actual rendering527
PASS, and the PDF copied by that reader reconciled invoice number, header and
line parameters529 PASS. This closes the compatible-viewer prerequisite for
this emulator, not the complete PDF authorization/cache matrix or phone viewing.
The first final-APK cold launch still FAILed with SystemUI ANR525. The private
driver was tightened to the last current-focus entry rather than any historical
matching entry. One explicit Wait recovery was recorded for targeted diagnostics;
it is not an unattended readiness pass. No overnight suite has started.


### Pause before six-core VM change — 2026-09-30

Inventory remained two guest CPUs/17GiB RAM/77GiB free with no KVM. No new
emulator diagnostic was launched before the operator interrupted work to request
the CPU change. Read existing launch/ANR evidence and official guidance; no cause
was established. Private539 verifies no diagnostic processes/listeners/socket;
Test1 gateway/tunnel active. Protected540 saves source/artifact identities, boot
ID and configuration fingerprints for post-reboot comparison. New CPU_UPGRADE_RESUME
integrates ordered inventory/health/ANR/rehearsal/build/plan prerequisites. No
overnight suite, VM setting change or reboot was initiated. Passed unchanged
cases remain reusable to their recorded scope; cold readiness remains FAIL.


### Resume with eight CPUs and usable KVM — 2026-09-30

Ubuntu24.04.3 VMware now exposes8CPUs/17GiB RAM/78GiB free, VT-x and usable
KVM API12 (private542). Both CPU allocation and virtualization exposure changed;
this trial does not isolate either as the sole cause of the previous ANRs.
Test1 source/private inputs/identity/artifact preservation and local/public doctor
PASS543. An initial comparison helper falsely failed because it compared an
0o600 string with a decimal-padded mode; corrected octal comparison passed.
No credential/state change was required. One startup544 attempt was explicitly
interrupted for permissions; its emulator-exited FAIL is preserved as interrupted
evidence, not a detected ANR. On resume, KVM/two emulated cores booted API30 in
25.2s and completed120s OS observation with no ANR. Current-focus probe549 ran
too early once; subsequent bounded focus waits retain that failure and check the
actual last focus entry rather than swallowing ANRs.

Retained57/code3010 then passed three cold launches and1804seconds/29cycles of
read/navigation/background/foreground with no ADB reset, Wait, crash or human
input550. Reused invoice20261005 reads asserted net173/tax9/surcharge2.5/total182;
completed business fixtures were not recreated. This is emulator readiness for
that artifact, not overnight or physical acceptance.

Source inspection found Crypto.randomUUID inside each createGRN/createDispatch
call. Expected retry to reuse the completed operation after response loss;
actual next call generated a new cache key. b03f197 now hashes the canonical full
numbered RPC body, with separate GRN/dispatch namespaces, so identical retries
reuse a key and changed bodies do not return stale cached data. No auth/OTP or
billing policy changed. Five key and two lost-response service regressions,
246 full Jest/36 suites,42 setup/type/lint checks PASS561. Keys depend on retaining
the same complete numbered body. Form drafts still reset on app restart; do not
claim cold-process interrupted-write recovery or silently regenerate/edit a lost
operation. The service's auto-number fallback is not covered by these numbered
retry assertions; native forms must retain their assigned number.

Fresh cleanb22 checkout551–557 passed required source checks; initial doctor
failed only because the agent omitted documented ANDROID_HOME in a new shell.
Corrected environment passed; passing unit/static checks were not rerun to hide
that attempt. After application source changed, separate cleanb03 checkout562–565
repeated npm ci/environment/all required checks including live contract from its
owning backend fixture. Clean standalone code3012 build/audit568–570 and signature,
identity, embedded CA, installed bytes/version573–574 PASS. Package stays the owned
fixture identity; no Metro, physical phone or real SMS was used. SHA256:
27d9ed96fe1b306610a4e50aedc4f56579bdd1d8c7f93e3a6fe270f070b77108.

An initial private installer expected res/raw/warehouse_fixture_ca.crt in the
release APK. Android optimized its filename to res/Yo.crt; install had not run.
Preserve573 failure, resolve the named resource with aapt dump --values resources,
and compare that packaged certificate byte-for-byte with the private bridge CA.
The compiled domain policy also references that resource; no TLS bypass or source
edit was needed. Do not infer a compiled resource filename from its source path.

Backend relay2bbc681 is declared as an additional file overlay in the owningc0a6
fixture checkout; the original fixture guard is unchanged. Twelve transport/control
regressions and60 backend units PASS. The tool refused installed Test1 before
opening listeners571. Four fictional receipt/dispatch pre-forward and post-success
API cases passed independent commit/no-commit, stock and same-key replay assertions
566; final read-only line quantities/cache/no-invoice reconciliation572 PASS.
Dispatch API controls used generate_invoice:false. Native retry and invoice side
effects remain separate. Full case plan and second authenticated fixture are
still incomplete; no overnight run, release, merge or production readiness claim.


Cached-response authorization supplemental result: before native fault submission,
source inspection raised a cache-before-role question. The starter access migration
wraps imported logic with authorize_rpc; actual verified fictional CustomerA/B
known-key save_grn/dispatch requests each returned403575 PASS. No authorization
change or production bypass was needed. Permanent equivalent cases are in backend
d068d77 and require a fresh fixture run; do not infer a vulnerability from the
unwrapped initial-schema body alone. Code3012 cold-only three-launch/known-invoice
read checks PASS550-20260930T131228Z; that mode did not run30minutes. Its initial
private helper banner incorrectly said30minutes; structured result scope is cold-only.
Preserve this misleading-message finding and correct the banner before full reuse.


### Current artifact native dispatch fault results — 2026-09-30

Standaloneb03f197/code2026093012, SHA256
27d9ed96fe1b306610a4e50aedc4f56579bdd1d8c7f93e3a6fe270f070b77108,
AndroidAPI30 on the owned KVM emulator. FXF201 before-upstream and FXF202
after-success controls both produced a native network error; read-only database
checks established no commit or exactly one committed dispatch before retry.
Unchanged forms retried successfully with one header/line/cache each and two
units each; reserved stock10→8→6 exactly once. PASS582; normal HTTPS route restored
and arm disarmed584. No real SMS, physical phone, pilot or recovery host used.

Expected-versus-actual finding: the private after-retry verifier initially expected
a persisted auto invoice and failed583. Existing RPC SQL only returns conditional
invoice calculation data; it does not save an invoice. Corrected the assertion to
zero invoices/errors and rechecked read-only, preserving the failed attempt. Do
not infer invoice persistence from p_generate_invoice:true. No pricing/auth policy
change was made. An automation wait used an invented success label and was
interrupted; actual label is Dispatch Created Successfully!, now asserted.
Runtime release logging did not expose the key, so there is no claim of an
independent second wire capture; native success and the original cached operation
are reconciled with the database and deterministic-key source/unit evidence.
Native receipt faults and interrupted-draft recovery across process death remain
separate open cases.

Current source CIb03f197/run36717966812 completed all4 jobs PASS:
https://github.com/abhiguru/rn-warehouse-template/actions/runs/36717966812 .
Backendd068d7787 clean owned fixture05 setup/core (including known-cache CustomerA/B
403) PASS577–581; its remote container audit remains FAIL with dependent checks
SKIPPED at run36724067923. Preserve release gates.


### Completed3012 readiness and separate switching-fixture prerequisite

Current3012/b03 three cold launches plus1802.8seconds/29controlled
read/navigation/background cycles PASS550-20260930T143230Z. No ANR/crash detected,
ADB restart, diagnostic Wait dismissal or user intervention. Readiness does not
establish overnight, physical or another artifact's acceptance.

Native PDF SEND for existing invoice20261005 reached approved Librera9.5.7/code7222;
later screenshot585 visibly rendered header total182/tax9/discount-2.5 and three
line parameters. The private reader copy text/hash reconciled that unique invoice.
Immediate focus assertions failed during asynchronous handoff/mode transition and
an initial Page1 placeholder was preserved. Later actual reader component and
crash buffer were checked. A text assertion wrongly assumed a printed GRN label;
existing starter document-pdf.ts prints Number/customer/header and line fields,
not GRN. Corrected the expectation without changing PDF/billing policy; initial
failed attempt retained. Wait for the actual chooser/reader and visible page before
calling viewing PASS. No Share request was repeated to repair automation.

A separate backend switching fixture now passed supported setup/local doctor,
pinned TLS discovery on its own18444 and occupancy-checked VM loopback443 passthrough,
fresh crypto mock delivery through the real verifier and authenticated admin read.
Primary fixture phones are refused. Sourcea9a49863600dbb33935b49a721f3d406ede9302f;
new state/identity/JWT/database/storage and independent72-hour TLS key. The original
core fixture guard is unchanged. Read the backend SWITCHING_FIXTURE.md before
preparing the two-origin native case; no pilot/Test1/recovery data or routes used.

SMALL BLOCKER for significant native cross-origin acceptance:3012 trusts only the
primary CA. Optional mobile toolc4cb8d24bedbb6bb730a6631385d4f6e114210c2 supports
separate exact-domain anchors for two independent keys; normal packages, reused
keys and existing trust policies remain refused.43setup checks and lint0errors/
1468existing warnings PASS589–590;62backend units PASS587. Clean dual-CA
code3013 build4m17s/983executed tasks PASS592; both optimized certificate mappings/
compiled exact-domain policies/manifest reference/signature PASS593; installed
bytes/version/two private routes with SELinux Enforcing PASS594. Three current
cold launches and known invoice read PASS550-20260930T152710Z, cold-only scope.
Native authenticated switching and full current-artifact readiness remain open. Current3012 findings remain
attached to their actual APK. Native receipt faults and the complete bound plan
still remain open; no overnight run/timer has started.


Current optional tooling CIc4cb8d2/run36733198901 completed all4 jobs PASS:
https://github.com/abhiguru/rn-warehouse-template/actions/runs/36733198901 .
The immediate post-install UI dump refused focus during launch; bounded actual-focus
cold checks passed without dismissing a dialog or restarting ADB. Preserve the
initial failed probe separately from artifact installation success.

### Current dual-CA emulator OTP automation limitation

Exact sourcec4cb8d2/code2026093013 on API30/x86_64: the supported OTP
page appeared, but `uiautomator dump /proc/self/fd/1` while the numeric keyboard
was open returned `ERROR: could not get idle state`, so the bounded wait
failed. The first fictional challenge expired during that failed probe. Failed
probe logs/screenshots and helper versions remain private. The OTP TextInput is
intentionally positioned off-screen in app/otp.tsx; expecting its accessibility
label in the visible hierarchy is an incorrect automation assumption. Dismissing the soft keyboard alone also failed; retain that failed proposed
workaround. A bounded read-only API30 snapshot helper now captures the active
fictional app hierarchy without demanding global idle. Focus the visible code
boxes and verify the active owned numeric input method before sending a fresh
fixture challenge via protected IPC/stdin. No provider SMS, fixed OTP, source
authentication bypass or ADB restart is an acceptable workaround. Compilation, API30 native snapshot and code3013 secondary administrator login
using a fresh cryptographic challenge all passed. This fixes automation only;
the installed app and its verifier are unchanged. No countdown pause or device
reset was used. Other Android API levels are not verified.

### Dual-CA native switching and conditional automatic start

Exact code3013/sourcec4cb8d2/e809e0fc APK: ordinary secondary selection, fresh
mock challenge/native actual verifier login, Switch Demo Administrator profile,
loaded empty Orders/invoices without primary A/B/invoice cache, Home return and
cold persistence PASS. Normal manual return preview displayed Fictional Core
Warehouse and activation cleared secondary authentication to login. Subsequent
cold discovery displayed Configuration Error/Server discovery timed out: FAIL
preserved. Host pinned primary HTTPS discovery returned200 in8.13s and8.09s;
the exact timeout cause is not established. An unconditional back-key automation
step reached Launcher; focus guard refused subsequent submission, no ANR. The
new automation checks actual keyboard visibility before dismissing it. Normal
app Retry then fresh primary actual-verifier login/CustomerA orders/invoice
20261005 total182 PASS separately. This recovery does not erase the failure or
establish a clean full switching trip.

Current3013 three cold launches PASS;30-minute read/navigation/background
rehearsal RUNNING, no business writes. Exact-artifact native receipts/PDF and
the final bound executable plan remain open. The operator authorized automatic
start of the isolated fixture/emulator overnight run when current tasks and
blockers pass, using recommended routine defaults. No overnight run or timer
has started at this recorded checkpoint; hardware/provider/release gates stay
separate.

### Small launch blocker: inherited gateway DNS search delay

The second native return timeout prompted independent latency/DNS diagnostics.
Both fixture discoveries tookabout8s; each Kong REST read waited4s while
direct REST took15–39ms. DNS trace showed rest.localdomain SERVFAIL retries
at0/2/4s despite immediate rest A resolution. Backend reviewed2584496f20a86595be2cf1996e9b4e5f82164fd8
sets root dns_search on Kong alone. Fresh separate fixture06 setup/doctor,
62units/migrations/gateway/changed-IP/core/Realtime/final API/Studio/retention
checks PASS; REST proxy0–2ms, discovery84ms, unauthenticated/invalidkeys401.
Application timeout/authentication was not weakened. Current emulator pair still
needs the explicitly declared correction, revalidated clean native switching and
relevant health/readiness before automatic overnight launch. Original timeout
and recovered Retry evidence remain separate. Test1/pilot/recovery/host DNS
were untouched; deferred dependency/release gates remain open.

### Receipt blocker: clearing the generated GRN number hides its input

Exact sourcec4cb8d2/code3013 on owned API30 emulator: normal new-GRN form
generatedA0002. Clearing it to enter reservedFXF301 made the field disappear
and left a spinner; replacement text could not enter. Sender selection remained
possible but the draft was unsaved; the response-loss relay remained disarmed.
Native failed UI/XML/screenshot and private helper attempts retained603. The
source condition `isCreateMode && !header.gr_no` treated an intentionally empty
field as an ongoing generation request, although the request had finished.

The reviewed correction tracks actual initial number generation, clears it in
finally on success/failure and keeps an empty field editable thereafter. It
matches the existing dispatch generation-state pattern; validation still requires
a number and business/RPC/billing rules are unchanged. Two component regressions
fail on prior source for the observed absent input and pass with the correction.
A first private red-test log-format assertion failed; read-only reconciliation
confirmed actual failures without rerunning tests. Full248Jest/37suites,
typecheck and lint0errors/1468 existing warnings PASS604. Required setup checks
and a new clean separately identified APK/native affected-case retest remain
necessary. Passed3013 switching/readiness stays scoped3013; no transfer to an
unbuilt corrected artifact or automatic overnight launch yet.

Picker automation also needed a correction: a search input and selection button
can display the same name. Prefer the actual enabled selection button, never an
editable search field. Selecting a sender auto-populates the customer by design;
do not wait for an already-replaced Select customer placeholder. These failed
private automation assumptions did not submit a receipt. No user input, SMS,
ADB reset or production data was used.

### Current corrected GRN artifact and two native receipt faults

Clean remote source42a5559b4abcad3ddd7601b2e4885e3c29101c76/code2026093014
build606 PASS. Full248Jest/37suites,43setup/typecheck/lint0errors PASS604;
[CI36751524355](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36751524355) all four jobs PASS.
Exact artifact SHA2566e882894ff4a0533b31e755fda6930aad6fea8c875030c083a887d445be5bb17,
audited fixture signer, both compiled exact-domain certificate resources and
manifest reference, bundled standalone code and owned-emulator installed bytes
PASS607. Native clearing/retyping generated GRN number PASS608.

Reserved FXF301 before-upstream loss and FXF302 after-success response loss each
showed native Error, independent database no-commit/commit before retry, unchanged
form retry, native success and exactly one receipt/line/qty4/stock4/cached success
PASS608. Both header images confirmed as WebP with private Storage objects.
Finally disarm and normal443-to18443 restoration passed; reserved stocks remain
untouched by later business cases. No previously passed write was repeated.

API30 reports inverted accessibility bounds for the visually displayed item
suggestion beneath the horizontal form. The first accessibility check FAIL is
retained; screenshot inspection showed the dropdown visible. A viewport-specific
inspected tap selected it, followed by explicit selected-item validation. This
is an automation limitation, not established visual clipping. Android multi-file
picker taps did not select the fictional file in this attempt; inspecting actual
keyboard focus after Tab and using Enter selected it. Wrong-case alert labels,
transition-focus failures and the premature image-count wait remain failed
attempts. This is fixture automation evidence only; do not claim general device
accessibility acceptance or silently loosen bounds guards. Current PDF, clean
switching, current readiness and final executable plan remain launch gates.

Current backend review383367b/run36748327886 has dependency-audit FAIL
(brace-expansion HIGH/fast-uri MODERATE), contract/redacted scan PASS and dependent
functional jobs SKIPPED. Fresh separate DNS258 fixture full local functional
checks599/same-input preservation605 passed; these do not erase remote failures.

### Exact3014 final preflight and native recovery checks

Clean two-origin authenticated switching610 PASS with current3014/source42: separate
fresh actual mock verifier, secondary empty cache/profile/cold persistence, primary
identity/data/cold persistence, no Retry/ADB reset/dialog dismissal/human. Link
offline banner and restoration/manual actual Orders refresh PASS on this emulator;
this is synthetic emulator connectivity, not physical Wi-Fi/cellular acceptance.
Current saved invoice header and actual native SEND/render/copied private PDF609
PASS. The template prints tax9 and total182, not net173 or9.00; a mistaken initial
assertion FAIL is retained and corrected by read-only comparison, without re-sharing
or repeating a write. Current3014 three cold launches PASS;30-minute rehearsal
started2026-09-30T18:17:21Z and remains RUNNING at this checkpoint.

The new read-soak observer first invoked from the review checkout was refused by
the original fixture ownership guard. This is a correct refusal: review code and
running fixture checkout differ. Tooling now requires an explicit owning
WAREHOUSE_FIXTURE_CHECKOUT and imports that unchanged validator. Owned fixture
business baseline/private administrator session snapshot/actual Orders RPC200
observation and read-only preflight passed. Never weaken the guard or pretend a
review tool's HEAD is the installed backend. Public helpers/plan procedure are
in UNATTENDED_RUN.md. No overnight run/timer started; recommended defaults and
conditional authorization remain recorded.

Final3014 readiness completed1801.7seconds/28cycles/three cold launches PASS,
without ANR/crash/Wait/ADB restart/human. New public preflight/soak source remains
separate tooling from APK42.64 backend units/45 mobile setup checks PASS612.
The copied preflight socket variable-shadowing failure was corrected with bounded
read-only IPC regression checks. Retained Android events then exceeded Node's
default1MiB stdout buffer(ENOBUFS1060581bytes); explicit8MiB cap restores full
checks without clearing logs. Corrected actual preflight PASS612.

### Automatic overnight launch — 2026-10-01 IST

Actual launch at2026-09-30T19:00:19.804384UTC /1October00:30:19IST.
User unit warehouse-fixture-overnight-3014.service active/running, PID2141593;
preflight and before-first-case checks PASS, actual soak-01 RUNNING. This is
a started supervised run, not a timer or compilation result. Frozen plan
SHA2565ab3825ba7445a2d279d422d5eea24679b7369fd7e80f14c0c40b5004fadecf5
with44bindings. Nine3200second blocks provide eight hours of native/network
reads plus checks; no business writes are repeated. No long-run PASS yet.

Tooling sources are backend98687380dc95e7200bf9888a9794a7a0dea12443 and
mobile4867d1a0ba29db1ff48a428c0e113ff60f10b6eb, pushed and remotely verified
before launch. Installed APK remains source42a5559/code3014/6e882894SHA;
app/config/dependency bytes match the later tooling checkout. The primary
backend is c0a6db plus declared bridgeee5,relay2bbc,DNS258/subnet overlays;
secondarya9 plus DNS258/subnet. Test1 stays requestedf18 unchanged. Private
manifest/identity/config/helper/artifact hashes retain these exact distinctions.

RuntimeMaxSec36000/Restart=no/private log/evidence permissions are set. The CA
guard covers the conservative10hour timeout window plus one hour of margin,
not only nominal elapsed soak. No additional user input is required. Hardware,
real-provider/cellular, unsaved-form/same-origin/revoked-session and dependency
release gaps remain separate. Inspect the unit and private ledger at completion;
require all steps/postconditions and the final aggregate to PASS before claiming
long acceptance. Never rerun interrupted writes or alter bound files to recover.

## Historical first overnight result — 2026-10-01: FAIL, stopped

The supervised run started at 00:30:19 IST and stopped at 04:46:13 IST on
1 October (`warehouse-fixture-overnight-3014.service`, exit status 1, no restart).
Blocks 01–04 and their postconditions PASS: 208 native cycles over
12,801.18 seconds (3 hours 33 minutes) of completed soak. Block 05 FAIL after
40 additional successful cycles; its final assertion was
`Actual Orders RPC200 not observed within deadline`. Blocks 06–09 and the final
aggregate are NOT RUN. This does not establish eight-hour acceptance or a
completed session-renewal aggregate.

The installed artifact remains source
42a5559b4abcad3ddd7601b2e4885e3c29101c76, code 2026093014, SHA-256
6e882894ff4a0533b31e755fda6930aad6fea8c875030c083a887d445be5bb17.
The private plan/ledger and original failed evidence are retained. Diagnosis 615
preserved the owned gateway failure-window logs and emulator logcat without
clearing buffers or changing business data. Gateway Orders RPCs returned 200
through 23:15:00 UTC on 30 September; none was observed after that in the
23:13–23:18 UTC window. No matching gateway timeout/connection/DNS error was
found in that window. Android recorded `Network request failed` at 04:45:53–55
IST; cause is not yet established. The observer retries currently suppress
helper assertion details, so its final timeout alone cannot distinguish a
missing request from an observation failure.

Next: reconcile the failed interval with read-only bridge, emulator transport,
fixture session and business-state evidence. Preserve the failed plan; do not
blindly resume it, repeat receipt/dispatch writes, or change its bound inputs.
Make any established correction in a review branch and verify it in a separate
attempt. A new long plan needs a valid TLS horizon: the current fixture CA
expires at 09:51:45 UTC on 1 October and cannot cover a fresh eight-hour run
from this morning. Rebuilding with new trust requires auditing the new exact
artifact and repeating affected prerequisites, rather than carrying forward
old artifact acceptance. No operator input is currently needed for diagnosis.

Mobile tooling CI 36761863580 completed with all four jobs PASS. Backend
9868738 CI 36761784926 remains FAIL at the dependency audit; dependent checks
were SKIPPED. Existing security, real-provider and physical-device gaps remain.
Earlier RUNNING checkpoints below are historical observations.

## Network failure investigation and local backup — 2026-10-01

Evidence 615/616 supersedes the earlier unexplained block-05 timeout. Ubuntu
24.04.3 x86_64 VMware/eight CPUs/17GiB RAM, Node22.23.3, Docker29.8.1,
Compose2.40.3, disposable API30 emulator and unchanged source42/code3014 APK.
The prior four PASS blocks and fifth FAIL remain historical; no blind resume.

| Case | Result and evidence |
| --- | --- |
| Failure boundary | Established listener loss: core18443, switch18444 and relay18643 absent, all three helper processes absent; Docker18080 and emulator still active, reverse443 still targeted18443. Pinned TLS curl exited7. Old tool process sessions unavailable; private0600 IPC sockets stale. Exact termination cause NOT ESTABLISHED |
| Failure-window logs | Gateway Orders200 through23:15:00UTC; no later request in23:13–23:18 window. Native Network request failed at04:45:53–55IST. Checked window contains no gateway timeout/DNS/connection-error category, kernel OOM/segfault or Android crash/ANR evidence; this does not prove the process termination mechanism |
| Read-only reconciliation | PASS616: reserved quantities/business counts/saved invoice unchanged, original administrator session present, OTP verification count and session-ID set unchanged; refresh hash changed. No credential values logged |
| Diagnostic preservation | PASS616: original failed logs/results/plan and all44 original bound inputs retained with matching SHA-256, plus private failure-window gateway/Android logs and original transport source bytes |
| Consistent local fixture backup | PASS616 using owning checkout's scripts/backup.sh with explicit core fixture state and unused private destination. Script paused that fixture's write-facing services, captured database/Storage/config and restarted previous services. All7 archive checksum entries pass; pg_restore --list reads2201 catalog lines, Storage tar has71 members. Post-backup business invariants PASS. Unencrypted same-VM archive; no restore, off-host transfer or recovery-host test performed |
| Supervised dependency lifecycle | PASS616: persistent mode0600 unenabled user units core/switch/fault-network-616-v3, independent private append logs, Restart=no, NRestarts0, KillMode=control-group,12hour cap. Original owning guards unchanged. Actual core stop removed listener/IPC; explicit start restored them |
| Failed lifecycle attempts | Preserved616: stopped transient unit was discarded and start failed Unit not found; first persistent unit incorrectly quoted WorkingDirectory and systemd refused it. Reviewed generator now uses correct scalar syntax and real systemd-analyze verification before start |
| Bounded proxy handling | PASS75 backend tests including real socket refusal502, stall504, truncated response, client cancellation, genuine WebSocket exchange/reconnection, rejected/stalled upgrade. No HTTP fallback or silent retry of a write added; metadata excludes bodies, headers, queries and credentials |
| Native graceful failure | PASS616 on exact code3014: deliberate core bridge stop caused visible network error, retained already loaded order and login; harness explicitly refused dead dependency. Existing Snackbar expires after3seconds: persistent stale-data marking remains a limitation, not proof of current data |
| Native recovery | PASS616 on exact code3014: original restored-bridge60second case/verify; final reviewed transport120second case/verify,2 cycles with actual Orders200, invoice read/background/foreground/business invariants. Same original native session, no OTP request. These short cases are not overnight acceptance |
| Live fixture WebSocket transport | PASS616 both pinned TLS bridges: handshake/ping/close/reconnect twice. Does not establish every authenticated Realtime topic/event permission |
| Clean fetched source checks | PASS616: backend7e3f66a locked npm ci/13 transport tests, mobilec0824db/5 helper tests, status and complete preflight from unchanged fetched checkouts against existing owned disposable states. Review trees75 backend/48 mobile setup tests PASS. Full installation into a new state at7e3f66a NOT TESTED; prior258 clean installation599 remains separately scoped |

The infrastructure defect was supervising only the runner while depending on
terminal/tool-backed bridges. Exact original kill/disconnect cause remains
unknown. Helpers now retain independent process/journal/private request evidence.
Mobile preflight and native health require explicit managedUnits and refuse a
disappeared or automatically restarted helper. Observation separates missing
requests from ownership/observer/auth/server errors, retains safe categories/
counters/UTC windows and enforces the actual15second polling deadline.

Source fixes are reviewed backend7e3f66a34bb729d80e25c6a4a0975f072c05d03a and
mobilec0824db72b73a049f066a2259352c5207e393bb6. Installed backend fixture HEADs
remain c0a6db1/a9a4986 with previously declared overlays plus the exact reviewed
bridge/proxy files from7e3f66a; these runtime changes are explicitly hashed in
private evidence616. Installed APK remains42a5559/code3014/SHA256
6e882894ff4a0533b31e755fda6930aad6fea8c875030c083a887d445be5bb17.
Test1 source/state/ingress, live pilot, recovery host and physical phone were not
changed. No real SMS, business-write replay, insecure origin fallback, merge or
release occurred.

Next gate: renew independently owned fixture TLS and build/audit an APK with the
new trust before a new long run; current CA expires09:51:45UTC1October. Complete
affected exact-artifact prerequisites, freeze new config/unit/helper/source/CA
bindings and use an unused plan/evidence directory. Never relabel the failed
3014 run as PASS. The long suite remains incomplete and stopped; no timer is
scheduled. No operator input is required for the retained diagnosis. Backend
7e3f66a CI36819232397 FAIL at the existing dependency audit; inspect its exact
job results before claiming any downstream checks. Mobilec082 CI36819240073
was still running at this documentation checkpoint. Deferred security, provider,
physical-device/cellular and persistent stale-display findings remain open.

## Renewed supervised-run preparation — 2026-10-01

The first3014 run remains FAIL; no blind resume or completed-write replay.
Old fixture03 was read-only reconciled, locally backed up and stopped without
removing its database/Storage/state. A clean remotely fetched backend7e3f66a
checkout owns a new core-backend-test-2026100101 state and fresh identity, JWTs,
passwords, database and Storage. Only the documented10.233.245.0/24 overlay was
applied. Setup/local doctor and all functional checks PASS618:75 units,
migrations, core API, customerA/B Realtime, final images/PDF/accounts, Studio,
gateway, gateway-DNS replacement, retention preview and live contract.
Container dependency audit remains FAIL; no release readiness.

Two fresh independently generated private fixture CAs expire at
2026-10-02T05:43:04Z. Never carry the old trust past expiry or disable TLS.
Clean mobilee217c1f build620/code2026100101/x86_64 SHA-256
238ba669f3e14e1e0ea6d0dd396b8766fe5ce1482eae48e264a9af2f95900ed0 passed generic
audit, signature, actual compiled manifest/two-domain trust/public certificate
byte comparisons, bundled JS and exact installed readback621. Only the documented
generated fixture native certificate overlay supplements source HEAD.
249 Jest tests/38suites,48setup, typecheck and lint0errors PASS617; lint retains
1468existing warnings. Persistent stale-warning regression failed before the
source correction and passed afterward. Native gates are still pending at this
checkpoint. Fresh API fixtures625 passed four lost-response cases and saved
invoice contracts179/147/200/252/177/182, including private PDFs; native
acceptance is separate. API-only FXF200 preparation is not current native
dispatch evidence. No real provider delivery or physical-phone change occurred.

Further current results: native persistent warning622 PASS on the exact new
APK after5seconds/error-Snackbar expiry, while a retry was deliberately pending,
and removed only after an observed current Orders RPC200. Explicit supervised
bridge recovery used no login, SMS or warehouse write. Mobile sourcee217c1f
[CI36821249722](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36821249722)
completed successfully; previous helperc082 run36819240073 also finished all4
jobs PASS. Mobile Expo compatibility, Doctor18/18 and dependency audit PASS620.
A host check against http://127.0.0.1:18080 failed because it differs from the
fixture's canonical HTTPS origin; preserve the failure and do not weaken identity
validation. Host check:backend/doctor passed against the canonical independent
Test1 public origin; the actual emulator separately selected and authenticated
the new fictional HTTPS identity. No production/pilot request was made.

Driver preparation failures are retained624: misspelled GRNs tab (actualGRN tab)
and assuming a form had only one EditText before the registration field loaded.
Both guards refused before a tap/edit. Select the inspected exact control and
retain viewport/focus guards. The known item dropdown's inverted accessibility
bounds were independently checked against a new screenshot before using the
scoped prior API30 coordinate; do not broadly loosen bounds. Raw logs must be
created with umask077/mode0600 even inside a private directory. One seed-log
invocation omitted that umask; its mode664 was corrected to600, without printing
contents or putting it in Git. These are driver/operator findings, not new
production pricing or authentication changes.

Native retry preparation624 initially failed: reverse443 was changed after the
loaded form; FXF301 saved successfully while its controller stayed ARMED.
Read-only reconciliation proves one receipt/line, received4/stock4 and confirmed
image. The failure and state are retained, with no retry/delete/replay. Existing
HTTP-connection reuse is a hypothesis; the control itself did not fire.
Configure the relay route before a cold launch and before preparing an unused
document. Corrected FXF303 before-upstream case PASS: actual Error, control
DROPPED_BEFORE_UPSTREAM, independent no-commit, unchanged same-key native
retry, one receipt/line/qty4/stock4/cache and native success. After-upstream
FXF302 remains pending here. Restore normal route/disarm and cold-launch before
normal-read gates. The permanent procedure is in backend FIXTURE_FAULT_REHEARSAL.md.

After-success FXF302 native case now PASS624: control DROPPED_AFTER_UPSTREAM_SUCCESS,
independent committed receipt before unchanged same-key retry, exactly one
receipt/line/qty4/stock4/cache and native success. Both corrected cases303/302
use the exact new APK. Three retained receipts301/302/303 have confirmed header
WebP and one private stored image each;301 remains a failed fault attempt with
a successfully saved record. No successful write was replayed.

New APK private PDF gate626 PASS: actual Overview→Actions→Share PDF→Android
chooser→approved Librera9.5.7/code7222→Scroll mode, rendered invoice number20261005/
labour20/tax9/discount-2.5/total182 and three duration/quantity rows inspected.
New exported bytes begin%PDF and text/hash match the fictional saved contract;
export timestamp is after this share. Reader title uses PDF metadata naming an
HTML source; that title does not establish the file format. Saved app summary
shows net173/tax9/total182, while existing per-line rounded totals are separately
labelled; no pricing-policy change. Driver failures retained: Share action sought
on Breakdown (present on Overview), immediate chooser check before asynchronous
PDF completion, and adb shell stat format containing an unquoted space. Correct
by inspecting the right tab, awaiting actual chooser and using a no-space%Y stat
format. Reconciled existing copied bytes without another share/write. First
623 switching attempt correctly refused the still-foreground reader;623b is the
new attempt after normal supported return. A Breakdown related-GRN accessibility
label reads undefined; its navigation is NOT TESTED and remains an open finding.

The623b return-login timeout has an established prerequisite cause: the fresh
fictional administrator's otp_rate_limits hourly_count is5 (daily5). Prior API
setup and native login consumed the existing five-per-hour allowance. No new
challenge was prepared after return. A subsequent normal request showed the
rate-limit UI; its generic60second countdown does not prove the server hour
window expired. Read-only rate-window inspection gives reset2026-10-01T06:53:50Z
(12:23:50IST). Do not reset counters, change auth limits, invent an OTP or issue
repeated requests. Wait for the actual natural window, then complete login and
use a new clean round-trip attempt623c. This supersedes a tentative missed-tap
hypothesis; settled/enabled control checks are still appropriate driver guards.
A scoped supervised prerequisite job629 now waits for that window, then runs
623c and the exact-artifact three cold launches/30minute rehearsal. It stops at
the first failure; no long-run acceptance exists yet. No operator input needed.

Quota gate cleared naturally at12:23:50IST, without counter or policy changes.
Supervised629 supported primary login PASS, then new clean authenticated round
trip623c PASS: both canonical HTTPS previews, session-cleared real mock verifiers,
secondary admin profile/empty Orders and invoices, both cold persistence, primary
CustomerA and saved invoice182 return. No Retry, human input, ANR dismissal or
ADB restart. New artifact readiness has three cold launches PASS and its actual
30minute controlled read/background rehearsal RUNNING.630 remains active and
will start the8hour unit only after completed readiness, short-read verification,
preflight and all8 prerequisite files PASS. No completed long-run PASS or actual
8hour start at this checkpoint; earlier timed-blocker sections are historical.

## Renewed eight-hour run started — 2026-10-01 13:17 IST

Separate corrected final gates633 PASS: bounded owned service/IPC/listener
readiness and relay DISARMED, preserved business/native-session/verified-OTP
count reconciliation, complete preflight, actual60second native read rehearsal
and its verify. Original630 ENOENT failure and successful captured baselines
remain retained; no transaction was replayed. All eight current-artifact
prerequisites PASS. Current readiness629 completed three cold launches and
1802.6seconds/30cycles. This corrects the earlier RUNNING/pending checkpoints.

Actual start2026-10-01T07:47:00.288137Z (13:17:00IST), active PID2211555,
unit `warehouse-fixture-overnight-2026100101.service`, first native block
soak-01 RUNNING after two PASS preflights.54 inputs frozen; plan SHA256
b18bcbd1cc1159a5e94f1ac196c58ee5ddca381a8fd26ddbe2ece19cf0150542.
Nine3200second read blocks plus postconditions/aggregate; no completed8hour
PASS yet. Native time alone ends no earlier than21:17IST; checks add time.
The runner has a10-hour cap, Restart=no and stops at the first failure.
No timer, automatic failed-case resume, authentication reset or write replay.

Runtime source remains clean backend7e3f66a in new fictional2026100101 state
plus documented subnet overlay; separately owned secondary retains declared
transport/DNS overlays. Current emulator APK sourcee217c1f/code2026100101,
SHA256238ba669f3e14e1e0ea6d0dd396b8766fe5ce1482eae48e264a9af2f95900ed0.
Plan froze backend toolinge85b152b2df5f5d6c8cb7fe81fd8e53f129ac1b4 and
mobile tooling73dc51c1b3911508c1f3a2d3a046685902f6ece8. Later documentation-only
commits do not change frozen executable inputs. Both private CAs expire
2026-10-02T05:43:04Z; helper12-hour windows cover this run and its cap.

Inspect the exact unit and protected631 start result/overnight ledger/results;
keep raw logs, phone/device/session values and hashes private. Do not run another
UI actor or edit bound inputs. Ordinary health/stop:

```bash
systemctl --user show warehouse-fixture-overnight-2026100101.service \
  --property=ActiveState,SubState,MainPID,NRestarts,Result
systemctl --user stop warehouse-fixture-overnight-2026100101.service
```

Next: observe without interacting with the emulator. If it fails, preserve the
ledger and diagnose/reconcile before a new separately frozen attempt. If it
finishes, require all nine block verifies and final business/session/duration/
actual-request/refresh-rotation aggregate PASS, then publish sanitized results.
A start or compilation is not end-to-end acceptance. Real SMS/current revoked
sessions, physical phone/Wi-Fi/cellular/noUSB, same-origin/unsaved-form switching,
current native dispatch faults, undefined related-GRN Breakdown label and
existing security/release gates remain open. Test1/pilot/recovery unchanged.

## Invoice Breakdown GRN link correction — source checks636, 2026-10-01

Candidate `04452271e786f9ce26f183e8383b8f874f29181a` is a source correction awaiting a new audited APK and
native navigation check. The running eight-hour suite retains e217c1f/code2026100101;
its frozen checkout, inputs, emulator and two fictional backends were not changed.
The new source lives in a separate worktree based on
93db85c7397c3602dce0abc5015fb4e0d317991a, Ubuntu24.04.3 x86_64, Node22.23.3/npm10.9.9.

Observed trigger626: invoice20261005 → Breakdown → Linked Documents displayed
`View GRN undefined`; Overview already displayed IRP05. Expected a readable
receipt number and navigation to its UUID. Backend7e3f66a's get_invoice_data
returns header.gr_no and grn.gr_no; Breakdown previously read grn.number alone.
It now uses the same grn.number → header.gr_no fallback as Overview. The route
continues to use grn.id; a printed number is never substituted for a missing UUID.
No invoice amount, provider, authorization or backend code changed.

Reproduce from this candidate with the ordinary documented Node22 setup:

```bash
npm ci
npm test -- --runTestsByPath src/tests/components/InvoiceRelatedGRN.test.tsx
npm test
npm run test:setup
npm run typecheck
npm run lint
```

| Check | Result |
| --- | --- |
| Before-fix screen regression with corrected test driver | FAIL as expected: missing/empty nested number cases fail; legacy number and absent UUID cases pass |
| After-fix screen regression | PASS4: actual Breakdown text/accessibility label and press→GRN UUID route; legacy number preserved; no fabricated route when UUID absent |
| Full unit suite | PASS253 tests/39 suites |
| Setup checks | PASS48 |
| Typecheck | PASS |
| Lint | PASS,0errors/1468existing warnings |
| Privacy/whitespace | PASS; fictional fixture only, private inputs excluded |
| New APK build/audit/native navigation | NOT TESTED; deferred until the current soak ends |

An initial test-driver attempt also failed its legacy control because
React Test Renderer exposes Pressable's inner function rather than the imported
memo wrapper. Preserved original logs show3fail/1pass; label/onPress-based
selection corrected the driver before recording the meaningful2fail/2pass
baseline. Then the single application-line change produced4PASS. These are
source regressions; they do not establish a new native pass.

For the next native build, select this candidate explicitly in a separate clean
checkout and follow the existing standalone APK sequence with a new build ID.
Audit its exact source/trust/SHA before installation. After the soak has stopped,
open saved invoice20261005 → Breakdown, verify visible/accessibility text
`View GRN IRP05`, press it, confirm the matching GRN detail and return to the
invoice. Also check the existing Overview GRN link. Record the new artifact and
result separately; do not transfer the previous artifact's eight-hour result.
No receipt, dispatch or invoice needs to be recreated for this read-only check.

The [next acceptance plan](OPERATOR_NEXT_ACCEPTANCE.md) records dependent work,
blocking resources and reuse rules. Historical626 undefined-label evidence is
retained above; the installed e217 artifact still contains that defect.


## Post-soak session-driver preparation637 — 2026-10-01

Separate source worktree based on GRN candidate/docs5619ac8, Ubuntu24.04.3,
Node22.23.3/npm10.9.9/Python3.12. Added guarded backend observation/ordinary
customer disable and native cold-restoration drivers; see the runnable sequence,
private config schema and pending preparation in
[OPERATOR_SESSION_CASES.md](OPERATOR_SESSION_CASES.md).

Expected an active soak to prevent any session-case side effect. Actual negative
check against the live run returned BLOCKED before ADB, SQL/HTTP action or attempt
creation. A sentinel ADB executable was not invoked; all54 frozen inputs remained
unchanged. Guard regressions8/full setup56/syntax/lint PASS (0errors/1468warnings).
No session account was prepared, disabled or expired and no new APK installed.
SQL/HTTP/native integration remains NOT TESTED; this is preparation evidence.

Source inspection established access expiry normally renews through a valid
refresh session, already measured by the ongoing soak. Refresh sessions expire
seven days after issuance; natural-expiry acceptance is BLOCKED until that age,
not accelerated by changing policy/time. Revocation uses the ordinary authenticated
admin enrollment decision against reserved fictional customer874 only. Its
private token, UUID binding, exclusive emulator and artifact audit are still
prerequisites. No automatic next-case launch is scheduled.


### GRN-fix CI review completed — 2026-10-01

[CI36854228659](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36854228659)
completed PASS on exact head5619ac8962096fa3c1479f358cbfa92370c8567a, containing
application fix0445227. All four jobs passed: lint/type/tests/setup/Expo/Android
JS bundle, Android debug artifact build/audit, dependency audit and redacted
source/history scan. This closes the pending CI review for that candidate.
It does not establish standalone new-APK installation/native GRN navigation,
physical acceptance or the later session-tooling head's CI. Those remain separate.
The bounded private CI observer saved exact-head/job results; no action was
replayed in the eight-hour suite. The operator session driver preparation is
sourcecec94766bf6a025d712482c441f58b8e5409c37b, with56setup/syntax/lint PASS and
live/native integration still NOT TESTED.

## Write retry evidence preparation638 — 2026-10-01

Ubuntu24.04.3, Node22.23.3, separate source checkout based on87c6d40.
Review of historical native receipt/dispatch helpers and the backend relay found
that repeated relay status reads retain the first dropped key. Expected independent
proof of the retry request key; actual helper comparison alone does not supply it.
This limits that part of the historical evidence without deleting its stock,
transaction, UI or cache results.

Added pure receipt/dispatch loss/retry reconciliation predicates and six regression
cases. The main [execution sequence](OPERATOR_WRITE_RETRY_CASES.md) now requires
independent retry-request observation, pre-retry commit proof and unused records.
The observer/native integration is BLOCKED pending implementation after exclusive
fixture access. This preparation does not alter application behavior, replay
business transactions or close current native acceptance. Run source setup checks;
record their result separately from future native evidence.

Validation: `node --test scripts/fixture-write-reconciliation.test.mjs` PASS6;
`npm run test:setup` PASS62/62, no failures/skips. No native/SQL/HTTP test executed.

### Retry observer source correction639 — 2026-10-01

Backend candidate0dc7392 implements the independent bounded observation identified
in638; relay17/backend80 tests PASS. Mobile predicates now require empty
pre-retry observations and exactly one matching post-loss request afterward,
rejecting overflow, concurrency, changed keys and extra requests. Setup63/63 PASS.
No live relay/device change: native draft/SQL adapters and post-soak deployment
still pending; the source fix does not close installed-artifact native acceptance.

### Read-only dispatch adapter preparation640 — 2026-10-01

Separate mobile review checkout based on d907c90; Node22.23.3/Ubuntu24.04.3.
Added guarded repeatable-read dispatch snapshots and strictly reserved source-line
binding. `npm run test:setup` PASS66, including three new boundary regressions.
Actual CLI negative test returned BLOCKED for active soak before backend import,
SQL/socket access or evidence-directory creation. No live SQL/native case executed.

The [main write-retry sequence](OPERATOR_WRITE_RETRY_CASES.md) documents exact config,
phase commands, hash coverage and limits. This adapter covers direct partial
fictional dispatch, not receipt/image/cart/final-dispatch policy. Native driver,
exclusive orchestration and released-fixture SQL integration remain NOT TESTED.

### Native dispatch draft preparation641 — 2026-10-01

Source based on62cc926, Ubuntu24.04.3/Node22.23.3/Python3.12. Inspection found the
create-dispatch icon, save-item icon and quantity input lacked explicit accessible
names. Added names without changing handlers or pricing/business rules. A new APK
is required for native verification. The prepared driver stops before submission;
read-only `after-draft` snapshots must match baseline and exact single-lot binding.

Commands: `npm test -- --watch=false` PASS253/39suites; `npm run test:setup` PASS67,
including four Python boundary tests; `npm run typecheck` PASS; `npm run lint`
0errors/1468existingwarnings; Python compile PASS. Actual entrypoint sentinel test
returned BLOCKED before ADB/route/lock/evidence access while soak remained active.
SQL/native execution NOT TESTED. Full arming/submission/retry/reconciliation and
cleanup orchestration remains pending; do not start another unattended suite yet.
See [the main draft sequence](OPERATOR_WRITE_RETRY_CASES.md) for config and limits.

Earlier mobile tooling CI87c6d40/90b2d90 completed successfully. Backend observer
[CI36858689257](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36858689257)
on0dc7392 failed Container source dependency audit; contract and redacted scan
passed, dependent migrations/isolated install/Grafana jobs were skipped. This is
not an all-pass backend gate. Existing dependency findings remain open.

### Native submission/retry runner preparation642 — 2026-10-01

Separate source worktree based one4c5526, Ubuntu24.04.3/Node22.23.3/Python3.12.
Added guarded submission runner with immutable attempt markers, exact one-item
confirmation, pre-retry database proof, independently observed same-key retry,
pinned loopback discovery/identity checks and bounded cleanup. Snapshot adapter
adds pre-submit equality; draft now records config SHA. Main commands/config and
remaining integration limits are in [write retry cases](OPERATOR_WRITE_RETRY_CASES.md).

`npm run test:setup` PASS68 including four additional Python case-control tests;
Python syntax PASS. Actual runner refusal while soak active PASS before any ADB,
lock, marker or backend/socket access. No native case, business write or new APK
installation occurred. SQL/native/transport/cleanup integration NOT TESTED. Normal
read-health after cleanup remains a separate required check. No new suite scheduled.

### Native cleanup ownership correction643 — 2026-10-01

Review of prepared runner2664426 found its finally block could restore the reverse
route after an early guard failure without having verified route ownership.
Corrected source requires exact unique owned routing before/after restoration;
unknown/in-flight/other-case control or failed evidence preservation leaves both
route and fault intact for reconciliation. No active runtime was affected.

`npm run test:setup` PASS69; seven mocked cleanup scenarios and exact-route boundary
coverage added; Python syntax PASS. Real ADB/warehouse cleanup NOT TESTED. Follow
the updated [main case sequence](OPERATOR_WRITE_RETRY_CASES.md); its frozen tooling
map now includes12files. Preserve all historical results and failed attempts.

### Dispatch console payload correction645 — 2026-10-01

While preparing native acceptance, source inspection found unconditional full
header/item dumps in dispatch form validation/review and full request/result/error
objects in create-dispatch console calls. These could include customer details,
notes and idempotency keys. Removed those dumps; create-path diagnostics now use
fixed messages/counts. RPC construction, one-attempt behavior, caller-visible
errors, validation and business rules are unchanged. This is a scoped dispatch
correction, not a complete app-wide logging audit; other paths remain unassessed.

The first fictional logging fixture omitted required vehicle registration, so
initial tests failed before reaching the intended RPC. That failed attempt is
retained privately. After correcting the fixture, all four privacy regressions
failed on the previous source and passed on the correction. They cover success,
transport rejection, business rejection and thrown exceptions while asserting
unchanged caller results, one RPC and mutation-lock release. New APK/native log
verification remains pending; installed e217 behavior has not changed.

The [current acceptance plan](OPERATOR_NEXT_ACCEPTANCE.md) has been consolidated;
preparation638–643 history remains above. It now separates lost-response tests
from offline queue behavior, names the current APK prerequisites and records the
backendbed4eee local dependency-gate correction without clearing image/runtime gates.

Validation645: `npm test -- --watch=false` PASS257/40suites, typecheck PASS,
lint0errors/1463warnings. The unchanged setup scripts retain643's69PASS evidence;
no duplicate fixture/native run was performed.

### GRN keypad selector correction646 — 2026-10-01

The dispatch GRN picker renders prefix counts next to numeric keypad buttons;
a count such as9 can duplicate the keypad's9 text. The strict draft selector
correctly refuses duplicate controls, so text-only digit taps could block an
unattended draft. Added explicit button accessibility names `Use GRN prefix …`
and `Enter GRN digit …`, and updated the draft driver to select those names.
Handlers, search behavior and displayed values are unchanged.

A synthetic native hierarchy regression reproduces the duplicate-label refusal
and verifies the named button selection, including disabled-button rejection.
`npm run test:setup` PASS69 (the existing Python test group now has5cases),
typecheck PASS, targeted component lint0errors/3existingwarnings, Python syntaxPASS.
This does not establish actual Android accessibility exposure; a newly built APK
and native selector verification remain required. Active emulator/runtime untouched.

### Dispatch SQL compatibility647 — 2026-10-01

Added an explicit guarded scratch SQL check and
[complete reproduction instructions](DISPATCH_SQL_ADAPTER_CHECK.md). It uses a new
pinned PostgreSQL15.8 container with networknone/noports, read-only root, private
tmpfs state and1CPU/512MiB limit. It rejects existing schemas or mismatched
container ownership/isolation, without using or weakening the core fixture guard.

Generated snapshot SQL and synthetic reconciliation checks PASS; reused-state
refusal PASS. Exact query/JSON shapes, one commit, stock/cache changes, unrelated
business data and wrong-stock-line rejection were checked. Initial numeric summary
count8 was replaced with nine named checks; original output retained. The minimal
schema and synthetic UI flags do not establish full schema/RPC/RLS or native
acceptance. No installed warehouse was queried or changed. Only the new scratch
container was removed after evidence capture; active soak inputs remain unchanged.

### Android CI SDK prerequisite correction648 — 2026-10-01

[CI36863674447](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36863674447)
on14129f2 failed Android assemble while configuring react-native-worklets-core.
Gradle implicitly installed NDK27.0.12077973 after its license was accepted, then
reported `Error on ZipFile unknown archive`. The unreadable SDK archive is the
observed failure; its underlying download/cache cause is not established. Other
three jobs passed. Earlier e4c5526/2664426 runs completed all-pass separately.

The operator sequence already listed both NDK revisions, but CI did not install
or verify them explicitly. Added a bounded12minute sdkmanager prerequisite step
before prebuild/Gradle, covering platform36, buildtools35/36, both NDKs and CMake.
It consumes no interactive stdin and does not silently accept new licenses, delete
SDK caches or repeat the whole build. Missing licenses/packages remain a failure.
A new read-only `node scripts/check-android-sdk.mjs` checks revisions and tool files
on Linuxx86_64; it is now in the main operator build sequence too.

Validation: setup72PASS with missing/wrong/incomplete SDK regressions; current VM
SDK checker PASS without running ADB; workflow YAML/shell/package-list checks PASS.
An initial ad-hoc YAML validation used a named import from CommonJS and failed;
correcting that validation import to default produced PASS, with no workflow
change needed. The next CI SDK download and full APK build remain pending. This
preflight does not guarantee archive integrity, eliminate network failures or
establish native acceptance. No active VM SDK, device or warehouse was changed.

### Server-switch confirmation and dispatch cleanup649 — 2026-10-01

Source review of86bde05 on Ubuntu24.04.3, Node22.23.3/npm10.9.9 found that pressing
**Use this server** for a different instance immediately logged out and discarded
unfinished forms without warning. The existing dispatch `resetForm` also left
its rollback snapshot and error intact, so rollback could restore a previous
warehouse's draft after a reset. This is a reproduced in-memory state defect;
no cross-warehouse request or disclosure was observed on a device.

Added a confirmation describing logout and unsaved-form loss. Cancel changes no
session/cache/form state. Same-origin/same-identity selection remains a no-op;
a replacement identity requires confirmation and cleanup. Confirmation callbacks
are invalidated by editing the origin or leaving the screen, and the existing
mutation guards are checked when confirming. Full dispatch reset now returns its
complete initial state, including an empty snapshot and error. No server, pricing,
authentication or persistence policy was changed.

Trigger: `npm test -- --watch=false --runTestsByPath
src/tests/components/OperatorServerSwitch.test.tsx`. Before correction:10FAIL/1PASS;
after correction:11PASS. Tests use real reducers for all four forms with fictional
drafts; discovery, credential operations and native alerts are mocked. They cover
cancel, confirmed switching/replacement, same instance, first selection, active
mutations, stale/unmounted confirmations, staging failure and rollback after reset.
The existing overlapping-discovery test also passes. Full Jest268/41suites PASS,
typecheck PASS, lint0errors/1463warnings. Raw failed/passing logs remain private.
Setup72 evidence648 is unchanged; no setup scripts changed in649.

No new APK, native dialog, SecureStore behavior or two-instance backend case was
tested in649. Current soak inputs/artifact/services are unchanged. Follow the
[main switch sequence above](#reproducible-local-standalone-test-apk) and
[new-artifact acceptance cases](OPERATOR_SERVER_SWITCH_CASES.md) after exclusive
fixture access is released.

CI follow-up: backendbed4eeee4a008073aa453c32da27cade50a32a2f completed all seven
jobs PASS in [36864729906](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36864729906),
including the source audit and isolated operator installation. Mobile86bde05
[36867225316](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36867225316)
passed the explicit SDK prerequisite step and three non-Android jobs; Android
assembly/audit remained pending at this observation. Preserve the earlier failed
archive download. These results do not upgrade the currently installed artifacts.

### Connection-status ordering correction650 — 2026-10-01

Reviewing3dc2023 on Ubuntu24.04.3, Node22.23.3/npm10.9.9 found an unguarded
`NetInfo.fetch().then(...)` alongside the native connection listener. A delayed
startup result could replace a newer offline or reconnect event, and rejection
was unhandled. Callbacks also processed state after unmount. The new code
subscribes first, accepts the initial result only until an event arrives, handles
observation failure without claiming the warehouse is down, and ignores results
after unmount. This corrects the app's initial promise/event ordering; it does not
prove ordering inside the native NetInfo library or API reachability.

Trigger: `npm test -- --watch=false --runTestsByPath
src/hooks/__tests__/useNetworkStatus.test.ts`. Controlled promises/native events
reproduce six failures with two initial-state cases already passing. The first
post-fix attempt passed seven cases but the unmount fixture failed because Babel
evaluated its object-literal getter during construction. The corrected fixture
uses `Object.defineProperty`; rerunning it against old source gives6FAIL/2PASS,
then corrected source8PASS. All attempts are retained privately. The existing
order lifecycle test passes separately. No radio/device/warehouse was changed.

### Offline banner cancellation correction651 — 2026-10-01

The banner ignored the animation completion's `finished` flag and had no cleanup
for an obsolete hide. On another disconnect, a stale callback could remove and
then recreate the warning. Initial tests inspected only the final visible state
and found two cleanup failures; stronger coverage of actual unmounts reproduced
four failures with one ordinary-reconnect case passing. This is a transient
removal/restart defect, not evidence of a permanently hidden native warning.

The effect now stops its own animation on replacement/unmount and accepts a hide
completion only while current, finished and online. Trigger: `npm test --
--watch=false --runTestsByPath src/tests/components/OfflineBanner.test.tsx`;
corrected5PASS with mocked animation completions, including obsolete success,
cancel, a subsequent normal reconnect and unmount. Installed React Native0.81.5
source confirms cancellation may invoke completion with `finished:false`.

Combined validation650–651: full Jest281/43suites PASS; typecheck PASS;
lint0errors/1463existingwarnings. Setup72 evidence648 remains unchanged, not
rerun. Main instructions now link the bounded offline/native sequence and explain
the lack of a durable GRN/dispatch queue. Native checks and a new APK remain
pending; all active-soak inputs/services and the installed e217 APK are unchanged.

CI follow-up: mobile86bde058194ea46fb68cb7b74b73ac404273c84d
[36867225316](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36867225316)
has now completed all four jobs PASS, including explicit SDK preparation, Android
debug compilation and artifact audit. This supersedes648/649's pending observation
and preserves14129f2's failed archive attempt. It does not establish the archive's
original root cause or new native acceptance. Later649/newer-head CI is separate.

### Replacement identity cleanup652 — 2026-10-01

Source review of70c3073 found that a discovered replacement at the same origin
used ordinary logout. With a previously initialized client, that could send the
old refresh credential through `logout_session` to the new instance. Manual
replacement selection could likewise send an old pending-enrollment token.
A mocked credential/RPC regression failed on old source, reproducing the remote
call. No native credential disclosure or real replacement was exercised.

Added explicit local-only logout for replacement discovery/selection, including
the usual local profile/config/form/cache cleanup and local enrollment removal.
Normal sign-out/different-origin switches retain old-server revocation. Extracted
the public discovery boundary into `verifySelectedOperator`: matching identities
preserve state, failed/incompatible discovery preserves selection, replacements
wait for cleanup before saving, and superseded discovery/cleanup does not adopt
an old identity. Bootstrap invalidates its run when unmounted.

Trigger: targeted `customSession` replacement regression RED1 (26 other cases
intentionally not selected), then complete customSession/bootstrap/switch group
PASS46. Initial bootstrap fixture used padded anon-key encoding and failed five
cases, including a wait that timed out; corrected the fictional fixture, not the
validator. Initial typecheck rejected a union combining selection/superseded;
separate discriminants corrected it. Failed attempts retained privately.
Full Jest290/44suites PASS, corrected typecheck PASS, lint0errors/1463warnings.
No new RPC/schema or authentication bypass; installed APK/soak unchanged.
Native same-origin replacement, SecureStore failure behavior on a device and
complete concurrent bootstrap/switch acceptance remain pending. Local cleanup
does not establish remote revocation of the former instance.

### Guarded navigation/offline driver preparation653 — 2026-10-01

Review source8f1f15b lacked a bounded native read/offline and cancel/confirm/same-server
driver. Added four navigation cases and one prepared no-image partial-dispatch
offline error/reconnect/explicit retry case. All require successful soak release,
private source/artifact/owner/session bindings and the exclusive session actor lock.
Independent read-only business/auth/OTP comparisons gate acceptance. Offline writes
require a completed UI error plus zero-write SQL proof before reconnect/retry;
uncertain first requests remain disconnected for reconciliation. No OTP/login,
seeding, pilot use, fault arming or automatic resume. No runtime files changed.

Trigger: `npm run test:setup` PASS75; five pure Python control tests PASS and new
Python/Node syntax PASS. Four actual entrypoint attempts against the active soak
returned BLOCKED before ADB/SQL/socket/attempt creation. Private sentinel ADB stayed
untouched; no case directory created; all54 frozen inputs unchanged. Full-schema
SQL/native/radio/selectors/cleanup integration NOT TESTED. Navigation cancellation
does not establish unsaved-form preservation; offline dispatch is a bounded
no-image case, not independent same-key HTTP observation or durable queue acceptance.
Use [navigation/offline driver instructions](OPERATOR_NAVIGATION_DRIVERS.md) for
exact private config fields, source bindings, execution order and limitations.

CI observation at14:07UTC: backendb401af6c87ef8f823c6ab3cc506c7ad20da5b0b2
[36869491629](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36869491629)
all7PASS; mobile switch3dc2023ff4c11274c9ff0da26367c8479bb9d692
[36869482636](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36869482636)
and mobile70c3073914eea2b52d6955848716ec8d0aa17909
[36871398156](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36871398156)
all4PASS each. These debug/source jobs do not establish current native acceptance.

### One-attempt query write policy654 — 2026-10-01

Source88817d1 still configured QueryClient mutations with two retries and
`networkMode: online`, which can pause an offline action until reconnect.
Five regressions exercise the actual application client/mutation cache with fake
transports: failed write, committed write/lost response, offline-to-online, transient
read and successful explicit write. Old source RED3/PASS2; corrected source PASS5.
Failed attempts retained privately. No network/backend business mutation occurred.

Changed mutation defaults to `retry: false`, `networkMode: always`: one transport
attempt immediately, with normal errors surfaced rather than queuing a later write.
The exported dispatch-delete hook specifies the same policy under another provider.
Read retries remain unchanged and their transient-read case PASS. Source search
found no mounted delete-hook consumer; current document/detail screens call their
services directly. This is preventive hardening, not proof of a current native
duplicate-delete incident or an audit of every transport retry in the stack.
Operators must still reconcile uncertain commits before another explicit action.

Trigger: targeted Jest5PASS, full Jest295/45suites PASS, typecheck PASS, lint
0errors/1463warnings. Setup75PASS from653 remains unchanged in scope. No native
APK rebuild, offline radio case or production policy change; new-artifact
acceptance remains open. Native NetInfo is not bridged to QueryClient's online
manager; this correction does not claim that query reconnect events work on-device.

### Acceptance-scope audit655 — 2026-10-01

The top launch checkpoint could be mistaken for live telemetry; its dependency
FAIL reflected an older source while later CI/source corrections were below it.
Preserved the table as a dated13:17IST launch snapshot and renamed the first
failed overnight heading as historical. Added a linked26-row acceptance index
with exact backend/mobile/artifact boundaries, scope, result and remaining
prerequisite. Required cases use PASS/FAIL/BLOCKED/NOT TESTED; the incomplete
full soak is NOT TESTED with actual progress, not an inherited/skipped PASS.
Current review code2fbf238 is source-only; installed e217/physical8d are unchanged.

Verification: all26 result/scope rows audited, local links resolve, protected-input
scan PASS. Seven completed native blocks and no failed checks were observed at
14:44UTC; final aggregate pending. No case rerun, source acceptance transferred
to hardware or historical failure removed. See [acceptance index](OPERATOR_ACCEPTANCE_MATRIX.md).

### Clean-guide audit and reproduction656 — 2026-10-01

Literal audit found two misleading main-sequence inputs: the selected e217 source
predated the later `scripts/check-android-sdk.mjs` command, and the example checkout/
fixture build ID2026100101 was already occupied by the active run. Corrected the
main mobile sequence to explicit remote review code2fbf238a270e9806ed055ddfab045b57eb926ab2,
a new unused checkout and distinct proposed fixture0102/normal0103 identifiers.
The original824 candidate and installed e217 remain explicitly recorded. Backend
main-sequence correction now pins exact all-seven-job-PASS codebed4eeee4a008073aa453c32da27cade50a32a2f
and labels258's original gateway measurements as historical. No silent upgrade
of installed Test1 or fixtures. Future operators must use their own unused paths.

Followed the corrected source sequence from fresh remote checkouts, without source
edits or copied node_modules: backend locked install,80tests and source audit PASS;
mobile SDK file/revision check, locked install, private ignored env creation,75setup,
295Jest/45suites, typecheck, lint0errors/1463warnings, Expo compatibility, Doctor18/18,
zero-vulnerability npm audit, public Test1 bootstrap and static contract PASS.
Both source trees stayed clean. Static contract reports no missing names or typed
mismatches; explicitly dynamic calls remain an inventory limitation, not live API proof.

Separate new fictional private state `core-backend-test-20261001656` and private
non-delivery provider directory were configured twice from clean bed4 source.
Private manifest/credential hashes stayed identical; state0700/credentials0600.
No services, database/admin, DNS/tunnel or SMS were started. This proves configuration
and source-command reproduction only. Full local backend installation is BLOCKED
while the active fixture owns the documented18080/subnet10.233.245.0/24; do not stop
it or weaken guards. Exact bed4/b401 CI already passed its separate isolated install,
but that is not this VM's literal full-guide reproduction. New Android prebuild/
Gradle/audit/install/native execution remains NOT TESTED and awaits exclusive
emulator release. Do not declare the new standalone guide fully reproduced yet.

Source retry audit: direct GRN/dispatch/delete services await one POST without an
app retry loop; generic `withRetry`/`withRetryRpc` and `callRPC` have no mounted
production call sites in this tree (exports/comments remain). Installed locked
PostgREST2.116.0 transport source restricts retry to GET/HEAD/OPTIONS; POST failure
propagates without retry. This is static/source evidence, not fault injection for
every mutation. Its exported Promise.race timeout utility does not cancel an
underlying request; a timeout alone must never authorize another write. Existing
uncertainty/stock/cache reconciliation rules remain required.

At15:01UTC: eight soak blocks PASS, ninth RUNNING, no failed checks; all54 frozen
inputs unchanged. Final aggregate/native acceptance not counted as PASS.

### Full-schema observer preparation657 — 2026-10-01

The new navigation/offline observer queries had not been checked against the full
migrated schema. Added an explicit scratch-only checker with pinned image, numeric
owned name/label, no network/ports/external mounts/privilege/restart,1CPU/1GiB and
tmpfs guards. It requires clean backendbed4, a fresh schema and private exclusive
command evidence. It applies the unmodified migration plan, without another
instance's state, credentials, volumes or fixture-guard changes.

Command: `node scripts/check-observer-schema.mjs OWNED_SCRATCH_CONTAINER CLEAN_BACKEND PRIVATE_EVIDENCE`.
All18 migrations and five query/rejection cases PASS: dispatch with/without key,
missing stock refused, repeat navigation digest stable, missing session refused.
Reused schema refused before migrations/queries. Owned scratch container removed.
No RPC/RLS, session issuance, populated business fixture, guarded observer CLI
warehouse path or native execution is claimed. Exact executed script hash/raw
logs remain private. After that run an early name check was added before Docker
inspection; pure guard regression PASS, unchanged SQL workload not repeated.
Initial setup76PASS, final77PASS. Application code stays2fb; this is tooling-only.
Reproduction/source pin and safe cleanup are in [schema check guide](OBSERVER_SCHEMA_CHECK.md).

Read-only horizon check15:28UTC: both current public fixture CAs expire
2026-10-02T05:43:04Z (11:13IST),14.24hours remaining. Current supervised helper
units remain active/Restart=no/NRestarts0,12-hour caps from12:56:34IST1October.
A later long run needs a fresh bounded service horizon and must recheck/prepare
fixture TLS before building if its required12-hour window would no longer fit.
This is a prerequisite for the next run, not a fault in the present soak.
No runtime/route/emulator/frozen source or production credential changed.

CI follow-up15:34UTC: exact mobile6bf0645a1ae119aabdcfa28804ea6cd8ad627e92
[36882231604](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36882231604)
now all4PASS, as is code2fb
[36879080017](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36879080017).
Backendb1 run36882201481 still has isolated installation pending at this checkpoint.
Eight soak blocks PASS/ninth RUNNING, no failed checks,54frozen inputs unchanged.
No new artifact/native acceptance is inherited from debug CI compilation.

### Completed supervised soak658 — 2026-10-01

Final native/session/business reconciliation completed PASS at
2026-10-01T15:48:30.756Z (21:18:30 IST). All nine3200-second blocks PASS:
28,804.866seconds of soak (8hours4.866seconds),459 lifecycle/read cycles,
461 successful Orders request observations, zero failed request observations
in the recorded cycle windows, and nine native credential rotations observed
from private hashes. All21 ledger checks PASS; business baseline reconciliation
and unchanged administrator OTP-verification count PASS. The original bound
native session persisted. This is read/lifecycle/session evidence, not an
eight-hour business-write or universal network-error test.

Exact scope: mobile e217c1f2b22f74ea5aaabca5101c27aa166c5f68, fixture
code2026100101/x86_64/API30, APK SHA256
238ba669f3e14e1e0ea6d0dd396b8766fe5ce1482eae48e264a9af2f95900ed0;
primary backend7e3f66a34bb729d80e25c6a4a0975f072c05d03a plus its
declared subnet overlay. All54 frozen file bindings still match. Completed
ledger SHA256 fe4aad31dcbd0ec95afc1ac268d15cfc9a9a7bb5ede45195e0b1e10d50a5c41b;
plan SHA256 b18bcbd1cc1159a5e94f1ac196c58ee5ddca381a8fd26ddbe2ece19cf0150542.
Raw results, private snapshots and immutable completion copies remain outside Git.
The real `assertReleased` check PASS with this ledger/plan and the now absent
successfully completed transient unit. No emulator, route, session or service
was changed to record completion. Earlier failed3014/630 attempts remain intact.

Exact latest pre-checkpoint CI: mobile802706de9dbf2f77f9f99250ecf93ded7eb2b6b3
[36885457329](https://github.com/abhiguru/rn-warehouse-template/actions/runs/36885457329)
all4jobs PASS; backend3a4342213474708869cd5001e1e778ee2ba7c7a3
[36885501919](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36885501919)
all7jobs PASS. Earlier pending backendb1 CI36882201481 also all7PASS. These
conclusions precede this documentation commit, whose CI must be tracked separately.

Next: preserve this completed evidence; prepare sufficient disposable fixture
TLS/helper lifetime before freezing new APK trust; build/audit the clean2fb
candidate with a new build ID; then run affected GRN, dispatch retry, offline,
switch and reserved-session native cases with fresh private bindings/documents.
Existing helpers end00:56IST2October and CAs expire11:13IST2October; neither
should be assumed sufficient for a new long run. Do not repeat the unchanged
e217 soak or transfer its PASS to the new APK. Complete local bed4 installation
is no longer blocked by an active soak, but still requires explicit ownership/
port/subnet planning and preservation of the current fixtures. Physical phone,
cellular/noUSB, real CustomerB, natural refresh expiry, replacement-state and
existing security/release gates remain open; no pilot/recovery action.
