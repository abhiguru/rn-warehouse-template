# Dependency security review — 2026-09-14

## Verified security backports and extended campaign — 3 October 2026

The user explicitly extended the campaign beyond its original 48-hour deadline
until blockers are removed and the full eight-hour soak starts. The separate
native attempt limits and fixture protections remain in force.

Mobile source now applies two local dependency repairs during npm postinstall.
The node-forge 1.4.0 RSA parser change is byte-identical to upstream PR #1152,
commit ceba34402e329f0365134f23fe19898756527d65 (still open/unmerged). The local
braces 3.0.3 correction bounds parser and direct AST walker depth, including
parentheses and cycles. Original package versions and lockfile identities stay
visible. Every installed copy must match reviewed original/patched checksums;
unexpected versions, source changes and symlink targets are refused before any
patch writes.

The user specifically approved replacing the raw-only npm audit CI gate with
source-verified backport evaluation. `npm run audit:dependencies` retains the
raw npm report: 50 high findings remain in published-package metadata. The
approved gate reports PASS_WITH_VERIFIED_BACKPORTS only when all high/critical
paths resolve to the two repaired advisories and every affected installed copy
is verified. It rejects unknown advisories, changed ranges, missing patches,
unverified copies, unresolved graph cycles, inconsistent counts and audit errors.
CI retains both raw report and source-verification artifacts. This is local
backport acceptance, not a claim that upstream published patched releases.

Security regressions reproduce the original defects and pass after patching.
Valid native PKCS1/PSS signatures and normal brace/micromatch behavior pass.
Clean installation, 360 setup tests, 323 application tests, SDK compatibility,
typecheck, lint, source/history scan and standalone Android JS export PASS.
The first malformed RSA fixture used the wrong padding API; its failed baseline
is preserved beside the corrected baseline and passing patched regression.
No new fixture APK or native result is claimed by these source checks.

Backend staff/cache source 75a6fb1 has all seven exact CI jobs PASS. Mobile 5218899
(the prior removal of unused tunnel tooling) finished CI with Android debug
artifact audit, lint/types/tests and scans PASS, dependencies FAIL. That earlier
result remains historical and does not establish CI for these new backports.
Current private evidence is extension-20261003-01 under the campaign root.

**Follow-up status — 2026-09-15:** The dated verification ledger for that
checkpoint's local checks and open native/review gates is archived (see
[HISTORY.md](HISTORY.md)). Evidence below dated
2026-09-14 or earlier describes the historical release checkpoint. The
pending mobile authentication/privacy fixes and backend follow-up commits
are outside the immutable `v0.2.1-demo` tags. Local follow-up results do
not establish merged-main CI or physical-device acceptance.

## VM campaign follow-up — 2026-10-03

The current SDK54 review candidate removes the unused `@expo/ngrok` development
dependency and its scoped UUID override. Repository scripts, the standalone
Expo/Gradle workflow and owned emulator routes do not use Expo tunnel mode.
The lockfile therefore no longer includes `http-cache-semantics`,
`cacheable-request`, or the ngrok binaries. This does not change any external
network route or Test1 service. The existing Xcode UUID compatibility regression
remains in place.

A clean `npm ci` passes. The full `npm audit --json` changes from **54 to 50 high
findings**; `npm audit --omit=dev --json` still reports **26 high findings**.
The dependency gate remains **BLOCKED**. Official npm registry and GitHub
advisory metadata rechecked on 2026-10-03 still list node-forge 1.4.0 and
braces 3.0.3 as the latest releases, with no patched version for
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) or
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Expo CLI/code-signing and Metro/Jest keep these packages in the supported tree.
The proposed forced Expo44 downgrade is not a compatible security fix.
No audit threshold, waiver or cryptographic implementation changed.

SDK compatibility, setup regressions, all 323 application tests and typecheck
pass for this removal. Lint, source/history scan and Android JavaScript export also pass. Exact source
CI results are recorded in the dated VM acceptance ledger. No replacement APK is built or
installed for this change; previous artifact/native results remain scoped to
those original bytes. The zero-vulnerability result below is historical.

## Current result

Native follow-up: explicitly depend on SDK 54's `expo-font ~14.0.12` so the
unrestricted icon-font peer does not autolink SDK 57's font module. Pin NetInfo
to Expo's expected `11.4.1`. CI also runs `expo install --check`; a dependency
regression test checks the selected font against Expo's bundled SDK range.

Both locked npm dependency trees report **zero vulnerabilities** on 2026-09-14.
This audit does not cover Docker images, Edge imports, operating systems or
native SDKs. Expo SDK 54 / React Native 0.81.5 are preserved.

## Changes and rationale

| Dependency                              | Selected version | Reason and compatibility boundary                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metro package family                    | 0.83.8           | Stay on the existing 0.83 line; upstream removed vulnerable `image-size`. Pin the family together to avoid mixed internals.                                                                                                                                                                                                         |
| PostCSS                                 | 8.5.28           | Patched 8.x release; replaces Expo's older 8.4 pin.                                                                                                                                                                                                                                                                                 |
| UUID under `xcode` and `@expo/ngrok`    | 11.1.1           | Patched CommonJS-capable release. Both consumers use `uuid.v4()`; targeted tests exercise that API and Xcode project identifier generation. This is a scoped major transitive override, not an SDK upgrade.                                                                                                                         |
| shell-quote under `react-devtools-core` | 1.11.0           | First patched release for [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) (critical, published 2026-10-06; `quote()` injection via a line terminator after a comment token, vulnerable >=1.8.4 <1.11.0). Same-major exact override of 1.10.0; only consumer is the development-only React DevTools bridge. |

These overrides are deliberate compatibility exceptions. Review them when Expo
updates its own dependencies; do not remove them without re-running audit and
regression checks. Expo SDK 54 and React Native 0.81.5 are unchanged.

## Decoder and Metro compatibility

The upstream [decoder advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
identifies 0.5.0 as patched. The lockfile overrides to that version.
`query-string` 7.1.3 expects a callable CommonJS export; the minimal adapter in
`scripts/patch-navigation-decoder.mjs` selects the upstream default export while
preserving `query-string`'s existing parse/stringify interface. Installation
checks dependency versions and source hashes before patching, is idempotent,
and fails clearly for unexpected contents. No advisory is suppressed.

Metro 0.83.8 changed its watcher event shape. The checked SDK 54 adapter in
`scripts/patch-expo-metro.mjs` maps that shape for both Expo observers, including
TypeScript file detection. Tests drive the real Metro aggregator and Expo
observers. Both adapters run on postinstall; keep package.json CommonJS because
Babel/Jest rely on it. ESLint's own configuration is `eslint.config.mjs`.

## Verification

- Released mobile: 100 Jest tests across nine suites, including actual navigation
  consumers, malformed input, logout/refresh races and configuration TTLs.
- Setup regressions cover bootstrap, dependency consumers, both checked adapters
  and safe environment-file creation.
- Online SDK compatibility passes in mobile main CI 34825877719; offline local
  compatibility checks are weaker evidence and are recorded as such.
- TypeScript and full ESLint error checks pass.
- `npm run test:setup` passes bootstrap and dependency-security test files.
- Dependency tests cover PNG dimensions in patched Metro, blocked external
  PostCSS source-map loading with synthetic fixtures, and UUID consumer APIs.
- Android JavaScript export passes: 2,934 modules, 45 assets; review output is
  outside Git. Environment-file loading and Expo telemetry were disabled for
  this export. This is not a native build or physical-device test.
- Re-run `npm audit` for current advisories. Native acceptance, container scanning
  and full release-artifact inspection remain in the shared release checklist.
- Android ARM64 debug compilation passes at `96d92a2`; this is not device/iOS
  acceptance. The native evidence and runbook are archived (see
  [HISTORY.md](HISTORY.md)).

## Primary references

- [Metro 0.83.8 security patch](https://github.com/react/metro/releases/tag/v0.83.8)
- [PostCSS source-map disclosure advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)
- [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [Expo upgrade procedure](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
