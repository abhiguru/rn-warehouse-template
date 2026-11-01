# Expo SDK upgrade checklist

This is the list to follow for every Expo SDK step. The app is on **Expo SDK 58** (React Native 0.88).

## Policy

- Adopt each new SDK **within 8 weeks** of its release and **never be more than one SDK behind**.
- React Native supports the latest **3 minor versions**. RN 0.88 (SDK 58) leaves support when RN 0.91 ships, so the step to
  SDK 59 (RN 0.89) must be made well before then, within the 8 weeks above.
- `.github/workflows/sdk-watch.yml` runs monthly and opens (or comments on) an issue "Expo SDK <n> is available" when
  the latest `expo` release is a newer major than `package.json`. Dependabot ignores the SDK-pinned packages on purpose
  (`.github/dependabot.yml`), so that issue is the trigger.
- An SDK step is a branch of its own. Expect roughly 30 to 50 hours the first time, 15 to 30 hours later (estimates);
  Android only, add 3 to 6 hours if an iOS build exists.

## What the SDK 58 step taught (done 2026-10-31), and what to look for next

Prepared on SDK 57 so the step itself was smaller, then met in the step:

| Breakage | State |
| --- | --- |
| `react-native-gesture-handler` 3 has no `Swipeable` | Done: every swipe row uses `ReanimatedSwipeable`; lint forbids `import { Swipeable }` (`eslint.config.mjs`). |
| React Native strict TypeScript API becomes the default | Done: `npm run typecheck:strict` is 0 errors and runs in CI. Ref types use `React.ComponentRef<typeof X>` (`src/types/nativeRefs.ts`). |
| `react-test-renderer` is no longer a dependency of jest-expo 58 | Declared as a devDependency, kept at React's version. The test suite still imports it; moving to `test-renderer` is a separate decision. |
| `query-string` is no longer pulled in by expo-router | Done: the decoder adapter script, its test and its `check-install` entries were deleted. |
| Android toolchain pins differ from React Native's | `scripts/check-android-sdk.mjs` compares CI's pins with `node_modules/react-native/gradle/libs.versions.toml` and names both values when they differ. Update `sdkPackages`, the CI install step and the docs together. SDK 37 is `platforms;android-37.0`. |
| `InteractionManager` is removed in RN 0.88 | Done. |
| React Navigation 8 (inside Expo Router 58): `usePreventRemove` | Its callback must call `repeat()` to carry on with the held action, not `navigation.dispatch(action)` (that is held again while the prevention is on). Set the form's `bypass` together with it (`src/hooks/useLeaveGuard.ts`). |
| React Navigation 8: partial `RESET` | A `RESET` with a partial state is refused; send the whole current state with the routes changed. |
| React Navigation 8: `beforeRemove` is gone | `removed` arrives one commit after the Back action. A screen that must know it is leaving at once also marks it on Back (`useMarkLeavingOnBack`). |
| React Navigation 8: tabs | A tab layout shows only the screens it declares; a Jest context must declare the tabs it has, no more. |
| Expo Router 58: route store | The internal router-store module is gone; tests read the navigation container through `src/tests/helpers/routerStore.ts`. Do not import from `expo-router/build/global-state`. |
| gesture-handler 3 in Jest | Add its `jestSetup.js` to `setupFiles` in `package.json` (it provides `installUIRuntimeBindings`, which jest-expo's native-module stand-in lacks), and render anything with a `GestureDetector`, `ReanimatedSwipeable`, Pressable or ScrollView of gesture-handler inside a `GestureHandlerRootView`; the check has no test exemption. |
| Reanimated 4.7 in Jest | Needs its own resolver: `"resolver": "react-native-reanimated/jest/resolver"` in the `jest` config (Jest 30 dropped `packageFilter`, which the jest-expo preset relied on). |
| Jest 30 `testMatch` | It also picks up `scripts/*.test.mjs`, which are `node --test` files (`npm run test:setup`); they are in `testPathIgnorePatterns`. |
| Jest and `navigator.product` | `jest.setup.js` sets it to `'ReactNative'` as a phone has it; without it `useLatestCallback` updates one commit later and guards read a stale navigator state. |
| Timers started by a navigation | A step circle navigates from a timer, and the screen it opens schedules timers of its own in the same act; a flow harness `settle` runs rounds until `jest.getTimerCount()` is 0. |
| `glob` and `minimatch` advisories (2026-10-30) | Accepted for build and dev tooling only, with a review date; see `docs/DEPENDENCY_SECURITY.md` and `acceptedWithoutRepair`. |

Next SDK: read its release notes against this table first; the items above are the places the last step went wrong.
Check `@gorhom/bottom-sheet` on gesture-handler 3 (the two sheets bring their own root view) and `Sentry`'s Expo notes.

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
