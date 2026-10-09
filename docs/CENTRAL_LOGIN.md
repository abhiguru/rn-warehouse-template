# Central login with facility-owned data — design

Status: **proposed** (2026-10-09). Nothing here is implemented yet; today each facility
backend runs its own SMS login (see "Today" in [CLAUDE.md](../CLAUDE.md)).

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

1. Record the purpose and this design (done with this document).
2. Login screen layout ready for the target (branding slot, +91, "Send code", facility shown as
   a small line with "Change").
3. Central identity service (new repository; hosting decided by the association).
4. Facility trust setting and exchange endpoint (backend migration and edge function).
5. App: central sign-in, My facilities, catalogue, switcher.
6. Passcode/biometric unlock, SMS auto-read, passkeys.

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
