# Bounded fictional-fixture runs

Read OPERATOR_INSTALL_NOTES.md and the backend UNATTENDED_FIXTURE.md first.
This harness is for an explicitly owned disposable fixture. A plan is executable
input, not a security boundary: inspect every command before using it. Never use
a pilot, production state, a physical device serial or real provider delivery.
A runner smoke check does not establish application acceptance.

The operator resumed after the VM change: eight guest CPUs and usable KVM are
verified. [CPU_UPGRADE_RESUME.md](CPU_UPGRADE_RESUME.md) preserves the pause and
current bounded results. Earlier failed ANR evidence is retained; a passed
30-minute code3010 rehearsal is not the full overnight plan.

## Launch authorization for this exercise

The operator authorized automatic launch after current tasks and prerequisite
blockers pass. Use recommended defaults for routine fixture choices. This does
not waive failed readiness checks or authorize production/pilot/recovery access,
real SMS delivery, physical-device changes, destructive actions, merging or a
release. Record the exact plan, bindings, private evidence directory and process
identifier when it starts. If a check fails, preserve its evidence and reconcile
state before retrying; do not launch the long run against a known failure.

Use reviewed backend tooling 7e3f66a34bb729d80e25c6a4a0975f072c05d03a and mobile tooling
c0824db72b73a049f066a2259352c5207e393bb6 for the corrected supervised/observed read
workflow. These tooling commits are distinct from installed APK source42a5559.

## Before preparing a long plan

1. Freeze the exact backend source plus declared local changes, mobile source,
   APK SHA-256/version, emulator identity/API, fixture identity/state, bridge and
   embedded certificate. Preserve these in a private source manifest. Hash the
   manifest, APK and a stable fixture identity file as plan bindings. Include
   helper scripts as extra bindings so changed automation cannot reuse evidence.
   Supervise all three bridges/relay using backend UNATTENDED_FIXTURE.md before
   rehearsal. Record protected unit config/files/logs and exact unit names.
   Foreground terminal dependencies are insufficient for a long run.
2. Complete invoice/native acceptance on that exact artifact. Check the actual
   PDF handoff; a VIEW intent handler alone is insufficient for the app's SEND
   flow. Record compatible reader version and its first-run permissions. On
   this disposable API30 image, verified Librera9.5.7/code7222 receives PDF SEND
   but needs explicit approval for manage-all-files storage permission. The
   operator approved that permission for this fictional-data emulator only;
   this is not authorization for another operator's phone or shared emulator.
3. Check certificate lifetime with prepare-emulator-fixture.mjs
   --check-certificate. WAREHOUSE_FIXTURE_MIN_VALID_HOURS must cover the planned
   run, setup and a safety margin. Compare the APK's embedded public certificate
   with the running bridge. Do not disable TLS validation.
4. Complete a short emulator readiness check: boot, app cold launch, controlled
   UI navigation, foreground/background and a known fictional read. Fail on
   ANR/crash, unauthorized/disconnected ADB, unexpected package or timeout.
   Read the actual last mCurrentFocus entry when dumpsys contains historical
   entries; an earlier matching app entry does not establish current focus.
   Do not automatically dismiss ANRs. A recovered manual session is not a clean
   unattended readiness pass. No-KVM availability is a resource limitation,
   not proof that every emulator failure has the same cause.
5. Review the per-case prerequisites and postconditions. Interrupted writes and
   two-instance authentication need their own guarded controls/second fixture;
   do not replace either case with link-offline or unauthenticated discovery. Use
   the backend FIXTURE_FAULT_REHEARSAL.md for guarded response-loss controls and
   independent database postconditions. Native numbered retries now use the
   complete normalized body key; changing the form after a lost response is a
   different attempt and requires reconciliation first.

## Verified viewer prerequisite on the disposable API30 emulator

The verified package is [Librera9.5.7-fdroid/code7222](https://f-droid.org/packages/com.foobnix.pro.pdf.reader/),
not9.6.17, which failed on this API30 image. Download only to private fixture
storage and compare the official F-Droid index metadata and signing certificate:

```bash
curl --fail --location https://f-droid.org/repo/com.foobnix.pro.pdf.reader_7222.apk \
  --output "$FIXTURE_PRIVATE/librera-7222.apk"
printf '%s  %s\n' \
  b43e0991b7e356231077013667a90420010754681cec55873342229ead610eb8 \
  "$FIXTURE_PRIVATE/librera-7222.apk" | sha256sum --check -
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs \
  "$FIXTURE_PRIVATE/librera-7222.apk"
adb -s "$SELECTED_EMULATOR" shell pm list packages com.foobnix.pro.pdf.reader
# Continue only if this package is absent in the explicitly owned emulator.
adb -s "$SELECTED_EMULATOR" install "$FIXTURE_PRIVATE/librera-7222.apk"
adb -s "$SELECTED_EMULATOR" shell cmd package query-activities --brief \
  -a android.intent.action.SEND -t application/pdf \
  -c android.intent.category.DEFAULT
```

Expected signer SHA-256:
`ea0d90df4dde7b9a9e8eaebe2e8aa47ed13f4df9d77aa64bc99c7ed309d2a84d`.
The APK size is99754068bytes. A hash/signature or handler mismatch is a blocker.
Never overwrite an existing operator reader merely to obtain this version.

Launch the reader once. Its YES prompt opens Android's All files access screen.
This reader needs broad shared-storage access to copy a shared PDF into its
Download/Librera directory. Grant only with explicit approval for the disposable
emulator. This exercise received that approval after automatic review initially
rejected the permission; the initial denial and EACCES attempt remain recorded.
Another operator may instead choose and verify a narrower compatible PDF SEND
reader. The permission is not required by the warehouse app itself.

Return to the warehouse app, use Share PDF, choose Librera FD and Scroll mode.
Verify the displayed invoice number, totals and line parameters against the
saved record; installation/handler discovery alone is insufficient. Preserve
private screenshots and, when checking an export, its hash/text. Do not select
printing, Bluetooth or an external delivery destination in this exercise.
Final code3010 native share/render and reader-copy reconciliation PASS527–529.

## Bounded snapshots for an active OTP countdown on API30

The stock shell `uiautomator dump` returned `ERROR: could not get idle state`
on the verification page with an active countdown, including after dismissing
the keyboard. Waiting until expiry creates a stale challenge. Keep these failed
attempts as failures. Android's shell capture first waits for global idle;
see the [AOSP shell implementation](https://android.googlesource.com/platform/frameworks/base/+/android11-release/cmds/uiautomator/cmds/uiautomator/src/com/android/commands/uiautomator/DumpCommand.java).

For this expressly owned API30/x86_64 fictional emulator, the read-only
`scripts/fixture-ui/FixtureUiCapture.java` uses the existing shell accessibility
wrapper and a bounded root snapshot instead. It refuses another API, a
non-generic device or another active app root. The host must independently verify
its owned AVD, installed APK/hash, actual focus, portrait720x1280 viewport,
SELinux and ANR/crash state. This is an internal Android shell API: other Android
versions are NOT TESTED. It does not change timers, authentication or the app.

Build in a new private directory with the already documented JDK17/SDK36:

```bash
umask 077
mkdir -m 700 "$FIXTURE_PRIVATE/ui-capture"
javac --release 8 -classpath "$ANDROID_HOME/platforms/android-36/android.jar" \
  -d "$FIXTURE_PRIVATE/ui-capture" scripts/fixture-ui/FixtureUiCapture.java
"$ANDROID_HOME/build-tools/36.0.0/d8" --min-api 30 \
  --lib "$ANDROID_HOME/platforms/android-36/android.jar" \
  --output "$FIXTURE_PRIVATE/ui-capture/capture.jar" \
  "$FIXTURE_PRIVATE/ui-capture/FixtureUiCapture.class"
```

Choose an unused `/data/local/tmp/warehouse-fixture-ui-capture.jar` path on that
emulator only; do not overwrite an existing helper. Push the JAR using the
explicitly selected owned emulator, chmod600 and compare remote/local SHA256.
Bind the source and compiled JAR hashes in the test plan. Capture stdout to a
private0600 file, never chat or Git:

```bash
adb -s "$SELECTED_EMULATOR" exec-out env \
  CLASSPATH=/system/framework/uiautomator.jar:/data/local/tmp/warehouse-fixture-ui-capture.jar \
  app_process /system/bin FixtureUiCapture > "$FIXTURE_PRIVATE/ui-raw.xml"
```

Redact phone numbers, numeric challenges and OTP field values before displaying
or archiving a sanitized hierarchy. Poll explicit screen/control assertions with
a deadline; a snapshot alone does not prove loading completed. The OTP input is
intentionally off-screen. Confirm the displayed fictional phone/page, focus its
visible code boxes, then verify the active input method belongs to the fixture
package and is numeric before reading its fresh mock challenge from0600 IPC.
Submit through stdin, never argv/logs. Code3013 snapshot/secondary native verifier
login passed with this procedure; stock idle-wait failures remain recorded.

## Private plan and evidence

Node22 and Linux are required. Put plan/evidence outside Git; own the directory
with mode0700 and plan mode0600. Commands use an absolute executable and cwd,
argv arrays (no implicit shell) and a1..3600-second timeout. Put credentials in
protected files, never argv. Child stdout/stderr stay in mode0600 logs.
Exit0 means the command passed; exit2 means BLOCKED; other exits mean FAIL.
Helpers must assert the expected outcome and return nonzero for skipped or
missing cases. A command that silently skips cannot establish acceptance.

Example schema (replace placeholders, including real SHA-256 values, locally):

```json
{
  "schema": 1,
  "scope": "isolated-fictional-fixture",
  "bindings": [
    {"path": "/private/fixture.apk", "sha256": "APK_SHA256"},
    {"path": "/private/source-manifest.json", "sha256": "MANIFEST_SHA256"},
    {"path": "/private/fixture-identity.json", "sha256": "IDENTITY_SHA256"}
  ],
  "preflight": [{
    "cwd": "/absolute/owned/checkout",
    "argv": ["/absolute/node", "/private/read-only-preflight.mjs"],
    "timeoutSeconds": 90
  }],
  "steps": [{
    "id": "receipt-case",
    "run": {
      "cwd": "/absolute/owned/checkout",
      "argv": ["/absolute/node", "/private/receipt-case.mjs"],
      "timeoutSeconds": 120
    },
    "verify": {
      "cwd": "/absolute/owned/checkout",
      "argv": ["/absolute/node", "/private/read-only-receipt-postcondition.mjs"],
      "timeoutSeconds": 60
    }
  }]
}
```

Implement the read-only preflight using the unchanged backend fixture ownership
validator, local health, exact installed artifact/routing/CA checks, disk/resource
budget and controlled-emulator checks. It runs before the plan and each case.
For a backend-only plan omit Android cases and label its scope honestly. Keep
preflight and verify commands read-only and bounded; do not launch background
services from them. Verification must remain meaningful after later steps.
The harness does not invent business cases or provide a complete overnight plan.

```bash
node scripts/run-fixture-plan.mjs /private/plan.json /private/run-evidence
# Only after reviewing the saved ledger and preserving the same bound inputs:
node scripts/run-fixture-plan.mjs /private/plan.json /private/run-evidence --resume
```

The runner binds the exact plan and input hashes, locks its evidence directory,
records RUNNING before a write and stops on FAIL, BLOCKED, timeout or failed
postcondition. It limits the sum of command timeouts to24hours. OS/process-launch
failure or abrupt host loss may leave a RUNNING record/lock; that is not PASS.

Resume rechecks prior successful postconditions and evidence hashes without
repeating successful writes. A failed/interrupted write is refused on resume:
inspect whether it committed, preserve the old ledger, and create a separately
reviewed corrective plan with fresh evidence. Do not edit the old result to PASS
or delete its logs. A stale lock requires confirming the recorded process and
its children are stopped before removing that specific lock. Never automatically
remove a lock or globally kill ADB/emulators to resume. Previously passed cases
remain historical evidence, not new test executions.

## Preparing the current eight-hour native read plan

New optional tooling is in `scripts/fixture-ui/soak-api30.py`,
`scripts/fixture-ui/verify-soak-summary.py` and `scripts/fixture-soak-preflight.mjs`.
Backend review helpers are `scripts/fixture-soak-database.mjs`,
`scripts/fixture-soak-http.mjs` and their pure observation module. Keep a separate
checkout of the reviewed tooling and record its exact pushed commit. It is not
the APK's source commit and does not modify the installed app. Bind every helper
and imported module in the plan.

Complete the preceding native gates first, using unused reserved fictional
receipts FXF301/302 quantity4 each and unchanged retries. Do not run those writes
again if evidence/state already exists. Before/after dispatch evidence on3012
stays3012. The read plan checks reserved FXF101/102 stock7, FXF200 stock6 and
FXF301/302 stock4; this is a prerequisite layout for this exercise. A fresh
operator must prepare and reconcile those cases before capturing a baseline;
never weaken the guard to make a differently populated warehouse pass.

The item suggestion on this API30 viewport displayed visually but reported
inverted accessibility bounds. Preserve the failed accessibility assertion.
Inspect a fresh screenshot/focus and select the actual visible suggestion, then
verify the selected item. Do not globally loosen bounds checks. For the system
multi-file image picker, taps did not select the fictional file in this attempt;
use Tab until the actual focused node names the expected file, then Enter.
Verify the uploaded image and final confirmed WebP/private Storage object.
These are specific automation limits, not general Android accessibility acceptance.

Create a0700 privateRoot and results directory and a0600 config outside Git.
Use an absolute path for every value below. `emulatorInputs` must be private JSON
with `createdOnlyForUnattendedFixtures=true`, the selected emulator serial,
`artifact` (package/source/path/sha256/versionCode), and the previously validated
`uiCapture` metadata (api30, viewport[720,1280], jar/local hash/remotePath). Never
print that file or commit its serial. The source manifest records actual backend
HEADs, every overlay/hash and independently created state/identity/CA.

Config fields:

| Field | Required value or purpose |
| --- | --- |
| scope | isolated-fictional-fixture |
| privateRoot / results / emulatorInputs | Private directories and metadata path |
| versionCode / apkSHA256 / mobileSource | Exact installed/audited APK values |
| adb / node | Absolute installed executable paths, Node22 |
| backendCheckout / backendState | Owning core fixture checkout/private state |
| secondaryBackendCheckout / secondaryBackendState | Separate switching fixture checkout/private state |
| primaryCA / secondaryCA / faultSocket | Independently audited certificates and protected relay control socket |
| databaseHelper / httpObserver | Exact reviewed backend read-only helper paths |
| businessBaseline | Private snapshot captured below |
| nativeSessionId | Private actual native session ID, matched to the fresh login time window |
| orderLabel / invoiceLabel | Exact expected loaded native labels from the prepared fictional data |
| startRecord | New private0600 start record, created only at actual launch |
| managedUnits | Object with core, switch and fault names from the persistent fixture supervisor |
| prerequisites | Current artifact audit, two native receipt results, current PDF, clean switching, completed readiness and short-helper rehearsal JSON paths |

Export owning paths explicitly for backend observer commands. A review checkout
may contain tooling but does not own the running fixture. The first invocation
from the review root correctly failed the ownership check. These tools require
WAREHOUSE_FIXTURE_CHECKOUT and import its unchanged validator; no guard bypass:

```bash
export WAREHOUSE_STATE_DIR="$OWNED_CORE_STATE"
export WAREHOUSE_FIXTURE_CHECKOUT="$OWNED_CORE_CHECKOUT"
export PATH="$NODE22_BIN:$PATH"
node "$BACKEND_TOOLS/scripts/fixture-soak-database.mjs" snapshot "$PRIVATE/business-baseline.json"
node "$BACKEND_TOOLS/scripts/fixture-soak-database.mjs" session "$PRIVATE/native-session-baseline.json"
```

SQL uses an explicitly read-only repeatable-read transaction. Locally identify
the one native administrator session created within the actual fresh native
login window, save its ID in the private config and confirm its fixture identity.
The long run performs no OTP request or login; it must keep that session alive.
The final verifier requires unchanged OTP verification count/session IDs and at
least four observed refresh-credential rotations across the nine blocks. This
proves observed session renewal; it does not alone establish revoked-session or
every expired-token case. Do not infer successful fresh reads from cached tabs.

After the30-minute rehearsal finishes and no other UI automation is running:

```bash
python3 "$MOBILE_TOOLS/scripts/fixture-ui/soak-api30.py" "$PRIVATE/config.json" run rehearsal 60
python3 "$MOBILE_TOOLS/scripts/fixture-ui/soak-api30.py" "$PRIVATE/config.json" verify rehearsal 60
sg docker -c 'node /ABSOLUTE/MOBILE_TOOLS/scripts/fixture-soak-preflight.mjs /ABSOLUTE/PRIVATE/config.json'
```

Replace the two literal absolute paths locally. Bind the short result as a
prerequisite. An initial copied preflight socket variable shadowed config and
failed; the extracted bounded read-only socket helper/regressions fix it. A
second actual preflight exceeded Node's default1MiB stdout buffer on retained
Android events (ENOBUFS at1060581bytes). It now uses an explicit8MiB ceiling;
full ANR/crash checks remain. Both failures are retained; no logs were cleared.

Make a new private schema1 plan using the schema above. Its nine steps are
soak-01 through soak-09, each invoking the public Python helper `run` with3200
seconds and `verify` with the same ID/duration. Use timeout3500 for run and120
for verify. Each block has one cold launch, force-refreshes Orders, independently
observes a new actual Kong Orders RPC200, reads invoice20261005/net173/tax9/
surcharge2.5/total182, cycles Home/foreground, checks ANR/crash and reconciles
reserved stocks/business counts/saved invoice. No business write is repeated.
Add a final step running verify-soak-summary.py, with the same command as its
read-only verify. The nine durations sum to eight hours; checks add some overhead.
Use a180-second preflight before each step. Bind config, APK, source manifest,
identities, CA files, runtime Compose files, original guards, backend observers/
parser, fixture-service-health.mjs, fixture_observation.py, supervisor/source/unit
files and infrastructure config, snapshot source/JAR, all public plan/soak/preflight
helpers/imports and
prerequisite/baseline evidence. The existing runner validates summed timeouts
below24hours and stops at the first failure.

At actual launch, create0600 startRecord containing started UTC and
plannedEndMillis = start time +10hours. Preflight validates remaining planned
window plus one hour of CA margin; before start it requires10hours. Never reuse
an old start record to make an expired certificate pass. The preflight and every
native health cycle require all three explicit managedUnits active/running,
Restart=no, NRestarts=0 and KillMode=control-group. An absent dependency is a
failure, not cached-UI acceptance. RPC observation now distinguishes missing
requests (WAIT) from observer/ownership/auth/server failures (FAIL). Failed network
observations retain only bounded nonsecret categories, counters and the UTC
window; child output is never copied into public or native result logs. Keep owned fixture
services/bridges/emulator running. Start only the new reviewed plan, using an
unused scoped user systemd unit with no automatic restart and private logs:

```bash
systemd-run --user --unit=warehouse-fixture-overnight-YOUR_ID \
  --property=Restart=no --property=UMask=0077 \
  --working-directory="$MOBILE_TOOLS" \
  "$NODE22_BIN/node" scripts/run-fixture-plan.mjs "$PRIVATE/plan.json" "$PRIVATE/run-evidence"
systemctl --user status warehouse-fixture-overnight-YOUR_ID.service
```

Record actual unit/PID/plan hash/start and verify the ledger is RUNNING before
reporting started. Do not count a scheduled command as a started run. If the
unit exits, inspect its private ledger/child logs. The completed ledger and final
summary must both PASS; elapsed time alone is insufficient. Ordinary stop is
`systemctl --user stop` for that exact owned unit; preserve interrupted evidence
and reconcile before any new plan. It does not stop Test1 or other services.

## Current gate status — actual launch

Exact source42a5559/code3014 clean build/audit/readback607, native clearing-number
regression/two receipt loss-retry-image cases608, actual private PDF609, clean
two-origin verifier/cache/cold persistence610 and offline/reconnect PASS. Final
3014 readiness1801.7seconds/28cycles/three cold launches and exact-helper60second
rehearsal/verify PASS.64backend units/45mobile setup/public preflight PASS612.
The original relative-guard/socket-shadow/default-buffer failures remain retained.

The scoped supervised run actually started2026-10-01T00:30:19IST. Unit
warehouse-fixture-overnight-3014.service is active/running(PID2141593), first
block RUNNING after two PASS preflights. Tooling pins9868738/4867d1a were pushed
and remotely verified; APK still42/source3014. PlanSHA256
5ab3825ba7445a2d279d422d5eea24679b7369fd7e80f14c0c40b5004fadecf5 binds44
inputs; nine3200second blocks plus final native-session/business reconciliation.
No timer or automatic restart;10hour maximum. This is current RUNNING evidence,
not a completed overnight PASS. Next inspect each block/private runner ledger
and require the final summary. Preserve all failures before any reconciliation.
Earlier3013 failures/readiness and3012 dispatch/PDF/readiness retain their
actual artifact scope. Physical/cellular/provider/revocation/unsaved-form/
same-origin and release gaps remain separate.

## Current overnight status — 2026-10-01: FAIL, stopped

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
