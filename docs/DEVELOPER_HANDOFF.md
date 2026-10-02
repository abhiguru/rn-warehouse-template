# Independent operator mobile handoff

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
