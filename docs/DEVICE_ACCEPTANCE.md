# Device acceptance build

How to build, install and exercise the Android app on a real phone against an
installed backend, as done for the v0.3.0 from-scratch acceptance. The backend's
[operator guide](https://github.com/abhiguru/supabase-warehouse-template/blob/main/docs/OPERATOR_INSTALL.md)
lists the functional checks (its "First-use checks"); this page covers the app
side: which APK to build, the build pitfalls, and phone and `adb` practicalities.

## Which APK

- `npm run android` and `./gradlew assembleDebug` produce a **debug** build that
  loads its JavaScript from Metro on a development machine (port 8081). Without
  Metro it shows "Unable to load script" and cannot run on its own. Good for
  development, not for acceptance.
- For a phone that is not tethered to a development server build
  `assembleRelease`, which embeds the bundle. The template signs it with its debug
  keystore (`signingConfigs.debug` in `android/app/build.gradle`), so it is a
  **test build only**, never a store or distribution build; see
  [RELEASE_PREPARATION.md](RELEASE_PREPARATION.md).

## Build (Linux)

```bash
export ANDROID_HOME="$HOME/android-sdk"        # in the shell that runs everything below
npm ci
node scripts/create-env.mjs
node scripts/check-android-sdk.mjs
npm run verify:backports
EXPO_PUBLIC_CONFIG_API_URL=https://<hostname> npm run doctor
npx expo prebuild --platform android --clean --no-install
(cd android && ./gradlew assembleRelease -Dorg.gradle.jvmargs="-Xmx5g -XX:MaxMetaspaceSize=1g")
npm run audit:artifact -- android/app/build/outputs/apk/release/app-release.apk
sha256sum android/app/build/outputs/apk/release/app-release.apk
```

- **Export `ANDROID_HOME` in the same shell.** `npm run doctor` and
  `audit:artifact` read it, and adding it to `~/.profile` does not change the
  shell you are already in. The doctor fetches the public configuration from
  `EXPO_PUBLIC_CONFIG_API_URL` and defaults to `http://localhost:18000` when that
  is unset.
- **Gradle's default heap is too small for the release lint tasks.** The
  generated `android/gradle.properties` sets `-Xmx2048m`, and
  `lintVitalAnalyzeRelease` can then fail with `OutOfMemoryError`. Pass the larger
  heap on the command line as shown (no file edit). Plan for about 8 GiB of free
  memory; a clean release build took roughly nine minutes on a small VM.
- Take the Android command-line tools zip from the current download page and
  verify its checksum; the file name changes with each release.
- Record the APK's SHA-256 and the audit output with your acceptance notes.

## Install and drive the phone

```bash
adb devices -l                       # the phone must say "device", not "unauthorized"
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`adb install -r` over a debug build of the same package keeps the app's data.

- **USB passthrough in a virtual machine can drop the phone.** If `adb devices`
  goes empty, run `adb kill-server`, reconnect the device to the VM, and accept
  "Allow USB debugging" with *Always allow*. Expect this after every reconnect.
- **`adb reverse tcp:8081 tcp:8081` matters only for debug builds**, and it is
  lost whenever the adb server restarts. A release build needs neither Metro nor
  `adb reverse`.
- **In a debug build, pressing `R` twice quickly reloads the bundle.** An
  `adb shell input text` string with two `R` characters triggers it, which looks
  like a blank screen followed by the first tab. Avoid such strings, or use the
  release build.
- `adb shell cmd connectivity airplane-mode enable` works for the offline check,
  but adb can hang afterwards; `adb kill-server` recovers it. Use the quick
  settings panel if you can touch the phone.
- Screenshots (`adb exec-out screencap -p`) capture whatever is on screen,
  including other apps' notifications; turn on Do Not Disturb first.

## What the app does on the phone

Observed during acceptance; useful as expected behaviour when recording results:

- First launch asks for the HTTPS origin and shows the company name before
  sign-in.
- Returning after more than ten minutes in the background keeps the session and
  re-checks the server once (a single `get-public-config` request).
- Offline, the app shows a "No internet connection" banner, lists stay readable,
  and they refresh when the connection returns.
- **Settings → Change Warehouse Server** with the origin already in use returns to
  Settings without a prompt and without signing out.
- After the backend rotates its signing keys, already-open apps are **not** sent
  to the login screen: their requests are rejected with HTTP 401 and the screens
  show load errors or empty lists until the user signs out (Settings → Sign Out)
  and signs in again.
- A goods receipt requires a photo of the GRN book entry. A dispatch photo is
  optional and can only be attached in the create flow's review step, not after
  the dispatch is submitted.
- There is no create-user screen: staff accounts come from signing in once,
  approval, and then Settings → Users → edit → role.
