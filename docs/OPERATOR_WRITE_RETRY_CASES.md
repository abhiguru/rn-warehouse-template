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
