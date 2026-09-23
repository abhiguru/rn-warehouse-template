# AI agent handoff — gateway CI follow-up after iPhone retest

## Current task for the next machine (2026-09-23)

The user narrowed this Mac's scope to **physical-iPhone testing, then a Git-pushed
handoff to another machine's AI**. The affected device retest is complete;
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md#later-gateway-fix-iphone-retest--2026-09-23-pre-merge-pair)
records the redacted observations and cleanup. Do not interpret that pre-merge
test as a green final-main build. Do not use GLM skills or helpers.

Clone both current main branches as siblings in a local, non-synchronized
workspace, then fetch and inspect newer commits before acting:

- Mobile: `https://github.com/abhiguru/rn-warehouse-template`; last verified
  main `4d6219553a742b3e84ee44063628a8660cd04615`. The physical runtime
  SHA is `c943de56b460852e8bca71fbe481b40d0c5265e6`. Mobile closure
  [PR #27](https://github.com/abhiguru/rn-warehouse-template/pull/27) was
  documentation only; [exact-main CI 35841891499](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35841891499)
  passed.
- Backend: `https://github.com/abhiguru/supabase-warehouse-template`; last
  verified main `85b5f0335fab4023ebf1b0d4a3ff83cd2a77fa01`. The earlier
  complete physical matrix used merged backend
  `8c682e4d4b83d4f4a8cb2dc252a00702478b11f9` and passed its
  [exact-main CI 35829262796](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35829262796).
  Documentation-only closure [PR #41](https://github.com/abhiguru/supabase-warehouse-template/pull/41)
  then merged, but [new-main CI 35842102994](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35842102994)
  failed (attempt 1 configuration HTTP 502 on setup rerun; attempt 2 fresh
  setup configuration HTTP 500, with cause not established).

Backend [PR #42](https://github.com/abhiguru/supabase-warehouse-template/pull/42)
is **open and unmerged** on `fix/setup-failure-diagnostics`, latest head
`604643517fa175b7383d57a9f3702c3f6976b8c0` (documentation after
runtime commit `53b983d3916dd44ec22c6ac2db05136ca81f3875`). The runtime
fix shortens Kong DNS caching for a replaced functions container, adds
ownership-checked failure diagnostics and a forced-IP-change regression.
Local reproduction was red before the fix and passed afterward. Setup rerun,
Realtime, doctor, API and 34 unit tests passed locally. The physical iPhone
15/iOS 26.6.2, Xcode 26.3, build `20260923.3`, ran mobile `c943de56` with
backend runtime `53b983d` and passed the affected case table linked above.
The preceding full merged-pair matrix at `c943de56`/`8c682e4` remains in
NATIVE_ACCEPTANCE. No Android rerun occurred on this Mac.

**Immediate blocker:** both [PR #42 runtime-head CI 35859569984](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35859569984)
and [documentation-head CI 35860093972](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35860093972)
failed in `Isolated demo API` → `Gateway upstream IP replacement`. Inspect the
exact CI logs and reproduce that failure in an isolated checkout. Fix on the
focused PR branch, run required checks, and get reviewed green PR CI before
merging. User approved PR #42 earlier **after CI passes**; this Mac paused the
merge because the user changed scope to iPhone testing and handoff. Verify
approval still applies to any material new fix; follow repository review rules.
After merge, verify exact backend-main CI, runtime SHA equivalence, paired
workflow pins and any newly affected physical-iPhone cases. A runtime change
that affects the tested device path requires a fresh device run; do not claim
the pre-merge `53b983d` observations cover a different implementation. Keep
active and documented workflow copies identical. Preserve all existing
`v0.2.2-demo` tags; do not deploy production or publish binaries.

Use the current mobile and backend setup/CI documents. Keep the demo on
loopback/USB, regenerate dependencies and private configuration on the next
machine, and use fictional data only. The Mac's owned test fixture was removed,
sessions revoked, helper/Metro/Compose stopped, and unrelated stack preserved.
No credentials, signing files, device IDs or generated build outputs belong in
Git. Production operator choices (SMS/onboarding, hosting/DNS/TLS, alerts,
off-host backup/recovery, retention, billing and capacity) and Grafana and
PostgREST inventory/scan security gates remain open.

## Order/cart physical-iPhone closure — 2026-09-23

The remaining live-update regression is complete on physical iPhone 15 / iOS
26.6.2, using Xcode 26.3 and local Debug bundle `20260923.2`. The exact final
tested pair is mobile `c943de56b460852e8bca71fbe481b40d0c5265e6` and backend
`8c682e4d4b83d4f4a8cb2dc252a00702478b11f9`, merged through mobile PR #26 and
backend PR #40. Their exact-main CI runs passed. The full redacted case table,
CI links, setup limitations and cleanup record are in
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md#physical-iphone-orderscart-live-update-closure--2026-09-23).

Customer list, staff Queue, cart add/change/remove, missed-event reconnect,
network and lifecycle recovery, logout/role isolation, token rotation, cold
restoration and manual fallback were all observed on the merged pair. This is
a closure record, not another continuation handoff. Later evidence commits are
documentation-only; companion runtime pins and immutable demo tags stay intact.
The earlier Android run was not repeated on this Mac. Production operator choices,
Grafana findings and PostgREST component-inventory/scan coverage remain open.


## Later local-readiness follow-up — 2026-09-22

The physical-iPhone work below remains closed. A later provider-independent
follow-up added the Android debug-artifact build/audit and paired backend
operational checks; see
[LOCAL_PRODUCTION_READINESS.md](LOCAL_PRODUCTION_READINESS.md). Only the
documented container-scan, provider, operator-policy, production infrastructure,
and signed distribution gates remain. Existing `v0.2.2-demo` tags remain
unchanged.

Completed 2026-09-22. This is a durable closure record, not a continuation
handoff. No later agent action is required for the local physical-iPhone
source-demo scope.

## Final implementation pair

| Repository | Merged implementation commit | Pull request | Exact-main CI |
| --- | --- | --- | --- |
| `abhiguru/rn-warehouse-template` | `9ba56ff122dc38dc57d6100de4c27599023d22b1` | [#18](https://github.com/abhiguru/rn-warehouse-template/pull/18) | [35686164009](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35686164009) |
| `abhiguru/supabase-warehouse-template` | `cf18f1e43ab613310b1b13339ab97e8533861f9b` | [#13](https://github.com/abhiguru/supabase-warehouse-template/pull/13) | [35686198287](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35686198287) |

Both main-branch CI runs passed. The existing source-only `v0.2.2-demo` tags
remain unchanged at mobile `6e6885786912fe9186285103e19de762e4ba88f8`
and backend `2959881d0e46a8797a98d10da8c7139217477476`.

## Completed scope

The complete source-demo matrix was exercised with fictional data on an iPhone
15 running iOS 26.6.2 using Xcode 26.3, CocoaPods 1.16.2, Node.js 22.23.1 and
Personal Team development signing. The final merged rerun confirmed clean
USB-only bootstrap, admin/customer roles and the repaired assigned-customer GRN
and per-item dispatch history. The complete pre-merge physical run used the
exact reviewed implementation trees later squash-merged and supplied the
stock/cart, pricing, invoice, private-PDF, navigation, destructive
fault-injection, secure-storage, refresh-race, reboot, camera/picker,
mutation-retry and malformed deep-link evidence.

The fixes delivered by the final pair include reproducible checkout-owned
USB-only iPhone API/Metro connectivity, definitive revoked-session logout,
customer-authorized per-GRN dispatch history, readable demo fixtures, stable
order snapshots, invoice-to-GRN navigation, actionable duplicate-item feedback
and focused regressions. The earlier merged customer-history pair also passed a
fresh Android API-36 build/login/history/cold-restoration smoke. The final pair
passed Android JS export and shared regression tests; this Mac had no Android
SDK, so an exact-final-pair emulator run was not repeated here.

Full case-by-case evidence is in
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md). The review and closure decision are
in [HANDOFF_REVIEW_2026-09-21.md](HANDOFF_REVIEW_2026-09-21.md).

## Customization and remaining boundary

Authorized users can configure default or customer-specific pricing. Billing-day
calculation is a code-level business-policy extension point and must be changed
with tests. Generated PDFs are starter templates: an adopter can replace the
cold-storage name, logo, address, tax/registration fields, terms and document
header, then must revalidate all four private-document flows.

Only production gates remain: enabled telemetry delivery, App Store/TestFlight,
production signing, production SMS/TLS/operations, retention/privacy deployment,
printing, sensors, payments, unsupported integrations, and production Realtime
capacity/resilience. The companion backend now verifies local authenticated
Realtime startup and authorization only. This record does not authorize or claim
the remaining capabilities.
