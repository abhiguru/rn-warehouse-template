# Developer handoff review — closed 2026-09-22

## Decision and final pair

The local source-demo physical-iPhone handoff is complete. All iPhone acceptance
rows are closed, the implementation fixes merged through required CI, and the
affected cases were rerun on the final merged source.

| Repository | Final implementation | PR | Exact-main CI |
| --- | --- | --- | --- |
| Mobile | `9ba56ff122dc38dc57d6100de4c27599023d22b1` | [#18](https://github.com/abhiguru/rn-warehouse-template/pull/18) | [35686164009](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35686164009) |
| Backend | `cf18f1e43ab613310b1b13339ab97e8533861f9b` | [#13](https://github.com/abhiguru/supabase-warehouse-template/pull/13) | [35686198287](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35686198287) |

The immutable `v0.2.2-demo` tags remain mobile
`6e6885786912fe9186285103e19de762e4ba88f8` and backend
`2959881d0e46a8797a98d10da8c7139217477476`.

## Closed findings

| Finding | Closure evidence |
| --- | --- |
| Assigned customers saw empty GRN/recent-dispatch history | Customer-authorized contracts, assignment-aware mapping/pagination and explicit error states merged. The final physical-iPhone run displayed Example Customer A GRNs, 100/79/21 item totals and authorized dispatch quantities 20 and 1. |
| Physical-iPhone onboarding depended on temporary manual relays | Tracked `scripts/ios-usb.mjs`, its tests, Expo/Metro integration and `docs/IOS_USB_DEVELOPMENT.md` now provide checkout-owned USB-only start/status/stop and reconnect/address-change handling without a LAN/public demo listener. |
| Revoked account remained on a failed protected screen | Definitive revocation now clears the secure session and returns to login; assignment denial and transient network failure preserve valid credentials. Focused regressions and physical checks passed. |
| Timestamped review fixtures appeared in normal UI | Readable fictional Example fixtures replaced the timestamped names; the final pricing/customer paths displayed the expected names. |
| Invoice/GRN/order navigation ambiguity | Invoice-to-GRN UUID navigation, per-GRN dispatch history, stable order customer targeting and duplicate-lot feedback merged with focused tests and physical verification. |
| Internal PDF origin failed on a physical phone | Private signed paths use the configured USB API origin. GRN, dispatch, invoice and customer-stock PDFs opened the native iOS share sheet. |

## Validation summary

The full implementation-head suites passed before merge: 27 mobile suites / 194
tests plus setup, typecheck, zero-error lint, Expo compatibility/export and
audits; backend unit, migration, health/doctor, contract, isolated API and scan
gates passed, including 94 RPC names / 129 typed calls with zero missing names
or mismatches. Both exact-main CI runs above passed after squash merge.

The device was an iPhone 15 on iOS 26.6.2 using Xcode 26.3, CocoaPods 1.16.2
and Node.js 22.23.1. The final merged rerun covered clean USB bootstrap,
admin/customer roles and the repaired assigned-customer GRN/per-item dispatch
history. The complete pre-merge physical run used the exact reviewed
implementation trees later squash-merged and supplied stock/cart, pricing,
invoice, PDF, navigation, secure-storage, refresh-race, reboot, camera/picker,
interruption/retry and malformed-link evidence.

The earlier merged customer-history pair passed an Android API-36
build/install/login/history/cold-restoration smoke. The final pair passed Android
JS export and shared regression tests; this Mac had no Android SDK, so an
exact-final-pair emulator run was not repeated.

## Customization and boundaries

Pricing records are configurable by authorized end users. Billing-day policy is
implemented in the backend calculation contract and is intentionally customizable
in code with accompanying unit/API tests. PDF layouts are starter templates and
may be branded with the operator's cold-storage name, logo, address,
registration/tax details, terms and headers; revalidate all four private document
flows after customization.

Production signing and App Store/TestFlight distribution, enabled telemetry
delivery, production SMS/TLS/operations, retention/privacy deployment, printing,
sensors, Realtime, payments and unsupported integrations remain separate gates.
They do not reopen this local source-demo acceptance.
