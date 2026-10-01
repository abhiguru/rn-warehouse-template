# Next operator acceptance after the active soak

Current plan, 2026-10-01. This is not an acceptance result. Historical preparations,
failed attempts and validation are retained in
[OPERATOR_INSTALL_NOTES.md](OPERATOR_INSTALL_NOTES.md). Read the private live soak
ledger for current status; do not use a documentation checkpoint as live telemetry.

The active soak exclusively owns its emulator, fixture sessions, services and54
frozen inputs. No concurrent UI actor, authentication mutation, replacement APK,
backend reconfiguration or bound-source edit is allowed while it runs.

## Order and blockers

| Priority | Required work | Blocking prerequisite | Current evidence |
| --- | --- | --- | --- |
| 1 | Complete nine native blocks plus final duration/request/session/business/refresh reconciliation | Active run must finish; a failed/stopped unit is not a successful release | RUNNING at this checkpoint; earlier passed blocks remain valid, final aggregate pending |
| 2 | Build/audit the current reviewed mobile candidate with a new ID, including GRN-link fix, dispatch accessibility labels and logging correction; verify Breakdown IRP05 label, GRN UUID navigation and Overview | Exclusive emulator; new APK not built/audited/installed | GRN source636 and CI36854228659 PASS; newer source checks are scoped separately; native new-artifact case NOT TESTED |
| 3 | Native direct partial dispatch before/after response loss with proof before retry, one independently observed same-key retry and stock/cache reconciliation | New APK, reviewed relay, fresh reserved stock/documents, exact private config and12source bindings; live SQL/native/cleanup integration | Drivers640–643 prepared and guarded; setup69PASS and refusal/mocked cleanup evidence; current native acceptance NOT TESTED, API625 and historical native3012 do not close it |
| 4 | Revoked/expired sessions, offline-before-submit/reconnect, unsaved-form switch and same-origin replacement | Reserved session customer/private bindings; seven-day natural refresh expiry; remaining offline/switch drivers and fresh replacement state | Session drivers637 prepared; no current native case. Lost-response transport tests do not establish airplane-mode/offline queue behavior |
| 5 | Current normal standalone APK on selected physical phone; QR, Wi-Fi/cellular, noUSB/Metro and owned-phone flows | Device/operator availability, camera/cellular as available | BLOCKED for fully unattended scope; emulator and historical phone results do not close hardware acceptance |

## Source corrections and CI

Backend review candidatebed4eee corrects the locally failing source dependency
audit with same-major leaf updates. Local metadata/Storage audits report zero;
backend80tests and metadata build/typecheck/12recipe tests passed. FreshCI and
rebuilt-container integration remain pending. Installed runtime still uses the
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
- Unsaved-form switching must verify the app's supported confirmation/cancellation
  behavior, account/cache/draft clearing and fresh authentication. Record an
  operator decision if the intended policy is undocumented.
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
