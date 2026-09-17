# Changelog

## Unreleased — source-demo developer handoff (2026-09-18)

- Added Android-first clean onboarding, ownership-aware emulator/Metro guidance,
  and source-demo versus production/physical-device boundaries.
- Hardened authentication restoration, account isolation, protected navigation,
  and GRN signed-image cache handling.
- Added dispatch-number mobile contract coverage, invoice detail compatibility,
  status-bar lifecycle tests, and development-client cold-start regression tests.
- Verified 20 suites / 165 tests, typecheck, setup/dependency gates, fresh native
  debug build/install, core emulator workflows, and paired backend CI.

## Unreleased — second-pass review

- Documented incomplete backend integration, inactive CI, and dependency findings.
- Removed Docker/private-key inspection from setup; added read-only bootstrap checks.
- Fixed SecureStore config authentication, legacy JWT decoding, and customer table
  queries, with regression tests and corrected native/device setup instructions.

## 0.1.0

Initial source preview; not verified as a working end-to-end application.
