# Second-pass readiness review — 2026-09-10

## Status

The mobile code installs and passes local checks, but the published pair is not
yet an end-to-end starter. The companion backend's initial migration fails on
an empty database. Its name inventory lacks 70 of 76 literal RPC calls, four
tables, and seven PDF/print functions required by this app. See the backend
[readiness checklist](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/READINESS.md)
and [API inventory](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/API_CONTRACT.md).

Do not describe the v0.1.0 pair as production-ready or a working ten-minute demo.

## Second-pass fixes

- Setup uses `npm ci`, checks Node 22.18+, and preserves an existing `.env`.
- Removed Docker inspection and service-role credential retrieval from the old
  key-update script. Public configuration is already fetched at app bootstrap.
  `npm run check:backend` validates that endpoint without copying keys or changing
  any environment file; errors and device/backend URL mismatches fail clearly.
- Changed the default API port to 18000 to distinguish the starter from an
  existing Supabase installation. Documented emulator/phone URLs and native builds.
- Authenticated configuration now uses the central SecureStore/session token
  lookup instead of the removed legacy AsyncStorage key. Legacy base64 JWTs are
  decoded before migration. Added regression tests for both paths and expiry.
- Fixed three customer queries using the nonexistent singular `customer` table.
- Removed the leftover service-key environment type. Aligned app/runtime version
  with package version 0.1.0 and corrected the iOS minimum to 15.1.

## Verification

Fresh-checkout `npm ci`, TypeScript, ESLint error checks, and **41 Jest tests**
passed. Public-bootstrap script regression tests also passed. These cover local
code, not completed database integration. A fresh Android JS export also passed
in this second pass (2,934 modules, 45 assets); this is not a compiled native app.

`npm audit` on 2026-09-10 reports **29 dependency findings: nine high and 20
moderate**. They include the Expo/Metro toolchain and transitive parsing packages.
They were not suppressed or force-upgraded. A supported SDK migration and native
regression tests are required; avoid exposing Metro to untrusted networks.

GitHub Actions are not active: workflow definitions live in
`docs/github-workflows/`. Enabling them needs a maintainer with workflow permission.
The audit job will remain red until the dependency findings are addressed.

## Required before saying “hit the ground running”

1. Complete and sanitize the backend export and its seed/demo/admin setup, without
   including original credentials, production data, private keys, or git history.
2. Pass backend migration, RPC/signature, storage-policy, and role-isolation tests.
3. From a fresh app install, test OTP success/failure/replay/expiry, registration,
   admin/customer assignments, inactive accounts, logout, app restart, and token
   refresh. The inherited session/refresh behavior still needs end-to-end review.
4. Test customer creation, GRN/image upload, stock, dispatch, invoice/payment,
   orders/reports, PDF generation, and optional printer/sensor flows. Inventory
   coverage is a lower bound; dynamic endpoints must also be checked.
5. Build Android and iOS natively; test emulator and physical-device connectivity,
   HTTP-development/HTTPS-production behavior, camera permissions, secure storage,
   deep links, and offline/error states. Expo Go/bundle success cannot establish this.
6. Address dependency findings, check all assets/licenses and store privacy claims,
   enable CI and dependency/secret scanning, and verify release artifacts contain
   no signing credentials, private URLs/keys, customer data, or original history.

The SDK-specific platform corrections use the
[Expo SDK compatibility table](https://docs.expo.dev/versions/latest/).
Existing private repositories and credentials were not changed by this pass.
