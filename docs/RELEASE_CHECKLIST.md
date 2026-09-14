# Open-source release checklist

## v0.2.1-demo external-developer review (in progress)

Baseline: `48e804c0d4b52351d7edb94b1db1e126e070dc07`; public-only clean checkout. Node 22.23.2 / npm 10.9.8.
Mobile baseline: Expo 54 / React Native 0.81.5, 75 Jest tests across 6 suites.
Backend baseline: 10 Node tests, disposable migration/security SQL, demo API suite.
Main CI passed: mobile run 34759514266; backend run 34759516147.
Release acceptance is pending the fixes and fresh verification below. Historical
entries describe older releases; they do not establish acceptance of this version.

| ID | Severity | Reproduction / finding | Fix / regression evidence | Remaining limitation |
| --- | --- | --- | --- | --- |
| R01 | High | Authenticated config survives logout/account switch; expired memory cache never revalidates | Pending: scoped TTL caches, rejection and late-response tests | Server authorization remains authoritative |
| R02 | High | Refresh can finish after logout; Redux deletes refresh credential before server logout | Pending: serialized mutations, session generation and race tests | Offline revocation cannot reach server |
| R03 | Moderate | Navigation uses vulnerable decode-uri-component <=0.4.2 | Pending: upstream 0.5.0 with checked query-string adapter and navigation tests | Preserve Expo SDK 54 |
| R04 | High | Contributor guide targets generic supabase-db container | Pending: ownership wrappers, disposable tests, doctor and handoff | Demo stays loopback-only |
| R05 | Review | Business contracts, images, orders, invoice/report values and role changes need stronger coverage | Pending: independent fixture and authorization tests | Unspecified rules must be recorded |
| R06 | Acceptance | Fresh setup, native build and isolated Android emulator workflow | Pending | Physical device and iOS untested |


The ordered checklist for both repositories is maintained in the backend:

[Shared release checklist](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/RELEASE_CHECKLIST.md)

For sibling local checkouts: [local checklist](../../supabase-warehouse-template/docs/RELEASE_CHECKLIST.md).

Work is confined to the new open-source repositories. Original repositories,
deployments and credentials must remain unchanged; no credential revocation or
rotation is part of this work. Current main is a local-demo checkpoint, not a
production-ready or native-device-accepted release.
