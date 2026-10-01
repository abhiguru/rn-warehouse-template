# Post-soak native write reconciliation

Preparation638, 2026-10-01. This is a test specification and a pure evidence
validator, not an executable native suite or a current native PASS.
Use this sequence after the [next acceptance plan](OPERATOR_NEXT_ACCEPTANCE.md)
releases the emulator. Keep all existing successful and failed transactions.

## Prerequisites and order

1. Require the completed nine-block soak and final reconciliation ledger, matching
   frozen plan hash, and an inactive successful owning unit. Use `assertReleased`
   from `scripts/fixture-session-guards.mjs` before any ADB, database or relay
   operation. A stopped or failed run alone does not authorize a next case.
2. Audit the exact new APK and installed hash; bind the private case to its
   instance UUID, backend/source overlays, artifact hash and driver hash. Run the
   unchanged backend `tests/operator-fixture.mjs` owning guard. Never use Test1,
   the live pilot or another instance's credentials for fixture cases.
3. Allocate a new private evidence directory and previously unused reserved
   `FXF` document numbers. Read the database to prove absence before preparing
   writes. Example numbers in unit tests are not an allocation or an absence
   check. Do not reuse historical FXF201/202/301/302/303 transactions.
4. Follow backend `docs/FIXTURE_FAULT_REHEARSAL.md`: set the owned reverse route
   to the fault relay **before cold launch and before creating the draft**.
   Changing the route after preparing a form can leave an existing connection
   bypassing the relay. The prior FXF301 failed injection and saved receipt stay
   preserved; do not retry it to obtain a cleaner result.
5. Prepare a one-line positive integral-quantity receipt or partial dispatch using
   fictional data. Snapshot document/line UUIDs, quantity, stock, invoice count,
   idempotency result and unrelated business-data digest. The dispatch prerequisite
   is separately owned stock sufficient for the requested quantity. These reserved
   dispatches calculate an invoice but do not persist one through `save_invoice`.
6. Arm the exact record/RPC once. Submit normally through native UI and require
   both its error and the actual matching relay drop event. `ARMED` plus native
   success is a failed fault injection, even if the business write succeeded.
7. Before touching Retry, independently read committed state. Before-upstream loss
   must preserve the full absent baseline including no cache entry. After-success
   loss must show exactly one header/line, correct stock delta, and one cached
   successful response bound to that header. Save this evidence before continuing.
8. Retry the unchanged form once and observe the **retry request's own key**.
   Require the same key, native success, exactly one committed operation and cache
   result. For after-success loss, header/line UUIDs and the full committed snapshot
   must remain identical. A changed form/key is a new operation, not a retry.
9. Save final read-only reconciliation, disarm the relay, restore the normal route,
   cold launch and check health. Preserve evidence if any stage fails; do not
   automatically replay a write, create a replacement document or hide a failure.

## Small blocker found before unattended execution

The existing relay's `status` retains the first dropped request's key. Historical
private native helpers compare that retained key again after retry; this alone
cannot independently establish the second request used the same key. Their saved
transaction/stock/cache evidence remains historical evidence, but do not treat
that comparison as a separate wire observation of the retry.

**Source correction639: backend commit0dc7392 adds bounded, redacted retry-request
observations. Relay tests17 and full backend tests80 PASS. Deployment and native
adapter integration remain BLOCKED until exclusive fixture access.** Record only the matching fictional RPC/document/key
and ordering, never authorization headers, complete bodies or OTPs. Test that
changed keys and unrelated requests cannot satisfy the observation. Install any
relay change only after the active soak releases its infrastructure. The current
running relay and its source bindings have not been changed by this preparation.

Native draft preparation, SQL snapshot adaptation, deploying the reviewed observer, exclusive
case runner and cleanup integration still need implementation/validation. The
pure validator does not acquire locks, inspect a device, authenticate, query SQL,
change a route, arm faults or authorize any write. Callers must provide actual
observations, not expected values filled into evidence fields.

## Source checks and evidence shape

Run with the documented Node22 toolchain:

```sh
node --test scripts/fixture-write-reconciliation.test.mjs
npm run test:setup
```

`scripts/fixture-write-reconciliation.mjs` exports `writeBaseline`, `lossEvidence`
and `retryEvidence`. Its unit fixtures define the precise evidence shape. Snapshot
`unrelatedBusinessHash` must exclude only the reserved operation's expected rows
and affected stock; its SQL definition must be reviewed with the future adapter.
`requestObservations` must come from the relay's separate `observations` command,
not a repeated `status` read. Before retry it must be empty without overflow;
after retry it must contain exactly one sequence1 observation for the bound
RPC/document/drop state/key with `sameKey:true`, without overflow. A MATCHED-state
concurrent request, extra retry or changed key fails the predicate.
The one-line/integral case restriction is deliberate; fractional/invalid quantities,
concurrent mutations, image retry and offline-before-submit need separate cases.

Seven regression tests cover both RPCs and loss phases, occupied records, untriggered
or mismatched faults, unexpected first commits, duplicate cache/stock changes,
missing/changed retry keys, changed forms/artifacts and replacement document IDs.
PASS of these source checks does not prove native reconnect or exactly-once
behavior in the installed app. No current business case was rerun in preparation.

Preparation639: mobile setup63/63 PASS. The source validator consumes the independent
observation envelope, including the empty pre-retry boundary. No live relay was
replaced and no native write case ran. Backend observer source0dc7392 remains a
review candidate until post-soak installation and exact-artifact native validation.

## Read-only partial-dispatch adapter640

`scripts/fixture-dispatch-observe.mjs` now prepares database observations for
**direct partial dispatch only**. It does not prepare forms, arm/disarm the relay,
retry writes, verify an installed APK, perform native actions or aggregate a case
PASS. The SQL adapter is source-reviewed against the recorded backend schema;
actual SQL execution against a released fixture remains NOT TESTED.

Create a private0600 JSON config under an owned0700 directory outside Git, with:

| Field | Required value |
| --- | --- |
| scope / kind | `isolated-fictional-dispatch-observation` / `dispatch` |
| record / sourceReceipt | Separate reserved `FXF` numbers (2–5digits), independently checked unused dispatch and owned source receipt |
| stockLineId / instanceId | Exact private source-line UUID and owned fixture instance UUID |
| quantity | Positive integral quantity strictly less than source stock |
| sourceQuantity / sourcePackageMark | Exact original receipt quantity and package mark (empty string if absent); the reserved receipt must have exactly one line |
| phase | `before-upstream` or `after-upstream-success` |
| artifactSHA256 | Exact audited installed artifact hash; the native runner must independently verify it |
| fixtureGuardSHA256 | Hash of the unchanged owning backend `tests/operator-fixture.mjs` |
| backendCheckout / backendState | Absolute paths to the owning isolated fixture checkout and state |
| faultSocket | Absolute protected socket path for the reviewed relay with observations support |
| caseDirectory | New existing owned0700 directory for this attempt, outside Git |
| priorRunUnit / priorRunLedger / priorPlanSHA256 | Completed successful soak unit, private ledger path and exact frozen plan hash |

After the release guard, artifact/transport checks, fixture ownership and exclusive
case lock have passed, run through the same effective Docker access used by the
fixture. Use absolute Node22 and config paths; keep command output private:

```sh
node scripts/fixture-dispatch-observe.mjs /absolute/private/case.json guard
node scripts/fixture-dispatch-observe.mjs /absolute/private/case.json baseline
# Native driver prepares the unused form, arms and submits once, observes error.
node scripts/fixture-dispatch-observe.mjs /absolute/private/case.json after-loss
# Validate lossEvidence with actual UI evidence BEFORE allowing unchanged retry.
# Native driver retries once and records actual success plus unchanged form proof.
node scripts/fixture-dispatch-observe.mjs /absolute/private/case.json after-retry
# Validate retryEvidence and preserve the complete case before cleanup.
```

Each phase saves its own exclusive-create0600 JSON; an existing file is never
replaced. Output `PASS` is explicitly scoped `readonly-observation-only`, not a
native/business-case result. The adapter checks unchanged relay status and
observations around one repeatable-read, read-only SQL transaction (10s statement
limit/15s child timeout). It never places the database password in argv or prints
raw database/transport failures. Never substitute expected UI booleans into the
saved evidence merely to make a predicate pass.

`sourceBound` proves the stock line belongs to the reserved, undeleted receipt;
`wrongStockLines` must remain zero. The unrelated-business digest includes complete
receipts and every receipt-line field except the selected stock value, other
dispatches/lines, all invoices/lines, orders/items, auto-invoice errors and Storage
object metadata. Only the target dispatch/lines and selected stock value are
excluded. It does not claim coverage of all database tables, authentication,
Storage bytes or images; those require separate evidence. Target cache lookup
matches the observed key or the target header UUID, and verifies the dispatch RPC
and cached header. Do not use this direct partial-dispatch adapter for cart-driven
writes, final depletion, receipts or image mutations.

Validation640: three new input/stock/SQL-construction regressions; setup66/66 PASS.
The real CLI with a deliberately nonexistent backend path refused the active soak
as BLOCKED before backend import, socket/SQL access or output-directory creation.
That guard config is marked TEST ONLY and must never become a live case config.
Native draft driver, independent artifact/transport binding, exclusive orchestration
and actual SQL/native integration remain pending. No warehouse transaction ran.

## Native draft preparation641 (source only)

`python3 scripts/fixture-ui/dispatch-draft-api30.py /absolute/private/case.json`
prepares a single direct dispatch draft and leaves its review open. The config
above additionally requires `soakConfig` (private owned-emulator config used by
the source soak helpers) and `artifactAudit` (private PASS audit for that exact
APK). Use the current reviewed scripts and a newly built/audited APK including
the Create Dispatch, Save dispatch item and Dispatch quantity accessibility labels.
The old installed e217 APK does not establish this driver's acceptance.

The fixture must already have an authenticated administrator, the named fictional
customer Backend Test Customer A, supervisor Core Demo Administrator, Backend
Test Potatoes and the privately bound single-lot reserved receipt. Prepare stock
through ordinary guarded fixture APIs separately; this driver does not issue
sessions, request OTPs, seed stock or create a warehouse. The native lot's original
quantity/package mark must match the SQL baseline. The future integrated runner
must verify public transport identity and freeze all sources before execution.

After the release guard, the driver takes the same actor lock as session tests,
checks emulator ownership/API30/SELinux, installed APK SHA and normal reverse route,
and requires the authenticated tabs screen. It records a read-only baseline,
force-stops only the owned fixture app, sets443→18643, cold launches and fills a
new draft using exact native labels. No selector fallback, duplicate-control guess,
blind tap or Submit action is permitted. The three-step form uses the existing
Save dispatch item action before navigating to Review.

`after-draft` observation requires DISARMED/empty relay observations and the same
business snapshot as baseline. Output PASS means **non-submitting draft preparation
only**. On success the relay route remains selected and the draft stays open for
the future guarded submission runner. The lock is released when the process exits;
that runner must reacquire exclusive ownership and verify the unchanged draft,
route, artifact and baseline before arming. Do not start this standalone stage
and assume it is a complete unattended write case.

On failure, retain the private result and existing draft. If changed by this driver,
the reverse route is restored to18443; no draft discard, automatic resume or
business retry occurs. Raw UI XML/text is not saved; only a private label digest
and fixed phase/category results. The label digest is preparation evidence, not
proof of an unchanged request payload across a later retry.

Validation: source setup67PASS (including four Python selector boundary tests),
253Jest tests/39suites PASS, typecheck PASS, lint0errors/1468existingwarnings,
Python syntax PASS. Actual driver invocation with sentinel ADB was BLOCKED before
ADB/route/lock/output directory access while the soak ran. No native screen/form
execution or released-fixture SQL run has occurred. Selector visibility, scrolling,
keyboard behavior and complete UI-to-SQL integration remain NOT TESTED. Stop and
record any native mismatch before correcting the reviewed driver; never silently
patch a running case.

## Bounded native submission runner642 (prepared, not executed)

After a new audited APK and the reviewed relay are installed on the released
fixture, the prepared next stage is:

```sh
python3 scripts/fixture-ui/dispatch-case-api30.py /absolute/private/case.json
```

Use the **same unchanged private config** as draft preparation. It now needs
`toolingSHA256`, a map of relative script names to SHA-256 values. Freeze the exact
12 entries listed by `required` in the runner before preparing the draft: the
observation/snapshot/verification/reconciliation/session-guard modules, both
native drivers and their control/cleanup modules, soak helper and observation decoder.
The runner verifies all bindings before ADB and before each submission. Do not
edit config or scripts between preparing and submitting a case. Record the source
pair, actual APK audit, declared fixture overlays and backend guard hash too.

A successful draft must be less than15minutes old, match config/driver hashes and
have its review digest unchanged. The runner reacquires the common actor lock,
creates an exclusive `case-started.json` marker, rechecks emulator/API30/SELinux,
installed artifact SHA and443→18643, then verifies discovery over both18443 and
18643 with the pinned CA, hostname and expected instance UUID. All sockets connect
to loopback; no external DNS/production backend is queried. A new `pre-submit`
read-only snapshot must equal baseline before arming the one-shot fault.

The runner opens the app's confirmation and requires the exact reserved dispatch
number and **one item** in its confirmation message. It persists an attempt marker
before tapping Submit. After the native Error, it saves independent relay/database
observations and runs `fixture-dispatch-verify.mjs ... loss`. Only a PASS permits
one unchanged-form retry. The retry requires the same review digest, another exact
confirmation, native Dispatch Created Successfully, independent subsequent-request
observation and `... retry` database reconciliation. There is no third submission,
form edit, session issuance, new operation-key generation or failed-case resume.

The verifier reads only designated native booleans from UI evidence; UI files
cannot overwrite database snapshots or relay observations. The runner never
constructs a successful database result from an expected value. `case-started.json`
always blocks another invocation; inspect and preserve uncertainty instead of
removing that marker to retry. Read-only reconciliation can be performed separately.

Before cleanup, private relay status/observations are saved, then disarm and
restore443→18443 are attempted. Cleanup failure makes the result FAIL. The runner
does not discard or cold-launch an uncertain draft/write. After successful cleanup,
a separate normal-route cold launch/read-health check is still required before
another case. This driver is not an eight-hour plan and is not scheduled to run.

Validation642: setup68PASS includes four new Python confirmation/two-attempt guard
tests; Python syntax PASS. Its real entrypoint with sentinel ADB returned BLOCKED
before ADB, locks, attempt markers, socket/SQL access during the active soak.
Actual SQL, pinned discovery integration, native selectors, transport fault/retry
and cleanup execution remain NOT TESTED. The runner's source preparation closes
the missing-runner implementation task, not the installed-artifact acceptance gate.

### Cleanup ownership correction643

Source review of642 found that an early native guard failure could reach cleanup
before the runner had proved ownership of443→18643. Cleanup now requires an exact,
single route row and rechecks it immediately before restoration and afterward.
A missing, duplicate, changed or prefix-similar route is refused, not overwritten.

Control evidence must be saved before disarming. Only this case's exact record,
phase and dispatch RPC may be disarmed. If control is unknown, evidence cannot be
saved, another case owns the fault, or the relay reports MATCHED/in-flight, preserve
both control and route for reconciliation and mark FAIL. Do not blindly disarm or
reroute a request that may still commit. An operator may later inspect the saved
case and perform deliberate recovery within fixture ownership boundaries.

The frozen source map now has12entries, including
`fixture-ui/dispatch_case_cleanup.py`; generate it before preparing a fresh draft.
Validation643: setup69PASS, including seven mocked cleanup scenarios and one new
exact-route boundary test; Python syntax PASS. Mocks cover preservation failure,
control/route errors, unverified ownership, changed routes, another record and
in-flight work. These tests perform no real ADB/SQL/network operation and do not
replace native fault/cleanup acceptance, which remains NOT TESTED.

### GRN keypad labels646

Include the current GRN picker accessibility changes in the next APK. The draft
driver uses `Use GRN prefix FXF` and `Enter GRN digit N`, not bare digit text,
because prefix counts can duplicate keypad digits. Preserve strict ambiguity
failure; do not fall back to coordinates or choose the first matching number.
Source setup69/typecheck/targeted lint pass; actual Android exposure is NOT TESTED.
Recompute frozen source hashes before preparing the next fresh case.

### Scratch SQL compatibility647

The generated query now has a PASS against a separate network-disabled PostgreSQL15.8
scratch database; [reproduction instructions](DISPATCH_SQL_ADAPTER_CHECK.md) include
isolation and cleanup. Baseline/commit/cache/stock shapes and negative predicates
were checked; reused state was refused. This reduces SQL-syntax uncertainty but
does not close released-fixture CLI, complete-schema/RPC/RLS or native integration.


## VM-only campaign integration checkpoint

The new 2fb/code2026100102 x86_64 fixture APK passed exact compiled audit and
owned API30 installation/readback. Clean bed4 installation, ordinary native
administrator login and independent reserved-stock preparation passed. The
actual guarded dispatch observer now passes a baseline against this populated
complete-schema fixture, closing that prerequisite in its executed scope.

The first non-submitting FXF411 draft failed at customer selection: the native
picker exposes an EditText, a semantic Button and its child TextView with the
same customer name. Its private after-draft snapshot equals baseline, proving no
business change; the owned normal route was restored. Failed UI evidence is
retained. The corrected selector explicitly requires the customer result's unique
Button role; it still refuses two Buttons and does not choose a fallback control.
The regression reproduces the earlier failure and passes after correction.
A new attempt requires fresh config/source hashes and a separate evidence directory.
Native lost-response/retry acceptance is still pending at this checkpoint.

The populated API30 draft integration also exposed the real GRN picker's
single-character prefix and automatic first available lot selection. The bounded
reserved-receipt driver now uses that prefix and requires the exact untouched
quantity/stock label and item before entering a quantity. Earlier draft failures
remain preserved; no submission occurred in either attempt.

The first bounded lost-response dispatch case reached its real confirmation
dialog, then refused the duplicated Submit Button/child-text label before the
write. Its relay and independent business/stock/cache evidence showed no request
or change. That case remains BLOCKED after two corrected campaign reruns. The
confirmation selector now requires the exact native Button for Submit/OK and
continues to refuse competing Buttons; independent reserved cases use new bindings.

The separate after-commit integration produced the injected native network error,
one successful dispatch, stock 20→17 and one cached result. Its observer stopped
before retry because the source receipt audit timestamp changes when dispatch
updates out_of_stock. A read-only reconstruction changing only that timestamp
exactly reproduced the preserved pre-write hash. The committed document is
preserved and the stopped runner is not resumed. Future fresh cases omit only
that selected receipt's updated_at from the unrelated hash; all other receipt
fields and all other receipts remain included. This evidence does not establish
a successful unchanged retry for that stopped case.

A populated vehicle-history fixture exposes GhostTextInput's suggestion over the
input. Tapping that inspected input can accept the exact desired suggestion and
blur. Draft preparation now checks the unique labelled EditText's exact desired
value after the tap before deciding whether typing is needed; otherwise its
focused-field gate remains mandatory. No arbitrary suggestion is accepted.
