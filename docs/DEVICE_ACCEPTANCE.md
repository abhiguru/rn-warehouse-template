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

What this checks: while the internet works the phone sends nothing to the server's address on the warehouse
network; in an outage it switches by itself and keeps working; it leaves that address as soon as it is on another
network or the address stops answering as the server; and Help → Connection tells the truth about each of these.

**Needs.** A backend with the fallback on (`bash scripts/lan.sh on auto` on the host; it prints "LAN address for
the app: http://192.168.1.20:8080", used below as `<server address>`), a build from this version (new APK, new iOS
build), a phone on the warehouse Wi-Fi that is signed in, a laptop on the same Wi-Fi with `python3`, and the host's
internet cable (the outage). The phone's own Wi-Fi address is in the phone's Wi-Fi details; call it
`<phone address>`. On iOS, allow the Local Network prompt the first time.

**Reading the host's log.** From the backend's folder on the host:

    bash scripts/compose.sh --profile lan logs --no-log-prefix gateway-lan 2>&1 | grep -cF '<phone address> '

counts the requests the phone made to the warehouse network address (one line each: the time, the path, the status).
`logs ... gateway-lan | grep -F '<phone address> ' | tail -20` shows them.

**Where it is in the app.** Settings → Help and about → Help → the **Connection** section: "Connected via" with a tag
("Internet" or "Warehouse network"), the "Warehouse network address" and where it comes from, **Check now**, and the
last check. Record PASS or FAIL for every step, with the values asked for under Evidence.

**Steps.** Each step is one action (typing an address and tapping Save address is one). If a step's start state is
not reached, do not guess: go back to the step that makes it, or mark the step NOT RUN and say why.

1. Start state: internet works; phone on the warehouse Wi-Fi; Connection shows "Connected via" with the tag
   "Internet", the address `<server address>` with "From your server" under it, and "Last checked": "Not checked yet" (or
   an earlier time).
   Action: tap **Check now**.
   Expected: within 3 s a green tag "Reachable" appears under the button; the line under it reads "Last checked
   <now>: Reachable" (a new time, not the earlier one); no millisecond figure anywhere.
   Evidence: the "Last checked" text before and after; the result tag; screenshot.
   A broken app would show: "Checking…" for more than 3 s, a red "Not reachable" tag with a sentence under it, a grey
   tag "Not on the warehouse Wi-Fi" or "Wi-Fi address not known" (the phone cannot tell it is inside the server's
   subnet, so the fallback is switched off on this phone: record the phone, its Android or iOS version and stop, no
   later step can pass), or the old "Last checked" text unchanged.

2. Start state: step 1 passed; note the host's request count for `<phone address>` as N0 and the time T0.
   Action: use the app normally for 3 minutes with the internet working: open Dispatch and GRNs, pull to refresh each
   twice, open one dispatch and one GRN.
   Expected: the host's count for `<phone address>` is still N0 (the phone sent nothing to the warehouse network
   address); Connection still shows the tag "Internet".
   Evidence: N0 and N1 (count after the 3 minutes); the tag.
   A broken app would show: N1 greater than N0 with lines for `/rest/v1/`, `/storage/v1/` or `/functions/v1/` other than
   hello and get-public-config, or the tag "Warehouse network" while the internet works.

3. Start state: step 2 passed; Connection says "Internet"; the Dispatch list shows its rows.
   Action: unplug the host's internet cable (keep its power and the Wi-Fi), then pull the Dispatch list down to
   refresh.
   Expected: the list is refreshed within 10 s with the same rows and no error message; no "You're offline" banner
   appears in the next 60 s; Connection shows the blue tag "Warehouse network"; the host's log has new lines for
   `<phone address>` with `/rest/v1/` paths. Write down the time of the first such line as Ts.
   Evidence: seconds to refresh; banner yes or no after 60 s; the tag; N2 (new count) and Ts.
   A broken app would show: an error message or an empty list instead of the rows, the offline banner (and "Save"
   refused), the tag still "Internet", or N2 equal to N1.

4. Start state: step 3 passed; the tag says "Warehouse network".
   Action: create a GRN with a photo of the GRN book entry and tap its save.
   Expected: the GRN is saved and shows its number; Connection still says "Warehouse network"; the host's log shows
   the photo upload (`/storage/v1/object/`) from `<phone address>`.
   Evidence: the new GRN number; the log line for the upload.
   A broken app would show: a "could not save" or "offline" message, a lost-answer screen that does not clear within 30
   s, or no upload line in the host's log.

5. Start state: step 4 passed.
   Action: open that GRN and tap its PDF (print or share).
   Expected: the PDF opens within 10 s.
   Evidence: seconds; the host's log shows the PDF download from `<phone address>`.
   A broken app would show: an error "could not open the document", or a PDF download line that is missing from the
   log (the document came over the internet, which is down).

6. Start state: step 5 passed; the outage goes on.
   Action: force-close the app, then open it again.
   Expected: the app reaches its signed-in home screen within 15 s (the first request waits up to 4 s and the public
   check up to 3 s); no "configuration" error screen; after a refresh, Connection says "Warehouse network".
   Evidence: seconds to the home screen; the tag.
   A broken app would show: the sign-in screen, an error screen about the server's configuration, or the home screen
   after more than 30 s.

7. Start state: step 6 passed; the outage goes on; Connection says "Warehouse network".
   Action: send the app to the background for 15 minutes (home button), then open it and pull the Dispatch list down.
   Expected: still signed in; the list refreshes within 10 s; Connection still says "Warehouse network" (the phone
   goes back to the internet only when the internet answers).
   Evidence: the list's refresh time; the tag.
   A broken app would show: the sign-in screen, or a list that keeps its old rows with an error.

8. Start state: step 7 passed; the cable is still out; Connection says "Warehouse network".
   Action: plug the host's internet cable in and write down the time as Tp; leave the phone on Connection and wait
   (do not open other screens).
   Expected: without any tap the tag changes to "Internet" no later than Tp + 11 minutes (the phone asks the public
   address once every 10 minutes while it is on the warehouse network, and goes back when it answers).
   Evidence: Tp and the time the tag changed (Tr); Tr minus Tp is at most 11 minutes.
   A broken app would show: the tag still "Warehouse network" at Tp + 15 minutes with the internet working.

9. Start state: internet works; Connection says "Internet"; nothing else is running.
   Action: unplug the cable and pull the Dispatch list down (the first host log line for `<phone address>` after that
   is Ts), then plug the cable back in one minute later.
   Expected: at Ts + 5 minutes the tag still says "Warehouse network" although the internet is back (the phone stays at
   least 10 minutes); at about Ts + 10 minutes, with no tap, it says "Internet".
   Evidence: the tag at Ts + 5 minutes; the time it changed (Tr); Tr minus Ts is 9 to 11 minutes.
   A broken app would show: "Internet" before Ts + 9 minutes (it went back too early and would move between the two
   paths on a flaky line), or still "Warehouse network" at Ts + 15 minutes.

10. Start state: internet works; Connection says "Internet" and "From your server"; `<server address>` is
   `http://192.168.1.20:8080` (use the first three numbers of yours below). Step 1 gave "Reachable" on this phone.
   Action: tap **Change address**, type `http://192.168.1.199:8080` (the same first three numbers, a host where
   nothing listens), tap **Save address**, then tap **Check now**.
   Expected: "Typed by you" appears under the address `http://192.168.1.199:8080`; after at most 3 s the result tag
   is "Not reachable" with the sentence "Nothing answered at this address. Check the address, and that this phone is
   on the warehouse Wi-Fi." (on iPhone the sentence continues with where to allow the Local Network).
   Evidence: the source text under the address; the tag and sentence; the host's log shows no line for this check.
   A broken app would show: "Reachable" (the check does not ask the typed address), "From your server" still under
   the address, or no sentence under the tag.

11. Start state: step 10 passed; the laptop is on the warehouse Wi-Fi with address `<laptop address>` (the first three
    numbers as the server's); on the laptop run `python3 -m http.server 8080` in an empty folder.
    Action: tap **Change address**, type `http://<laptop address>:8080`, tap **Save address**, then tap **Check now**.
    Expected: the tag "Not reachable" with the sentence "Another device answered at this address."; the laptop's
    terminal prints exactly two requests, `GET /functions/v1/hello` and `GET /functions/v1/get-public-config`, both
    with status 404, and no request with `/rest/v1/`.
    Evidence: the sentence; the laptop's terminal lines.
    A broken app would show: the sentence "Nothing answered at this address..." (the check cannot tell a stranger
    from silence), "Reachable", or any `/rest/v1/` line on the laptop (a credential would have gone to a stranger).

12. Start state: step 11 passed; the typed address is `http://<laptop address>:8080`.
    Action: tap **Use your server's address**, then **Check now**.
    Expected: the address reads `<server address>` with "From your server" under it, the "Use your server's address"
    button is gone, and the tag is "Reachable".
    Evidence: the address text and source; the tag.
    A broken app would show: the typed address still shown, or "Not reachable".

13. Start state: step 10 or 11 left a typed address on the phone (type one again if not); the internet works.
    Action: on the host run `bash scripts/lan.sh off`, then on the phone force-close the app, open it and open
    Connection.
    Expected: the address reads "Not set" with the sentence "Your server does not offer a warehouse network address, so
    this phone uses only the internet."; there is no "Typed by you", no **Change address** button, and **Check now** is
    greyed. (Run `bash scripts/lan.sh on auto` afterwards; the phone learns the address again when it next starts.)
    Evidence: the address line; the buttons that are present.
    A broken app would show: the typed address still shown, or **Change address** still offered (the operator's "off"
    would not have withdrawn the fallback from this phone).

14. Start state: the outage is on again (cable out); the phone is on the warehouse Wi-Fi, has switched (pull the
    Dispatch list down once; Connection says "Warehouse network"); the host's count for `<phone address>` is N3.
    Action: switch the phone's Wi-Fi off, so it is on mobile data, then pull the Dispatch list down to refresh.
    Expected: the refresh fails with the usual network message (the facility is not reachable); Connection says
    "Internet" (the phone is back on the public path); the host's count for `<phone address>` is still N3.
    Evidence: the tag; N3 and the count after.
    A broken app would show: the tag "Warehouse network" on mobile data, or a count above N3 (the phone sent
    something to the warehouse network address from another network).

15. Start state: step 14 passed; the cable is still out; a second Wi-Fi network (a phone hotspot or a router on the
    same private range, `192.168.1.x`) is available, with the laptop on it set to the SERVER'S address
    `192.168.1.20` and running `python3 -m http.server 8080` there.
    Action: join the phone to that second Wi-Fi and pull the Dispatch list down to refresh.
    Expected: the refresh fails with the usual network message; the laptop's terminal shows at most the two requests
    `GET /functions/v1/hello` and `GET /functions/v1/get-public-config` (404), and no request for `/rest/v1/`; the
    tag says "Internet".
    Evidence: the laptop's terminal lines; the tag.
    A broken app would show: any `/rest/v1/` line on the laptop (the phone sent its session to the stranger who
    holds the server's address on a network it has never seen), or the tag "Warehouse network".

16. Start state: internet works; the phone is on mobile data (Wi-Fi off); Connection says "Internet".
    Action: tap **Check now**.
    Expected: the grey tag "Not on the warehouse Wi-Fi" with the sentence "Connect this phone to the warehouse Wi-Fi,
    then check again."; the "Last checked" line is unchanged; the host's count for the phone's mobile address is 0.
    Evidence: the tag and sentence; the "Last checked" text before and after; the host's log.
    A broken app would show: "Not reachable" or "Reachable" (the phone asked a private address from mobile data), or
    a new "Last checked" time.

17. Start state: the internet works; the host runs the fallback with `LAN_CIDR` set to a range that does not contain
    the phone's Wi-Fi address (`bash scripts/lan.sh on auto --cidr 192.168.77.0/24` on a throw-away facility; restore
    it afterwards); the phone is on the warehouse Wi-Fi.
    Action: tap **Check now**.
    Expected: the red tag "Not reachable" with the sentence "Your server does not accept this phone's Wi-Fi address."
    Evidence: the sentence; the host's log shows a 403 for `<phone address>`.
    A broken app would show: "Reachable", or the "Nothing answered ..." sentence (the 403 was not told apart).

18. Start state: a throw-away facility whose `gateway-lan` holds a different `ANON_KEY` than the installation: edit
    `ANON_KEY` in `config/compose.env` to another well-formed key, run
    `bash scripts/compose.sh --profile lan up -d --force-recreate --no-deps gateway-lan`, and put the original line
    back (the public gateway keeps the right key); the host's internet cable is out; the phone is signed in on the
    warehouse Wi-Fi.
    Action: pull the Dispatch list down to refresh.
    Expected: the phone is NOT signed out (no sign-in screen); within 60 s the banner reads "The warehouse network
    answered with an old configuration. Ask whoever runs your server to run the server's start step again, or connect
    to the internet."; Connection shows "Warehouse network" and the same sentence in red with the alert icon. Then run
    `bash scripts/compose.sh --profile lan up -d --force-recreate --no-deps gateway-lan` on the host and refresh
    again: the banner is gone and the list loads.
    Evidence: the banner text; the Connection sentence; whether the sign-in screen appeared; the state after the
    recreate.
    A broken app would show: the sign-in screen (the session ended on the stale listener's 401), or the ordinary
    "You're offline" banner without the sentence about the old configuration.

19. Start state: step 17 left the last check at "Not reachable" at time t (tap **Check now** while `LAN_CIDR` is still
    wrong if it did not); the host's fallback is back to normal (`bash scripts/lan.sh on auto`); the phone is on the
    warehouse Wi-Fi with the internet working, and the app stays open in the foreground.
    Action: leave the app open on Connection for 75 minutes.
    Expected: "Last checked" shows a time after t with the result "Reachable" (the phone repeats a check that failed by
    itself, about every hour); the host's log shows exactly one `hello` and one `get-public-config` more from
    `<phone address>` and nothing else.
    Evidence: the "Last checked" text before and after; the number of new log lines.
    A broken app would show: the old "Last checked" time and "Not reachable" after 75 minutes (a failed check would be
    repeated only after a day), or more than those two requests.

Unit tests that cover what a phone cannot show here: a network change with the same private range and a stranger at the
address (`src/config/__tests__/lanTransport.test.ts`, "a change of network"), the 429 and 5xx rule, the slow write and
the upload (`lanTransport.test.ts`), and the typed address (`operatorServer.test.ts`).

## Version gate and the upgrade answer (app 0.6.0)

What this checks: a build older than the facility's minimum is refused with its own screen on both ways in; the "being
updated" banner shows during an upgrade without signing anyone out or saving twice; and an order line edit against a current
backend keeps its concurrency check. Record PASS or FAIL for every step, with the values asked for under Evidence.

**Needs.** The Dev facility on a backend that publishes `minimumClientVersion` and `schemaHead`; a build of this version; a
second build or a backend file edit that makes the minimum higher than the build (`app-compat.json` of the Dev checkout, then
`setup.sh`; restore it afterwards); the ability to run `upgrade.sh` on Dev (it closes the API for a few minutes). Step 7 needs a backend that reports `schemaHead`; a
facility that does not (an earlier release) is treated as older, and its order line edits go without the concurrency check.

1.  Setup: sign in at Dev by its address. Action: raise the minimum above the build, close the app and open it.
    Expected: the full-screen "Update the app" with "This facility needs app version X or newer. You have Y." (X and Y are the
    real numbers); not a connection message. Back opens the server address screen with central login off (a build without it),
    and My facilities with central login on (the Dev and Metro setting).
    Evidence: a screenshot; the two numbers. A broken app would show: "Can't be reached" or a generic error.
2.  Setup: central login on, signed in centrally. Action: in My facilities open the same facility.
    Expected: the same "Update the app" screen, no dialog; Back returns to My facilities with the facility's status unchanged.
3.  Setup: a build with a real application id (not `com.example...`). Action: tap "Get the update". Expected: the phone opens
    the Google Play listing of that id. With a `com.example...` id: no button, and "Ask the facility where to get the new
    version."
4.  Setup: restore the minimum; signed in; the Orders list open. Action: start `upgrade.sh` on Dev and pull the list down while
    it runs. Expected: a banner "The facility's server is being updated. Try again in a few minutes." under the status bar, the
    person still signed in, no error dialog; the banner goes away by itself after the upgrade, on the next request that works.
5.  Setup: as 4, a GRN form filled in. Action: tap Save during the upgrade.
    Expected: the message above and the form stays editable; it is NOT shown as "checking" or "may have been saved". Save again
    after the upgrade: one GRN, not two. A broken app would show "checking" until the upgrade ends.
6.  Setup: signed in at Dev with the Orders list open; the phone stays on (or is put in the background for a minute and brought back).
    Action: raise the minimum above the build on Dev as in step 1, then put the app in the background and bring it back (or run
    `upgrade.sh` with a list open, then use the app after it ends). A phone that stays in the foreground and sends nothing
    during an upgrade keeps the old minimum until its next background stay (accepted). Expected: the same "Update the app" screen over the app, without restarting it. Restore the minimum
    afterwards; a restart then opens the app as before.
7.  Setup: Dev on the current backend, an order with a line, two phones (or one phone and a manual change of the line in the
    database). Action: change the line on the second phone, then change its quantity on the first without refreshing.
    Expected: the first phone is told the line changed (the concurrency check), and nothing is overwritten.

Unit tests that cover what a phone cannot show here: the typed refusal in both ways in (`operatorServer.test.ts`,
`openFacility.test.ts`, `operatorBootstrap.test.ts`, `BootstrapCentral.test.tsx`, `OperatorServerSelection.test.tsx`), the 503 handling in the request layer
(`upgradeAnswer.test.ts`, `functionUpgradingAnswer.test.ts`), the saves (`grnUpgradingAnswer.test.ts`, `dispatchUpgradingAnswer.test.ts`) and the release table
(`backendFeatures.test.ts`, `orderLineVersion.test.ts`).

## Document numbers (WS-8)

Needs Dev on backend migration 127 or later (and, for step 10, Dev before it). Not run: for the owner's phone checks.
Use a GRN, a dispatch and an invoice that exist only for these steps; put the rule back afterwards (Settings > Warehouse tools >
Document numbers > the row > the scheme and fields as they were).

1.  Setup: sign in at Dev as an administrator. Action: Reports tab, Profile and settings, Settings. Expected: under "Warehouse tools" a row
    "Document numbers" with "How GRN, dispatch and invoice numbers are written". Evidence: a screenshot. A broken app would show no row.
2.  Setup: sign in as a supervisor, then as a staff member. Action: open Settings. Expected: no "Document numbers" row for either.
3.  Action: as the administrator, open "Document numbers". Expected: three rows, GRN, Dispatch and Invoice, each with its rule in words
    (for example "Letter series from A, for example A0001"), "A number outside the rule is refused" or "... is saved (not checked)", and, where
    there are some, "N existing numbers do not follow the rule". Evidence: a screenshot.
4.  Action: open GRN. Expected: four choices (Letters and digits, Financial year, Plain sequence, Typed by hand) with the stored one chosen; the fields
    First letter, Digits and Numbers per letter; "Example: The first number looks like A0001". Choose "Financial year", type the prefix GRN/.
    Expected: fields Prefix, Digits and First number; the example becomes GRN/26-27/0001 (the two years follow today's date). Save numbering is off
    until something changed. Type 9 in Digits and press Save numbering: "Enter a whole number from 1 to 7." and no confirm step.
5.  Action: with the financial-year rule filled in, press Save numbering. Expected: a confirm step in the same sheet: "Change the numbering?",
    "New numbers look like GRN/26-27/0001.", "N existing documents keep their numbers." Back returns to the fields with nothing sent. Press Change numbering.
    Expected: the sheet closes, "Numbering saved. The next number is GRN/26-27/0001." and the GRN row now describes the new rule.
6.  Action: GRN tab, Create GRN. Expected: the "GRN number" box holds GRN/26-27/0001 (not A0001). Type A0500 in its place and go to Review, then press
    Create GRN while the GRN check is on. Expected: "This number does not follow this facility's numbering (GRN/26-27/####)." and step 1 with the number
    flagged; nothing was saved (check the GRN list). Put the suggested number back and Create GRN: it is saved.
7.  Action: Document numbers > GRN > switch off "Refuse numbers outside this rule" > Save numbering > confirm. Create a GRN with the number A0500.
    Expected: it is saved. Switch the check on again: the confirm step says how many existing numbers do not follow the rule and that they are kept.
8.  Action: Document numbers > GRN > "Typed by hand" > Save. Create GRN. Expected: the "GRN number" box is empty; type 14/B/2027 and the GRN saves
    (up to 20 characters). With the box empty, Review > Create GRN says "No GRN number is offered. Type the GRN number." and sends nothing.
9.  Action: Dispatch tab, Create dispatch with the dispatch rule set to a financial-year rule with prefix D/. Expected: the "Dispatch number" box holds
    the suggested D/26-27/0001 in full (20 characters fit; check that it is not cut off) and the dispatch saves. Invoice: open Invoice in Document numbers:
    only two choices ("Start again every financial year", "Keep counting across years"), the field First number, no refuse-numbers switch.
10. Setup: Dev on a backend before migration 127 (or the app against a facility that has not upgraded). Action: create a GRN, a dispatch and an invoice.
    Expected: the numbers are suggested as before (A0001-style, I0001-style, whole invoice number); Settings shows no "Document numbers" row (the backend has no
    such call, so the row is left out). Put Dev back on the current backend.
11. Setup: language set to Gujarati. Action: open Document numbers and its sheet. Expected: Gujarati drafts; counts in Gujarati digits ("૩ હાલના નંબર ..."),
    the numbers and patterns (A0001, GRN/26-27/0001) in 0-9.
12. Setup: each of the four themes (Orange and GCSA, light and dark) and the largest font size. Action: open the screen and a sheet. Expected: no cut-off text,
    every control at least 44 high, the pinned Save numbering button above the keyboard.

Unit tests that cover what a phone cannot show here: `documentNumberingService.test.ts` (the suggestion and the older backend),
`nextInvoiceNumberRule.test.ts`, `numberFormatRefusal.test.ts`, `grnNumberFormat.test.ts`, `dispatchNumberFormat.test.ts`,
`GrnReviewStepNumberFormat.test.tsx`, `useDispatchFormSubmit.test.tsx`, `DispatchHeaderStepNumber.test.tsx`, `numberingModel.test.ts` and
`DocumentNumberingScreen.test.tsx`.
