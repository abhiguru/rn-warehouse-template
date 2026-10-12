# Central login with facility-owned data — design

Status: **built in the app, off by default** (2026-10-12). The app has central sign-in, My
facilities, the catalogue, the exchange with a facility and the switcher (phase 5 below). It is
on only in a build that names the central origin (see [Build settings](#build-settings));
without it the app behaves exactly as before: one facility, that facility's own SMS login.
It needs a facility backend with migration 49 (`central-exchange`) and a running central
identity service ([central-identity-template](https://github.com/abhiguru/central-identity-template),
contract in its `docs/API.md`). **None of it has been run on a phone against a real central
service yet**; see [Not tested](#not-tested). What is still open is listed under
[Still open](#still-open).

## Goal

One app for a cold-storage association's members. A person signs in **once, centrally**,
then works with **one facility at a time**. Each facility runs its own backend on premise,
keeps all of its data, and alone decides who may see it.

| Principle | Consequence |
|---|---|
| Central proves identity only | It holds people (phone, name) and signing keys. No business data, no record of which facilities a person uses. |
| Data never leaves the facility | The app talks to the chosen facility's backend directly. |
| The facility authorizes | Access starts as a request; the facility admin approves a role (and customers) and can revoke any time. |
| Access can be cut locally | Revoking at the facility takes effect without the central service. |

## Components

### Central identity service (association-hosted)
- Phone sign-in with a one-time SMS code (one SMS account for the association).
- Issues short-lived signed identity tokens (ES256), publishes its public keys (JWKS).
  `sub` is a stable central user id; the token also carries the verified phone number.
- When the app opens a facility, central issues a token **for that facility only**
  (audience = the facility's origin, as in RFC 8707 resource indicators), valid for a few
  minutes and usable once. Central does not log which facility was requested.
- Publishes the **facility catalogue**: a public, signed list of member facilities
  (id, name, city, origin, operator). It is not tied to any user.

### Facility backend (this template's backend)
- Operator setting: trust the association issuer and its JWKS (off for installs that are
  not association members; local SMS login keeps working for them and for bootstrap).
- New exchange endpoint: verify the central token (signature, issuer, audience = this
  facility, expiry, single use), then look up the local profile by central `sub` (or by the
  verified phone number the first time):
  - no profile: create a **pending access request** (the existing enrollment review);
  - approved and active: issue the facility's **existing session** (custom JWT + refresh);
  - disabled or rejected: refuse.
- Revocation is the existing local mechanism: disabling a profile revokes its sessions.

### App
The target; what exists is under [The app as built](#the-app-as-built).

1. **Sign in** (association branding): logo, short title, phone number with a fixed +91,
   "Send code", terms (first run: a checkbox enables Continue).
2. **Verify code**: auto-read on Android (SMS Retriever), resend timer, change number.
3. **My facilities**: the person's own list, kept on the device per central user, with a
   status per facility: Approved, Requested, Revoked. "Add facility" opens the catalogue
   (search by name or city) or scans a facility QR code. With exactly one approved facility
   the list is skipped; the last facility used is preselected.
4. **Inside a facility**: the facility name is always visible in the header with a one-tap
   switcher. Switching clears that facility's caches and navigation, reusing today's
   server-switch cleanup.
5. Later: app passcode or biometric unlock after the first sign-in, and a device passkey to
   depend less on SMS.

## Sign-in flow

```
App ──phone──▶ Central ──SMS code──▶ phone
App ──code───▶ Central ──identity session──▶ App
App: My facilities ──pick F──▶ Central ──token(aud=F, 2–5 min)──▶ App
App ──token──▶ Facility F ──(profile approved?)──▶ F session ──▶ App fetches F's data
                         └─(no profile)──▶ access request ──▶ F's admin approves or rejects
```

## Practices this follows

- **SAP Fiori onboarding**: a short first-run flow (connect to the right system, sign in, terms,
  passcode/biometrics), logo and short title, plain language, permissions only when needed,
  never repeated after it is complete; multi-user devices list existing accounts.
- **Organization switching**: sign in once, then pick; skip the picker for one organization;
  remember the last; always show the current context; search long lists; reset state on switch.
- **Federated authorization**: one identity provider, many independent resource servers; tokens
  restricted to a single audience; each resource server keeps its own authorization and revocation.
- **Native-app OAuth** (RFC 8252, OAuth security BCP RFC 9700): authorization code with PKCE,
  no secrets in the app; optionally DPoP (RFC 9449) to bind tokens to a device key.
- **SMS codes** are a restricted authenticator (NIST SP 800-63B-4; OWASP MASVS-AUTH): rate limits,
  replay protection, SIM-swap awareness, tokens only in Keychain/Keystore, and a stronger
  option planned.

## Phases

1. Record the purpose and this design. **Done** (2026-10-09).
2. Login screen layout ready for the target (branding slot, +91, "Send code", facility shown as
   a small line with "Change"). **Done.**
3. Central identity service (new repository; hosting decided by the association). **Built**
   (central-identity-template); hosting is still the association's decision.
4. Facility trust setting and exchange endpoint (backend migration and edge function).
   **Built** (backend migration 49; the backend's `docs/CENTRAL_LOGIN.md`).
5. App: central sign-in, My facilities, catalogue, switcher. **Built** (2026-10-12); described
   under [The app as built](#the-app-as-built).
6. Passcode/biometric unlock, SMS auto-read, passkeys. **Not started.**

## Build settings

Two values, fixed when the app is built (`src/config/envConfig.ts`; commented out in
`.env.example`):

| Setting | Meaning |
|---|---|
| `EXPO_PUBLIC_CENTRAL_ORIGIN` | The address the app calls: the central service's `https://` origin, nothing after the host and port. A development build also accepts `http://localhost:PORT` and `http://127.0.0.1:PORT`. **Central login is on only when this is set.** A value that is not acceptable (plain `http` in a release build, a path, a typing mistake) leaves central login off. |
| `EXPO_PUBLIC_CENTRAL_ISSUER` | The issuer name facilities trust: the `iss` of the tokens and the facility's `CENTRAL_ISSUER`. Defaults to the origin; set it when the app reaches the service at another address than the issuer's name (a development build through `localhost`). |

`isCentralLoginConfigured()` is the one question the rest of the app asks. The terms version
sent at sign-in is `TERMS_VERSION` in the same file (`2025-12`, the date on the terms page).

## The app as built

Everything below applies only with central login on.

**Start.** The app no longer needs a facility server before it can show anything: without a
selected server it renders the app shell, and the route guard (`src/navigation/routeAccess.ts`)
decides where the person belongs:

| Signed in centrally | Facility session | Where |
|---|---|---|
| no | no | Central sign-in (`/central-login`) |
| yes | no | My facilities (`/facilities`) |
| yes or no | yes | Inside the facility, by role, as before |

A facility session from before central login keeps working; such a person meets central
sign-in the first time they leave the facility.

**Central sign-in** (`app/central-login.tsx`, `app/central-otp.tsx`). The layout and components
of the facility sign-in (`src/components/auth/PhoneSignInForm.tsx`, `CodeEntryForm.tsx`), with
the association line in place of a facility. The first sign-in on a phone shows a terms tick
box; "Send code" is disabled until it is ticked. The tick is asked of every mobile **number**
once per terms version (`central_terms_accepted_v1:<number>`), so two people who share a phone
each see it on their own first sign-in; `terms_version` is only ever sent for a number whose
tick was given.

**The central session** (`src/config/centralSession.ts`). Its own SecureStore keys
(`secure_central_*`), never the facility session's; plain `fetch` with a 15 second limit, not
the facility request gate. The access token is replaced a minute before it expires and once
when the service answers 401; one refresh runs at a time. A refresh that failed on the
connection is repeated once at once, and only while less than 8 seconds have passed since it
was sent, because the service answers a repeat of the same token with a new session only
within 10 seconds of its first use; a refresh the app gave up waiting for (15 seconds), or a
connection reset late, is outside that window and is not repeated, since the repeat would
count as reuse and revoke the whole session family. When the service refuses the refresh token
the person is signed out centrally, told why, and returned to central sign-in. A secure store
that does not answer is not "no session": nothing is cleared, the store is read again once
2 seconds later and on each return to the foreground, and the next call reads again.

**My facilities** (`app/facilities.tsx`, `src/config/centralFacilities.ts`). The person's own
list, stored on the phone under `central_facilities_v1:<central user id>`: address, instance
id, name, city, a status and when it was last opened. No token. It is kept on central
sign-out and removed by "Delete my account".

| Status | Shown as | Set when |
|---|---|---|
| `approved` | Approved (positive) | The facility answered with a session |
| `requested` | Requested (critical) | The facility answered that the request waits |
| `revoked` | Revoked (negative) | The facility answered `account_unavailable` |
| `link_needed` | Confirm number (neutral) | The facility answered `link_required`, or a wrong code was entered |
| `unavailable` | Unavailable (neutral) | Just added and never opened; the facility refused the identity, a conflict, or it does not take association sign-in right now. A facility whose database did not answer keeps its status |

A status is checked only when its facility is opened; no facility is contacted in the
background, and pull to refresh reads the list and asks the central service who is signed in.
A facility that cannot be reached, a lost connection, a rate limit, a failure of the central
service, and `central_keys_unavailable` leave the status as it was: they say nothing about the
person's access, and a single network blip must not stop the start-up skip. With exactly one approved
facility and nothing waiting, the list is skipped once at start (and after a new central
sign-in) and that facility is opened; "Switch facility" always shows the list.

**Add facility** (`app/facility-catalogue.tsx`, `app/facility-address.tsx`). The catalogue
from `GET /v1/facilities`, searched by name or city, with loading, empty, no-match and error
states. "Enter address" reuses the server address screen (typed or scanned from the
facility's QR code) for a facility that is not listed. Either way the facility goes on the
list and is opened.

**Opening a facility** (`src/config/openFacility.ts`), in this order:

1. Discover the facility (`get-public-config`). Its `centralLogin.issuer` must equal this
   build's issuer; otherwise the person is offered that facility's own SMS sign-in, and on
   "Continue" the facility becomes the server and the existing sign-in screen takes over.
2. Switch to it with the shared server-switch sequence (`src/store/operatorSwitch.ts`, also
   used by the server address screen): the previous facility's session is ended and
   everything that belonged to it is cleared before the new server is committed.
3. Ask the central service for a token for this facility (`POST /v1/facility-token`).
4. Hand it to the facility (`POST /functions/v1/central-exchange`, a facility call through
   the request gate).
5. The answer is handled by the code that handles an SMS sign-in
   (`completeOperatorSignIn` in `src/config/supabaseConfig.ts`): a session and profile, or an
   enrollment token and the waiting screen.

| Facility answers | The person sees | Status |
|---|---|---|
| `login` | The facility | approved |
| `pending` | Waiting for approval | requested |
| `link_required` | "Confirm your number at <facility> once": the facility sends its own code, and the code goes back with a fresh token (`app/facility-link.tsx`) | link_needed |
| `invalid_otp` (linking) | "That code is wrong or has expired…", still on the code step | link_needed |
| `identity_conflict` | "This mobile number is linked to another sign-in at <facility>…" | unavailable |
| `account_unavailable` | "<facility> has withdrawn your access…" | revoked |
| `central_unavailable` | "<facility> is not accepting association sign-in right now…" | unavailable |
| `central_keys_unavailable` | "<facility> couldn't check your sign-in just now…" | unchanged |
| `invalid_identity_token` | "<facility> couldn't verify your sign-in…" | unavailable |
| `identity_token_used` | Nothing: a fresh token is tried once; a second time counts as the row above | |
| `rate_limited`, `enrollment_limited` | "Too many attempts at <facility>…" with the wait, or "Too many new access requests today…" | unchanged |
| no answer | "The connection to <facility> was lost…" | unchanged |

Every refusal is a message on My facilities; the person is never left on a raw error.

**Inside a facility.** Settings shows "Switch facility" with the facility's name in place of
"Change warehouse server"; it asks first and then leaves through the same cleanup, ending
with no selected server. "Sign out" in Settings signs out of that facility only and returns
to My facilities. "Delete account" in Settings deletes the profile at that facility (as
before), takes the facility off the person's list and leaves through the same cleanup, so My
facilities cannot open it again and file a new access request: before the deletion is
dispatched (the facility session empties the store the moment it starts) the start-up skip is
spent and the entry is marked Unavailable on the phone, the entry is removed after the
deletion, and no facility is opened while a sign-out or deletion is still running. A deletion
the server carried out but the app's thunk still reported as failed (a concurrent forced
sign-out, a sign-out that could not reach the server) is treated the same way; only a refusal
by the server keeps the entry, with its status restored. On My facilities, "Sign out" revokes the central session, forgets it on the
phone and also leaves the current facility; the account entry holds the name and "Delete my
account" (`DELETE /v1/me`), whose confirmation says that each facility keeps its own records.

## Still open

- **The catalogue's signature is not verified in the app.** The catalogue is a signed token
  (ES256) and the central contract says the app verifies it; Hermes has no ES256. The app
  checks the token's type, algorithm name, issuer and expiry, and relies on TLS to the
  configured origin. A facility, not the app, decides access and verifies its own tokens, so
  a forged catalogue can show a wrong address but cannot open a facility's data to anyone.
- **Passcode and biometrics** after the first sign-in.
- **SMS auto-read** on Android (SMS Retriever); the code fields already use one-time-code
  autofill.
- **Passkeys**, to depend less on SMS.
- **Shared devices.** One central session per phone. The list of facilities and the terms
  tick are kept per central person, so a second person on the same phone gets their own list
  and is asked for the tick after signing in, but there is no account chooser.
- Removing a facility from My facilities (the store can; no screen offers it).
- A header inside the facility that always shows its name with the switcher. Today the name
  and "Switch facility" are in Settings.
- An administrator screen for `clear_user_central_identity` (unlink a profile).
- Binding a token to a device key (DPoP).

## Not tested

- Nothing here has run on a phone or against a real central service: the central session,
  the open sequence and the screens are covered by Jest tests with the service and the
  facility mocked from their documented answers.
- Opening a facility changes the selected server, which rebuilds the app's navigation tree
  (as a server change always has). The result of the open is therefore kept outside the
  screens and handled by whichever screen is mounted afterwards, and entering the facility is
  left to the route guard. That hand-over is tested piece by piece, not end to end on a device.
- The Gujarati text is a draft for the owner's wording review.

## Open questions

- Who hosts and operates the central service and its SMS account.
- Association name, logo and colors for the sign-in screen.
- Whether owners with several facilities later want a combined view.
- Offline behavior per facility.
- Shared devices (several people on one phone).

## Sources

- SAP Fiori for Android, single-user onboarding: https://www.sap.com/design-system/fiori-design-android/v26-4/patterns/onboarding/single-user-onboarding/usage
- SAP Fiori for iOS, onboarding: https://www.sap.com/design-system/fiori-design-ios/v26-4/patterns/onboarding/onboarding/usage
- SAP Mobile Start onboarding: https://learning.sap.com/learning-journeys/Setting-Up-SAP-Build-Work-Zone-standard-edition-and-SAP-Mobile-Start-with-SAP-S-4HANA/onboarding-end-users
- Organization switching: https://docs.scalekit.com/fsa/guides/organization-switching/ ,
  https://www.saasui.design/blog/saas-workspace-organization-switcher-ux-patterns ,
  https://www.jibble.io/help/switching-organizations-mobile
- UMA federated authorization: https://docs.kantarainitiative.org/uma/wg/rec-oauth-uma-federated-authz-2.0.html
- Resource servers trusting an external authorization server: https://iiw.idcommons.net/OAuth_2_Federation_%E2%80%93_RS_trust_external_AS
- RFC 8707 resource indicators: https://datatracker.ietf.org/doc/html/rfc8707
- RFC 8693 token exchange: https://www.authlete.com/developers/token_exchange
- Native apps (RFC 8252 practice): https://docs.feide.no/service_providers/openid_connect/mobile_applications.html
- DPoP for native apps: https://duendesoftware.com/blog/20231012-dpop-native
- SMS OTP under NIST SP 800-63B-4: https://blog.typingdna.com/nist-sp-800-63b-rev-4-sms-otp-is-now-a-restricted-authenticator-but-we-have-the-fix/
- OWASP MASVS-AUTH overview: https://www.appknox.com/blog/masvs-auth-mobile-app-authentication-security
