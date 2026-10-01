# Guarded post-soak navigation and offline drivers

Preparation653, 2026-10-01, is source/guard evidence. These drivers have **not**
passed current complete-schema SQL or native integration. Do not use them to
close offline, switching or hardware acceptance before executing the cases on
the next audited APK. The original soak APK and its frozen files are unchanged.

## Release and private configuration

Require all nine soak blocks, final reconciliation and every postcondition PASS,
plus an inactive successful run and no active overnight/prepare/autostart/final
gate unit. A failed or stopped run does not release the fixture. Both observation
helpers check this before SQL/socket access; both native entrypoints check before
ADB, locks, route changes and attempt creation. They share the session actor lock.
Run only on the owned fictional API30 emulator, never a phone, Test1 or the pilot.

Prepare configuration outside Git in an owned physical0700directory, with0600
files. Every attempt needs a new directory; preserve failures and do not resume.
Use a separately prepared UI config bound to the new audited fixture APK, package
`in.gurucold.warehouse.fixture`, API30, SELinux enforcing, the owned capture helper,
CA files and supervised core/switch/fault services. Never edit the active soak's
config. Record source pair, overlays, artifact SHA/build ID and case config hash.

The navigation config has scope `isolated-fictional-navigation-case`, case
`offline-orders`, `same-server`, `cancel-switch` or `confirm-switch`; absolute
`backendCheckout`, `backendState`, `soakConfig`, `artifactAudit`, `caseDirectory`;
`instanceId`, `profileId`, exact native `sessionId`; `profileName` exactly
`Core Demo Administrator`; `artifactSHA256`, `fixtureGuardSHA256`; and the release
fields `priorRunUnit`, `priorRunLedger`, `priorPlanSHA256`. Bind `toolingSHA256` to
exactly these files under mobile `scripts/`:

- `fixture-navigation-observe.mjs`, `fixture-navigation-guards.mjs`,
  `fixture-session-guards.mjs`;
- `fixture-ui/navigation-api30.py`, `fixture-ui/navigation_controls.py`,
  `fixture-ui/dispatch_case_controls.py`, `fixture-ui/soak-api30.py`,
  `fixture-ui/fixture_observation.py`.

Also bind `databaseHelperSHA256` and `httpObserverSHA256` from the UI config.
Read IDs from private evidence for the ordinary fictional native login; do not
provision sessions directly. The backend's unchanged operator-fixture guard,
manifest, fictional administrator identity and full business/auth comparisons
must match. The relay must be DISARMED with no retained write observations.

```bash
# Absolute paths to protected files; no credential values in shell arguments.
node scripts/fixture-navigation-observe.mjs "$NAVIGATION_CASE_FILE" guard
timeout --signal=TERM --kill-after=10s 10m python3 scripts/fixture-ui/navigation-api30.py "$NAVIGATION_CASE_FILE"
```

Run with the documented Docker group access. The native driver uses `sg docker`
for observers and the UI config's absolute Node path; the standalone helper needs
that same environment. Bound each invocation to ten minutes using the existing
`timeout` command below. A timeout is FAIL/BLOCKED, never a successful resume.

## Navigation case scope

`offline-orders` starts on Orders, requires an independently observed fresh
Orders200, journals radio settings, disables only this emulator's radios and
removes its exact owned443→18443reverse route. It requires the visible offline
banner, stale-data warning and no successful current Orders request, then restores
only the originally owned network and requires a fresh Orders200. An ADB reverse
removal may leave an established connection alive: such a case fails rather than
claiming a real outage. Radio/route ownership changes prevent cleanup writes.

Switch cases start on Settings with the exact fictional administrator profile
visible. `same-server` preserves the session without confirmation; `cancel-switch`
checks the new identity/warning and cancels without adoption; `confirm-switch`
deliberately performs normal logout of the bound fictional session, then requires
the destination login screen after cold launch. Run confirmation last: it ends
the source session. No OTP is requested and the driver cannot log back in.

For cold persistence, the emulator must already permit reading this owned app's
AsyncStorage DB. The driver never enables root. It copies bounded DB/WAL/SHM files
to private evidence and queries only the public selected-origin/instance entry.
The copies may contain fictional session data and must remain private. A racing,
unreadable or inconsistent copy fails the check. No host or phone files are read.

The before/after SQL snapshots require unchanged business rows, Storage metadata,
OTP count, profiles, assignments and other sessions. Confirmation alone may remove
the exact bound source session. These comparisons do not hash stored object bytes
or all database tables. These cases do not establish unsaved-form preservation,
active-mutation switching, destination authentication, same-origin replacement,
real SMS or physical network acceptance; follow the separate case guides.

## Offline dispatch with proof before retry

Use a fresh reserved partial-dispatch config and the draft-only preparation in
[write retry cases](OPERATOR_WRITE_RETRY_CASES.md). Add `offlineCase: true` before
preparing the draft. Retain that guide's complete12-file `toolingSHA256` binding
and add `offlineToolingSHA256` for exactly `fixture-offline-dispatch-observe.mjs`,
`fixture-ui/offline-dispatch-api30.py`, `fixture-ui/navigation_controls.py`.
The same config must bind the draft and offline runner; do not edit it afterward.

```bash
node scripts/fixture-offline-dispatch-observe.mjs "$DISPATCH_CASE_FILE" guard
python3 scripts/fixture-ui/dispatch-draft-api30.py "$DISPATCH_CASE_FILE"
timeout --signal=TERM --kill-after=10s 10m python3 scripts/fixture-ui/offline-dispatch-api30.py "$DISPATCH_CASE_FILE"
```

This driver requires a fresh PASS draft under15minutes, the reviewed APK, exact
review-label hash, stock/source binding and the owned443→18643relay route. The
relay remains DISARMED. It journals the radios, disconnects the owned network,
requires the banner, submits once and waits for an error. Only independent SQL
proof of unchanged document, stock, cache and unrelated business state permits
reconnection. It then waits30seconds without submitting, proves no replay and
makes one explicit unchanged retry. Success requires native success plus exactly
one header/line, one successful cache entry and the expected stock delta.

If the first request remains uncertain, the driver leaves its owned network
disconnected and preserves evidence for reconciliation; it cannot reconnect or
retry that request automatically. Network restoration refuses occupied routes or
changed radio settings. A later uncertain retry keeps its existing route for
investigation. After a proven final success, ownership-aware cleanup restores
the normal18443route; check normal-route cold read health separately.

This is one no-image partial-dispatch case and a bounded no-replay observation,
not independent same-key HTTP observation, durable queue acceptance, GRN/image
recovery or every future reconnect timer. Full-schema SQL, selectors, real radio
behavior, native error handling and cleanup integration remain NOT TESTED until
the guarded run. A failure blocks further writes and retains its reserved number.

## Recorded preparation evidence

Setup75/75 PASS; five pure Python control cases PASS; Python/Node syntax PASS.
All four real active-run entrypoints returned BLOCKED before native/SQL/socket
access or attempt creation. Sentinel ADB was untouched and all54 frozen inputs
were unchanged. Source tests are reusable within unchanged scope; native results
must be recorded separately for the exact APK and freshly reserved case.
