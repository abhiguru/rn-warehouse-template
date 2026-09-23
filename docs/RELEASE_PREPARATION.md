# Mobile release preparation

This inventory is based on source configuration reviewed on 2026-09-24. It
prepares the mobile part of [remaining handoff work](DEVELOPER_HANDOFF.md#remaining-work-after-the-source-demo-handoff--2026-09-24);
it does not approve a production identity, privacy statement, signed artifact,
or store submission. The 2026-09-22 Android development APK evidence remains in
[LOCAL_PRODUCTION_READINESS.md](LOCAL_PRODUCTION_READINESS.md).

## What is ready to use

- `eas.json` has development, internal preview, and store production build
  profiles. Production selects an Android app bundle and a device-capable iOS
  build. Its iOS submit IDs are placeholders. The repository supplies no owned
  EAS project, signing credentials, or store accounts.
- `npm run audit:artifact -- PATH` currently accepts an Android **APK** or an
  exported bundle **directory**. For an APK, it checks archive paths and selected
  text, Android manifest permissions, known public certificates, font notices,
  and SHA-256. It does not accept an AAB or iOS archive. A release owner must
  inspect those final files with suitable platform tooling and record the
  results before distribution; the debug APK audit cannot substitute for this.
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
| `eas.json` | Example Apple ID, App Store Connect ID, and team ID in the submit profile | Owned EAS/store project and accounts, release credentials held outside Git, and chosen Play/App Store/TestFlight or enterprise path. |
| `app/privacy-policy.tsx`, `app/terms-of-service.tsx` | `Your Company Name`, `legal@example.com`, December 2025 dates, India-specific legal text and broad data/third-party statements | Operator-approved legal identity, contact, jurisdiction, dates, actual processing/retention disclosures, and hosted/store versions. Review each statement against the deployed backend and enabled services. |
| `app.json` iOS privacy manifest and Android permissions | iOS tracking false and collected-data list empty; declared required-reason APIs. Android blocks audio, SMS, media-library and external-storage permissions. | Compare the final native artifacts, SDK behavior and any enabled telemetry with Apple privacy and Google Play data-safety/permission declarations. Reconcile discrepancies before submission. |

## Evidence to attach to the final release decision

Record the mobile/backend source commits, app identity and version/build IDs,
operator-approved privacy/store declarations, selected distribution route,
and the final AAB/APK/iOS archive hashes. Keep signing keys and account secrets
outside this record. Attach platform-specific archive inspection for contents,
permissions/entitlements, certificates, embedded configuration, and applicable
third-party notices. Record the actual store or enterprise review outcome and
targeted device acceptance on those exact builds. If telemetry is enabled,
attach the redacted received-event test and retention/access review; otherwise
record that it remains disabled. The historical source-demo phone results
identify their own tested SHAs and do not establish these final build results.
