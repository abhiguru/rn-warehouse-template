# Developer handoff review — 2026-09-21

## Status and source pair

Ordered item 3's physical-iOS test execution is complete, with the open defects
below. This is a qualified acceptance record, not an all-green product sign-off.
Item 4 has not started. Detailed observations and the separate Android scope are
in [NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md).

The physical run started from mobile
`51ee8d39b74238576339d95dd30f5a4bf8bb1fbc` and backend
`1898dc79588f5db0a6d6dae520d5fa663548eb8f`. The fixes and documentation are
post-release work on `handoff/ios-acceptance-review` in both repositories. Use
those branches while review is pending, then the reviewed merge commits on
`main`; record both full SHAs when reproducing the handoff. Backend CI pins its
mobile companion explicitly. A final commit cannot embed its own SHA; Git and
the paired pull requests identify the submitted revisions.

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

## Open work, in priority order

| Priority | Gap and evidence | Completion criterion |
| --- | --- | --- |
| High | Customer GRN and recent-dispatch views use staff-only RPCs (`grn-service.ts`, `dispatch-service.ts`, `GRNListFiori.tsx`, `RecentDispatchesSection.tsx`). The phone showed empty views despite existing records. | Use customer-authorized queries with explicit response mapping and visible errors. Test assigned customer data, other-customer denial, pagination and unchanged staff behavior. Preserve backend authorization. |
| High | Physical-iPhone onboarding is not reproducible from the tracked runbook alone. The successful run needed temporary USB API/bundle relays and a local development signing identity. Those helpers were removed. iOS has no `adb reverse`. | Supply a reviewed, repeatable USB-only connection procedure or helper with reconnect detection, origin handling, ownership-scoped shutdown and fresh-clone validation. Keep demo OTP services off LAN/public listeners. |
| Medium | Revoking an active account denies protected data but leaves the stock screen in an error state instead of invalidating local credentials. | Route definitive session revocation through the shared logout/cache invalidation path. Verify cold relaunch remains logged out; assignment-only denial and network errors must not destroy a valid session. |
| Low | Pricing cards display the fictional `Review customer <timestamp>` fixture name. The orange number is a record count, not an identifier leak. | Use readable fixture names or isolate automated-test data; confirm real customer names remain intact. |
| Release gate | Local success and historic CI are not CI evidence for these new commits. Native tests used an evolving worktree, and no clean final-commit physical rebuild has been recorded. | Review both PRs, verify the pinned pair in CI, merge, and smoke-test the resulting source pair. Repeat Android smoke for the shared JS changes. Preserve existing release tags. |
| Separate scope | Enabled telemetry, production signing/distribution, SMS/TLS/operations, retention and privacy declarations remain open. | Keep telemetry off until a dedicated test project is configured and redaction/delivery are verified. Complete the production gates before any production claim. |

## Validation and remaining evidence

On Node.js 22.23.1, the mobile suite passed 23 suites / 177 tests, typecheck,
ESLint's error check and 19 setup tests. `npm audit --audit-level=high` reported
zero vulnerabilities. Expo's online compatibility check reported dependencies
up to date (`EXPO_NO_CACHE=1` avoided a sandbox-restricted cache). Existing lint warnings remain.
Jest used `--watchman=false` because this sandbox cannot install Watchman's
LaunchAgent; no application test was skipped.

Backend unit tests passed 17/17 after the CLI-path fix, including configuration
preservation and the symlink regression. The physical/API evidence predates that
CLI-only fix. The static companion check found 93 RPC names / 127 typed calls,
zero missing names and zero mismatches. Both npm audits reported zero findings.
Docker was unavailable during this final review, so fresh setup,
migration execution and live API/contract checks must be confirmed by the paired
CI or an isolated Docker rehearsal; this review does not claim a new live run.

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
