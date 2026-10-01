# Next operator acceptance after the completed soak

Current plan, 2026-10-01. This is not an acceptance result. Historical preparations,
failed attempts and validation are retained in
[OPERATOR_INSTALL_NOTES.md](OPERATOR_INSTALL_NOTES.md). Read the private live soak
ledger for current status; do not use a documentation checkpoint as live telemetry.

Completion658: all9blocks/final reconciliation and21checks PASS at21:18IST
1October; the actual exclusive-release guard now passes. Preserve all54 frozen
inputs and completed evidence. Any future run again owns its emulator/sessions/
services exclusively; check the real guard before native operations.

## Order and blockers

| Priority | Required work | Blocking prerequisite | Current evidence |
| --- | --- | --- | --- |
| 1 | Preserve completed soak evidence, then prepare next helper/TLS horizon before new APK trust | New bounded owned helper plan and certificates sufficient for build/preparation/run/safety; old evidence stays immutable |658 PASS:9blocks/final,21checks,459cycles,8hours4.866seconds; release guard PASS |
| 2 | Build/audit the current reviewed mobile candidate with a new ID, including GRN-link fix, dispatch accessibility labels, logging correction and switch cleanup; verify Breakdown IRP05 label, GRN UUID navigation and Overview | Exclusive emulator; new APK not built/audited/installed | GRN source636 and CI36854228659 PASS; newer source checks are scoped separately; native new-artifact case NOT TESTED |
| 3 | Native direct partial dispatch before/after response loss with proof before retry, one independently observed same-key retry and stock/cache reconciliation | New APK, reviewed relay, fresh reserved stock/documents, exact private config and12source bindings; populated-fixture SQL/native/cleanup integration | Drivers640–643 prepared and guarded; setup69PASS, refusal/mocked cleanup and scratch SQL647PASS; current native acceptance NOT TESTED, API625 and historical native3012 do not close it |
| 4 | Revoked/expired sessions, offline-before-submit/reconnect, unsaved-form switch and same-origin replacement | Reserved session customer/private bindings; seven-day natural refresh expiry; new APK, complete-schema/native driver integration and fresh replacement state | Session637 and navigation/offline653 drivers prepared with release refusals; no current native case. Read-only switching does not establish unsaved-form behavior; lost-response tests do not establish device disconnection |
| 5 | Current normal standalone APK on selected physical phone; QR, Wi-Fi/cellular, noUSB/Metro and owned-phone flows | Device/operator availability, camera/cellular as available | BLOCKED for fully unattended scope; emulator and historical phone results do not close hardware acceptance |

## Source corrections and CI

Backend review candidatebed4eee corrects the locally failing source dependency
audit with same-major leaf updates. Local metadata/Storage audits report zero;
backend80tests and metadata build/typecheck/12recipe tests passed. Exact
[CI36864729906](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36864729906)
passed all seven jobs, including isolated operator installation. Installed runtime still uses the
recorded earlier source/images. Existing image-security findings and production
release gates remain open; a clean npm audit does not clear them.

Review the exact latest PR34 and PR79 CI heads before assigning all-pass status.
Completed CI for an earlier tooling head or debug artifact is not current native
acceptance. No branch merge, release or production-readiness claim is authorized.

## Execution and evidence rules

- Follow [write retry cases](OPERATOR_WRITE_RETRY_CASES.md) for draft, submission,
  independent observations, source bindings and ownership-aware cleanup. Native
  cases use new unused documents; never replay successful historical transactions.
- The relay route must precede cold launch and draft preparation. Preserve any
  uncertain/in-flight operation; cleanup must not erase evidence or overwrite an
  unowned route. After successful cleanup perform a separate normal-route cold
  launch/read-health check before another case.
- Follow [session cases](OPERATOR_SESSION_CASES.md) for reserved-account preparation.
  Normal access renewal is already covered by the soak; do not alter timestamps,
  authentication policy or OTP counters to simulate seven-day refresh expiry.
- Follow [offline/reconnect cases](OPERATOR_OFFLINE_CASES.md) for zero-write
  evidence before a manual retry and separate device/network/backend-outage
  results. Include650–651's connection-ordering/banner fixes in the new APK;
  source tests pass but current native acceptance is open. An ADB reverse route
  may remain reachable when an emulator reports offline.
- Unsaved-form switching must verify the app's supported confirmation/cancellation
  behavior, account/cache/draft clearing and fresh authentication. Record an
  operator decision if the intended policy is undocumented. Correction649 adds
  the explicit warning/Cancel action and clears dispatch rollback data; source
  regressions PASS, new-APK acceptance remains open. Follow
  [server-switch cases](OPERATOR_SERVER_SWITCH_CASES.md).
- Same-origin replacement needs separate empty state, new credentials and identity;
  never copy another instance's state. Inspect listener ownership before routing.
  Existing core/switch round-trip623c does not prove replacement at the same URL.
- Reuse source and API evidence only within its unchanged recorded scope. A new
  APK needs its own audit and affected native tests; it does not inherit the old
  artifact's eight-hour soak. Clean setup618 and safe rerun628 remain scoped to
  their recorded backend source/overlays; no duplicate install solely for display
  or logging changes is required.

Third owned CustomerB phone remains unavailable. Installed-warehouse real A/B
authentication stays blocked; isolated fictional evidence is separate. Do not
request the same missing input again. Printing, sensors, iPhone, external alerts,
rotation, deferred image-security research, recovery rehearsal and production/pilot
changes remain outside this exercise. Preserve every historical failure and gate.


Source work652–656 is saved: local-only replacement cleanup, guarded offline/switch
drivers, one-attempt query writes, scoped acceptance index and clean-source guide
checks. Pin explicit mobile2fbf238/backendbed4 as documented; new APK/populated-fixture/native
driver integration/full local new-backend setup remain unperformed. Clean source checks
and configuration-only rerun PASS do not close standalone/native acceptance.


Preparation657 now validates dispatch/navigation generated SQL against all18
unmodified bed4 migrations in an isolated network-disabled scratch database.
Empty-state shape, stable digests, missing source/session and reused-schema refusal
PASS; setup77PASS. Container removed. This closes empty full-schema compatibility;
actual guarded CLI/populated-fixture/native/cleanup integration remains open.
See [repeatable schema check](OBSERVER_SCHEMA_CHECK.md); do not rerun unchanged PASS.

Small prerequisites before another long run: current helper units have12-hour caps
and stop around00:56IST2October; current fixture CAs expire11:13IST2October.
They covered the completed soak, but must be replaced by a newly bounded owned helper
plan and sufficient certificate horizon for the next run. At15:28UTC there were
14.24certificate hours remaining. Recheck at build and actual launch; include
build/preparation/run/safety margin. Preserve the completed source bindings and trust evidence; use new private
certificate paths/configuration and record the next units/artifact bindings. Prepare any new certificates before the next APK build if
the intended later run cannot meet its12-hour guard. This concerns disposable
fixture TLS, not production provider/warehouse credential rotation.


## VM-only campaign begun 1 October 2026

The authorized campaign has a 48-hour deadline of 3 October 2026 16:27:13 UTC
(21:57:13 IST). Use only the owned x86_64 VM and API30 emulators. ARM builds
and physical acceptance are deferred. Preserve completion658 and its frozen
inputs; its PASS remains attached to e217/code2026100101.

Before the next candidate build, generate independent primary, switching and
same-origin replacement certificates in new private directories, each valid for
14 days and containing only its exact fictional DNS SAN. The fixture-only build
helper accepts optional `WAREHOUSE_REPLACEMENT_FIXTURE_CA`; this adds a second
independent public trust anchor to `backend-core.example.test` only. The optional
switch anchor remains confined to `backend-switch.example.test`. Normal package
IDs, wildcard/additional/wrong hosts, invalid dates, reused keys and overwriting
an existing native trust policy are refused. These tests establish tooling
behavior; compiled artifact and real replacement acceptance require later checks.

For the authorized build use a clean pinned application checkout, applying only
the separately recorded fixture tooling overlay. Export all three absolute CA
paths and `WAREHOUSE_FIXTURE_MIN_VALID_HOURS=168`, then use the documented Expo
prebuild and x86_64 release commands with Gradle's two-worker/3GiB limits. Recheck
25GiB free immediately before compilation. Record the application commit, tooling
commit, overlay hashes, new increasing build ID, signer and exact APK hash.
Do not copy private key material into the checkout or APK.

Take a consistent private backup with each retiring fixture's owning checkout
before sequential replacement. Require archive checksum and pg_restore catalog
readability, preserving all prior state; this is not a restore test. New helper
units keep the existing 12-hour cap and require actual TLS/IPC readiness. Freeze
bounded stages separately within the runner's 24-hour timeout limit. The final
candidate needs its own eight-hour soak after affected native gates pass.

After the final APK freezes, authenticate a reserved fictional expiry account on
its own newly created API30 AVD, record real server expiry, stop it cleanly and
schedule one bounded check for expiry plus ten minutes. Preserve its storage;
never change timestamps, reset quotas or clone authenticated device state.
The appointment can fall after the execution campaign; its eventual result
remains pending until the actual check executes.

### VM build resource correction

The clean accessibility build2026100103 completed, but Metro's default worker
count caused VM memory pressure and the kernel killed the old terminal-owned
emulator. Its stopped state was archived locally and verified before an owned
supervised boot; no stored state was restored or erased. Native work stopped at
its preflight gate. Preserve that failure even though build/audit passed.

For a future disposable **fixture** build, set
`WAREHOUSE_FIXTURE_BUNDLE_WORKERS=2` before running
`node scripts/prepare-emulator-fixture.mjs` after prebuild. This optional overlay
adds Expo `export:embed --max-workers 2` to generated Gradle only after the
fixture package, expected command and absence of existing options are verified.
Normal APKs and worker counts outside1–2 are refused. Keep Gradle's documented
two-worker/3GiB heap limits too. Stop the proven-owned AVD cleanly before another
heavy build, preserve its storage, and restart it under supervision afterward;
never build while a final soak owns the fixture.
