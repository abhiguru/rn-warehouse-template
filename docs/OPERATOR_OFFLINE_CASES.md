# Offline and reconnect acceptance

Corrections650–651 address startup connection-state ordering and cancellation of
the offline banner's hide animation. Their source regressions pass. Current
native offline submission, rapid reconnect and new-artifact acceptance remain
**NOT TESTED**. The active read soak and response-loss tests do not close them.

## What an operator should expect

The app shows **No internet connection** when its network monitor reports offline.
This describes the device connection, not warehouse API health: a connected Wi-Fi
network can still have an unreachable warehouse. A failed network-status check
leaves reachability unknown until a later event; it is not proof of connectivity.

GRN and dispatch forms currently submit directly to their services. They do not
implement a durable offline submission queue. A failed submit returns an error;
the hook does not clear the form on failure. Keep the form open while recovering
the connection: drafts are not persisted across app restart, and some forms reset
on navigation. Reconnecting alone is not an instruction to resubmit a document.
If a request may have reached the warehouse, inspect saved records and reconcile
stock before an explicit unchanged retry. The same numbered GRN/dispatch body
has a stable idempotency key; changed fields produce a different key. Do not edit
an uncertain operation and assume it is the same retry.

The shared QueryClient has an automatic mutation retry default, and an exported
`useDeleteDispatch` hook inherits it. Source search at3dc2023 found no mounted
consumer of that hook; the current dispatch-detail screen calls its service
directly. This is a separate source-hardening item before enabling query-based
writes. There is also no native NetInfo-to-QueryClient online-manager bridge;
its reconnect option alone does not establish working native reconnection.
Do not use those unused query hooks as evidence that current document forms queue
writes. Order Realtime and the offline banner use the network hook directly.

## Post-soak test sequence

Use the [guarded navigation/offline drivers](OPERATOR_NAVIGATION_DRIVERS.md)
for source-prepared Orders and no-image partial-dispatch cases. Their active-run
refusal checks PASS; complete-schema/native integration remains NOT TESTED.

1. Release the fixture under the [acceptance plan](OPERATOR_NEXT_ACCEPTANCE.md).
   Preserve all nine blocks and final aggregate before changing the emulator.
   Build/audit/install a new APK containing650–651 and record the source pair,
   overlays, artifact hash/build ID and emulator OS. Keep physical-phone and
   cellular acceptance separate. No live pilot, recovery host or real SMS.
2. Use fresh reserved fictional document numbers and stock owned by the fixture.
   Save private baseline document/stock/cache/session comparisons. Prepare a
   valid GRN or dispatch through the UI while connected; do not submit yet.
3. Disconnect only the selected emulator's network through supported controls.
   Verify the native connection state, visible banner and an actual failed
   warehouse read. An ADB reverse route can keep a loopback fixture reachable:
   airplane mode or a banner alone does not prove requests are blocked. If this
   topology cannot establish a real network disconnect, mark that case BLOCKED
   and test an owned-route/backend outage as a separately named case. Do not
   remove an unowned route or stop a shared service to manufacture a failure.
4. Confirm submission once. Record the resulting UI error and preservation of
   the complete form. Use a bounded observation window and preserve an unresolved
   spinner/request as FAIL or BLOCKED; do not tap repeatedly to obtain progress.
   Verify no document, stock or idempotency-cache change when no request arrived.
   If a request did arrive, treat the outcome as uncertain and reconcile it using
   [write retry cases](OPERATOR_WRITE_RETRY_CASES.md), not as a zero-write pass.
5. Reconnect, leave the form untouched and observe for at least30seconds. Verify
   the warning clears only after the connection event, a real read succeeds and
   no business write occurs without another explicit submission. This is a
   bounded no-replay observation, not a guarantee about every future timer.
6. After reconciliation, make one explicit unchanged retry where safe. Require
   exactly one document and the expected stock/cache result. Record whether
   images were included: document success does not establish upload recovery.
   A pending or uncertain prior request blocks another write.
7. Exercise a quick disconnect/reconnect/disconnect while the banner is hiding.
   It should remain present during the last offline state without disappearing
   and restarting. Then reconnect normally and verify it hides, Orders refreshes
   through an actual authorized response, and Realtime resubscribes. Record
   cold-launch behavior separately; cached data is not a fresh-server result.
8. Restore only the owned routes/settings changed by the case. Perform a normal
   route cold launch/read-health check. Preserve all saved transactions and raw
   private evidence; never reset OTP counters, edit expiry times or replay an
   already successful document to repeat a screenshot.

## Evidence boundary

| Case | Current result |
| --- | --- |
| Startup check cannot overwrite a newer native event, both directions | Source PASS650; native NOT TESTED |
| Initial-check failure and late callbacks after unmount | Source PASS650; native NOT TESTED |
| Obsolete/cancelled banner animation cannot remove the newer warning | Source PASS651; native NOT TESTED |
| Device offline before submit, form retention and zero writes | NOT TESTED; native driver/topology verification required |
| Reconnect without replay, then explicit reconciled retry | NOT TESTED on new APK |
| Backend outage with device still online | Distinct case; existing lost-response results retain their own scope |
| Deferred image recovery, current session expiry, physical Wi-Fi/cellular | Existing separate acceptance gates remain open |

Record PASS/FAIL/BLOCKED/NOT TESTED for each case and exact artifact. Source tests
mock native events/animations and do not establish radios, transport timeouts,
server transactions, SecureStore behavior or physical acceptance.
