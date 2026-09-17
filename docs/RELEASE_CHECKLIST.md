# Open-source release checklist

## v0.2.2-demo source-only prerelease — 2026-09-18

- [x] Android-first source-demo acceptance summarized in
      `SOURCE_DEMO_ACCEPTANCE.md`; physical hardware, iOS, production, printing,
      sensors, payments, and unsupported integrations remain separate gates.
- [x] Maintainer redistribution attestation and tracked-material/third-party
      inventory reconciled in `ATTRIBUTION_REVIEW.md` and
      `../THIRD_PARTY_NOTICES.md`; no unresolved source-only provenance blocker.
- [x] Exact `v0.2.2-demo` positive/negative gate tests and required local checks
      pass: 165 Jest tests, 18 setup/gate tests, typecheck, zero-error lint, Expo
      compatibility/export, zero-vulnerability audit, and source/history scan.
- [ ] Required hosted PR/default-branch checks pass for the release-preparation
      change.
- [ ] Mobile change merges through review and resulting `main` CI passes.
- [ ] Backend pins that exact mobile `main` SHA in both byte-identical CI copies,
      merges through review, and resulting paired CI passes.
- [ ] Matching immutable tags pass tag validation before either GitHub release is
      published.
- [ ] Both GitHub releases are prereleases with generated source archives only,
      matching cross-links, and no uploaded binaries or latest-stable designation.

The final tag SHAs and workflow/release URLs are recorded in GitHub release notes
and the external delivery ledger to avoid circular commit-SHA documentation.
Historical release records follow.

**Follow-up status — 2026-09-15:** See [the dated verification ledger](RESUME_VERIFICATION_2026-09-15.md)
for current local checks and open native/review gates. Evidence below dated
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
| R06 | Acceptance, open | Native build and actual Android UI workflow require separate evidence | See mobile NATIVE_ACCEPTANCE.md for recorded build/UI results | Physical Android, iOS and hardware camera remain untested |
| R07 | High onboarding/CI, follow-up | Backend branch inference selected old or nonexistent mobile branch | Both CI companion checkouts pinned to released mobile SHA; both tested SHAs printed | Follow-up CI must pass before merge; tags are not moved |

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
rotation is part of this work. Current main is a local-demo checkpoint, not a
production-ready or native-device-accepted release.
