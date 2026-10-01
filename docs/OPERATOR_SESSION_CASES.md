# Guarded session cases after the eight-hour soak

These optional drivers are for the owned API30 fictional emulator. They are
**prepared source, not completed native acceptance**. Preparation637 passed
56 setup tests (including eight new guard cases), Node/Python syntax, lint and
an actual active-run refusal. A sentinel ADB command was not invoked and no
attempt directory was created. No account was disabled and no expiry was changed.

## Distinguish the three session cases

| Case | Expected behavior | Evidence or blocker |
| --- | --- | --- |
| Access token expires while refresh session remains valid | Renew credentials and continue protected reads without a new OTP | The current nine-block soak already measures actual reads and multiple refresh rotations; require its final aggregate before using that evidence |
| Administrator disables the fictional customer | Its refresh sessions disappear; cold restoration requires login; subsequent cold/foreground cycles remain on login | New revoked driver is prepared; exclusive emulator, reserved account/native session and current artifact audit still required |
| Refresh session reaches its natural expiry | Cold restoration requires login and cannot replace the expired session without authentication | Backend issue_session sets a seven-day refresh lifetime. The driver refuses a session that has not expired; natural-expiry native acceptance remains BLOCKED until such a session exists |

The latter two cases do not establish every foreground RPC error path, a real
provider login, physical-device behavior or complete cache isolation. The login
screen's static app name is not proof of the selected warehouse identity. This
driver checks that server selection is not requested again; origin/identity
selection has its own acceptance cases.

## Prerequisites before enabling an actual case

1. Finish the current soak and preserve its ledger, native results and final
   aggregate. The driver requires all nine blocks, the final reconciliation and
   every postcondition PASS for the exact expected plan hash. A missing/stopped
   service alone is insufficient. Failed or interrupted runs require diagnosis
   and a separately reviewed next step; do not edit the ledger to release this
   driver. No session case auto-start is configured.
2. Prepare the candidate APK through the normal clean build/audit sequence. Use
   **new private emulator metadata and UI config files**, preserving the old
   soak's bound inputs and evidence. The UI config follows UNATTENDED_RUN.md's
   schema; the driver checks the local and installed APK SHA, owned AVD/API30,
   enforcing SELinux, normal443→18443 route and supervised helpers. The core
   bridge needs an independently verified certificate with at least one hour
   remaining, matching instance discovery, and a DISARMED fault relay.
3. On the guarded fictional core backend, prepare the reserved phone
   `919888888874`, named exactly `Session Rehearsal Customer`, through the
   documented fixture mock-delivery and real verifier flow. The ordinary
   administrator enrollment API must approve it with a fictional customer
   assignment. Respect the five/hour limit and resend cooldown. No direct
   session issuance, SQL account provisioning, fixed code or provider delivery
   is part of this driver. Stop if that reserved identity is occupied by a
   different fixture. Account preparation has not been executed in637.
4. Sign that customer into the emulator through the supported flow and leave
   Settings visible with `View profile for Session Rehearsal Customer`. There
   must be exactly one refresh session for it. Gather its profile/session UUIDs
   privately using an unchanged owning fixture guard and a read-only lookup of
   public.user_profiles joined to warehouse_security.refresh_sessions on
   auth_user_id=user_id, restricted to that exact phone/name. Bind the unique
   session to the just-observed native login; do not guess a UUID or reuse an
   administrator/core-A/core-B session. This private binding remains pending.
5. For revocation, obtain a fresh administrator access token through the normal
   guarded fictional login and save its response privately. The helper expects
   a mode0600 JSON file containing the `access_token` field, never a token in a
   command argument or chat. It checks the fixture administrator identity,
   remaining token lifetime and an actual authenticated check_session request.
   It does not mint or refresh tokens itself. For natural expiry, no admin token
   is used and no account is changed. Keep the customer session/device data until
   its actual seven-day expiry; future TLS renewal/new artifact audits are
   separate prerequisites, not permission to weaken authentication.

All private config/evidence parents must be owned0700, files0600, outside Git.
Preparation remains a prerequisite, not an undocumented live bypass. The
current overnight fixture, installed Test1, pilot, recovery host and physical
phone must not be used for concurrent preparation.

## Private case configuration

Create a new JSON file under the private evidence/state root, with these keys.
Paths must be absolute. Fill UUIDs from the private preparation evidence; the
placeholders below are intentionally not executable inputs.

```json
{
  "scope": "isolated-fictional-session-case",
  "case": "revoked",
  "backendCheckout": "/absolute/owning/core/checkout",
  "backendState": "/absolute/private/core-backend-test-CASE",
  "fixtureGuardSHA256": "SHA256_OF_OWNING_tests/operator-fixture.mjs",
  "soakConfig": "/absolute/private/new-artifact-ui-config.json",
  "artifactAudit": "/absolute/private/new-artifact-audit.json",
  "caseDirectory": "/absolute/private/unused-session-attempt",
  "priorRunUnit": "warehouse-fixture-overnight-YOUR_ID.service",
  "priorRunLedger": "/absolute/private/completed-soak/ledger.json",
  "priorPlanSHA256": "EXACT_COMPLETED_PLAN_SHA256",
  "phone": "919888888874",
  "profileName": "Session Rehearsal Customer",
  "profileId": "PRIVATE_PREPARED_PROFILE_UUID",
  "sessionId": "PRIVATE_MATCHED_NATIVE_SESSION_UUID",
  "adminSessionFile": "/absolute/private/fresh-admin-session.json"
}
```

For natural expiry, use `"case": "expired"` and omit adminSessionFile. It starts
only with an already expired session; it does not wait seven days in a process,
change the device clock, shorten server TTLs or manufacture an expired token.
Use a different unused attempt directory/config for each case.

## Run and verify

From the separately reviewed mobile checkout, with documented Node22/Python3
and effective Docker access:

```bash
umask 077
node --test scripts/fixture-session-guards.test.mjs
python3 -m py_compile scripts/fixture-ui/session-api30.py
node scripts/fixture-session-backend.mjs "$PRIVATE_CASE_CONFIG" guard
python3 scripts/fixture-ui/session-api30.py "$PRIVATE_CASE_CONFIG"
```

The `guard` command checks release of the prior run; it is not a complete backend
or native acceptance check. The native driver repeats it before ADB access and
then imports the owning backend's unchanged guard. It obtains a read-only
baseline before any mutation. Active/starting/stopping fixture jobs, incomplete
ledgers, ambiguous sessions, wrong artifact/fixture, invalid certificates or
an armed relay stop the case. A private file lock prevents two session drivers
from sharing the emulator.

Revocation uses precisely the normal authenticated
`operator_review_enrollment(p_user_id, 'disabled', [])` API. It writes an attempt
marker before sending, independently confirms account disable/session removal,
and never retries that action automatically. Then it cold-starts the app,
requires the actual Send OTP/operator login screen, checks background/foreground
and another cold launch, and verifies the checked business tables, other
accounts/sessions/assignments and OTP count are unchanged. A natural-expiry
case observes the expired session and performs only the restoration checks;
ordinary logout cleanup of that expired row is allowed, a new session is not.

Raw hierarchy, tokens and SQL results are never printed. Private outputs include
source/config hashes, before/after observations and a per-phase result. Do not
relabel BLOCKED as PASS. On an uncertain mutation or native failure, preserve
the attempt marker and reconcile through a new read-only investigation before
any retry. The reserved account intentionally remains disabled after revocation;
no automatic reapproval, new OTP or cleanup is performed. Future cases must
explicitly prepare their own valid account/session.

## Preparation evidence and remaining limitations

- PASS637: eight guard regressions; full56 setup checks; syntax and lint
  (0errors/1468existing warnings).
- PASS637 active-run negative check: both backend and native entry points
  refused the actual running soak. Sentinel ADB was not called; no attempt
  directory was made; all54 original bindings unchanged.
- NOT TESTED: live session-case SQL/HTTP integration, reserved-account setup,
  new-APK native revocation/restoration and natural refresh expiry. Guard tests
  and syntax checks do not close these cases.
- Pending inputs can be collected autonomously after exclusive fixture access;
  no real phone/provider credentials or additional operator SMS permission is
  needed for this isolated scope.
