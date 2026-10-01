# Resume after a VM CPU upgrade

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


## Current resume results — 2026-09-30

The operator resumed. Actual allocation is eight guest CPUs; VT-x and usable
KVM are now exposed.17GiB RAM/74GiB free remain sufficient for the measured
checks. Test1 source/private-input preservation and local/public doctor PASS543.
The permission pause interrupted the first544 startup; the resumed KVM/API30/
two-emulated-core OS trial booted25.2s plus120s observation PASS. Retained57/
code3010 passed3cold launches and1804s/29cycles read/navigation/background smoke550
without ANR dismissal, ADB restart or user interaction. Previous ANR failures
remain historical; CPU and KVM changes were not isolated causally.

A new retry blocker was discovered and corrected: numbered GRN/dispatch retries
now retain their canonical complete-body operation key in reviewedb03f197.
Fresh source checks246Jest/42setup/type/lint/Expo/audit/doctor/bootstrap/live-contract
and clean standalone code3012 build/audit/install/readback PASS. Its exact SHA256
is27d9ed96fe1b306610a4e50aedc4f56579bdd1d8c7f93e3a6fe270f070b77108.
Backend guarded relay2bbc681 plus four API/database lost-response cases PASS;
native dispatch before/after retries PASS582, final read-only stock reconciliation
PASS and normal route restoration584. Current3012 native PDF585 and3cold launches/1802.8s/29cycle readiness PASS.
Native receipt faults, dual-CA artifact/native authenticated switching and final
plan remain open; independent switching backend TLS/auth prerequisite passed. The original checkpoint below is historical, not current
service/artifact state. Use OPERATOR_INSTALL_NOTES.md for the current matrix.

## Overnight run now started — 2026-10-01 IST

All required launch gates passed. Actual start00:30:19IST; scoped user unit
warehouse-fixture-overnight-3014.service active/running, PID2141593; first
native block RUNNING with two passed preflights.44input bindings and nine
3200second blocks cover eight hours plus checks. Do not start another UI actor
or edit bound inputs. Backend/tooling9868738, mobile/tooling4867d1a are pushed;
installed app source42/code3014 and backend overlays remain separately recorded.
No completed overnight PASS yet.

Next: inspect that exact unit/private ledger. On failure preserve logs and
reconcile state; no blind rerun. On completion require each verify plus the
aggregate duration/actual requests/business invariants/native session renewal
PASS, then update sanitized operator matrix/PRs and final handoff. Ordinary stop
is systemctl --user stop for that exact unit; no global ADB/fixture shutdown.
The checkpoint below records prelaunch work and is historical.

## Next work at the resumed checkpoint

Current owned emulator has source42a5559b4abcad3ddd7601b2e4885e3c29101c76,
code2026093014/x86_64, SHA256
6e882894ff4a0533b31e755fda6930aad6fea8c875030c083a887d445be5bb17.
Clean build606/exact compiled trust/signature/installed bytes607 PASS;248Jest/
43setup/type/lint PASS604, mobile42 CI36751524355 all4 jobs PASS. Native clear/retype
GRN number and both native receipt response-loss/unchanged retry/database/image
checks608 PASS. Actual private PDF609, clean two-origin authentication/cache/cold
persistence610 and offline/reconnect PASS. Both fixture gateways include exact
DNS258 overlay601; identity/credentials/state preserved. Fresh258 fixture06 full
checks599/same-input preservation605 PASS and state retained stopped. Earlier
3013 timeout/Retry/GRN defect remain failed history;3013 readiness completed
1804.6s/29cycles PASS, not current3014 evidence.

Current3014 three cold launches and1801.7seconds/28cycles readiness PASS.
Rehearse the new
public native/network soak helper without concurrent UI automation, freeze private
plan/APK/source/overlays/identities/CA/helpers, check remaining CA horizon/resources
and launch automatically if all required checks pass. Operator authorized this
conditional automatic start and recommended routine defaults; no further input
is needed. No overnight run/timer started yet. No production/pilot/recovery, real
SMS, physical-device changes, destructive actions, merge or release are authorized
by this scope. Backend current CI retains dependency audit FAIL/dependent jobs
SKIPPED. Preserve hardware/provider/release and unsaved-form/same-origin gaps.

## Paused checkpoint — 2026-09-30

The operator requested documentation, commit/push and a pause before assigning
six total CPU cores to this VM and rebooting it. No reboot or VMware setting
change was performed by the installation agent. The interrupted diagnostic turn
performed inventory and read existing evidence; a new emulator diagnostic had
not started. No overnight run or timer is active.

At pause, Ubuntu24.04.3 x86_64 VMware exposes two CPUs,17GiB RAM and77GiB free
disk. Test1's loopback18000 gateway and dedicated tunnel are active. The owned
fixture03, bridge and emulator are stopped;18080/18443/5556/5557 and the private
fixture IPC socket are absent. Fixture04 is also retained stopped. Persistent
warehouse state, AVDs, APKs, protected inputs, signing material and raw evidence
remain outside Git. Reuse them; do not delete or recreate the installed warehouse.
Private checkpoint paths and hashes are in the operator's protected resume file.

Installed Test1 backend remains
`f18f51d4625e7f8c0d977ac69645804e318a9d49`, with source content unchanged.
Current fixture03 backend actually uses
`c0a6db16a8e6ff23d56a8563703231b2f76b5da4` plus its declared bridge-boundary patch
identical to reviewedee5b493 and isolated subnet10.233.245/24. Its owning checkout
and state must be verified before any fixture start or test mutation.

The retained, installed emulator APK is version2026093010/x86_64, source
`57add4456cf47465771e3962f041928f8d6029d7`, SHA-256
`c642950d24922b89119b9dacf91e0565a04f75f47e83bb3d286af07d12457676`.
Current tested tooling pin is
`b22c3b5ad72f41e9ea936d987aee6b027459ca0e`; its app/config/dependency files match
the built57 source. Main instructions show a clean new build3011, which has not
yet been performed. Later review documentation commits are not installed app
sources. Read OPERATOR_INSTALL_NOTES.md for exact artifact-scoped results.

Invoice239Jest/type/lint,42setup checks, runner regressions, guarded read-only
runner/resume smoke, native invoice/PDF correction and approved local reader
checks have already passed to their recorded scopes. Reuse that evidence unless
inputs or relevant behavior change. First cold launch still failed with SystemUI
ANR; one diagnostic Wait recovery did not close unattended readiness. The exact
ANR cause is not established. Google lists accelerated emulators inside another
VM as unsupported in its [acceleration guidance](https://developer.android.com/studio/run/emulator-acceleration).
Additional CPU capacity is a software-performance experiment, not proof of KVM
availability or a guaranteed ANR fix.

## Historical planned work after explicit resume

1. Refresh host inventory and compare the saved boot ID privately. Verify six
   guest CPUs with nproc/lscpu, memory/disk, effective noninteractive sudo, pinned
   Node22/npm, Docker/Compose/access and current virtualization flags /dev/kvm.
   Do not assume the CPU change also enabled hardware virtualization. The previous
   inventory had no vmx/svm or KVM. Preserve new inventory privately.
2. Verify the installed Test1 source, private state/configuration fingerprints,
   Docker services and dedicated tunnel. Run its local/public doctor and identity
   discovery to establish post-reboot health. Ordinary commands are in the
   backend installation guide and the private handoff. If it fails, preserve the
   error and fix this instance only before starting optional fixture work.
3. Reconfirm exact source/artifact hashes, private state ownership and disposable
   port/socket vacancy. Check certificate horizon before restarting the fixture
   bridge or planning a long run. Current fixture CA expires
   2026-10-01T09:51:45Z. If insufficient for preparation/run/margin, issue new private
   fixture TLS, build/audit/install its matching APK and record a fresh build ID.
   Retain the old artifact/evidence; never bypass TLS.
4. Begin the bounded emulator diagnostic. Leave heavy compilation and optional
   fixture services stopped for the first OS-startup observation. The saved
   launcher uses -cores2. Retain that value for the first six-host-core comparison
   so the changed resource is clear; record a separate -cores4 trial only if
   needed. Do not automatically configure six emulated cores on the six-core VM.
   Record emulator37.1.11/API30/default x86_64, software rendering and exact args.
   Capture host load and Android event/logcat/ANR traces privately before launching
   the warehouse app. Boot-completed alone is insufficient; check the actual last
   current-focus entry and detect any system/app ANR without dismissing it.
5. If OS startup is clean, ownership-check and start fixture03 and its loopback
   bridge. Reapply only the owned emulator's hosts binding and ADB reverse after
   each cold boot, preserving SELinux Enforcing. Verify the retained installed
   APK bytes/version rather than reinstalling an unchanged APK. No physical phone,
   real OTP or production pilot is used by this diagnostic.
6. Establish readiness with the proposed minimum of three consecutive clean app
   cold launches plus a30-minute unattended smoke: controlled navigation, known
   fictional reads and background/foreground, with no ANR dismissal, ADB restart
   or manual intervention. Treat this as a bounded prerequisite rehearsal; stop
   and preserve evidence on failure. A clean rehearsal is not overnight acceptance.
7. Reproduce the corrected build from a clean pinned checkout, audit/install the
   final chosen artifact and bind its source pair, local overlays, CA, identity,
   helper hashes and build identifier into the private test manifest. Complete
   the executable case plan with assertions, timeouts, dependencies, private logs
   and read-only postconditions. Revalidate the runner against those bindings;
   preserve successful case evidence and never automatically repeat a write after
   an interrupted attempt.
8. Prepare guarded before/after-commit fault controls and a separately owned second
   authenticated fictional fixture for dependent cases. Neither is implemented
   yet. Preserve the original core-fixture guard; use no pilot data/routes/tunnel.
   Mark unavailable cases BLOCKED rather than silently skipping or inventing PASS.
9. Perform the final owned-state/health/disk/CA/artifact/routing preflight and the
   bounded suite rehearsal. Launch an overnight run only when its exact scope and
   prerequisites are satisfied and recorded. Deferred/external gates stay open.

The backend dependency-security CI gate still fails at the explicitly deferred
container audit. Physical/current corrected-artifact acceptance, cellular/no-USB,
real CustomerB and other documented hardware/provider/recovery/release gates are
not closed by the CPU change. No merge, release, recovery rehearsal or production
readiness claim belongs to this resume procedure.
