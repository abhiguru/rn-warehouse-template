# Dependency security review — 2026-09-12

## Current result

The mobile audit fell from **9 high / 20 moderate / 0 critical** to
**0 high / 8 moderate / 0 critical** after targeted dependency overrides.
This is not a clean audit or a production-readiness approval. The backend npm
audit reports zero findings; that small dependency tree does not cover Docker
images, Edge imports, operating systems or native SDKs.

## Changes and rationale

| Dependency                           | Selected version | Reason and compatibility boundary                                                                                                                                                                           |
| ------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metro package family                 | 0.83.8           | Stay on the existing 0.83 line; upstream removed vulnerable `image-size`. Pin the family together to avoid mixed internals.                                                                                 |
| PostCSS                              | 8.5.28           | Patched 8.x release; replaces Expo's older 8.4 pin.                                                                                                                                                         |
| UUID under `xcode` and `@expo/ngrok` | 11.1.1           | Patched CommonJS-capable release. Both consumers use `uuid.v4()`; targeted tests exercise that API and Xcode project identifier generation. This is a scoped major transitive override, not an SDK upgrade. |

These overrides are deliberate compatibility exceptions. Review them when Expo
updates its own dependencies; do not remove them without re-running audit and
regression checks. Expo SDK 54 and React Native 0.81.5 are unchanged.

## Remaining moderate finding

All eight reported package findings trace to
[`decode-uri-component` denial of service](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)
through `query-string`, Expo Router and React Navigation. They are not eight
independent root vulnerabilities. Malformed percent-encoded input can cause
excessive decoding work; navigation/deep-link exposure still needs assessment.

The installed `query-string` 7.1.3 requires a CommonJS function export. Patched
`decode-uri-component` 0.5.0 is ESM, while `query-string` 9.5.1 changes the package's
export shape. Current navigation/router code imports a namespace and calls
`.parse()`/`.stringify()`. A blind dependency override can therefore break
navigation even if a bundle compiles. npm also suggests an Expo Router downgrade;
that is not a validated fix for this app.

Do not silence this advisory or force an upgrade just to obtain a clean audit.
Next: choose a supported navigation/SDK migration or a reviewed compatibility
backport, then test actual route parsing, Unicode/array parameters, malformed
deep links, redirects, and native Android/iOS startup. Production acceptance
remains open until the issue is resolved or explicitly risk-assessed.

## Verification

- 59 Jest tests pass across five suites.
- TypeScript and full ESLint error checks pass.
- `npm run test:setup` passes bootstrap and dependency-security test files.
- Dependency tests cover PNG dimensions in patched Metro, blocked external
  PostCSS source-map loading with synthetic fixtures, and UUID consumer APIs.
- Android JavaScript export passes: 2,934 modules, 45 assets; review output is
  outside Git. Environment-file loading and Expo telemetry were disabled for
  this export. This is not a native build or physical-device test.
- Re-run `npm audit` for current advisories. Native acceptance, container scanning
  and full release-artifact inspection remain in the shared release checklist.

## Primary references

- [Metro 0.83.8 security patch](https://github.com/react/metro/releases/tag/v0.83.8)
- [PostCSS source-map disclosure advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)
- [UUID advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [Expo upgrade procedure](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
