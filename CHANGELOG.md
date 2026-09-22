# Changelog

## Unreleased — order/cart live updates

- Refetch order lists, supervisor queues and carts on authenticated order events
  and reconnect, with session cleanup and foreground/network lifecycle handling.
- Keep stock/invoice subscriptions and production capacity acceptance outside
  this change; see `docs/ORDER_LIVE_UPDATES.md`.

## Unreleased — local Android artifact readiness (2026-09-22)

- Added a native APK audit for forbidden archive paths and embedded material,
  Android permissions, public certificates, artifact hashing, and required
  third-party notices.
- Built and audited a fresh development APK, documented the separate exported
  icon-font inventory, and kept release signing/store review open.
- Extended CI with Expo Doctor and a native debug build/audit job; no APK is
  uploaded or published.
- Linked the companion backend's provider-independent readiness evidence and
  preserved the immutable source-demo release tags.

## Unreleased — iOS acceptance handoff (2026-09-21)

- Reconciled the final handoff records: all local source-demo acceptance and
  source-only attribution items are closed, while production distribution,
  deployed retention/telemetry and optional integrations remain separate gates.
- Closed the complete physical-iPhone source-demo matrix on the final merged pair:
  PR #18 / `9ba56ff122dc38dc57d6100de4c27599023d22b1` with backend PR #13 /
  `cf18f1e43ab613310b1b13339ab97e8533861f9b`; exact-main CI and affected
  iPhone reruns passed.
- Added tracked checkout-owned USB-only iPhone onboarding, definitive
  revoked-session logout, per-GRN customer dispatch history, invoice-to-GRN
  navigation, stable order targeting and focused regressions.
- Replaced the continuation handoff with durable acceptance evidence and recorded
  the end-user pricing, code-level billing-day and PDF/cold-storage branding
  customization boundaries.
- Repaired assigned-customer GRN and recent-dispatch history views without
  widening staff RPC grants. Customer responses are explicitly normalized,
  pagination works across multiple assignments, and visible errors replace
  misleading empty states. The companion backend adds the guarded customer
  dispatch-list contract and extends customer GRN filtering.
- Added customer-history regression coverage and recorded fresh migration, live
  API, and paired-contract evidence. The post-release repair passed paired PR
  review, CI and Android API-36 emulator smoke on the merged pair.
- Fixed Item Pricing customer search, duplicate dispatch-lot feedback, private
  PDF URL handling and native warm-link delivery, with physical-iPhone evidence.
- Made CLI bootstrap, doctor and postinstall entry checks work through symlinked
  checkout paths, with a regression that verifies failures are not silently skipped.
- Recorded the qualified iOS acceptance result, remaining customer-view/session
  defects, physical-USB onboarding gap and pricing/PDF customization contracts.
- Preserved all published source-release tags; the changes passed paired review
  and exact-main CI.

## 0.2.2-demo — source-only prerelease (2026-09-18)

- Added Android-first clean onboarding, ownership-aware emulator/Metro guidance,
  and source-demo versus production/physical-device boundaries.
- Hardened authentication restoration, account isolation, protected navigation,
  and GRN signed-image cache handling.
- Added dispatch-number mobile contract coverage, invoice detail compatibility,
  status-bar lifecycle tests, and development-client cold-start regression tests.
- Verified 20 suites / 165 tests, typecheck, setup/dependency gates, fresh native
  debug build/install, core emulator workflows, and paired backend CI.
- Reconciled public onboarding, acceptance scope, maintainer redistribution
  attestation, tracked artwork provenance, and third-party icon/font notices.
- Restricted the release workflow to the exact `v0.2.2-demo` tag with positive
  and negative regression coverage; publication contains source archives only.

## Unreleased — second-pass review

- Documented incomplete backend integration, inactive CI, and dependency findings.
- Removed Docker/private-key inspection from setup; added read-only bootstrap checks.
- Fixed SecureStore config authentication, legacy JWT decoding, and customer table
  queries, with regression tests and corrected native/device setup instructions.

## 0.1.0

Initial source preview; not verified as a working end-to-end application.
