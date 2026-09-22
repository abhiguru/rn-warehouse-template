# Open-source release checklist

## Post-release local-readiness follow-up — 2026-09-22

- [x] Build a fresh Android development APK and audit archive paths, embedded
  text, permissions, public certificates, hash, and applicable notices.
- [x] Add the artifact unit tests and CI build/audit job without uploading a
  binary; keep active/documented workflow copies byte-identical.
- [x] Link the companion backend's provider-independent checks for areas 1–10.
- [ ] Audit final release-signed Android/iOS artifacts, privacy/store metadata,
  and enabled telemetry using owned credentials and target distribution paths.
- [ ] Clear the companion backend's all-profile image-scan blocker and its
  external/provider/operator production gates.

This follow-up does not move or republish `v0.2.2-demo`. See
[LOCAL_PRODUCTION_READINESS.md](LOCAL_PRODUCTION_READINESS.md).

## v0.2.2-demo source-only prerelease — 2026-09-18

- [x] Android-first source-demo acceptance summarized in
      `SOURCE_DEMO_ACCEPTANCE.md`; physical hardware was a separate gate at
      publication and is covered by the later records below. The post-release
      physical-iPhone source-demo gate is now closed; production, printing,
      sensors, payments and unsupported integrations remain separate.
- [x] Maintainer redistribution attestation and tracked-material/third-party
      inventory reconciled in `ATTRIBUTION_REVIEW.md` and
      `../THIRD_PARTY_NOTICES.md`; no unresolved source-only provenance blocker.
- [x] Exact `v0.2.2-demo` positive/negative gate tests and required local checks
      pass: 165 Jest tests, 18 setup/gate tests, typecheck, zero-error lint, Expo
      compatibility/export, zero-vulnerability audit, and source/history scan.
- [x] Required hosted PR/default-branch checks pass for the release-preparation
      change: mobile PR #11 and backend PR #8 passed their required checks.
- [x] Mobile change merged through review as
      `6e6885786912fe9186285103e19de762e4ba88f8`; main CI run `35274817895`
      passed.
- [x] Backend pins that exact mobile `main` SHA in both byte-identical CI
      copies, merged as `2959881d0e46a8797a98d10da8c7139217477476`, and
      paired main CI run `35275536840` passed.
- [x] Matching immutable tags passed tag validation before publication: mobile
      run `35276024942` and backend run `35276027479`.
- [x] Both GitHub releases are prereleases with generated source archives only,
      matching cross-links, zero uploaded assets, and no latest-stable
      designation.

The final tag SHAs and workflow/release URLs are recorded in GitHub release notes
and the external delivery ledger to avoid circular commit-SHA documentation.

## Post-release physical Android acceptance — 2026-09-18

- [x] Fresh debug install on physical Samsung SM-A346E, Android 15/API 35,
      using mobile `7a9c6449c01600ccbbe92b1071df845a63d0f861` with backend
      `1898dc79588f5db0a6d6dae520d5fa663548eb8f`.
- [x] Admin/customer login and role screens, secure-session cold restoration,
      logout/re-login, authenticated cold deep link, and customer denial on the
      admin-only Users route passed.
- [x] API-disconnect fail-closed behavior and retry recovery passed through an
      explicitly owned USB reverse mapping.
- [x] Initial camera denial, retry/grant, physical capture, Android Photo Picker,
      and two-image return to the GRN item form passed.
- [x] Invoice PDF generation, private download, cache cleanup, and native share
      sheet passed. No external share target was selected.

The run used fictional demo data. Its two reverse mappings were removed and
Metro was stopped afterward. Production/distribution gates remain open.

## Post-release physical iPhone acceptance — 2026-09-22

- [x] Mobile PR #18 merged as
      `9ba56ff122dc38dc57d6100de4c27599023d22b1`; backend PR #13 merged as
      `cf18f1e43ab613310b1b13339ab97e8533861f9b`.
- [x] Exact-main CI passed in mobile run `35686164009` and backend run
      `35686198287`.
- [x] Final evidence corrections also passed exact-main CI in mobile run
      `35690385027` and backend run `35690411801`.
- [x] Tracked checkout-owned USB-only API/Metro onboarding passed disconnect,
      reconnect, address change, status and ownership-scoped shutdown behavior.
- [x] Fresh build/install/bootstrap, admin/customer roles, secure restoration,
      expired refresh, logout/relogin, reboot/unlock, SecureStore failure,
      refresh races and definitive revocation behavior passed on iPhone 15 /
      iOS 26.6.2.
- [x] Interruption/retry, customer history, camera/picker/images, GRN/dispatch,
      stock/cart, pricing/invoice, all four private PDFs and protected/malformed
      deep links passed with fictional demo data.
- [x] Temporary probes were removed; generated native/config/signing artifacts
      stayed ignored; existing `v0.2.2-demo` tags were not moved.

Historical release records follow.

**Historical follow-up status — 2026-09-15:** See [the dated verification ledger](RESUME_VERIFICATION_2026-09-15.md)
for that checkpoint's local checks and open native/review gates. Evidence below dated
2026-09-14 or earlier describes the historical release checkpoint. The
pending mobile authentication/privacy fixes and backend follow-up commits
are outside the immutable `v0.2.1-demo` tags. Local follow-up results do
not establish merged-main CI or physical-device acceptance.

## v0.2.1-demo release and verification follow-up — 2026-09-14

Published source-only prerelease pair (no native assets): mobile
`8f22fbd14ee93816e42c120eef91a689a2da98c7`, backend
`35cfa90f41cc25fb91cae6d966551d9774faf3d5`. Historical tags stay unchanged.
Node 22.23.2 / npm 10.9.8; Expo SDK 54 / React Native 0.81.5.
Mobile main [CI 34825877719](https://github.com/abhiguru/rn-warehouse-template/actions/runs/34825877719)
passed. Backend main [CI 34825847890](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/34825847890)
failed live contracts because its mobile checkout was the older `48e804c`.
The subsequent API/setup-rerun steps were skipped. Publication alone therefore
does not establish the full release acceptance gate.

| ID | Severity | Reproduction / finding | Fix / regression evidence | Remaining limitation |
| --- | --- | --- | --- | --- |
| R01 | High, fixed | Auth config survived logout/account changes and expired memory caches | Origin/session scoped TTL caches; rejection, expiry and late-response tests in released mobile | Server authorization remains authoritative |
| R02 | High, fixed | Refresh completion could restore a logged-out session | Serialized credential writes, session generation, Redux request guards; migration 07 and refresh/logout API race | Offline server revocation must wait for connectivity |
| R03 | Moderate, fixed | Navigation pulled vulnerable decoder <=0.4.2 | Upstream 0.5.0, checked CommonJS adapter and actual navigation/malformed-input tests; SDK 54 retained | Version/content checks deliberately fail on unexpected dependency changes |
| R04 | High, fixed | Contributor command targeted a generic database container | Checkout ownership wrappers, disposable migration tests, read-only doctors, exclusive config creation | Demo remains loopback-only |
| R05 | Review, covered API cases | Images, orders, invoice/report values, role changes and retries lacked coverage | Full demo API passes locally; confirmed GRN/dispatch customer isolation, staff-only customer-images, explicit 950/48/998 invoice fixture, duration boundaries, concurrent stock mutations and rollback | See backend INVOICE_RULES.md; legacy dual-rate overload unsupported; payments not comprehensively accepted |
| R06 | Acceptance, later closed | Native build and actual Android UI workflow required separate evidence at this historical checkpoint | See mobile NATIVE_ACCEPTANCE.md for the later Android and complete iPhone records | Production distribution and optional hardware remain separate |
| R07 | High onboarding/CI, fixed | Backend branch inference selected old or nonexistent mobile branch | Both CI companion checkouts pin the reviewed mobile implementation tree; paired CI passed | Historical tags are not moved |

Local review services use API 28000, HTTPS 28443, Studio 55325, database 25433,
and renderer 23100, all on 127.0.0.1 under project `warehouse-v021-review`.
These differ from quickstart defaults (API 18000, Studio 54325, database 15433,
renderer 13100). No pooler was started for the review. These test services do
not establish production readiness.




The ordered checklist for both repositories is maintained in the backend:

[Shared release checklist](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/RELEASE_CHECKLIST.md)

For sibling local checkouts: [local checklist](../../supabase-warehouse-template/docs/RELEASE_CHECKLIST.md).

Work is confined to the new open-source repositories. Original repositories,
deployments and credentials must remain unchanged; no credential revocation or
rotation is part of this work. Current main is a physical-device-accepted local
source demo, not a production-ready or production-signed/app-store release.
