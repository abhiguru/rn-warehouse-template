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

## Running Metro for a phone

For a debug build or a quick look in Expo Go the phone loads its JavaScript from Metro
(`npx expo start`, port 8081). This is a development server with no sign-in: keep it off
the internet except for a short, deliberate test.

- **Same network.** `npx expo start --lan` works only when the phone can reach the Metro host
  on its Wi-Fi. A virtual machine behind NAT (the VMware and VirtualBox default) is not
  reachable from the phone's Wi-Fi; bridge the VM's network adapter, or use USB
  (`adb reverse`, or [IOS_USB_DEVELOPMENT.md](IOS_USB_DEVELOPMENT.md) on an iPhone). If the host
  runs a firewall such as `ufw`, allow port 8081 from the LAN only (for example
  `sudo ufw allow from 192.168.1.0/24 to any port 8081 proto tcp`, with your own subnet).
- **`expo start --tunnel` can fail** with `CommandError: failed to start tunnel`
  (Expo's ngrok v2 agent). Use `--lan` or a USB path instead.
- **Your own Cloudflare Tunnel in front of Metro.** While it runs, anyone who knows the host
  name can load your bundle; stop the tunnel when you are done. Set
  `EXPO_PACKAGER_PROXY_URL=https://<host>` before `npx expo start`, so the URLs in the manifest
  are https. Metro prints an `exp://` address, which Cloudflare answers with a redirect: in
  Expo Go open `exps://<host>`. If the bundle request
  (`/node_modules/expo-router/entry.bundle`) returns 403 "Sorry, you have been blocked", a
  Cloudflare WAF custom rule that blocks paths containing `node_modules` is the cause: add a
  skip rule for that host name while you test, and remove it afterwards.
- **`Cannot find native module 'ExpoAsset'` in Expo Go** although the SDK matches: reload the app
  in Expo Go (shake the phone, then Reload), or restart Metro with `npx expo start --clear`.
  Expo Go's Settings shows the SDK it supports; it must be the one in `package.json`.
- **`ERROR An unknown error occurred while installing React Native DevTools ... chrome-sandbox ...
  must be owned by root and mode 4755`** (Linux) concerns the DevTools window only. Metro still
  serves the app; ignore it.
- **`EXPO_PUBLIC_*` values are inlined when the bundle is built.** After you change `.env`,
  restart Metro with `npx expo start --clear`, or the phone keeps the old value.

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

## Warehouse network fallback (WS-L)

Needs a backend with `bash scripts/lan.sh on` run on the host (it prints "LAN address for the app"), a build
from this version (new APK, new iOS build), a phone on the warehouse Wi-Fi that is signed in, and the host's
internet cable unplugged for the outage steps. Settings → Help and about → Help → **Connection** shows the state.

1. Internet up: Connection says "Connected via Internet", the warehouse network address is the one the host
   printed ("From your server"), and **Check now** answers "Reachable (answered in N ms)".
2. Unplug the host's internet cable, keep the Wi-Fi: within about a minute there is no offline banner; a list
   loads in under 3 s; Connection says "Connected via Warehouse network". Create a GRN with a photo and save it
   (a save that was in flight when the cable came out ends as the lost-answer screen; the next one works); open a
   PDF. On iOS, allow the Local Network prompt the first time.
3. Force-close and open the app: no configuration error screen. Leave it in the background for 15 minutes and come
   back: it works.
4. Plug the cable in: the phone stays on the warehouse network for 10 minutes, then Connection says "Connected via
   Internet" again (the public address is asked at most once per 10 minutes).
5. A wrong stored address: type one that is not the host's in Connection → Change address; **Check now** says
   "Not reachable"; "Use your server's address" puts the server's back.
6. After `rotate-keys.sh` on a host where `gateway-lan` was not recreated: during an outage the phone is NOT
   signed out; the offline banner says the warehouse network answered with an old configuration.
7. On a phone outside the allowed range (mobile data, or another Wi-Fi network): Check now says "Not
   reachable" (or the server refuses this phone's Wi-Fi address).
