# Independent operator mobile handoff

## Verified security backports and extended campaign — 3 October 2026

The user explicitly extended the campaign beyond its original 48-hour deadline
until blockers are removed and the full eight-hour soak starts. The separate
native attempt limits and fixture protections remain in force.

Mobile source now applies two local dependency repairs during npm postinstall.
The node-forge 1.4.0 RSA parser change is byte-identical to upstream PR #1152,
commit ceba34402e329f0365134f23fe19898756527d65 (still open/unmerged). The local
braces 3.0.3 correction bounds parser and direct AST walker depth, including
parentheses and cycles. Original package versions and lockfile identities stay
visible. Every installed copy must match reviewed original/patched checksums;
unexpected versions, source changes and symlink targets are refused before any
patch writes.

The user specifically approved replacing the raw-only npm audit CI gate with
source-verified backport evaluation. `npm run audit:dependencies` retains the
raw npm report: 50 high findings remain in published-package metadata. The
approved gate reports PASS_WITH_VERIFIED_BACKPORTS only when all high/critical
paths resolve to the two repaired advisories and every affected installed copy
is verified. It rejects unknown advisories, changed ranges, missing patches,
unverified copies, unresolved graph cycles, inconsistent counts and audit errors.
CI retains both raw report and source-verification artifacts. This is local
backport acceptance, not a claim that upstream published patched releases.

Security regressions reproduce the original defects and pass after patching.
Valid native PKCS1/PSS signatures and normal brace/micromatch behavior pass.
Clean installation, 360 setup tests, 323 application tests, SDK compatibility,
typecheck, lint, source/history scan and standalone Android JS export PASS.
The first malformed RSA fixture used the wrong padding API; its failed baseline
is preserved beside the corrected baseline and passing patched regression.
No new fixture APK or native result is claimed by these source checks.

Backend staff/cache source 75a6fb1 has all seven exact CI jobs PASS. Mobile 5218899
(the prior removal of unused tunnel tooling) finished CI with Android debug
artifact audit, lint/types/tests and scans PASS, dependencies FAIL. That earlier
result remains historical and does not establish CI for these new backports.
Current private evidence is extension-20261003-01 under the campaign root.

## Approved staff GRN policy, 3 October2026

The operator chose staff access to view, create and edit GRNs, with deletion
reserved for administrators/supervisors. Backend migration18 grants the scoped
GRN RPC/read surface and required customer/attachment lookups; unrelated role
permissions remain governed by their existing checks. The GRN activity screen
includes staff, and the edit dispatch-presence helper reads the GRN-authorized
summary and rejects malformed/denied responses.

Ten focused mobile tests, typecheck and lint passed locally; existing lint
warnings remain. CI run37121658351 exposed one older authentication test still
mocking the replaced dispatch-table query. After correcting it to require the
authenticated GRN-detail RPC, all 50 suites/323 tests passed locally. That CI
failure remains preserved. The policy decision is resolved. Backend migration
CI failed a legacy-list count assertion: its source correction initializes the
previously unseeded refresh queue and awaits an authorized database validation
attempt. Native acceptance remains outstanding; no new APK was built or installed.
Historical staff-policy blocker notes below retain the prior observations.

## Current VM campaign checkpoint, 3 October 2026

User-resumed after resource resize:31GiB RAM/about115GiB free disk/unused swap.
Original and fresh backend local doctors PASS. Fresh85 tables/five actual files,
configuration and identity match pre-restart state exactly; prior99 matrix file
bindings verified. Emulator remains stopped; no stale helper or write replay.
New read-only monitor28 uses frozen e1194f8, deadline16:27:13UTC, first pass
14,370 bound files/17 retained historical changes/zero current integrity errors.
The old helper/monitor lifetime observations below are historical after reboot.
Fresh backend monitoring has a new two-hour-bounded serial pinned image-build
stage; no runtime acceptance is claimed while its build remains live.
Backend source regressions115/115 include eight auth-driver unsafe-binding
refusals. Added mocked provider-contract coverage subsequently passes118/118.
These checks do not close installed APK native groups or change the deadline.


Fresh backend final local monitoring attempt3 PASSed: five pinned amd64 images
exported/read back, Prometheus/Alertmanager configuration, all five scrape
targets and actual local-only alert delivery. Both earlier timeout/OOM failures
are preserved; new4GiB/two-CPU/one-worker builder stopped normally. All85
tables/five files/configuration/identity stayed unchanged. This is private
backend monitoring evidence, not external alerts or native acceptance.

A consistent private local backup of that populated fresh fixture then PASSed
seven checksums/readable database and stored-object catalogs, identical protected
state and post-backup doctor. Only its own write-facing services were briefly
stopped and normally restarted. No restoration/transfer/original-warehouse
change. Six older private archives revalidated separately after resize.
Backend documentation9b4b2b9 records complete scoped results and image IDs.
The emulator remains stopped; no new Android refresh-expiry appointment exists.

The VM-only campaign remains incomplete, with deadline 16:27:13 UTC today.
Installed x86_64 APK2026100110 is application c422f62, SHA256
a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69; backend
application remains bed4eeee plus declared overlays. See the dated acceptance
matrix for exact native scope. No final freeze, new eight-hour soak or dedicated
natural-expiry appointment exists. Historical results below do not transfer.

Independent fresh backend application079ab4a now PASSed setup/migrations/
bootstrap/doctor, business API, reciprocal customer Realtime, ordinary final
OTP/account/image cases, Studio/metadata, gateway CORS/payload/DNS, retention
preview, bounded load and current mobile live contract. Repeat setup preserved
85 tables and five actual stored files, configuration and identity, with only
the existing sms_config.updated_at update. Test tooling1c2b724 and helper3ae80ae
are separate from the application. Verified TLS19543/IPC returned the genuine
new instance; original emulator routing remained unchanged. Backend3ae80ae CI
run37108193432 passed all seven jobs. Backend documentation832c4f7 records
private install-result03/business-result01/supporting-result02/TLS proof02.
These results do not establish current native workflow or switching acceptance.

At08:34UTC less than eight hours remained before the16:27:13UTC deadline.
A new full eight-hour soak plus readiness/reconciliation cannot fit; it remains
unstarted. No final freeze or dedicated natural-expiry appointment is established.
The private immutable matrix20261003T083815Z contains29 rows/80 bindings and
retains prior failures and the separate older APK soak evidence.

Current original owned API30 emulator is logged out after normal removal of the
temporary genuine A native session. Two cold launches require login and Core
selection persists. Account remains active; its two older API sessions are
preserved. Native cleanup attempt3 PASSed with zero OTP/business writes and
unchanged protected SQL/authentication/stored bytes; no fourth attempt. Earlier
A authentication and isolation results remain scoped to their recorded sessions.
The prior supervisor session804 was removed by normal logout; that account remains
active. Customer B remains rejected/inactive and must not be reapproved to reuse
historical acceptance. Private current A login/receipt denial/image and PDF API
proofs are under the campaign root. The final A-to-B native receipt-denial attempt
passed; its two failures remain preserved and no fourth attempt is allowed.
API image and PDF denial preserve the current native session and actual stored
bytes; they do not establish native image rendering or full reciprocal isolation.

Genuine B invoice20261031 now has one API-generated/downloaded private PDF,
20,809 bytes, SHA256ebeb9b37e023389438ce07868aa08f32cf7c083b487488c38b02fa7f8bebebab.
The first current A API direct invoice PDF read/generation denial PASSed400/404,
with existing native/API sessions, business, pricing and actual bytes preserved.
Only new supervisor/A API sessions were normally logged out. This closes the
scoped invoice transport check, not native PDF or reciprocal workflow groups.
Private proofs: `b-invoice-pdf-preparation0110-final-proof01.json` and
`current-a-private-b-invoice0110-final-proof01.json`. Frozen tooling55cab9e;
installed APK/application unchanged. Admin daily quota remains20 with natural
reset after campaign deadline; no further Admin OTP or quota reset is allowed.

Latest complete fixture source validation passed347/347 under Node22.23.3.
Mobile production audit still reports26 high dependency paths. Backend review
9c11104 replaces metadata cpy-cli/nodemon with native Node asset-copy/watch
helpers; the full metadata audit fell from8 high to0 while all170 production
lock entries and retained entries stay unchanged. Backend source tests105/105
and pinned upstream check/build/tests12/12 PASS; both container audits report0.
The clean9c11104 isolated metadata image build and exact-image bounded
root/health/missing-route HTTP smoke PASS. The first wrong runtime-user override
failure is preserved; correction used the declared Dockerfile user without
changing permissions. Aggregate metadata-native-tooling-image-final-proof01.json
binds18 evidence files. Reviewed backend smoke/handoff57eef6b. This does
not establish original-warehouse replacement; subsequent independent fresh
backend reproduction is recorded above.
Do not use audit fix --force, downgrade Expo/nodemon or waive gates. Backend
storage busboy3.2.2 patch now has isolated image build/parser/integration PASS; it is not installed storage-service acceptance.
The installed application remains bed4eeee plus its four declared overlays.
No final freeze, readiness soak or delayed-expiry appointment is eligible yet.
Core helper14 uses pinned e3126a0, switching08 uses7699364, and fault04 is disarmed.
Core's single-use Orders delay controller is consumed; normal traffic is restored.
Each helper retains its12-hour cap; verify actual remaining lifetime before work.

Current read-only monitor is `warehouse-vm-campaign-monitor-20261001-27.service`,
frozen tooling e1194f8, private root
`/home/jay/warehouse-install-private/vm-campaign-20261001`. Its configuration is
`monitor27-config.json`, output `monitor27.jsonl`, transition record
`monitor27-transition.json`. First full integrity pass checked all 7,848 bound
files: no unreadable input/current/older-soak failure; 17 historical changes
remain recorded. The prior 4,096-file limit was insufficient; the corrected
finite limit is 16,384 with the unchanged 256-stage limit. Prior monitor26 logs
are preserved. Restart is disabled and lifetime ends at the campaign deadline.

Health: `systemctl --user status warehouse-vm-campaign-monitor-20261001-27.service`.
Stop: `systemctl --user stop warehouse-vm-campaign-monitor-20261001-27.service`.
Use the recorded supervised invocation and remaining deadline to start a new
identity; do not resume old transient identities or extend the campaign.
Current core14, switching08 and fault04 helpers retain their own twelve-hour
caps; the core Orders controller is consumed and the fault relay disarmed.
No helper, emulator session or business state was changed for this correction.


## Current VM-only campaign handoff — 2 October 2026

For this active campaign, use [OPERATOR_VM_ACCEPTANCE_20261001.md](OPERATOR_VM_ACCEPTANCE_20261001.md).
The instructions below retain earlier installation history; their physical-device,
SMS and tunnel work is outside this campaign. Current review is draft
[PR34](https://github.com/abhiguru/rn-warehouse-template/pull/34) with backend draft
[PR79](https://github.com/abhiguru/supabase-warehouse-template/pull/79).
No merge, release, restore, host reboot or production contact is authorized.

Installed application source is `c422f62cd36cb407e7ed7bfce28c4db5189e2bd5`,
version0.1.0/code2026100110, package `in.gurucold.warehouse.fixture`, x86_64 only.
APK SHA256 is `a7df6781bdcd889eb9ccaa01ee0973890effd4d187bb6ac45f100284e1b04b69`;
fixture signer fingerprint is
`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
Later review commits change fixture tooling/docs; they do not update installed bytes.
The compiled audit, installed read-back and source/build logs are under the private
campaign root `/home/jay/warehouse-install-private/vm-campaign-20261001/build0110`.
The artifact is `/home/jay/warehouse-artifacts/fixture/fixture-c422f62-build2026100110-x86_64.apk`.

Reproduce in a fresh pinned checkout and separate empty disposable backend state,
following backend `bed4eeee4a008073aa453c32da27cade50a32a2f` operator installation
instructions and recording every declared port/subnet/container/native overlay.
Do not carry generated configuration from an existing warehouse. Backend setup,
migrations, bootstrap, identity and local doctor must pass before Android build.
Use Node22.23.3/JDK17 and the documented SDK/NDK prerequisites. Require25GiB free
before native generation and compilation; stop/preserve the owned AVD before a
heavy build and use one build at a time. Do not clear unrelated caches or state.

After clean `npm ci` and the documented setup/unit/lint/type/SDK/Expo/contract and
redacted source/history checks, configure the fixture-only identity and three
independent fictional certificate inputs in the process environment:

```bash
export WAREHOUSE_ANDROID_PACKAGE=in.gurucold.warehouse.fixture
export WAREHOUSE_APP_NAME='Fictional Core Warehouse'
export WAREHOUSE_APP_SCHEME=warehouse-fixture
export WAREHOUSE_ANDROID_VERSION_CODE="$UNUSED_INCREASING_BUILD_ID"
export WAREHOUSE_FIXTURE_CA="$PRIVATE_PRIMARY_CERT"
export WAREHOUSE_SWITCH_FIXTURE_CA="$PRIVATE_SWITCH_CERT"
export WAREHOUSE_REPLACEMENT_FIXTURE_CA="$PRIVATE_REPLACEMENT_CERT"
export WAREHOUSE_FIXTURE_MIN_VALID_HOURS=168
export WAREHOUSE_FIXTURE_BUNDLE_WORKERS=2
export EXPO_PUBLIC_CONFIG_API_URL=https://backend-core.example.test
node scripts/check-android-sdk.mjs
node scripts/prepare-emulator-fixture.mjs --check-certificate
npx --no-install expo prebuild --platform android --clean --no-install
node scripts/prepare-emulator-fixture.mjs
(cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64 -Porg.gradle.workers.max=2 '-Porg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=768m')
node scripts/artifact-audit.mjs android/app/build/outputs/apk/release/app-release.apk
```

Allocate the identifier and create private certificate inputs before these commands;
never overwrite an old artifact. Certificates must be independent fourteen-day
fictional certificates with exact permitted hosts and private key permissions.
Record fingerprints/expiry, source/tooling/overlay commits, full command, compiled
trust/JS/permissions/ABI, signer/package/version and SHA256. Run the picker native
compile audit against the actual generated `compile_commands.json`, then inspect
signer and manifest with the installed SDK tools. Install only on the owned API30
AVD after state preservation; pull back the installed APK and compare hashes.
Metro must be absent. This workflow produced APK10 from clean source; it does not
waive the currently failing dependency audit or prove physical no-USB operation.

Current VM services and read-only health/stop instructions are in the backend
campaign ledger. Use its current private helper config with the guarded supervisor
`status`; starting a helper requires a new config/runId/socket/log identity and
actual TLS/IPC readiness, retaining the12-hour cap. The current AVD is
`TestWarehouseFixture_API30`/emulator-5556 under
`warehouse-fixture-emulator-vm2026100110-01.service`; do not wipe or clone it.
Librera's existing approved permissions belong only to this original disposable AVD.

Native invalid receipt quantities PASS on APK10. Queue/PDF/Realtime/draft and other
historical PASS evidence remains scoped to older artifacts. Concurrency is BLOCKED
with three preserved failures and no fourth attempt, stock3 and no dispatch commit;
its legitimate-refresh observer correction is separately source/SQL tested.
Other exhausted cases and untested switching prerequisites remain in the matrix.
The older build0101 eight-hour soak remains separate PASS. Final candidate freeze,
30-minute readiness and new eight-hour soak are UNSTARTED. Dedicated natural
expiry is UNSCHEDULED because final freeze is not yet satisfied: no appointment
may reuse the original AVD/session or shorten/alter expiry. After an eligible freeze,
use a new owned API30 AVD, ordinary reserved-account authentication, recorded real
expiry, clean stop/storage preservation and a single one-hour check at expiry+10min.


The current app selects an operator's canonical HTTPS origin before login.
Manual entry and QR discovery show the warehouse identity. Credentials, pending
enrollment and business state belong to one selected instance; a server switch
or replacement instance requires a fresh login.

Use the backend [operator installation guide](https://github.com/abhiguru/supabase-warehouse-template/blob/f18f51d4625e7f8c0d977ac69645804e318a9d49/docs/OPERATOR_INSTALL.md)
for the VM, MSG91 settings and local first-administrator bootstrap. The backend
[acceptance ledger](https://github.com/abhiguru/supabase-warehouse-template/blob/f18f51d4625e7f8c0d977ac69645804e318a9d49/docs/PRODUCTION_DEPENDENCIES.md#independent-operator-installation-work)
is authoritative for unfinished software and service/device acceptance.

Mobile implementation is under draft [mobile PR #33](https://github.com/abhiguru/rn-warehouse-template/pull/33)
and backend [PR #68](https://github.com/abhiguru/supabase-warehouse-template/pull/68)
merged at `f18f51d4625e7f8c0d977ac69645804e318a9d49`. Mobile candidate is
`8240cce9121a797fd0cf2e00e568a61985814ddb`; do not assume it is on mobile `main`.
See [OPERATOR_INSTALL_NOTES.md](OPERATOR_INSTALL_NOTES.md) for this fresh VM
attempt and installation findings. The [dated acceptance matrix](OPERATOR_ACCEPTANCE_MATRIX.md)
separates installed artifacts, newer source fixes, required cases and blockers;
consult the private soak ledger for live progress.
Record exact backend/mobile commits and native build IDs for every VM or physical
device acceptance run. Source checks and an Android artifact audit do not prove
real SMS, iPhone, lifecycle recovery or server-switch isolation on a device.

The next native acceptance uses the new VM's origin: administrator SMS login,
pending customer signup, administrator approval and customer login; core business
flows; Wi-Fi/cellular access; sign-out, cold restoration and two-server switching.
Retest delayed responses, active mutations, QR selection and a replacement
instance at the same URL on Android and a physical iPhone.

Printing and sensors remain disabled until their own acceptance. Native store
publication is separate from the pilot. Do not copy backend service credentials
into the app. `EXPO_PUBLIC_CONFIG_API_URL` is only for CLI configuration checks;
the running app uses the selected server.

[Historical source-demo handoff](SOURCE_DEMO_DEVELOPER_HANDOFF.md) and
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md) retain the original tested commits
and device identifiers. Those results do not validate the changed operator
runtime. Preserve `v0.2.2-demo`.

For work after the current isolated soak, use the [next acceptance plan](OPERATOR_NEXT_ACCEPTANCE.md). It distinguishes the source-only GRN-link fix from the installed artifact and lists the remaining native/hardware blockers.

The [post-soak session drivers](OPERATOR_SESSION_CASES.md) have passing guard/refusal checks; live/native acceptance and reserved-account preparation remain pending. The exact GRN-fix CI run36854228659 completed with all4 jobs PASS; later tooling-head CI and new-artifact native acceptance remain separate.

See [post-soak write retry cases](OPERATOR_WRITE_RETRY_CASES.md) for preparation638 and the small retry-observation blocker to close before unattended writes. No active-soak infrastructure was changed.

The dispatch draft-only driver641 and read-only adapter640 are documented in [write retry cases](OPERATOR_WRITE_RETRY_CASES.md). They have source and active-run refusal evidence, not current native acceptance. Include the three dispatch accessibility labels in the next audited APK; never replay existing fault documents.

Before Android compilation run `node scripts/check-android-sdk.mjs` after installing the pinned packages in [operator notes](OPERATOR_INSTALL_NOTES.md). CI now performs this explicit prerequisite step; SDK archive/download failures remain separate from app compilation/native acceptance.

Correction649 adds confirmation before switching warehouses and clears dispatch
rollback/error state on full reset. Eleven new source regressions pass; the
[server-switch cases](OPERATOR_SERVER_SWITCH_CASES.md) still require a new audited
APK and exclusive fixtures after the soak. Historical round-trip evidence does
not establish unsaved-form cancellation or same-origin replacement acceptance.

Corrections650–651 guard initial network-state ordering and stale offline-banner
animation callbacks. Combined source validation:281Jest tests/43suites,
typecheck and lint0errors PASS. The [offline/reconnect cases](OPERATOR_OFFLINE_CASES.md)
separate device disconnection, backend outage and explicit write retries; no
durable offline GRN/dispatch queue or new native result is claimed.

Preparation653 adds [guarded navigation/offline drivers](OPERATOR_NAVIGATION_DRIVERS.md).
Four active-run refusals and setup75PASS; full-schema/native execution remains open.
Cold-start identity correction652 has290Jest tests PASS; replacement authentication
on a new audited native artifact still needs separately owned replacement state.

Correction654 makes query-based writes one attempt per explicit action and avoids
paused reconnect execution. Five real-client regressions PASS; full295Jest tests,
typecheck and lint0errors PASS. The unused dispatch-delete hook is hardened;
current direct document services and installed soak APK are unchanged.

Literal-staff APK10 check (3 October): ordinary login and logout PASS; cold
Orders200/no Queue PASS, GRN denied with Staff access required. Mobile/backend
permission-policy mismatch remains BLOCKED. Normal administrator API restored
reserved profile947 to active/approved supervisor; no target native session,
original emulator logged out. Business/assignments/other accounts/stored bytes
preserved. Role-cycle hash qualification and failed attempt retained privately.
Reviewed fixture tooling7b717d0 has328 passing source tests.


Current operational identities (3 October) supersede the older examples below:

| Service | Private configuration | Current unit |
| --- | --- | --- |
| Core TLS18443 / OTP IPC | helpers-primary-confirmread14.json | warehouse-fixture-core-vm2026100110-confirmread14.service |
| Switching TLS18444 / OTP IPC | helpers-switch-observe08.json | warehouse-fixture-switch-vm2026100110-observe08.service |
| Disarmed fault TLS18643 | helpers-fault-renew04.json | warehouse-fixture-fault-vm2026100110-renew04.service |
| Original API30 emulator | native-config0110-confirmread14.json | warehouse-fixture-emulator-vm2026100110-01.service |
| Read-only monitor | monitor27-config.json | warehouse-vm-campaign-monitor-20261001-27.service |

Private root: /home/jay/warehouse-install-private/vm-campaign-20261001.
Read-only TLS/IPC/artifact/owned-route health command:

```bash
sg docker -c '/home/jay/.local/opt/node-v22.23.3-linux-x64/bin/node /home/jay/warehouse-install-private/vm-campaign-20261001/runtime-7b717d0/scripts/fixture-soak-preflight.mjs /home/jay/warehouse-install-private/vm-campaign-20261001/native-config0110-confirmread14.json'
systemctl --user show warehouse-fixture-core-vm2026100110-confirmread14.service -p ActiveState -p SubState -p RuntimeMaxUSec -p NRestarts
```

Stop only after actor release: systemctl --user stop followed by the exact owned
unit above; this preserves logs, configuration, state and emulator storage.
Do not restart an expired identity or reuse retired normal11/monitor23 inputs.
A replacement start requires a new frozen private runId/socket/log config,
reviewed supervisor, ownership guards, unchanged12-hour cap and actual TLS/IPC
readiness. The emulator requires its own preserved storage and fresh supervisor
identity, never a wipe/clone or another device's authenticated state.
Production audit26 high paths and full audit54 high paths including development
tooling are distinct; metadata audit8 high. Current full audit also reports
unpatched http-cache-semantics (GHSA-ch52-4w7c-c8xp). Forced major downgrades and
audit waivers were not applied. Exact current-head CI fails these dependency
gates; standalone lint/type/source scans do not establish all-green CI.

Current B fixture/native invoice checkpoint supersedes earlier logged-out state:
API-prepared FXI971/FXI972 and invoice20261031 (8/tax1), B-only fictional monthly
price5/labour2/tax5, with original failed attempts and two failed API sessions
preserved. Native genuine A-to-B invoice denial PASS on unchanged APK10; A is
currently authenticated with new native-approved-a-auth0110-02 session. B stays
rejected/inactive. Admin daily count20: its natural reset16:53:18UTC is after the
16:27:13UTC campaign deadline, so no more administrator OTP requests. No counter
reset or blind old-session cleanup. Source339 fixture tests/lint PASS; final
freeze/soak/expiry and full group closure remain unestablished.

## Installed candidate and staff tooling continuation (3 October 2026)

The owned primary now runs backend application `75a6fb1badeff39b727099d9d67f3c9e84a2cf12` after a consistent private backup. Source replacement preserved identity, credentials, 85 business/auth tables and 17 stored objects except the intended refresh-queue initialization. The original API30 emulator has standalone x86_64 APK2026100311 from mobile application `78fe59284cbd476bd7661d6ae5b0b8b189abb3c4`, SHA-256 `8649a9ea301248d5e314063cb7f567d641639fd2f8164df39b27ede993bce80b`; compiled audits and installed byte read-back passed with app storage preserved. Two failed pre-install controllers remain recorded. This establishes installation, while native workflow acceptance remains incomplete.

Staff-only fixture tooling now admits that exact application/source pair through an explicit candidate binding. Legacy artifact admission remains available for preserved historical cases; wrong hashes, normal package names, changed source pairs, ARM architecture, identities and fourth native attempts are refused. Other capped workflow guards retain their prior admission rules. The role-preparation driver accepts a separately hash-bound, explicitly approved campaign extension while retaining the original campaign file, one-hour stage bound, source/ownership guards and normal authentication limits.

All 365 setup regression tests and the source/history secret scan pass for these tooling changes. A read-only inventory confirmed the reserved account is currently an approved, logged-out supervisor; it must be changed through the normal administrator API before staff acceptance. Administrator and customer A daily/hourly windows have naturally elapsed; their effective budgets are available. No counters were reset and no OTP or session was issued by this inventory.

Next steps remain guarded role preparation, ordinary native staff login and its remaining read attempts, corrected workflow drivers and specifically reopened capped cases, revocation, final readiness, the complete eight-hour soak, and the dedicated natural-refresh-expiry appointment. No soak has started.

The bounded native authentication driver now uses the same hash-bound, authorization-backed campaign extension verifier as role preparation. The original campaign deadline remains unchanged; extension verification runs before any ADB action or attempt creation, with the existing ten-minute authentication limit. Current staff authentication also binds the exact candidate guard module. This tooling change does not rebuild the installed application APK.
