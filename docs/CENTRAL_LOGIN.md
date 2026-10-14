# Central login with facility-owned data — design

Status: **built in the app, off by default** (2026-10-12). The app has central sign-in, My
facilities, the catalogue, the exchange with a facility and the switcher (phase 5 below). It is
on only in a build that names the central origin (see [Build settings](#build-settings));
without it the app behaves exactly as before: one facility, that facility's own SMS login.
It needs a facility backend with migration 49 (`central-exchange`) and a running central
identity service ([central-identity-template](https://github.com/abhiguru/central-identity-template),
contract in its `docs/API.md`). On a phone against the development central service
(2026-10-12): with central login on, the walkthrough of plan D17 by hand (44 of 45 steps, on an
earlier commit) and the same walkthrough as 18 Maestro flows on the code of 21:24, all passed
(sign-in, access request, approval, switching, linking with a wrong and a right code, an
unreachable facility, revocation, sign-out); with it off, plans D18 to D20 and the Maestro
smoke flow (three passes after one failure of a selector in the flow itself). What has not
been run is under [Not tested](#not-tested); what is still open under
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
  (id, name, town and district, origin, operator, and from central 0.8.0 whether the service
  reached the facility at its last check). A member with no app server yet is listed with no
  origin. It is not tied to any user.

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
   (search by name, town or district) or scans a facility QR code. With exactly one approved facility
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

With no facility selected there is no facility backend to ask, so the facility session
restore (`initializeAuth` in `src/store/slices/authSlice.ts`) answers "no facility session"
without asking for a client. Before 2026-10-12 it failed there on every such start with
"Configuration must be loaded first", logged as an error and kept in `auth.error`; the
person still reached the right screen.

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
when the service answers 401; one refresh runs at a time, and the refresh path sends a refresh
token exactly once. A refresh whose answer was lost is not repeated: the session is kept and
the next need refreshes again with the same token. If the lost request had reached the
service, that next refresh is reuse: the service revokes the session family and the person
signs in again; if it had not (the connection failed before it arrived), the next refresh
simply succeeds. When the service refuses the refresh token the person is signed out
centrally, told why, and returned to central sign-in. Sign-out with an expired access token
needs a new one for the revocation and keeps the same rule (backlog A20): it reads the pair in
the same queued step that removes it, so no newer pair can be stored after the one it reads;
it waits for a refresh that is running; and if a refresh has already exchanged that refresh
token for a new pair, the revocation uses that pair and the token is not sent again. Only
without such an answer does sign-out send the token itself, as the next refresh would; the
family is being revoked in the same breath, so a reuse refusal there changes nothing.
Accepted: when the running refresh's answer is lost (or it was refused), sign-out sends that
token a second time. If the lost request had reached the service, that is a reuse: it is
refused, the family is revoked by it, and no revocation call is made (A20e); after a refusal
the token was already dead (A20d). If it had not, the refresh simply succeeds and its new
access token carries the revocation. A secure store
that does not answer is not "no session": nothing is cleared, the store is read again once
2 seconds later and on each return to the foreground, and the next call reads again.

Whose session is stored is checked, not assumed (external review of 2026-10-12, R1, R3, R7):

- A refresh writes its new pair only over the pair it read: a session revision moves at every
  write or removal of the pair, and the pair is written only if the revision has not moved and
  the stored refresh token is the one the refresh sent (a failed read of that token with the
  revision unchanged counts as unchanged). A code check that began and failed meanwhile costs
  nothing; a check for another person that stored its session meanwhile keeps it.
- A refusal of the refresh token ends the session only if that token is still the stored one,
  checked and ended in one step: a late refusal for the previous person does not sign out the
  next one.
- A stored pair is a person's only when the access token's `sub` names the stored user. A call
  made for one person (the account deletion, a facility token) is sent only with that
  person's pair, and a start removes a whole set whose `sub` names someone else.
- Sign-out reports whether the phone removed the session. Each key's deletion is tried twice.
  Before the deletion a sign-out marker (`secure_central_signed_out`, a short digest of the
  refresh token being removed, or `*` when it cannot be read) is written and it is removed
  once all four keys are gone. If they are not, My facilities says "Couldn't sign out" and
  asks the person to restart the app; the session is not refreshed meanwhile, and the next
  start finds the marker next to that session, removes it again and stays signed out. A new
  sign-in removes an old marker.

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

**Add facility** (`app/facility-catalogue.tsx`, `src/config/catalogueView.ts`,
`app/facility-address.tsx`). The catalogue from `GET /v1/facilities`, searched by name, town
or district (and the older `city`), with loading, empty, no-match and error states and pull to
refresh. "Enter address" reuses the server address screen (typed or scanned from the
facility's QR code) for a facility that is not listed. Either way the facility goes on the
list and is opened.

What the app reads from each catalogue entry (`readCatalogueToken` in
`src/config/centralSession.ts`); it reads the catalogue of central 0.8.0 and the older one:

| Field | Read as |
|---|---|
| `id` | A non-empty string; a second entry with the same id is dropped |
| `name` | Trimmed; an entry without a name is dropped |
| `town`, `city` | The same place (0.8.0 sends both, the older catalogue only `city`); each falls back to the other |
| `district` | `''` when missing or null |
| `origin` | A bare lower-case `https://` origin, or `null` for a member with no app server yet. Anything else (missing, `http://`, a path, upper case) drops the entry: a mistake at the association is never shown as "No app server yet". A second entry with the same origin is dropped |
| `online` | Only a real boolean; `null` (not reported) when missing, not a boolean, or the entry has no origin |
| `last_seen_at` | Kept when `Date.parse` reads it, otherwise `null` |

Each row has one tag (style guide §3.5), the place as "Town, District" (the district left out
when there is none or it is the town), and the rows are in this order:

| Availability | Tag | Order | Tap |
|---|---|---|---|
| `online: true` | Online (positive) | first, by name | Added to My facilities and opened |
| `online` not reported (older catalogue) | none | first, by name, with the online ones | Added and opened |
| `online: false` | Offline (negative), with "Last seen 5 min ago" (or "Last seen just now", or "Not reached yet" when `last_seen_at` is null) | after them, by name | Added and opened: the check may be a minute old, and a facility that cannot be reached gets the message of the table under Opening a facility |
| `origin: null` | No app server yet (neutral), the row greyed with `text.secondary` and `icon.secondary`, an information icon in place of the chevron | last, by name | Only a dialog, "<name> is not on the app yet", which says the cold storage has not set up its app server; nothing is added, opened or navigated to |

Names are compared without regard to case or accents, then by id. "On your list" is a
footnote line with a check under a row already on My facilities, not a second tag.

The catalogue is kept in memory for 60 seconds (it was 10 minutes while it said nothing about
availability); "Try again" and pull to refresh always ask the service. Every catalogue request carries
`Cache-Control: no-cache`: Android's HTTP cache (OkHttp) honours the service's `max-age` (30
seconds from central 0.8.0) and would otherwise answer a forced read with its stored copy.
Pull to refresh keeps the rows while it waits; when it fails the rows stay and one line under
the search field says "Couldn't refresh the list." with the reason. Picking a facility puts it
on My facilities with its town as the place.

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

An open belongs to the person it began for (external review R5): before the switch, the token
request (asked for that person only), the exchange, each write to the list, the profile and
the linking code it checks that the central person has not changed (an identity generation in
`src/config/centralState.ts` that moves at every sign-in, sign-out or change of person). If it
has, the open stops with "sign in again" and shows nothing; a facility session the exchange
had already started is left at once. The linking code goes to the number the open began with,
and a code step begun for another number is not completed.

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

**The ways back.** The waiting screen and the code step are opened on top of My facilities,
and every way back returns to that same My facilities:

| From | Hardware Back | The screen's "My facilities" |
|---|---|---|
| Waiting for approval | My facilities, tag Requested. Nothing is sent; the waiting-screen token stays until the next open or facility change deals with it | The same My facilities, tag Requested; the waiting-screen token is signed out at the facility first, as before |
| The code step | My facilities, tag Confirm number; the pending link is forgotten | The same, by the same steps |
| The code step, while a code is being checked | My facilities at once, the pending link forgotten. The answer then changes only the tag (a wrong code: Confirm number, with no message; a waiting request: Requested, with no waiting screen); a session enters the facility | |

Both controls go back to the My facilities under the screen (`returnToMyFacilities` in
`src/navigation/myFacilities.ts`); replacing the screen would leave two, both mounted. Where
none is under the screen (the waiting screen after a facility's own SMS sign-in, with that
facility's sign-in under it) the stack is taken down and My facilities replaces the screen,
so it is alone. The waiting screen's control goes back only after the sign-out at the facility
has returned, so Back may have come first: when My facilities is already the screen that is
shown (or the navigator's state cannot be read, or holds no stack of the app), the return is
`dismissTo` and changes nothing; it never replaces a My facilities that is shown, which would
mount it a second time. An answer of an open is
taken by exactly one screen (`consumeOpenOutcome` answers true once), so a second My
facilities, however it came about, cannot open a second waiting screen or repeat a message.

**What is in the root stack.** The central screens and a facility's screens do not stay
under one another:

| After | Root stack |
|---|---|
| Central sign-in (`startAtMyFacilities`), also after a central session that ended on a central screen | My facilities alone; Back has nothing to go back to |
| An open that the facility answers with a session, and a correct code on the code step | The facility's home alone |
| A forced sign-out on a facility screen while the facility stays selected (nothing rebuilds the tree) | My facilities alone; opening the facility again gives its home alone |
| A facility's own SMS sign-in | That facility's sign-in under the code step and then under the home, as in a build without central login |
| A forced sign-out after that sign-in (`facilitySmsOrigin` is cleared when it finishes) | My facilities alone |
| "My facilities" on the waiting screen after a facility's own SMS sign-in | My facilities alone: that facility's sign-in is taken off the stack, so Back has nothing to go back to |
| The facility session ends on a screen pushed over its home after the central session has ended | Central sign-in alone (and the same for the facility's own sign-in, where the person is sent to it) |
| Hardware Back while the central code is being checked, then a correct code | My facilities alone, once: the session is stored and the guard shows My facilities in place of central sign-in; the removed code step does not navigate again. A wrong code is not said over the screen that is shown by then. If the person asked for a code again meanwhile, so that another code step is shown, the guard leaves that screen alone for a person who is signed in, so the first check's correct answer takes the stack down to My facilities alone itself, unless that code step is checking a code of its own: it is left alone, and its own answer decides; a wrong code there, with the person signed in by then, goes on to My facilities as a correct one would, with no message (backlog A1) |

The route guard does this (`src/navigation/RouteGuard.tsx`, central login only): a refused
screen on top of My facilities goes back to that My facilities; a session that ends on a
screen pushed over the facility's home takes the whole stack down before My facilities
replaces it; a facility session that arrives while a central screen is shown with anything
under it, or lies underneath, takes the stack down before the home replaces it; and a refused
screen with anything under it that sends the person to central sign-in or to the facility's
own sign-in takes the stack down first, so neither is left over a facility's hidden home.

**Inside a facility.** Settings shows "Switch facility" with the facility's name in place of
"Change warehouse server"; it asks first and then leaves through the same cleanup, ending
with no selected server. "Sign out" in Settings signs out of that facility only and returns
to My facilities. "Delete account" in Settings deletes the profile at that facility (as
before), takes the facility off the person's list and leaves through the same cleanup, so My
facilities cannot open it again and file a new access request: before the deletion is
dispatched (the facility session empties the store the moment it starts) the start-up skip is
spent and the entry is marked Unavailable on the phone, the entry is removed after the
deletion, and no facility is opened while a sign-out or deletion is still running. The
deletion's own report says what the server did, and it is conservative: "kept" is claimed
only for the database's own answer (the RPC's `success: false`, the last-administrator
refusal, or a PostgREST/SQL error with its code); everything else that is not a success (no
connection, a gateway's error page, a session that changed after the answer, an exception) is
"not known". Deleted (also when the session then changed or the sign-out that follows
failed; that row now says "Session changed" where it used to show the generic failure)
removes the entry and leaves; kept restores the entry's status and shows the message, on My
facilities when Settings is already gone; not known leaves the entry Unavailable, leaves the
facility and shows the message, or the cleanup's own message when that cleanup did not
finish. On My facilities, "Sign out" revokes the central session, forgets it on the
phone and also leaves the current facility (if the phone could not remove the session from its
secure storage it says so, see the central session above); the account entry holds the name and "Delete my
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

- On a phone, only the walkthroughs named at the top have run (against the development
  central service, in English, on Android). Not run on a phone: Back pressed while a code is
  being checked; revocation while inside a facility; two people overlapping on one phone; a
  failing secure store (the sign-out marker included); the central screens in Gujarati; iOS;
  real SMS delivery. These rest on the Jest tests (the service and the facility mocked from
  their documented answers) and on the fuzz test of the session store, which also injects
  secure-store faults.
- Accepted risks of the sign-out marker and the open's identity check (review of 2026-10-12):
  - if the deletions fail AND the marker cannot be written, the next start signs the person
    back in (sign-out still says it could not remove the sign-in);
  - a deletion that the secure store reports as done without deleting makes sign-out report
    success, and the next start signs the person in;
  - after an exchange that finished for a person who has since changed, the facility session
    is left with `leaveFacility`; if that answers `busy` or `failed` the answer is ignored and
    the previous person's facility session stays until the next switch or sign-out.
- Opening a facility changes the selected server, which rebuilds the app's navigation tree
  (as a server change always has). The result of the open is therefore kept outside the
  screens and handled by whichever screen is mounted afterwards, and entering the facility is
  left to the route guard. After the rebuild `useSegments()` can still name the route the
  stack started on while the navigator already shows My facilities; with central login the
  guard therefore goes by the navigator's own route before it replaces anything, so it does
  not undo the waiting screen or the linking step that My facilities has just opened
  (phone report 2026-10-12). `src/tests/navigation/CentralOpenRemount.test.tsx` runs that
  hand-over through the real router, route guard and screens, and the ways back from the
  waiting screen and the code step; none of it has been re-run on a device since the fixes.
- The Gujarati text is a draft for the owner's wording review.
- The catalogue's availability (2026-10-14) rests on the Jest tests (`src/config/__tests__/catalogueView.test.ts`,
  the catalogue part of `centralSession.test.ts` and of `src/tests/components/CentralLoginScreens.test.tsx`).
  Not run on a phone yet: a facility going Offline and back Online through the service's check
  and pull to refresh (how fresh the tag is on a real phone, with Android's HTTP cache), the
  greyed rows and their dialog, and the new catalogue texts in Gujarati.

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
