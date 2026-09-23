# Final Mac execution handoff — completed

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
