# Source-demo acceptance

Status: completed and published for the Android-first source demo on
**2026-09-18**. Matching immutable `v0.2.2-demo` source-only prereleases
identify mobile commit `6e6885786912fe9186285103e19de762e4ba88f8` and
backend commit `2959881d0e46a8797a98d10da8c7139217477476`.

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
- The published pair passed mobile main CI run
  [35274817895](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35274817895)
  and tag run
  [35276024942](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35276024942),
  plus backend main CI run
  [35275536840](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35275536840)
  and tag run
  [35276027479](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35276027479).

## Supported onboarding

Use matching `v0.2.2-demo` tags in this repository and
[`supabase-warehouse-template`](https://github.com/abhiguru/supabase-warehouse-template).
Use current `main` branches for contribution work.
Follow the backend `docs/CLEAN_INSTALL.md`, keep both repositories as siblings,
and verify the backend workflow pin equals the mobile commit checked out.

## Separate gates

Physical camera and other Android hardware, iOS, production SMS/TLS/operations,
app-store or signed-binary distribution, printing, sensors, Realtime, payments,
and unsupported integrations remain separate gates. The source-demo acceptance
does not claim production readiness or all-platform acceptance.
