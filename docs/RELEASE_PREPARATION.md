# Mobile release preparation

This inventory is based on source configuration reviewed on 2026-09-24. It
prepares the mobile part of the release work that remained after the source-demo
handoff; it does not approve a production identity, privacy statement, signed
artifact, or store submission. The 2026-09-22 Android development APK evidence
is archived (see [HISTORY.md](HISTORY.md)).

## What is ready to use

- `eas.json` has development, internal preview, and store production build
  profiles. Production selects an Android app bundle and a device-capable iOS
  build. Its iOS submit IDs are placeholders. The repository supplies no owned
  EAS project, signing credentials, or store accounts.
- `npm run audit:artifact -- PATH` currently accepts an Android **APK** or an
  exported bundle **directory**. For an APK, it checks archive paths and selected
  text, Android manifest permissions, known public certificates, font notices,
  and SHA-256. Permissions are checked against the list of permissions the app
  is expected to request (`EXPECTED_ANDROID_PERMISSIONS` in
  `scripts/artifact-audit.mjs`): any other permission in the merged manifest
  fails the audit, so a dependency or SDK upgrade cannot add one unreviewed.
  The blocked list in `app.json` is checked as well. It does not accept an AAB or iOS archive. A release owner must
  inspect those final files with suitable platform tooling and record the
  results before distribution; the debug APK audit cannot substitute for this.
- The iOS network policy is declared by `plugins/with-ios-transport-policy.js`, not
  taken from Expo's template default (which allows arbitrary loads and an http
  exception for `localhost`). A release project has `NSAllowsArbitraryLoads = false`
  and no other App Transport Security key: no exception domain and no local-networking
  exception. `NSAllowsLocalNetworking` is added only when the native project is
  generated for development (`WAREHOUSE_IOS_LOCAL_NETWORKING=1`, the USB helper's
  `WAREHOUSE_IOS_USB_HOST`, or the EAS `development` profile). `Info.plist` is shared by
  Debug and Release, so generate the project for a release archive **without** those
  variables (`npx expo prebuild --platform ios --clean`); the EAS `preview` and
  `production` profiles refuse them. The plugin also adds a Run Script phase that fails a
  Release build when the built `Info.plist` has `NSAllowsLocalNetworking` or
  `NSAllowsArbitraryLoads = true`, so a development project cannot be archived. That phase
  is checked as generated project text only; it has not been built (no macOS or Xcode here). `scripts/ios-transport.test.mjs` checks the
  generated configuration on any machine. It does not replace the archive check listed
  below, which needs macOS.
- `.env.example` leaves the optional Sentry/GlitchTip DSN commented out.
  `src/config/sentryConfig.ts` enables it only outside development with a
  nonempty DSN. If enabled, received events and native crashes still need an
  owned test destination, redaction review, access controls, and retention
  acceptance under [TELEMETRY_AND_PRIVACY.md](TELEMETRY_AND_PRIVACY.md).

## Values and declarations requiring an operator decision

| Source location | Current template value or claim | Required input and review |
| --- | --- | --- |
| `app.json` | `Warehouse Manager`, `rn-warehouse-template`, `warehousemanager`, `com.example.warehousemanager` on both platforms, app/runtime `0.1.0`, Android version code `1`, iOS build `1` | Approved identity, unique package/bundle IDs, deep-link scheme, version/build policy, target platforms, and owned signing/distribution setup. Rebuild after changes. |
| `assets/`, `.env.example` | Template icons/splash/logo; `Your Company Name`, optional commented store IDs | Approved branding and actual store IDs. Review any replacement asset provenance and bundled notices. Public environment values ship in the app. |
| `eas.json` | Example Apple ID, App Store Connect ID, and team ID in the submit profile | Owned signing credentials and any EAS/store accounts required by the chosen Play/App Store/TestFlight or enterprise path; keep secrets outside Git. |
| `app/privacy-policy.tsx`, `app/terms-of-service.tsx` | `Your Company Name`, `legal@example.com`, December 2025 dates, India-specific legal text and broad data/third-party statements | Operator-approved legal identity, contact, jurisdiction, dates, actual processing/retention disclosures, and hosted/store versions. Review each statement against the deployed backend and enabled services. |
| `EXPO_PUBLIC_CENTRAL_ORIGIN` (builds with central login) | The app reads the association's facility catalogue from this origin and trusts TLS to it. The catalogue's ES256 signature is **not** verified in the app (Hermes has no ES256); decided 2026-10-17: TLS-only trust, as the identity service's `docs/API.md` (section "The catalogue token") describes for the mobile app. | The issuer must be served over HTTPS with a certificate from a publicly trusted authority, kept valid. Never use a private CA or a self-signed certificate for it, and never point a build at an issuer you do not run. Anyone who can intercept TLS to the issuer on the phone itself (a certificate authority installed by a device profile or a managed-device proxy; Android apps targeting API 24 or later ignore user-installed authorities by default, iOS trusts a fully trusted profile) can serve a forged catalogue and so lead a person to an address the association never published. Facilities still decide access themselves, and identity refuses facility tokens for origins not in its catalogue. State this limit to the association and to device administrators. See [CENTRAL_LOGIN.md](CENTRAL_LOGIN.md), "Still open". |
| `app.json` iOS privacy manifest and Android permissions | iOS tracking false and collected-data list empty; declared required-reason APIs. Android blocks audio, SMS, media-library and external-storage permissions. | Compare the final native artifacts, SDK behavior and any enabled telemetry with Apple privacy and Google Play data-safety/permission declarations. Reconcile discrepancies before submission. |

## Evidence to attach to the final release decision

Record the mobile/backend source commits, app identity and version/build IDs,
operator-approved privacy/store declarations, selected distribution route,
and the final AAB/APK/iOS archive hashes. Keep signing keys and account secrets
outside this record. Attach platform-specific archive inspection for contents,
permissions/entitlements, certificates, embedded configuration, and applicable
third-party notices. For iOS include the `Info.plist` inside the archive's `.app`
(`plutil -p`): `NSAppTransportSecurity` must show `NSAllowsArbitraryLoads = 0` and no
`NSExceptionDomains` or `NSAllowsLocalNetworking`. Record the actual store or enterprise review outcome and
targeted device acceptance on those exact builds. If telemetry is enabled,
attach the redacted received-event test and retention/access review; otherwise
record that it remains disabled. The historical source-demo phone results
identify their own tested SHAs and do not establish these final build results.
