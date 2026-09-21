# AI agent handoff: warehouse demo, after iOS acceptance

Prepared 2026-09-21 for continuation on another computer. Continue from the
published work below. Do not use GLM skills.

## Objective and current status

Finish the developer handoff for the paired warehouse source-demo repositories.
The immediate next step is to create or find the two review PRs, verify CI for
the exact submitted pair, and resolve review/CI blockers. Then address the
documented product and onboarding gaps in focused follow-up changes.

Ordered items 1 and 2 were completed earlier. Item 3's physical-iOS matrix was
executed and documented with known defects; this is qualified acceptance, not
an all-green product sign-off. Item 4 has not started. Its definition is not
included in this handoff; retrieve the original ordered plan before starting it.

The implementation commits listed below were pushed and verified on GitHub.
This note is a subsequent documentation-only addition to the mobile branch.
Both local worktrees were clean before adding the note. No PR was created by
the previous agent, and CI for these commits has not been verified.
Check current GitHub state before
creating duplicates or making claims about review/merge status.

## Repositories and published implementation baselines

Both repositories use branch `handoff/ios-acceptance-review`.

| Repository | Suggested sibling directory | Published implementation commit |
| --- | --- | --- |
| `abhiguru/rn-warehouse-template` | `rn-warehouse-template` | `ab0e8cb0e13bf6dc1c2fab580648d603b03c1073` |
| `abhiguru/supabase-warehouse-template` | `supabase-warehouse-template` | `553779ae62f14e00cd4f32e48ecc07e0624aee92` |

Remote URLs:

- https://github.com/abhiguru/rn-warehouse-template.git
- https://github.com/abhiguru/supabase-warehouse-template.git

On a computer without these checkouts, clone the published branches as siblings:

```bash
mkdir -p ~/ws/warehouse-demo
cd ~/ws/warehouse-demo
git clone --branch handoff/ios-acceptance-review https://github.com/abhiguru/rn-warehouse-template.git
git clone --branch handoff/ios-acceptance-review https://github.com/abhiguru/supabase-warehouse-template.git
git -C rn-warehouse-template rev-parse HEAD
git -C supabase-warehouse-template rev-parse HEAD
```

For existing checkouts, inspect uncommitted work and branch state before fetching
or switching. The mobile branch HEAD is newer than its implementation baseline
because it includes this note. Verify the baseline is an ancestor with
`git merge-base --is-ancestor BASELINE_SHA HEAD`; record actual HEADs rather than
assuming the table lists the latest revisions. Read this tracked file at
`rn-warehouse-template/docs/AI_AGENT_HANDOFF.md` after cloning.

Install dependencies and generate configuration on the receiving computer.
Use Node.js 22.18 or newer. Physical iOS validation requires a Mac with full
Xcode and a connected iPhone; an agent on Linux can handle code, PRs and CI but
must leave iOS device checks for the Mac. Consult the clean-install guide before
starting backend services.

PR creation pages (these are not existing PRs):

- https://github.com/abhiguru/rn-warehouse-template/pull/new/handoff/ios-acceptance-review
- https://github.com/abhiguru/supabase-warehouse-template/pull/new/handoff/ios-acceptance-review

Preserve the immutable `v0.2.2-demo` tags. Their target commits are mobile
`6e6885786912fe9186285103e19de762e4ba88f8` and backend
`2959881d0e46a8797a98d10da8c7139217477476`. Those tags do not contain the new
handoff fixes. Use the published review branches, or their reviewed successors
if they have since merged. Fetch and inspect state; do not reset user changes.

## Read first

Read applicable `AGENTS.md` instructions, then these repository-relative files:

1. Mobile `docs/HANDOFF_REVIEW_2026-09-21.md` — authoritative priorities,
   acceptance qualifications, validation and cleanup record.
2. Mobile `docs/NATIVE_ACCEPTANCE.md` — physical iPhone and separate Android evidence.
3. Both repositories' `docs/DEVELOPER_HANDOFF.md` and `docs/SOURCE_DEMO_ACCEPTANCE.md`.
4. Backend `docs/CLEAN_INSTALL.md` and both contribution/PR guides.

The backend's `.github/workflows/ci.yml` and `docs/github-workflows/ci.yml` are
byte-identical and both pin mobile commit `ab0e8cb0e13bf6dc1c2fab580648d603b03c1073`.
Keep them synchronized. This documentation-only note does not change the runtime
or contract, so the existing mobile implementation pin remains intentional.
If mobile implementation changes during review, publish that commit before
deliberately updating both pins and rerunning paired validation.

## Work already completed

- Fixed Item Pricing customer selection by normalizing wrapped and direct-array
  `search_customers` results.
- Added Dispatch feedback when all available lots are already in the draft,
  with a working **View All** action.
- Fixed private PDF signed URLs using internal/loopback hosts so physical iOS
  downloads use the configured API origin. All four iOS share paths were tested.
- Fixed warm iOS deep-link delivery and added an Expo config plugin so the native
  bridge survives prebuild, plus hook/plugin regression tests.
- Fixed symlink-sensitive CLI entry checks in both repositories. macOS `/var`
  versus `/private/var` paths previously caused setup, migration planning,
  doctor, bootstrap or postinstall scripts to silently skip execution. This was
  the cause of the formerly failing backend exit-1-versus-42 fixture; it was
  incorrectly attributed to the sandbox earlier. New symlink tests pass.
- Updated handoff, acceptance and changelog records with qualified results.
- Documented customization: staff can configure item rates; billing-day policy
  changes require backend code/fixtures. PDF branding uses `COMPANY_NAME` and
  `functions/_shared/document-html.ts`; there is no runtime branding editor.

## Next actions and completion criteria

1. Verify published branches, find/create paired PRs targeting `main`, and
   describe the changes and known limitations accurately. Attach PRs to the task
   if supported. Check the current commits' CI, not historical green runs.
   Resolve relevant failures and report whether each PR is ready to merge.
2. Fix customer GRN and recent-dispatch views. They call staff-only
   `get_all_grn_items` / `get_dispatch_list_with_items`, producing empty or failed
   customer views despite existing data. Start with `src/services/grn-service.ts`,
   `src/services/dispatch-service.ts`, `src/components/GRNListFiori.tsx` and
   `src/components/RecentDispatchesSection.tsx`. Use customer-authorized contracts
   and explicit response mapping. Verify assigned-customer results, other-customer
   denial, pagination, visible errors and unchanged staff behavior. Do not broaden
   grants or weaken RLS to satisfy the screens.
3. Make physical-iPhone onboarding reproducible. The successful run used temporary
   USB-only API/bundle relays that were removed. Supply a reviewed procedure/helper
   with reconnect detection, API-origin handling and owned-process shutdown, then
   rehearse from a fresh checkout. iOS does not support `adb reverse`.
4. Fix revoked-session UX: protected data is correctly denied, but the stock
   screen remains failed instead of clearing credentials and returning to login.
   Inspect the shared error handling/auth invalidation path. Test logout and cold
   relaunch, while ensuring assignment denial or network failure does not erase
   otherwise valid credentials.
5. Clean up readable fictional fixture names or test-data isolation. Pricing
   displays `Review customer <timestamp>`; the orange number is a record count,
   not an identifier leak. Preserve real customer names and records.
6. Record final commit-pair evidence, perform a clean native rebuild/smoke, and
   repeat Android smoke for shared JavaScript changes. Keep unresolved work and
   unexecuted checks explicit in the developer handoff.

## Validation already recorded

Under Node.js 22.23.1:

- Mobile: 23 Jest suites / 177 tests, 19 setup tests, typecheck and ESLint error
  check passed. Existing lint warnings remain.
- Backend: 17/17 unit tests passed after the CLI-path fix.
- Static companion contract: 93 RPC names / 127 typed calls, zero missing names
  and zero mismatches.
- Both npm audits reported zero vulnerabilities. Expo online compatibility
  reported dependencies up to date with `EXPO_NO_CACHE=1`.
- Physical acceptance used an iPhone 15, Xcode 26.3, CocoaPods 1.16.2 and Personal
  Team development signing. Refer to the native record for each test's scope.

Useful local commands (select the appropriate repository first):

```bash
node --version # Must be 22.18+; the recorded run used 22.23.1.
# Mobile
npm test -- --silent --watchman=false
npm run test:setup
npm run typecheck
npx eslint . --ext .ts,.tsx --quiet
EXPO_NO_CACHE=1 EXPO_NO_TELEMETRY=1 npx expo install --check
npm audit --audit-level=high
# Backend
npm test
node scripts/check-mobile-contract.mjs ../rn-warehouse-template
```

The source Mac's default Node was 22.14.0; a compliant 22.23.1 was installed
through NVM. Select an appropriate runtime on the receiving computer rather
than copying that machine's PATH. `--watchman=false` avoided the source agent
sandbox's Watchman LaunchAgent restriction.
Docker was unavailable at final review. Fresh setup, migrations, live API and
live contract checks were not rerun after the CLI fix; use paired CI or an
isolated Docker rehearsal. Earlier API/device evidence does not prove a fresh
build of the final submitted commits.

## Environment, authentication and boundaries

On the source Mac, the agent shell could fetch public GitHub refs but could not
obtain Keychain
credentials (`failed to get: -67674`); SSH was also denied. The user successfully
pushed both branches from their own Mac Terminal, and the previous agent verified
the remote SHAs. Git 2.50.1 and Apple command-line tools are installed; missing
Git is not the blocker. GitHub CLI `gh` was not found. Recheck authentication on
the receiving computer; this source-Mac failure may not apply there. Do not request
credentials in chat or assume a browser login automatically authenticates terminal Git.

Temporary instrumentation, API/bundle relays, SSH forward and helper files were
removed or stopped. Ports 8081 and 18000 had no listeners at cleanup. The ignored
mobile `.env` points to `http://localhost:18000`; the generated AppDelegate again
uses the standard Metro resolver. Re-establish development connectivity before
expecting the phone app to run. Recheck device attachment/unlock and Docker state
on the execution host.

Use fictional demo data and checkout-owned Compose projects. Keep demo OTP/API
services off LAN/public listeners. Do not transfer `.env`, `node_modules`, native
build directories, signing keys or provisioning profiles between machines.
Preserve existing credentials/configuration and applied migrations; add migrations
when needed. Personal Team signing is development-only evidence.

Enabled telemetry has not been tested because no dedicated DSN/project was
provided. Keep it disabled unless that scope is explicitly configured. Production
SMS/TLS/operations, distribution signing, retention/privacy declarations, printing
and sensors remain separate gates. Do not describe this source demo as production-ready.

Finish by reporting the exact commits, PR links, current CI results, device
evidence, outstanding gaps and next required user action, if any.
