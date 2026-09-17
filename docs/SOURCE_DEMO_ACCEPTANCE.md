# Source-demo acceptance

Status: completed for the Android-first source demo on **2026-09-18**.
`v0.2.2-demo` is the forthcoming immutable source-only prerelease checkpoint
until its tag-validation workflow passes and the GitHub prerelease is published.

The accepted application/backend behavior was exercised as a compatible pair.
The final tag targets and cross-repository commit pair are recorded in the two
GitHub release notes because a commit cannot contain its own final SHA.

## Verified scope

- Fresh public sibling clones installed locked dependencies without private
  files. Repository scripts generated mode-0600 configuration and preserved it
  byte-for-byte across setup rerun and owned stop/restart.
- A checkout-owned, loopback-only backend applied all migrations and remained
  healthy. Static and live contract checks found 93 RPC names, 127 typed calls,
  zero missing names, and zero mismatches.
- An API-36 Android emulator built and installed the debug app. Public bootstrap,
  demo login, authenticated cold restoration, logout/reconnect, account isolation,
  authorized navigation, and malformed/unauthorized route handling passed.
- Native workflows covered GRN creation, padded dispatch numbering, exact stock
  decrement and oversell protection, cart/order conversion, invoice eligibility,
  saved totals and detail reopening, Android photo-picker upload/display/delete,
  and representative PDF open/share. All four PDF types passed authenticated and
  unauthorized-access checks.
- Runtime checks covered light/dark status-bar ownership, modal restoration,
  repeat Metro startup/reload, loopback containment, and the development-client
  cold-start route regression.
- The delivered pre-release baseline passed mobile CI run
  [35269266129](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35269266129)
  and backend CI run
  [35269882640](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35269882640).
  Release-preparation changes are documentation and release-gate changes and must
  pass their own PR, default-branch, and exact-tag workflows before publication.

## Supported onboarding

Use matching `v0.2.2-demo` tags in this repository and
[`supabase-warehouse-template`](https://github.com/abhiguru/supabase-warehouse-template)
after publication. Before publication, use matching current `main` branches.
Follow the backend `docs/CLEAN_INSTALL.md`, keep both repositories as siblings,
and verify the backend workflow pin equals the mobile commit checked out.

## Separate gates

Physical camera and other Android hardware, iOS, production SMS/TLS/operations,
app-store or signed-binary distribution, printing, sensors, Realtime, payments,
and unsupported integrations remain separate gates. The source-demo acceptance
does not claim production readiness or all-platform acceptance.
