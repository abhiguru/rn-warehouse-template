# Warehouse switching acceptance

The reviewed application confirms before discarding local state when a warehouse
changes and clears dispatch rollback data on full reset. Acceptance below is
scoped to each installed artifact. APK 0109 is the current x86_64 fixture candidate,
not a frozen final artifact. See the chronological
[VM acceptance ledger](OPERATOR_VM_ACCEPTANCE_20261001.md) for preserved failures,
source/tooling identifiers and remaining gates. Historical passes do not transfer
to APK 0109 or establish unsaved/in-flight behavior.

## Prerequisites

The older soak completed and released its fixtures; retain its immutable evidence.
Before each bounded stage, verify released-run guards, exclusive ownership,
current artifact hash and the supervised helper/configuration bindings. Follow
[operator build instructions](OPERATOR_INSTALL_NOTES.md#reproducible-local-standalone-test-apk)
for any new candidate. Native builds require 25 GiB free and one heavy build at a
time, with Gradle's two-worker limit. No new final soak has started. Record the
exact source pair, declared overlays, tooling, APK hash/build ID and emulator OS.
Use only owned fictional core/switch fixtures and ordinary fixture authentication.

The genuine same-origin replacement warehouse is separately provisioned with
independent credentials and identity. Its native replacement/return pass is
scoped to APK 0106, with no pending-enrollment state at that time. Preserve both
warehouses and historical logs; use only proven-owned routes. Replacement results
must never be inferred from fabricated discovery or changed database/session
timestamps. Current routes point to the original primary and switching warehouse;
temporary delayed/incompatible helpers were retired with evidence preserved. The current primary normal helper is normal10; consult the dated campaign ledger for its exact config and lifetime.

Build correction652 before replacement checks. Discovery now completes local
cleanup before adopting the new identity. It clears the old access/refresh and
pending-enrollment credentials without sending them to the replacement at that
URL. Ordinary logout and a switch between different origins still attempt
revocation against the old instance. This local replacement cleanup does not
prove revocation on the former server, which is no longer the discovered instance.

## Cases to execute once per affected artifact

The [guarded navigation drivers](OPERATOR_NAVIGATION_DRIVERS.md) provide bounded
same-server, cancellation and confirmed-origin checks. The baseline same-server,
confirmed-switch, switch-back and replacement cases reached their campaign attempt
caps; preserve their exact older-artifact passes and do not create aliases for
additional runs. Distinct cancellation tests for unsaved customer, invoice, GRN and dispatch drafts passed on APK0109 with the ordinary supervisor session. Confirmed switching with those drafts and switching during saves/uploads remain untested. Their missing evidence must not be replaced by the cancellation passes. The installed APK10 has its own acceptance scope; older results do not transfer.

Prepare fictional unsaved GRN, dispatch, invoice and customer drafts through the
supported UI. Record which drafts survive navigation before claiming the switch
preserves or clears them; some forms reset on unmount. Do not submit documents
merely to create these drafts. In-memory rollback reset is covered separately by
the real-reducer regression; native screens do not expose a rollback test command.

| Case | Expected behavior | Verified evidence and remaining scope |
| --- | --- | --- |
| Discover a different server, then cancel confirmation | Display identity and warning; preserve old session and selection | APK 0109 PASS, `stage-cancel-switch-0109-v3`; four separate unsaved-draft cancellation proofs also PASS on APK0109 |
| Confirm a different origin | Clear old drafts/caches, adopt genuine identity and require destination authentication | APK 0108 PASS, `stage-confirm-switch-0108-v3`; no transfer to APK 0109 or unsaved/in-flight cases |
| Select the same origin and instance | Preserve session and selected warehouse without destructive confirmation | APK 0103 PASS, `stage-same-server-0103-v3`; no APK 0109 acceptance claim |
| Confirm a new instance at the same origin | Local cleanup before identity adoption; no old credentials forwarded | APK 0106 scoped PASS, `stage-replacement-cold-0106-v3`; pending-enrollment cleanup and APK 0109 acceptance remain open |
| Save already in progress when confirming | Refuse switch; reconcile original mutation without blind retry | Source tests PASS; native NOT TESTED |
| Discovery transport failure | Preserve current warehouse/session and allow owned route recovery | APK 0109 PASS, `stage-discovery-failure-0109-v1`; storage staging failures remain source-only |
| Genuine compatibility rejection | Reject an independently installed server requiring a newer client | APK 0109 PASS, `stage-compatibility-0109-v1`; genuine server minimum 0.2.0, no selection or OTP |
| Leave selection before delayed discovery completes | Prevent stale preview/alert or selection activation | APK 0109 PASS, `stage-late-discovery-0109-v2`; genuine delayed TLS response |
| Enter selection while an Orders response is pending | Keep selection visible when the genuine response arrives | APK 0109 PASS, `stage-orders-selection-race-0109-v3`; no confirmed switch, save or upload |
| Switch back and cold launch | Restore correct identity and require fresh authentication where applicable | APK 0108 PASS, `stage-switch-back-0108-v3`; no transfer to APK 0109 |
| Cancel switching with unsaved GRN, dispatch, invoice or customer drafts | Preserve supported draft fields through cancellation | APK0109 PASS for all four cancellations; private four-draft-cancellations0109-final-proof.json. Confirmed draft switching remains NOT TESTED |

These nine historical native stage plans and step-log hashes were revalidated on
2 October 2026; private proof `switching-guide-evidence-revalidation01.json`.
This revalidation checks preserved evidence, not new execution. All capped
failures remain in the campaign ledger. Pending confirmed/in-flight cases and final readiness remain
open; do not shorten the final eight-hour soak or bypass its gates.

Keep protected session/database comparisons, screenshots and device identifiers
outside Git. Record PASS/FAIL/BLOCKED/NOT TESTED with the exact case/artifact.
Do not reinterpret compilation, mocked logout or emulator evidence as real SMS,
physical phone, cellular or production acceptance. Preserve failures and saved
transactions; return to the normal owned route and check read health afterward.

Populated API30 integration: settings retains its scroll position when selecting
the same instance returns via router.back(). The driver must verify the visible
Change Warehouse Server settings action, then cold-launch and independently
verify the original session, public persisted selection and an actual Orders200.
Waiting for the off-screen profile header incorrectly fails that return. The
failed attempt remains preserved and its business/auth invariants are checked
before the final permitted corrected rerun.

Current VM-only checkpoint: APK10 is installed and normal-route cleanup/TLS readiness passed. Dependency and native gates remain unresolved; there is no final freeze, new eight-hour soak or dedicated expiry appointment. Server-switch baseline case caps remain closed. Native save/upload failure injection requires safely prepared/reconciled original writes; exhausted positive-write/image prerequisites must not be bypassed with another case name. No unsupported injection or unexecuted workflow is counted as PASS or as three failed attempts.

Confirmed-draft observer preparation on 2026-10-02: the dedicated
`fixture-confirmed-draft-controls.mjs` and `fixture-confirmed-draft-snapshot.mjs`
bind APK10, the real core/switch identities and the reserved supervisor session.
Five source refusal/reconciliation tests passed. Two consecutive actual read-only
snapshots of both populated warehouses matched, including stored-object bytes,
stock movements, users, quotas, enrollment and refresh rotation history. Private
evidence is `confirmed-draft-observer01.json` in the campaign directory. The initial
SQL failure assumed a GoTrue `auth.identities` table; the corrected query follows
the actual custom-auth schema. The failed scripts and database error remain private.

This observer preparation made no native attempt, login, logout or business write.
Its confirmation reconciliation requires one native confirmation, one successful
source logout, no credential forwarding and unchanged destination state before
authentication. Even a successful reconciliation reports draft acceptance
`NOT_TESTED`: ordinary destination login and actual empty-draft UI evidence remain
required. The missing confirmed-draft native driver and those executions remain
open. These modules do not reopen exhausted baseline cases.

Exact-head CI for observer revision `99babd3` exposed three ESLint `no-undef`
errors for the bare `structuredClone` test global. The corrected tests use
`globalThis.structuredClone`; focused tests, complete lint (zero errors) and
typecheck passed locally. The failed CI log remains private. Backend CI for
`071806b9eb2763dc2e147daf992f05b199226c65` completed successfully; its remote
excluded suites do not establish additional VM native or physical acceptance.

The reusable `fixture-ui/confirmed-draft-api30.py` driver now prepares one real
customer, GRN, dispatch or invoice header draft, checks the actual warning and
confirms once. Its `fixture-confirmed-draft-observe.mjs` observer binds exact
source files, UI configuration, original fixture guards, distinct helper
configuration/log identities and log prefixes/inodes. Both bridges must run the
new optional credential-presence observation tooling. All helpers must retain
their 12-hour cap and have sufficient actual monotonic lifetime for the bounded
case. A live listener alone is insufficient. Each case requires a new protected
configuration/directory, an existing ordinary supervisor session, normal route,
the actor lock, actual TLS discovery and the exact installed APK10 hash.

The driver has a ten-minute deadline, no business submit, no OTP, no destination
login, no automatic cleanup and no resume. It requires immediate destination login in the same actual app process, public
selected identity, on-device credential-key absence,
one independently observed source logout and no credential-bearing destination
request before independently reconciling both warehouses and stored bytes. The
credential observer returns only key presence and row counts; values are neither
extracted nor copied. Its actual read-only integration on the original owned
emulator passed (`confirmed-credential-key-observer01.json` private evidence).
Eight focused source/entrypoint/lifetime tests passed, including refusal before
SQL/native/attempt access during an active soak. Native confirmation is still
NOT TESTED: source tests and the credential-presence probe do not close it.

After successful pre-authentication reconciliation, preserve destination login,
selection and the actual app process. A separately guarded ordinary destination
login and actual empty-draft UI checks must run in that same process before any
cold launch; otherwise process death itself could erase the draft and weaken the
switch evidence. Cold persistence and authentication reconciliation then remain
necessary before confirmed-draft acceptance can pass. Fresh normal11/observe08 helpers now include the new switching observation, and
renew04 is explicitly disarmed. Separate helper-transition evidence preserves
old units/configurations/logs and proves actual TLS/IPC readiness and identical
warehouse/stored-byte snapshots. The initial IDLE assertion failure remains
preserved. Original app storage/session are retained; the app is stopped without
logout. No historical attempt or exhausted case was changed or reopened.

Driver preparation correction: before any native confirmation attempt, removed
the immediate post-switch cold restart and added exact before/after process-ID
checks. Source refusal tests reject a process replacement or cold launch before
destination authentication. The earlier frozen tooling is retained; execution
requires a new frozen revision. Fresh helper readiness passed after preserving
the initial IDLE-versus-DISARMED assertion failure and explicitly initializing
only the proven-empty new relay. No native switch, login or logout has occurred.

Destination continuation tooling: `auth-api30.py` has an optional
`confirmedDraftDestinationAuthentication` fixture-only mode. It binds the actual
switching administrator, exact APK10, previous confirmation configuration and
successful pre-authentication reconciliation, current app process ID and fresh
switch helper/IPC identity. One ordinary OTP is requested and entered through
private IPC/ADB stdin; no fixed code or quota reset is used. Before login it must
prove that destination state still matches confirmation and source state is
unchanged. Authentication must add exactly one fixed seven-day session and one
verification, preserve every prior session, and leave unrelated auth, users,
rotation history, configuration, business rows and stored bytes unchanged.

The continuation opens the actual destination form and rejects the original
source draft marker in the same app process. Only after that evidence may it
cold-launch, verify public destination selection and require an explicit fresh
authenticated destination Orders200 from the hash/inode-preserved safe helper
log. Final independent authentication and both-warehouse reconciliation follow.
It never saves a business record, repeats OTP, resumes or cleans up a failure.
Three focused source tests (including native control refusals) and the existing
nine authentication control tests passed. The expanded actual destination SQL,
profile/quota and metadata digests passed read-only integration; private evidence
`destination-auth-readonly-sql-validation01-proof.json` records zero native,
OTP and session-creation attempts. Real confirmation/authentication/draft/cold
execution remains NOT TESTED until the freshly frozen bounded stages run.

Actual APK10 customer draft confirmation attempt 01 reached the genuine
destination login in the original process, with one confirmation, zero business
submissions and zero OTP requests. Its frozen observer refused because it
expected `response-complete`; the installed pinned helper emits `complete`
from the actual HTTP response finish event. The original native result and
runner ledger remain FAIL. A separate read-only corrected reconciliation proved
normal source logout/history removal, unchanged protected source business/auth
and stored bytes, unchanged destination state and no old credential forwarding.
Private evidence: `confirmed-customer-draft0110-01-independent-reconciliation.json`.
The preserved process is awaiting a separately guarded continuation; no
destination authentication or draft-clearing acceptance is claimed. Reviewed
fixture consumers now match the installed helper contract, including its exact
error event names. Eleven focused tests passed after the correction.
