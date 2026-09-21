# Developer handoff review — 2026-09-21

## Status and source pair

Ordered item 3's physical-iOS test execution is complete, with the open defects
below. This is a qualified acceptance record, not an all-green product sign-off.
Item 4 has not started. The customer-history repair and its paired release gate
are now closed. Detailed observations and the separate Android scope are in
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md).

The physical run started from mobile
`51ee8d39b74238576339d95dd30f5a4bf8bb1fbc` and backend
`1898dc79588f5db0a6d6dae520d5fa663548eb8f`. The reviewed customer-history pair
on `main` is mobile `09919ebfbce1f6e819363eca7711c23dd29b155f` and backend
`a1ad80741ddff97d4f9eb47a0066094f76ea476a`. Backend CI pins that exact mobile
implementation commit in its active and documented workflow copies. Mobile PR
#15 and backend PR #11 identify the reviewed submissions and checks.

The immutable `v0.2.2-demo` tags still select mobile
`6e6885786912fe9186285103e19de762e4ba88f8` and backend
`2959881d0e46a8797a98d10da8c7139217477476`. Cloning those tags reproduces the
published baseline and does **not** include the fixes in this handoff.

## Reviewed changes

- Item Pricing accepts the standardized customer-search envelope and the legacy
  array, restoring customer selection.
- Dispatch explains when every available lot is already added and opens the
  existing draft items through **View All**.
- Private PDF downloads rewrite internal/loopback origins to the configured API
  origin while retaining the signed path and query. All four iOS share paths
  were exercised.
- An Expo config plugin preserves the iOS warm-link bridge after prebuild; the
  app listens for warm links and uses the existing authentication/route guards.
- Both repositories canonicalize CLI entry paths. Previously, macOS `/var` →
  `/private/var` or another symlinked checkout could cause setup, migration-plan,
  doctor, bootstrap or postinstall commands to silently skip execution. The
  backend's previously recorded exit-1-versus-42 fixture failure was this path
  defect, not evidence of a fake-Docker sandbox denial. Regression tests now
  exercise symlinked CLI invocation, import behavior and configuration retention.
- Both developer guides distinguish staff-configurable prices from code-level
  billing-day policy and PDF branding customization.

## Status by priority

| Priority | Gap and evidence | Completion criterion |
| --- | --- | --- |
| Closed — customer history | Customer GRN and recent-dispatch views previously used staff-only RPCs, producing empty views despite existing records. The merged pair uses customer-authorized contracts with explicit mapping, visible errors, assignment-aware pagination, and unchanged staff calls. | Mobile PR #15 and backend PR #11 merged; default-branch CI passed; an API-36 emulator displayed two GRNs and three recent dispatches for the assigned fictional customer. |
| High | Physical-iPhone onboarding is not reproducible from the tracked runbook alone. The successful run needed temporary USB API/bundle relays and a local development signing identity. Those helpers were removed. iOS has no `adb reverse`. | Supply a reviewed, repeatable USB-only connection procedure or helper with reconnect detection, origin handling, ownership-scoped shutdown and fresh-clone validation. Keep demo OTP services off LAN/public listeners. |
| Medium | Revoking an active account denies protected data but leaves the stock screen in an error state instead of invalidating local credentials. | Route definitive session revocation through the shared logout/cache invalidation path. Verify cold relaunch remains logged out; assignment-only denial and network errors must not destroy a valid session. |
| Low | Pricing cards display the fictional `Review customer <timestamp>` fixture name. The orange number is a record count, not an identifier leak. | Use readable fixture names or isolate automated-test data; confirm real customer names remain intact. |
| Closed — paired gate | The implementation required current CI and a clean native smoke on the final merged pair. | Both PRs merged, mobile main CI run `35605871279` and backend main CI run `35606744913` passed, including the pinned integration pair. The post-merge API-36 emulator build/login/history/cold-restoration smoke passed. Existing release tags remain unchanged. |
| Separate scope | Enabled telemetry, production signing/distribution, SMS/TLS/operations, retention and privacy declarations remain open. | Keep telemetry off until a dedicated test project is configured and redaction/delivery are verified. Complete the production gates before any production claim. |

## Validation and remaining evidence

On Node.js 22.23.1, the mobile suite now passes 24 suites / 182 tests,
typecheck, zero-error lint and all 19 setup tests. Expo's online compatibility
check and both high-severity dependency audits reported clean results; the
Android JavaScript export passed. Existing lint warnings remain.

The backend unit suite passes 17/17. An isolated, loopback-only,
checkout-owned `warehouse-customer-history` demo applied migrations 00000–00011
and passed health checks. Its full API matrix passed, including assigned-customer
GRN/dispatch results, pagination and cross-customer denial. The live companion
check found 94 RPC names / 129 typed calls, zero missing names and zero
mismatches. Mobile main CI run `35605871279` and backend main CI run
`35606744913` passed for the reviewed pair. A fresh debug build installed on
`Medium_Phone_API_36.1` (Android API 36); demo login succeeded, the assigned
customer displayed two GRNs and three recent dispatches, and force-stop/relaunch
restored the authenticated Orders screen.

## Local cleanup and continuation

Temporary fault injection, the USB relay, bundle server and acceptance-admin
helpers were removed. Their processes and the SSH API forward were stopped;
ports 8081 and 18000 had no listeners at cleanup. The ignored app environment
was restored to `http://localhost:18000`, and the generated AppDelegate again
uses the standard Metro bundle resolver. Starting the phone app now requires
re-establishing its development connection.

Generated native directories, `.env`, dependencies, signing material and test
photos are not handoff artifacts. Recreate them locally. Personal Team signing
establishes development installation only. See [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md)
for configuration and customization contracts, and the backend's
`docs/CLEAN_INSTALL.md` for checkout-owned isolation.
