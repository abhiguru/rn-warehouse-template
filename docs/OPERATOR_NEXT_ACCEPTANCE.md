# Next operator acceptance after the active soak

Checkpoint2026-10-01. This is a work plan, not a test result. Use
[OPERATOR_INSTALL_NOTES.md](OPERATOR_INSTALL_NOTES.md) for evidence and
[CPU_UPGRADE_RESUME.md](CPU_UPGRADE_RESUME.md) for the running unit/frozen inputs.
The active run owns its emulator and session; execute no concurrent native actor,
authentication mutation, backend reconfiguration or replacement APK there.

## Order and blockers

| Priority | Work and required evidence | Small blocker or required resource | Current status |
| --- | --- | --- | --- |
| 1 | Finish nine native blocks and their verifies; aggregate actual requests, ≥8hours, business/session invariants and refresh rotations. Retain every failed attempt | Current supervised run must finish or stop with preserved failure evidence | RUNNING at preparation checkpoint; read live ledger for current state |
| 2 | Build/audit candidate0445227 with a new ID; Breakdown shows IRP05 and opens its GRN UUID, then return and check Overview | SOURCE DEFECT FIXED; emulator occupied by soak, new artifact not built/audited | Source636 PASS253unit/48setup/type/lint; GRN-fix CI36854228659 all4 jobs PASS; native NOT TESTED |
| 3 | Current native dispatch before/after lost-response cases: independent no-commit/commit proof, same-key retry, exactly one dispatch and reconciled stock | Exclusive emulator and unused fictional IDs; add independent retry-request observation (small blocker638); current native evidence remains historical3012 | NOT TESTED on current APK; API625 results remain scoped API |
| 4 | Expired/revoked sessions, offline writes/reconnect, unsaved-form switch, same-origin replacement | Session drivers prepared637; exclusive emulator/reserved account/private session bindings still required; natural refresh expiry needs seven-day age. Offline/switching drivers and replacement state remain pending | NOT TESTED current native; prepare drivers before execution |
| 5 | Corrected normal standalone APK on selected physical phone; QR/Wi-Fi/cellular/noUSB/Metro and authorized operator flows | Physical device/operator availability; cellular/camera as available; owned phone authentication inputs entered locally | BLOCKED for fully unattended scope; emulator cannot close hardware cases |

## Execution rules for remaining unattended cases

- Freeze each case's source/artifact, owned instance/identity, expected invariant,
  unique record identifiers, driver hash and unused private evidence directory.
  Run unchanged owning guards and complete doctor/transport prerequisites first.
- Session tests use only an isolated fictional account. Distinguish normal access-token renewal from
  revoked/expired refresh sessions that require fresh login. Use the prepared
  [session cases](OPERATOR_SESSION_CASES.md) and their explicit release guards. Never alter the active soak's session, use a fixed
  OTP, weaken authentication or reset rate-limit counters. Account for existing
  five/hour limits before starting; fictional delivery uses the guarded bridge.
- Offline writes use the reviewed fault relay and unused documents. Set the route
  before a cold launch/new draft. Reconcile commit state before any retry; assert
  unchanged-key retry creates exactly one operation. Keep every saved attempt.
- Unsaved-form switching must verify the app's supported confirmation/cancellation
  behavior, removal of the old account/cache/draft after a confirmed switch and
  fresh authentication to the second fictional identity. Do not invent policy
  where the intended behavior is undocumented; record the decision needed.
- Same-origin replacement must use a separately provisioned empty fictional state,
  new credentials and new identity. Do not clone/copy another instance's state.
  Keep both states and inspect local listener ownership before routing the owned
  test origin. Verify old credentials and cached data are not adopted. Existing
  core/switch origin round-trip PASS623c does not prove this replacement case.
- A new APK requires its own audit and affected native tests. Reuse source/API
  evidence only within its recorded unchanged scope. Existing passed receipt,
  dispatch and invoice transactions must never be replayed just to refresh a
  checklist. A previous artifact's soak does not become a new artifact's soak.

## Operator handoff and retained boundaries

Consolidate one current source/artifact/case matrix, link historical attempts,
source checks and CI separately, and list ordinary service start/stop/health
commands. Clean independent setup618 and same-input preservation628 remain
usable evidence for their exact backend source/overlay; no duplicate warehouse
reinstall is required solely for this display correction.

Third owned real CustomerB number remains unavailable; installed-warehouse real
A/B login is blocked, while isolated fictional API A/B evidence is separately
recorded. Do not request the same missing resource again without a changed need.
Printing, sensors, iPhone, external alerts, rotation, image-security research,
recovery rehearsal and production/pilot changes remain outside scope. Preserve
existing dependency/CI/release gates. No merge, release or production-readiness
claim follows from these source checks or a successful emulator soak.

Prepared session-case drivers and their pending setup/native checks are documented in [OPERATOR_SESSION_CASES.md](OPERATOR_SESSION_CASES.md). The active soak already covers normal renewal; do not repeat it merely to add an expiry checkbox. Natural refresh expiry requires the actual seven-day lifetime.

The [write retry specification](OPERATOR_WRITE_RETRY_CASES.md) provides tested pure reconciliation predicates. Native automation remains blocked on independently observing the retry request key; retained relay status alone is insufficient.
