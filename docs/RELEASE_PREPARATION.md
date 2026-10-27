# Mobile release preparation

This inventory is based on source configuration reviewed on 2026-09-24. It
prepares the mobile part of the release work that remained after the source-demo
handoff; it does not approve a production identity, privacy statement, signed
artifact, or store submission. The 2026-09-22 Android development APK evidence
is archived (see [HISTORY.md](HISTORY.md)).

## Every release build bumps the version

`app.json` `expo.version` (and `package.json` `version`, and `expo.android.versionCode` = `MAJOR*10000 + MINOR*100 + PATCH`) must move
before a release build is made. A facility compares the app's version with its `minimumClientVersion` and tells an older build to
update, so a version that never moves breaks that gate. `scripts/app-version.test.mjs` (`npm run test:setup`) fails when the three
disagree; in a checkout that has the tags it also fails when the version is still the one of the newest `vX.Y.Z` tag once commits
follow it (CI has no tags and skips that one). The release workflow runs `scripts/check-release.sh`, which refuses a tag that, without
its `v` and any `-prerelease` suffix, differs from `expo.version` in `app.json`.

The `versionCode` formula leaves two digits for MINOR and for PATCH: from MINOR 100 or PATCH 100 on, two versions would share a code.
Move to a new MAJOR (or change the formula in `app.config.js` and the test together) before that. `WAREHOUSE_ANDROID_VERSION_CODE`
overrides the formula at build time; leave it unset, or keep it equal to the formula, so the code in the store follows the version.

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
  For an exported bundle directory the audit scans every file, the main Hermes
  bundle included, for the forbidden text patterns, and fails on a file above
  256 MiB instead of skipping it. Its JSON report has `scanned` and `skipped`
  counts, and CI runs it on `dist` after `expo export`.
- The network policy is declared by two config plugins, not taken from Expo's template default (which
  allows arbitrary loads and an http exception for `localhost`). Owner decision 2026-10-26 (WS-L)
  amends D24: cleartext is allowed to a private LAN address only, as a fallback when the public path to the
  facility's server fails (`src/config/lanTransport.ts`; the phone uses `urls.lan` of the server's
  authenticated `get-config`, `http://<private IPv4>:<port>`, and returns to the public address when it works
  again). The accepted exposure is written down in the backend's `docs/CONTAINER_SECURITY.md`.
  - iOS, `plugins/with-ios-transport-policy.js`: every build has `NSAllowsArbitraryLoads = false`,
    `NSAllowsLocalNetworking = true` and no other App Transport Security key (no exception domain, no
    web-content or media exemption), plus `NSLocalNetworkUsageDescription` (English text for the Local
    Network prompt). Local networking also lets a Debug build reach Metro over http. Since iOS 17, App
    Transport Security blocks connections to an IP-address literal by default, so the key is REQUIRED for the
    fallback to work, not just a declaration; Apple's text for it is "unqualified domains, `.local` domains, and IP
    addresses using IPv4 or IPv6", it does not say "local only", and `src/config/lanAddress.ts` is the limit to
    private addresses
    ([NSAllowsLocalNetworking](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking)).
    The plugin adds a Run
    Script phase that fails a Release build when the built `Info.plist` has `NSAllowsArbitraryLoads = true`,
    `NSAllowsArbitraryLoadsInWebContent`, `NSAllowsArbitraryLoadsForMedia` or any `NSExceptionDomains`, and
    also when it cannot look: PlistBuddy is missing, or the built `Info.plist` is missing, unreadable or
    unparseable. That phase is checked as generated project text only; it has not been built (no macOS or
    Xcode here). `scripts/ios-transport.test.mjs` checks the generated configuration on any machine. It does
    not replace the archive check listed below, which needs macOS. An `ios/` folder made before 2026-10-26
    has the old phase, which refuses local networking: generate it again
    (`npx expo prebuild --platform ios --clean`). The USB helper's `WAREHOUSE_IOS_USB_HOST` is refused under the
    EAS `preview` and `production` profiles.
  - Android, `plugins/with-android-lan-cleartext.js`: `android:networkSecurityConfig` and
    `res/xml/network_security_config.xml` with `cleartextTrafficPermitted="true"` in the `base-config`,
    system trust anchors only. This is as narrow as Android allows: a network security config names a host or
    one exact IP address, never a range, and a facility's address is chosen by its operator's DHCP, so
    "private addresses only" cannot be written there. The app keeps cleartext to private addresses:
    `src/config/lanAddress.ts` is the only place a cleartext URL is built and accepts only
    `http://<RFC 1918 IPv4>:<port>`; every other address the app takes is https;
    `src/config/__tests__/lanCallSites.test.ts` fails when another module builds one. No dependency was added
    (`expo-build-properties` is not used). `scripts/android-lan-cleartext.test.mjs` checks the config and the
    manifest attribute. The platform therefore allows cleartext to ANY host, redirects included (React Native
    follows them whatever `redirect` says and OkHttp follows https to http; the precondition is a compromised or
    misconfigured canonical origin, and OkHttp drops `Authorization` when the host changes): the accepted exposure.
  - Android 17 and target SDK 37: the platform protects the local network (10/8, 172.16/12, 192.168/16, 169.254/16
    and 100.64/10 on Wi-Fi and Ethernet). An app that targets SDK 37 or higher needs the runtime permission
    `ACCESS_LOCAL_NETWORK` (group NEARBY_DEVICES, shown to the person as a "Nearby devices" prompt); without it the
    connection to the server's address times out and the fallback fails silently. The app targets SDK 36 today
    (React Native's `libs.versions.toml`), which gets an implicit grant. The plugin declares the permission now,
    which is harmless on 36. **Before raising the target SDK to 37** add the runtime request
    (`PermissionsAndroid.request`, best asked from Help, Connection, Check now). `scripts/android-lan-cleartext.test.mjs`
    fails when the target reaches 37 and no such request is in `src/`.
  - Not in this release, recorded for the owner: an authenticated proof of the LAN address. Today the identity
    check compares the server's public `instanceId`, so it tells this warehouse from another one but not from a
    device that copies the answer. A challenge that the server answers with an HMAC (a per-session secret from the
    authenticated `get-config`; server side with pgcrypto and the service key) would make it real authentication and
    close the "rogue device on the warehouse Wi-Fi" class that the plain-http decision accepts. It needs both
    repositories.
  - Both native changes need a new APK and iOS build; an OTA update cannot carry them.
- `.env.example` leaves the optional Sentry/GlitchTip DSN commented out.
  `src/config/sentryConfig.ts` enables it only outside development with a
  nonempty DSN. Setting a DSN is the operator's consent: the app has no
  per-person switch, so every phone that runs that build reports (decision D22,
  [TELEMETRY_AND_PRIVACY.md](TELEMETRY_AND_PRIVACY.md) section 1). A report
  carries the app version, the phone model, the role (no account id) and the
  error text, never a request body. If enabled, received events and native
  crashes still need an owned test destination, redaction review, access
  controls, and retention acceptance, and the store declarations under
  "Crash-reporting declarations" below must be made.

## Values and declarations requiring an operator decision

| Source location | Current template value or claim | Required input and review |
| --- | --- | --- |
| `app.json` | `Warehouse Manager`, `rn-warehouse-template`, `warehousemanager`, `com.example.warehousemanager` on both platforms, app/runtime `0.1.0`, Android version code `1`, iOS build `1` | Approved identity, unique package/bundle IDs, deep-link scheme, version/build policy, target platforms, and owned signing/distribution setup. Rebuild after changes. |
| `assets/`, `.env.example` | Template icons/splash/logo; `Your Company Name`, optional commented store IDs | Approved branding and actual store IDs. Review any replacement asset provenance and bundled notices. Public environment values ship in the app. |
| `eas.json` | Example Apple ID, App Store Connect ID, and team ID in the submit profile | Owned signing credentials and any EAS/store accounts required by the chosen Play/App Store/TestFlight or enterprise path; keep secrets outside Git. |
| `app/privacy-policy.tsx`, `app/terms-of-service.tsx` | `Your Company Name`, `legal@example.com`, December 2025 dates, India-specific legal text and broad data/third-party statements | Operator-approved legal identity, contact, jurisdiction, dates, actual processing/retention disclosures, and hosted/store versions. Review each statement against the deployed backend and enabled services. |
| `EXPO_PUBLIC_CENTRAL_ORIGIN` (builds with central login) | The app reads the association's facility catalogue from this origin and trusts TLS to it. The catalogue's ES256 signature is **not** verified in the app (Hermes has no ES256); decided 2026-10-17: TLS-only trust, as the identity service's `docs/API.md` (section "The catalogue token") describes for the mobile app. | The issuer must be served over HTTPS with a certificate from a publicly trusted authority, kept valid. Never use a private CA or a self-signed certificate for it, and never point a build at an issuer you do not run. Anyone who can intercept TLS to the issuer on the phone itself (a certificate authority installed by a device profile or a managed-device proxy; Android apps targeting API 24 or later ignore user-installed authorities by default, iOS trusts a fully trusted profile) can serve a forged catalogue and so lead a person to an address the association never published. Facilities still decide access themselves, and identity refuses facility tokens for origins not in its catalogue. State this limit to the association and to device administrators. See [CENTRAL_LOGIN.md](CENTRAL_LOGIN.md), "Still open". |
| `app.json` iOS privacy manifest and Android permissions | iOS tracking false and collected-data list empty; declared required-reason APIs. Android blocks audio, SMS, media-library and external-storage permissions. | Compare the final native artifacts, SDK behavior and any enabled telemetry with Apple privacy and Google Play data-safety/permission declarations. Reconcile discrepancies before submission. For a build with `EXPO_PUBLIC_SENTRY_DSN` the crash data must be declared: follow "Crash-reporting declarations" below. |
| `EXPO_PUBLIC_SENTRY_DSN` and the privacy screen's crash-report wording | Empty DSN (nothing is sent). `app/privacy-policy.tsx` says reports are switched on by "the organisation that distributes your copy of the App" and that the App has no switch of its own. | Decide whether this build reports. If it does, the contact on the privacy screen must reach the organisation that distributes the build (it is the one the screen tells people to ask), the declarations below must be made, and a person who asks for reports to be switched off is answered by a build without a DSN or by deletion at the server. If it does not, keep the DSN empty and leave the declarations without crash data. |

## Crash-reporting declarations (builds with a DSN)

Operator step, owner decision D22 (review finding M09). The template ships without a
DSN and without any crash-data declaration, which is correct for a build that sends
nothing. A build made with `EXPO_PUBLIC_SENTRY_DSN` sends crash data from every phone
(see [TELEMETRY_AND_PRIVACY.md](TELEMETRY_AND_PRIVACY.md) section 1 for exactly what),
so the store declarations must say so before that build is submitted. Do the steps below
for that build only; a build without a DSN keeps the empty list and declares no crash
data.

**Apple (App Store Connect privacy answers and the privacy manifest)**

1. In `app.json`, under `expo.ios.privacyManifests.NSPrivacyCollectedDataTypes`, add the
   crash-data entry (this repository's value is `[]`):

   ```json
   {
     "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeCrashData",
     "NSPrivacyCollectedDataTypeLinked": false,
     "NSPrivacyCollectedDataTypeTracking": false,
     "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]
   }
   ```

   Not linked and no tracking hold only while the report carries no account id and the
   receiving service does not keep or join IP addresses (see the server settings in
   TELEMETRY_AND_PRIVACY.md section 3). If you add an id to reports, keep IP addresses, or
   join reports with other data, change `Linked` to `true` and answer "linked to you" in
   App Store Connect.
2. Answer the App Store Connect "App Privacy" questions to match: Diagnostics, Crash Data,
   used for App Functionality, not linked to the user, not used for tracking.
3. Rebuild, archive, and inspect the privacy information of the archive, including the
   manifest the Sentry SDK bundles: in Xcode, Product > Archive > Generate Privacy Report
   (or read each `PrivacyInfo.xcprivacy` inside the `.app`). Every data type the report lists
   must also be answered in App Store Connect. If the SDK's manifest names more than crash
   data (for example performance or other diagnostic data, or a device id for a random
   installation identifier), declare those as well. This needs macOS and an archive; it was
   not run from the source tree.

**Google Play (Data safety form)**

1. Data collected: yes. App info and performance, Crash logs, and, if the archive or the
   received events show a random installation identifier, Device or other IDs.
2. Purpose: App functionality. Not used for advertising or tracking.
3. Shared: no, if the receiving service is run by the operator or is a service provider acting
   on the operator's behalf (Google treats that as processing, not sharing); say yes for a
   third party that uses the data for its own purposes.
4. Collection is required: the app has no switch, so answer that people cannot turn this
   collection off. Data is encrypted in transit (the DSN is `https`).
5. Deletion: describe how a person asks the operator to switch reports off and have them deleted
   (the contact on the privacy screen), and keep the retention at the server within the 30 to 90
   days of TELEMETRY_AND_PRIVACY.md section 3.

**Both stores**

- The account and record data the app handles (mobile number, name, role, customers, GRNs,
  photos and the rest) is covered by the previous table's privacy row and is outside these
  steps; list it in the same forms.
- If the build changes what a report holds (a new SDK option, an id, a request body), redo the
  declarations. The privacy screen, TELEMETRY_AND_PRIVACY.md section 1 and both store forms must
  all describe the same build.
- Attach to the release record the Generate Privacy Report output, the exported Play Data safety
  answers, and the redacted received-event test (see "Evidence to attach").

## Evidence to attach to the final release decision

Record the mobile/backend source commits, app identity and version/build IDs,
operator-approved privacy/store declarations, selected distribution route,
and the final AAB/APK/iOS archive hashes. Keep signing keys and account secrets
outside this record. Attach platform-specific archive inspection for contents,
permissions/entitlements, certificates, embedded configuration, and applicable
third-party notices. For iOS include the `Info.plist` inside the archive's `.app`
(`plutil -p`): `NSAppTransportSecurity` must show `NSAllowsArbitraryLoads = 0` and
`NSAllowsLocalNetworking = 1` and nothing else (no `NSExceptionDomains`), and `NSLocalNetworkUsageDescription`
must be present. For Android, the merged manifest of the release build must name
`android:networkSecurityConfig="@xml/network_security_config"` and the package must contain that file with
`cleartextTrafficPermitted="true"` in its base-config only. Record the actual store or enterprise review outcome and
targeted device acceptance on those exact builds. If telemetry is enabled,
attach the redacted received-event test and retention/access review; otherwise
record that it remains disabled. The historical source-demo phone results
identify their own tested SHAs and do not establish these final build results.
