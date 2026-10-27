# Contributor guide

Expo SDK 57 / React Native 0.86 warehouse client for the companion backend
([`supabase-warehouse-template`](https://github.com/abhiguru/supabase-warehouse-template)).
Install that backend with its [operator guide](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/OPERATOR_INSTALL.md) before running the app against it.

## Server selection

- The app stores one active operator server (`src/config/operatorServer.ts`). On first launch the
  operator types or scans the server's **HTTPS origin**; `discoverOperator` reads `get-public-config`
  and the app checks the server identity, API compatibility and minimum client version before any
  session is restored (`src/config/operatorBootstrap.ts`, `app/_layout.tsx`).
- Switching servers (`OperatorServerSelection`) signs out, clears session-scoped state and only then
  commits the new origin. The configuration error screen can open the same selection; nothing is
  signed out until the operator confirms a change there.

## Credentials and the identity gate

- OTP sign-in returns a custom JWT pair stored in `expo-secure-store` (`src/config/supabaseConfig.ts`).
  Refresh is single-flight; every credentialed fetch goes through `gatedFetch`, which waits for
  `awaitIdentityGate` (foreground identity re-verification) and refuses once the session generation moves.
- Returning from the background re-verifies the server identity; a camera, picker or share round trip
  is a native hand-off (`src/config/nativeHandoff.ts`, `src/config/resumeLifecycle.ts`) and does not suspend work.
- A definitive refresh rejection (`success:false` payload or the `Session expired` P0001 exception)
  clears stored tokens and dispatches `forceLogoutOnInvalidToken` exactly once per generation;
  transport errors keep credentials. `useSessionGenerationGuard` moves the UI to the login screen when
  a profile is present but no tokens remain.
- A refresh that gets no answer (the 15 s limit, or a transport error) is sent once more with the same
  token, the repeat with a 5 s limit; if that fails too it is tried again in the background 2, 5, 10 and
  20 s later, inside 50 s of the first send. The backend (migration 44) answers a repeat within its
  grace period (`refresh_grace_seconds`, 60 by default) with the same successor; a facility that sets a
  shorter grace shortens what these attempts can save. A connectivity failure never clears the session.
- An access token is renewed a tenth of its lifetime ahead of its expiry, five minutes at most
  (`renewAheadMs` in `src/config/sessionLifecycle.ts`), and not again within a minute of being issued.
- `gatedFetch` aborts a request whose answer is not complete in time: 30 s for a read, 60 s for a write, 120 s for a
  Storage upload and the document and print functions (`REQUEST_TIME_LIMIT_MS`). The limit covers the body
  as well as the headers: the global fetch since Expo SDK 57 is `expo/fetch`, which resolves at the headers
  (unless a build sets `EXPO_PUBLIC_USE_RN_FETCH`), so a read's whole download gets 30 s. A request stays
  in flight until its body has been read (a write holds a
  server switch back that long; a switch aborts a read's body read). A HEAD request and a 204, 205 or 304
  answer end with their headers; a body that is never read stays in flight until the limit, so code that
  returns without reading one (a gateway's error page) calls `discardBody` (`src/config/discardBody.ts`),
  which ends the request at once without reading it. The error is a
  timeout to the error tables; a write that timed out may still have been applied. A refused refresh re-reads the
  secure store before the session ends, and a session that ends is also reported to `logout_session`.
- Expiry is judged on the device clock but set from the server's: the stored expiry is `exp` moved by
  (time received - `iat`). When the server refuses a token as expired anyway (`JWT expired`,
  `Invalid or expired access token`), the session is renewed once; a read is sent again, a write is not.
- `isReadRequest` decides which requests of the authenticated client are reads (GET/HEAD, read RPCs by
  name, Storage sign/list). Reads are aborted by a server switch; only writes hold it back. Name a new
  read RPC `get_`/`search_`/`check_`/`list_`/`count_`, or it is treated as a write.

## Dates and server answers

- **A calendar day goes to the server as `'YYYY-MM-DD'`** built from the phone's calendar
  (`toLocalISODate`, or `toCalendarDay` for a value that may be a timestamp). Never `toISOString()`:
  local midnight in India is 18:30 UTC of the day before, and the server takes the day from the text.
  `createGRN`/`updateGRN` and `createDispatch`/`updateDispatch` pass their date through `toCalendarDay`.
- **A date range the server reads as moments** (the GRN, dispatch and invoice lists; `timestamptz`)
  is sent as `startOfDayIST(day)` and `endOfDayIST(day)`: the zone (+05:30) is written out. The
  report RPCs take plain `date` parameters and bucket with `::date` in the database's zone, which the
  backend does not pin; see the changelog for what that leaves open.
- `get_customer_grn_items` and `get_customer_dispatch_items` apply a range only when both ends are
  given; `closeDateRange` fills an open end.
- **An RPC can refuse in its answer** (HTTP 200 with `{success:false, error|message}` or, for the
  older report functions, `{error, summary:null}`). Ask `rpcRefusal(data)` (`src/utils/rpcRefusal.ts`)
  before reading rows; read as data, a refusal is an empty list. The reporting services use
  `reportRefusal`/`refusedReport` from `src/services/reporting/reportEnvelope.ts`.
- **Never put a number on the left of `&&` in JSX** (`{item.weight && <Text/>}`): 0 is rendered as
  a bare number and React Native throws. Compare it (`Number(x) > 0 ? ... : null`).

## Roles and routes

- **Who is offered what is one table: `src/config/roles.ts`.** `isWarehouseUser` is admin,
  supervisor or staff; `isManager` is admin or supervisor; `isCustomerAccount` is a customer's
  own login. `canOpenScreen`, `settingsFeatureRows`, `reportScopeFor` and `userManagementActions`
  are built on them and mirror the backend's role table (its `docs/STAFF_GRN_POLICY.md`, "Roles
  after migration 45"). Do not add a flag called `isStaff`: it used to mean two opposite things.
  The screens it gates (`RoleGatedScreen`): sensors for warehouse users;
  customers and items (an item's rates are its Pricing tab, `app/item/[id].tsx`), user management,
  the operations dashboard and the price history (`app/item-price-history.tsx`, opened from an
  item's Pricing tab) for managers; enrollment review for
  administrators.
  `useRoleBasedAccess()` gives the same for the signed-in profile; `usePermissions()` gives
  create/update/delete and `isStaffRole` (the `staff` role only).
- **A report screen gets its scope from `useReportScope`** (`src/features/reports`): the
  all-customers list for warehouse users, the one customer of a customer account, or
  `ReportCustomerPicker` first for a customer account with several. A customer account is refused
  every all-customers RPC, so its requests always name one assigned customer (`get_customer_*`,
  `get_stock_aging_report(p_customer_uuid)`,
  `get_item_wise_stock_list(p_customer_id)`, `get_customer_grn_items`).
- **Every route is protected unless `src/navigation/routeAccess.ts` lists it as public.** The root
  layout applies it to the whole stack: `useRootRouteGuard` replaces the focused route (sign-in when
  signed out, home tabs for a role the route is not offered to, or for a signed-in person on the
  sign-in screen), and `GuardedScreen` (the stack's `screenLayout`) keeps a refused screen from
  mounting. Both run after `initializeAuth` has settled. A new role-only screen gets a row in
  `ROLE_GATED_ROUTES`; a new public screen a row in `PUBLIC_ROUTES`. The sign-in screen stays
  mounted under the code step, so a public screen is never hidden and only the focused route is
  navigated.

## Session-scoped state

`clearSessionScopedState` (`src/store/sessionScopedState.ts`) runs every clear function registered with
`registerSessionScoped(name, clear)` (`src/config/sessionScopedRegistry.ts`), in registration order. It cancels and
clears react-query, the autocomplete cache, the three form drafts (GRN, dispatch, invoice), the list filters, the
rate caches, every list cache (`clearAllCaches`), the image caches, the local photo files and the shared-documents
directory. It runs on logout, forced logout, account deletion and both server-switch paths. A module that keeps
session data outside the store registers its own clear (pass `{ onGenerationChange: true }` to also clear whenever the
session generation advances); `src/tests/sessionScopedRegistry.scan.test.ts` fails for a module under `src/services`
or `src/features` that holds a module-level `Map`, `Set` or object and neither registers nor is on its allow-list
with a reason. At this commit only the dispatch list keeps offline copies of list answers (a bounded cache in
`dispatch-service.ts`, keyed by session identity: origin, instance, subject), and it serves them only after an
offline failure; reports keep their own session-keyed cache (`src/features/reports/reportCache.ts`). The GRN, order,
invoice and stock list prefixes in `cacheConfig.ts` are cleared too, but no list service writes them today.

## Commands

```bash
npm ci                      # runs the three postinstall patches (not with --ignore-scripts)
node scripts/check-install.mjs   # all three patches are in place; also runs before start, android, ios, web, test
npm run verify:backports    # re-checks scripts/security-backports.json against node_modules
npm run typecheck && npm run typecheck:tests && npm run lint && npm test && npm run test:setup
npm run audit:dependencies -- --report-dir /tmp/dependency-security-report
npm run doctor              # read-only check against an installed backend
```

`npm test` runs Jest with `--maxWorkers=50%`: the worker count follows the CPU count of the machine (and of the CI
runner named by the repository variable `CI_RUNNER`). Measured 2026-10-27 on an 8-core development machine, 658 suites
green each time: 1 min 30 s with Jest's default of all cores but one, 2 min 12 s with two workers, 7 min 24 s with
`--runInBand`. Half the cores is used so that the slow UI suites (for example the 300-line invoice editor) keep
their time to spare under load. No suite needs `--runInBand`; add it only to debug one suite.

Dependabot ignores the packages pinned by the backports (`.github/dependabot.yml`); bump them together
with the manifest. It also ignores every package whose version the Expo SDK sets; move those together
in one SDK upgrade with `npx expo install --fix`.

## CI and releases

`.github/workflows/ci.yml` runs `Lint & Type Check` (expo doctor from the lockfile with `--no-install`, lint with a
`--max-warnings` limit, typecheck, test-file typecheck, jest, setup tests, Android bundle and its `audit:artifact -- dist`),
`Android debug artifact audit` (pinned JDK 17 / SDK 36 build and APK audit),
`dependencies` (backport verification and the dependency audit report) and `secrets` (history scan).
`release.yml` validates any semantic `v*` tag (`scripts/check-release.sh`) with the same gates plus
`expo export`; publishing a GitHub release stays a manual step after the validation run passes.

Three CI details to keep in step. (1) `expo-doctor` is a devDependency at an exact version and both workflows run
`npx --no-install expo-doctor`, so a run never fetches an unreviewed copy; bump it with each Expo SDK upgrade and let
`npm run audit:dependencies` cover its tree. (2) Lint is `npm run lint -- --max-warnings N` in `ci.yml` and
`release.yml` (the same N; `scripts/workflows.test.mjs` checks). N is the warning count today, almost all
`no-console` in `app/` and `src/`; lower it whenever warnings are fixed, never raise it. (3) `npm run audit:artifact -- dist`
scans every file of the Android export (the Hermes bundle too) and fails on a file it cannot scan.

Every CI job takes its runner from a repository variable (Settings, Secrets and variables, Actions,
Variables), a JSON value such as `["self-hosted","linux","x64","warehouse-vm"]`: `Android debug
artifact audit` reads `ANDROID_ARTIFACT_RUNNER`, the other jobs read `CI_RUNNER`. Without the variable
a job runs on `ubuntu-latest`, so a fork needs nothing; a pull request from a fork always runs on
GitHub's hosted runners, whatever the variables say, so a fork's code never runs on the project's
own machine. To go back to hosted runners, delete the variables. One self-hosted runner runs the
jobs one after another. The job is not a required check: when the runner is offline it waits (GitHub
gives up on a job after 24 hours in the queue) and merging is not blocked. On a runner that keeps
the Gradle caches the job took 11.5 minutes instead of 28.5 (measured 2026-10-11, second run in a
row).

Such a runner must provide the Android SDK with its command-line tools and `ANDROID_HOME` in the
runner's environment (the job fails early without it; the pinned packages are listed in the job and
checked by `scripts/check-android-sdk.mjs`). The job installs its own Node and JDK and uses no
Docker and no `sudo`. This repository is public, so code from a pull request, or from the install
script of a dependency, runs on that machine: use a dedicated one that holds nothing of value and
cannot reach your other machines, require approval before workflows run for pull requests from all
outside contributors (Settings, Actions, General; Dependabot's pull requests come from inside the
repository and need no approval), keep the workflow token read-only, and never point a release job
at it. `scripts/workflows.test.mjs` refuses a self-hosted label written into a workflow.
