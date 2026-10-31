# Expo SDK upgrade checklist

This is the list to follow for every Expo SDK step. The app is on **Expo SDK 57** (React Native 0.86).

## Policy

- Adopt each new SDK **within 8 weeks** of its release and **never be more than one SDK behind**.
- React Native supports the latest **3 minor versions**. RN 0.86 (SDK 57) leaves support when RN 0.89 ships (about
  December 2026), so a step to SDK 58 (RN 0.88) is due before then.
- `.github/workflows/sdk-watch.yml` runs monthly and opens (or comments on) an issue "Expo SDK <n> is available" when
  the latest `expo` release is a newer major than `package.json`. Dependabot ignores the SDK-pinned packages on purpose
  (`.github/dependabot.yml`), so that issue is the trigger.
- An SDK step is a branch of its own. Expect roughly 30 to 50 hours the first time, 15 to 30 hours later (estimates);
  Android only, add 3 to 6 hours if an iOS build exists.

## The known SDK 58 breakages, and their state

Prepared on SDK 57 so the step itself is smaller:

| Breakage | State |
| --- | --- |
| `react-native-gesture-handler` 3 has no `Swipeable` | Done: every swipe row uses `ReanimatedSwipeable`; lint forbids `import { Swipeable }` (`eslint.config.mjs`). |
| React Native strict TypeScript API becomes the default | Done: `npm run typecheck:strict` is 0 errors and runs in CI. Ref types use `React.ComponentRef<typeof X>` (`src/types/nativeRefs.ts`). |
| `react-test-renderer` is no longer a dependency of jest-expo 58 | Declared as a devDependency. The test suite still imports it; moving to `test-renderer` (the direction of jest-expo 58 and Testing Library 14) is a separate decision. |
| `query-string` is no longer pulled in by expo-router | `scripts/patch-navigation-decoder.mjs` prints "obsolete and should be removed" and exits 0 once the lockfile has no consumer. When you see that line, delete the script, its test, and the entries in `scripts/check-install.mjs`, `postinstall` and the setup tests. |
| Android toolchain pins differ from React Native's | `scripts/check-android-sdk.mjs` compares CI's pins with `node_modules/react-native/gradle/libs.versions.toml` and names both values when they differ. Update `sdkPackages`, the CI install step and the docs together. |
| `InteractionManager` is removed in RN 0.88 | Done: the last use (`clearExpiredCacheInBackground`) was dead code and is gone. |

Still open at the step: `Sentry` 8, Jest 30 / jest-expo 58, any `StatusBar`, `Modal animated` or
`keyboardShouldPersistTaps={boolean}` use the release notes name, and `@gorhom/bottom-sheet` on gesture-handler 3
(not verified yet).

## Checklist

1. **Read** the Expo SDK changelog and upgrade guide, and the React Native blog posts for each minor in between.
2. **Branch**, then `npx expo install expo@^<n>.0.0 --fix`, then `npx expo install --check` until it reports nothing.
3. **expo-doctor**: bump the exact version in `package.json` (`expo-doctor` is pinned; `scripts/workflows.test.mjs`
   checks the lockfile agrees) and run `npx --no-install expo-doctor`.
4. **Two postinstall scripts pin hashes** of files inside `node_modules` and fail closed on any change. For each, read
   the upstream diff, then update the reviewed version and hash with the review in the commit message:
   - `scripts/patch-expo-metro.mjs` (`@expo/cli` `runServer-fork.js`; moved four times in nine days on SDK 57),
   - `scripts/patch-security-backports.mjs` with `scripts/security-backports.json`.
   Run `npm run test:setup` and `npm run verify:backports`.
5. **Jest and jest-expo**: check that `react-test-renderer` is still installed and that `npm test` starts; move to
   `test-renderer` only as its own change.
6. **Sentry** (`@sentry/react-native`): take the version Expo lists for the SDK; read its migration notes.
7. **gesture-handler** (`~3.x`) and **reanimated / worklets**: confirm `ReanimatedSwipeable` rows and the bottom sheets
   (`@gorhom/bottom-sheet`) still behave. The worklets Babel plugin comes from `babel-preset-expo`; do not add it to
   `babel.config.js`.
8. **Strict types**: `npm run typecheck`, `npm run typecheck:strict` and `npm run typecheck:tests` all at 0 errors.
9. **Android pins**: `node scripts/check-android-sdk.mjs` against a real SDK (the CI job does this). Update
   `sdkPackages`, the `sdkmanager` line in `.github/workflows/ci.yml`, `README.md` and `docs/DEVICE_ACCEPTANCE.md` when
   React Native moves `compileSdk`, `buildTools` or `ndkVersion`.
10. **iOS, only if an iOS build is made**: SDK 58 generates a `SceneDelegate` and iOS 27 requires the scene life cycle.
    Re-check the three config plugins `plugins/with-ios-linking-manager.js` (it throws if the template no longer has the
    `application(_:open:)` line it patches), `plugins/with-ios-transport-policy.js` and `plugins/with-ios-usb.js`.
11. **Android release build**: R8 is on by default for release builds. Build the release, run
    `npm run audit:artifact -- dist` and the debug-artifact audit, and install the release build; look for
    reflection-based libraries that need keep rules.
12. **Predictive back**: `app.json` does not enable it, and Expo writes `enableOnBackInvokedCallback="false"` unless it is
    on. If that default ever changes, the screens that intercept Back need a review.
13. **Device acceptance** (`docs/DEVICE_ACCEPTANCE.md`): the four form flows (GRN, dispatch, invoice, customer), sign-in,
    and photos, on a real phone. Record the result in the PR.
14. **CHANGELOG** entry, and move this page's table forward (what is now done, what is newly known).

## Keeping this page honest

Edit it in the SDK step's PR: the table should list only breakages that are still ahead.
