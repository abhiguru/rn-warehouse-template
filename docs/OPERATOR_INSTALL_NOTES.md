# Fresh operator Android installation notes

## Source and phase boundary — 2026-09-30

Backend baseline: `f18f51d4625e7f8c0d977ac69645804e318a9d49`, merged backend
[PR #68](https://github.com/abhiguru/supabase-warehouse-template/pull/68).
[Post-merge backend CI 36591024357](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/36591024357)
passed all seven jobs. Mobile candidate:
`8240cce9121a797fd0cf2e00e568a61985814ddb`, available on `codex/operator-mobile`
and [draft PR #33](https://github.com/abhiguru/rn-warehouse-template/pull/33).
Remote refs and GitHub PR status were verified before installation. Mobile
`main` was `272e434844b58d68fd714023a6ae11885a0f1a21`; it is not the candidate.

Clean detached installation sources and separate review worktrees preserve the
exact version boundary. No Android dependencies or native tools have been
installed for this attempt yet. Read the README, developer handoff,
NATIVE_ACCEPTANCE, LOCAL_PRODUCTION_READINESS and CI workflow first. No AGENTS.md
was found in either checkout or their workspace parents.

Begin Android installation only after this independent backend passes local and
public doctor and identity discovery. The fresh host is Ubuntu 24.04.3 x86-64
VMware with 5.7 GiB RAM, 4 GiB swap and initially 63 GiB free disk. Backend host
preparation installed Node 22.23.3/npm 10.9.9. JDK, SDK, ADB and device selection
are still outstanding. Historical phones, APKs and successful compilation do not
count as this attempt's device acceptance.

## Findings

| Environment / trigger | Expected versus actual | Correction | Verification and limitation |
| --- | --- | --- | --- |
| Candidate README `git clone` sequence | Candidate changes expected; clone defaults to a different main commit | Pin full candidate before npm/setup; record both sources and clean status | Remote candidate availability PASS; Android installation not started |
| Mobile handoff at candidate | Backend branch/PR described as current review dependency; backend PR #68 has merged | Link pinned backend merge documentation and distinguish mobile draft | GitHub backend merge and seven CI jobs PASS; no fresh backend/device acceptance inherited |
| Read historical Android build workflow | Standalone warehouse operation required; documented debug APK normally requires Metro | Treat debug compilation/audit as limited evidence; establish a supported bundled test build and test without Metro/USB in phase 2 | No standalone artifact or device pass claimed yet |

## Current acceptance matrix

| Required case | Status | Evidence / next resource |
| --- | --- | --- |
| Exact source availability and version record | PASS | Full SHAs and remote PR refs above |
| Backend local/public installation | BLOCKED | Backend phase still in progress; no Android installation yet |
| npm ci, SDK compatibility, Expo Doctor, unit/setup, lint, typecheck, contract, dependency and secret checks | NOT TESTED | Run after backend installation passes |
| Android SDK/JDK/native generation and build | NOT TESTED | Install documented native prerequisites in phase 2 |
| Artifact hash/build ID/audit | NOT TESTED | No current artifact |
| Selected physical Android model/OS/install | BLOCKED | Device selection not yet requested; keep serial private |
| Emulator alternative | NOT TESTED | Emulator results cannot close physical acceptance |
| Manual server selection and displayed identity | NOT TESTED | Test on exact installed artifact and independent origin |
| QR selection | NOT TESTED | Requires selected device camera |
| Malformed origins, cold launch, foreground/background, selected-server persistence | NOT TESTED | Current native run required |
| Standalone operation without Metro/USB | NOT TESTED | Bundled artifact and disconnected-device launch required |
| Administrator/customer login, pending approval and approval | BLOCKED | No-SMS instruction remains in force |
| Logout, expired/revoked sessions, offline/reconnect, Realtime, images and authorized PDFs | BLOCKED | Requires permitted authentication and exact native artifact |
| Wi-Fi | NOT TESTED | Actual selected device/network observation required |
| Cellular | NOT TESTED | Record unavailable cellular separately |
| Cross-instance and replacement-instance isolation | BLOCKED | Needs second isolated running instance; never use the live pilot |

Keep phones, credentials, sessions, device serials, raw logs and signing material
outside Git in private storage. Do not introduce a fixed OTP or auth bypass.
Printing, sensors, iPhone, external alerts, rotation, image-security research,
recovery rehearsal, host reboot, release publication and unrelated PR merges stay
outside this exercise. Existing release gates and unresolved findings remain.

This is an in-progress record, not a reproducible-build or end-to-end acceptance
claim. Revised instructions still require clean-source verification with separate
owned state before the final handoff.
