# Dependency security review — 2026-09-14

**Follow-up status — 2026-09-15:** See [the dated verification ledger](RESUME_VERIFICATION_2026-09-15.md)
for current local checks and open native/review gates. Evidence below dated
2026-09-14 or earlier describes the historical release checkpoint. The
pending mobile authentication/privacy fixes and backend follow-up commits
are outside the immutable `v0.2.1-demo` tags. Local follow-up results do
not establish merged-main CI or physical-device acceptance.

## Current result

Native follow-up: explicitly depend on SDK 54's `expo-font ~14.0.12` so the
unrestricted icon-font peer does not autolink SDK 57's font module. Pin NetInfo
to Expo's expected `11.4.1`. CI also runs `expo install --check`; a dependency
regression test checks the selected font against Expo's bundled SDK range.

Both locked npm dependency trees report **zero vulnerabilities** on 2026-09-14.
This audit does not cover Docker images, Edge imports, operating systems or
native SDKs. Expo SDK 54 / React Native 0.81.5 are preserved.

## Changes and rationale

| Dependency                           | Selected version | Reason and compatibility boundary                                                                                                                                                                           |
| ------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metro package family                 | 0.83.8           | Stay on the existing 0.83 line; upstream removed vulnerable `image-size`. Pin the family together to avoid mixed internals.                                                                                 |
| PostCSS                              | 8.5.28           | Patched 8.x release; replaces Expo's older 8.4 pin.                                                                                                                                                         |
| UUID under `xcode` and `@expo/ngrok` | 11.1.1           | Patched CommonJS-capable release. Both consumers use `uuid.v4()`; targeted tests exercise that API and Xcode project identifier generation. This is a scoped major transitive override, not an SDK upgrade. |

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
  acceptance. See [native evidence and runbook](NATIVE_ACCEPTANCE.md).

## Primary references

- [Metro 0.83.8 security patch](https://github.com/react/metro/releases/tag/v0.83.8)
- [PostCSS source-map disclosure advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)
- [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [Expo upgrade procedure](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
