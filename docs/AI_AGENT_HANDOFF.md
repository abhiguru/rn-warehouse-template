# Final Mac execution handoff: complete physical-iPhone acceptance

Updated 2026-09-21 for execution on the separate Mac. Do not use GLM skills.
This is the final transfer handoff. The receiving agent must carry the complete
source-demo iPhone scope through fixes, review, merged CI, final-device rerun,
durable closure records, and cleanup. Do not stop after discovering defects and
do not create another handoff document for a later agent.

## Current status

The paired customer-history repair is reviewed, merged, green in default-branch
CI, and smoke-tested on an Android API-36 emulator. Do not recreate its PRs or
repeat it as open work.

| Repository | Merged implementation commit | Pull request | Main CI |
| --- | --- | --- | --- |
| `abhiguru/rn-warehouse-template` | `09919ebfbce1f6e819363eca7711c23dd29b155f` | [#15](https://github.com/abhiguru/rn-warehouse-template/pull/15) | [35605871279](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35605871279) |
| `abhiguru/supabase-warehouse-template` | `a1ad80741ddff97d4f9eb47a0066094f76ea476a` | [#11](https://github.com/abhiguru/supabase-warehouse-template/pull/11) | [35606744913](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35606744913) |

The documentation closure subsequently merged as mobile
`c2dd9878a7bd433eacdef028f3eb9a77b1623f96` and backend
`13ecd056760aa8e24bf0ea0523a4aa85fe1f4d9f`; both corresponding main CI runs
passed. These are documentation-only successors to the implementation pair.

Both backend workflow copies are byte-identical and intentionally pin mobile
implementation commit `09919ebfbce1f6e819363eca7711c23dd29b155f`. A later
mobile documentation-only commit does not require changing that pin.

The backend run verified 94 RPC names / 129 typed calls with zero missing names
and zero mismatches. A fresh Android Debug build on `Medium_Phone_API_36.1`
(API 36) completed and installed. Fictional customer OTP login succeeded; the
assigned customer displayed two GRNs and three recent dispatches. Force-stop and
launcher restart restored the authenticated Orders screen. See
`docs/NATIVE_ACCEPTANCE.md` and `docs/HANDOFF_REVIEW_2026-09-21.md` for the
durable scope and evidence.

The immutable `v0.2.2-demo` tags remain mobile
`6e6885786912fe9186285103e19de762e4ba88f8` and backend
`2959881d0e46a8797a98d10da8c7139217477476`. The customer-history repair is
post-release work and does not move or amend those tags.

## Checkout on another computer

Clone current `main` branches as siblings and record the actual HEADs:

```bash
mkdir -p ~/ws/warehouse-demo
cd ~/ws/warehouse-demo
git clone https://github.com/abhiguru/rn-warehouse-template.git
git clone https://github.com/abhiguru/supabase-warehouse-template.git
git -C rn-warehouse-template rev-parse HEAD
git -C supabase-warehouse-template rev-parse HEAD
```

Read applicable `AGENTS.md` instructions, then read:

1. Mobile `docs/HANDOFF_REVIEW_2026-09-21.md` for current priorities.
2. Mobile `docs/NATIVE_ACCEPTANCE.md` for Android and qualified iOS evidence.
3. Both `docs/DEVELOPER_HANDOFF.md` files.
4. Backend `docs/CLEAN_INSTALL.md` before starting checkout-owned services.

Use Node.js 22.18 or newer. Android emulator work requires the Android SDK, a
compatible JDK, and explicit ownership of the AVD and reverse mappings. Physical
iOS work requires a Mac with full Xcode and a connected iPhone; iOS has no
equivalent to `adb reverse`.

## Final Mac mission

Complete every step below in order. Treat a failing acceptance case as work to
repair and retest, not merely something to record. Use focused reviewed PRs,
merge only after required checks pass, and retest the final merged source on the
physical iPhone. A documentation-only commit after that final run does not
require another native rebuild.

### 1. Establish the exact clean starting pair

- Clone or update both `main` branches as clean sibling checkouts. Do not use the
  old `handoff/ios-acceptance-review` branches.
- Record both full starting SHAs and confirm the implementation commits above are
  ancestors. Inspect existing work before switching or pulling; preserve user
  changes.
- Verify Node.js 22.18+, full Xcode, the selected Xcode command-line path,
  `xcodebuild`, `xcrun`, CocoaPods, Docker/Compose, Git and GitHub authentication.
- Connect, unlock and trust the physical iPhone; enable Developer Mode if needed.
  Use local development signing. Never commit certificates, profiles, team IDs,
  device identifiers, generated native trees, `.env` files or secrets.

### 2. Make clean-checkout iPhone onboarding reproducible

- Create a unique checkout-owned Compose project and unused loopback ports by
  following backend `docs/CLEAN_INSTALL.md`. Generate configuration through the
  repository scripts; do not copy another checkout's credentials.
- Run setup, migration verification, doctor/health, setup rerun, owned stop and
  restart. Prove configuration and fictional data survive the rerun.
- Add a tracked USB-only iPhone connectivity procedure or helper for both the API
  and Metro. It must handle reconnect/address changes, configure the advertised
  API origin correctly, detect stale relays, and stop only processes it owns.
- Keep the API, OTP service, database and Metro off Wi-Fi, LAN and public
  listeners. iOS has no `adb reverse`; do not work around this by exposing the
  demo publicly.
- Rehearse the tracked instructions from a fresh checkout before calling the
  onboarding gap closed.

### 3. Build and install the current source cleanly

- Install locked JavaScript dependencies, generate the mobile environment with
  its repository script, run setup/bootstrap checks, and regenerate iOS native
  files through the documented Expo workflow.
- Install pods, build the Debug workspace with local development signing, install
  it on the physical iPhone, and launch it through the USB-only development path.
- Confirm the tracked warm-link config plugin survives a clean prebuild. Keep
  all machine-specific signing and generated native changes untracked.

### 4. Execute the complete physical-iPhone source-demo matrix

Record device model, redacted identifier, iOS/Xcode/CocoaPods/Node versions,
tested mobile and backend SHAs, and objective results for every case:

1. Fresh install, public configuration bootstrap, fictional admin login and
   assigned-customer login; verify each role exposes only its allowed screens.
2. Warm/cold restoration, expired-token refresh, logout/relogin, full
   stop/relaunch, and reboot/unlock persistence. Repeat the fail-closed
   SecureStore read/write instrumentation and remove it after the test; no
   AsyncStorage credential fallback may authenticate the app.
3. Bootstrap, OTP, image-upload and stock-mutation interruption/recovery. A
   failed request must show an error, stay retryable, and create no false success
   or duplicate stock/image record after one retry.
4. Parallel refresh single-flight and logout-during-delayed-refresh. Logout must
   win and a late refresh must not restore credentials.
5. Server-side account revocation must clear credentials and return to login,
   including after cold relaunch. Fix the currently open revoked-session UX.
   Assignment-only denial and network failure must show the correct error while
   preserving an otherwise valid session.
6. Verify the merged customer-history repair on the physical iPhone: the assigned
   fictional customer must see its GRNs and recent dispatches, including details
   and pagination where present; another customer's history must remain denied;
   backend failures must render a visible retryable error rather than an empty
   success state.
7. Camera permission denial, explanation, retry/grant, real camera capture,
   native photo picker, upload, reopen/display and deletion. Confirm admin and
   assigned-customer access boundaries.
8. Complete the warehouse walkthrough: create/reopen GRN, add images, partial and
   final dispatch, assigned-customer stock/cart add/change/remove, Item Pricing
   customer search and rate selection, invoice preview and saved invoice. Replace
   timestamped `Review customer <timestamp>` fixtures with readable fictional
   names or isolate them from normal UI, then verify real names remain intact.
9. Generate and open the native iOS share sheet for all four private documents:
   GRN, dispatch, invoice and customer stock summary. Confirm signed paths use the
   configured physical-device API origin and do not disclose privileged URLs.
10. Exercise warm and fully stopped deep links, allowed and denied role routes,
    Unicode parameters, repeated parameters, malformed percent encoding and
    invalid bytes. None may crash or bypass authorization.
11. Confirm default telemetry remains disabled, generated configuration stays
    ignored with restrictive permissions, logs/screenshots contain no secrets,
    and private files are inaccessible to the wrong fictional account.
12. Repeat setup/doctor/contract checks and the owned backend stop/restart after
    the walkthrough. Confirm saved data and configuration persist.

### 5. Repair, review and rerun until the matrix is closed

- Add focused regressions for every code defect found. Run the complete relevant
  mobile suite, setup tests, lint, typecheck, Expo compatibility/export and audit;
  run backend tests, migrations, contracts, isolated API checks and scans when
  backend behavior changes.
- If mobile implementation changes, push that exact commit first, update both
  byte-identical backend workflow copies to the same mobile commit, and rerun the
  paired contract/API jobs. Documentation-only mobile changes do not move the
  implementation pin.
- Merge through the existing review controls and wait for successful CI on both
  resulting `main` SHAs. Then perform the affected physical-iPhone cases again on
  those merged sources. For shared runtime/auth/navigation changes, also run an
  Android emulator smoke before closure.
- Do not weaken RLS, broaden grants, suppress a failure, or describe a partial
  result as a pass.

### 6. Close the handoff permanently

- Update `NATIVE_ACCEPTANCE.md`, `HANDOFF_REVIEW_2026-09-21.md`, both developer
  handoffs, readiness/checklist records and changelogs with the final pair, CI
  links, device scope, fixes, supported workflows and exclusions.
- Mark every source-demo iPhone row PASS. There must be no remaining iPhone row
  labeled PARTIAL, NOT RUN, acceptance defect, pending rerun or pending clean
  onboarding. Production-only exclusions stay explicit and do not block this
  source-demo closure.
- Replace this document's execution instructions with a short completed record or
  archive it. Do not create another continuation handoff.
- Stop only the checkout-owned backend, relays and Metro processes; remove test
  instrumentation; verify ignored signing/native/configuration artifacts were not
  committed; leave both repositories clean on current `main`.
- Report directly to the user with final SHAs, PRs, CI links, tested device/iOS
  versions, all matrix results and the remaining production-only exclusions.

## Completion boundary

This final Mac mission covers complete physical-iPhone acceptance for the local
source demo. Enabled telemetry delivery, App Store/TestFlight distribution,
production signing, production SMS/TLS/operations, retention/privacy deployment,
printing, sensors, Realtime, payments and unsupported integrations require their
own production credentials or hardware and remain outside this mission. Preserve
the existing `v0.2.2-demo` tags and do not attach native binaries to those
source-only prereleases.
