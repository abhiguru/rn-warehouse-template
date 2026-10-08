# Contributor guide

Expo SDK 54 / React Native 0.81 warehouse client for the companion backend
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

## Session-scoped state

`clearSessionScopedState` (`src/store/sessionScopedState.ts`) cancels and clears react-query, the
autocomplete cache, the four form drafts, every list cache (`clearAllCaches`) and the shared-documents
directory. It runs on logout, forced logout, account deletion and both server-switch paths. List caches are
keyed by session identity (origin, instance, subject) and are served only for offline failures.

## Commands

```bash
npm ci                      # runs the three postinstall patches
npm run verify:backports    # re-checks scripts/security-backports.json against node_modules
npm run typecheck && npm run lint && npm test && npm run test:setup
npm run audit:dependencies -- --report-dir /tmp/dependency-security-report
npm run doctor              # read-only check against an installed backend
```

Dependabot ignores the packages pinned by the backports (`.github/dependabot.yml`); bump them together
with the manifest.

## CI and releases

`.github/workflows/ci.yml` runs `Lint & Type Check` (expo doctor, lint, typecheck, jest, setup tests,
Android bundle), `Android debug artifact audit` (pinned JDK 17 / SDK 36 build and APK audit),
`dependencies` (backport verification and the dependency audit report) and `secrets` (history scan).
`release.yml` validates any semantic `v*` tag (`scripts/check-release.sh`) with the same gates plus
`expo export`; publishing a GitHub release stays a manual step after the validation run passes.
