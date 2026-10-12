# CLAUDE.md — rn-warehouse-template

Guidance for Claude Code (and other contributors) working in this repository.

## What this app is for

One mobile app that a cold-storage **owner**, their **staff** and their **clients** all use
for orders, tracking, goods receipts (GRN), dispatch, invoices and stock.

- It is meant to be launched by the **Gujarat Cold Storage Association (GCSA)** for its members.
- Every member **self-hosts the backend on premise**
  ([supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template));
  some owners run **several facilities**, each with its own backend.
- **Login is central; data is not.** A central service only proves who the user is. There is
  **no central data store**: business data stays in each facility's backend.
- After signing in, a user sees the **association's list of facilities**, adds facilities to
  **their own list** in the app, and sees a facility's data **only after that facility
  authorizes them**. The facility decides the role and customers, and can **revoke** access
  at any time without involving the central service.
- Intended flow: **central sign-in → choose a facility → data is fetched from that
  facility's backend.**

The target design, open questions and the research behind it are in
[docs/CENTRAL_LOGIN.md](docs/CENTRAL_LOGIN.md). Read it before changing sign-in, server
selection or session handling.

## Central login in the app (built 2026-10-12, off by default)

On only in a build that sets `EXPO_PUBLIC_CENTRAL_ORIGIN` (`isCentralLoginConfigured()` in
`src/config/envConfig.ts`). Then: central sign-in (`app/central-login.tsx`,
`src/config/centralSession.ts`, its own `secure_central_*` keys and plain `fetch`, never
`gatedFetch`), My facilities (`app/facilities.tsx`, `src/config/centralFacilities.ts`), and
opening a facility (`src/config/openFacility.ts`: discover, the shared switch sequence in
`src/store/operatorSwitch.ts`, a facility token, `central-exchange`). Transient central state
that screens and the route guard share is in `src/config/centralState.ts`, outside React,
because a server change rebuilds the navigation tree. With central login off every screen and
route decision must stay exactly as described below; keep both paths tested.

## How it works without central login

- The user enters one facility's HTTPS origin (`app/operator-server.tsx`,
  `src/config/operatorServer.ts`); the app validates its public discovery document.
- Sign-in is an SMS code sent by that facility's own backend (`app/login.tsx`, `app/otp.tsx`,
  `src/config/supabaseConfig.ts`); sessions are the backend's custom JWT + refresh token.
- Every request goes through `gatedFetch` in `src/config/supabaseConfig.ts` (identity gate,
  server-switch and session-generation checks, rotated-key detection). Keep new network code
  on that path.
- Roles: `admin`, `supervisor`, `staff`, `customer`. Who is offered which screen is one table
  in `src/config/roles.ts`; `src/navigation/routeAccess.ts` sends a signed-out or wrong-role
  visitor away from a route. `src/hooks/useRoleBasedAccess.ts` reads the table for a screen and
  `src/config/permissions.ts` holds create/read/update/delete per role. The server decides
  again on every request. Staff have full order access (2026-10-09 decision).

When building toward central login, reuse the existing pieces rather than replacing them:
server switching and its cleanup (`beginOperatorSwitch`, `sessionLifecycle.ts`,
`operatorResumeGate`), the enrollment-review flow (`app/enrollment-review.tsx`) for
facility access requests, and forced sign-out (`forceLogoutOnInvalidToken`).

## Working rules

- Checks before a pull request: `npm test`, `npm run typecheck`, `npm run lint`
  (no new warnings in changed files). CI runs the same plus an Android build audit.
- Add or update tests with every behavior change (Jest; see `src/**/__tests__`).
- Never commit secrets, signing keys, `.env` or generated `android/`/`ios/` folders.
- Use fictional names and phone numbers in tests, fixtures and screenshots.
- UI follows the existing SAP Fiori-style components and theme (`src/components/fiori`,
  `src/theme`); support light and dark mode.
- App changes that need a backend change list the matching backend migration in
  `CHANGELOG.md`; merge and deploy the backend first.
- Security-relevant findings go to a private GitHub security advisory, not a public issue.
