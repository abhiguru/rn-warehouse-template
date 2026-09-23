# Native and physical-device acceptance

## Physical-iPhone orders/cart live-update closure — 2026-09-23

The complete feature matrix passed on the final merged pair:

| Repository | Exact physical-device test SHA | Reviewed fix PR | Successful exact-main CI |
| --- | --- | --- | --- |
| Mobile | `c943de56b460852e8bca71fbe481b40d0c5265e6` | [#26](https://github.com/abhiguru/rn-warehouse-template/pull/26) | [35828897266](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35828897266) |
| Backend | `8c682e4d4b83d4f4a8cb2dc252a00702478b11f9` | [#40](https://github.com/abhiguru/supabase-warehouse-template/pull/40) | [35829262796](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35829262796) |

Physical iPhone 15, iOS 26.6.2 (23G90), Xcode 26.3 (17C529), CocoaPods 1.16.2,
Node 22.23.1, Personal Team Debug build. The installed final bundle version was
`20260923.2`, independently read from the built app. Earlier pre-merge runs had
bundle version `1`; `20260923` was their local run label, not installed version.
Generated native configuration/signing files remained ignored and local.

The backend used a fresh isolated demo Compose project with loopback ports and
the documented USB-only API/Metro relay. Fresh setup and rerun passed. Following
local Docker recovery, bootstrap and `npm run test:realtime` passed again
(delivery, customer isolation, reconnect and invalid-token rejection). All
observations below used fictional Example Customer A/B and Example Potatoes.
Live rows required visible automatic changes without pull-to-refresh.

| Final merged-pair physical case | Redacted observation | Result |
| --- | --- | --- |
| Customer Orders | Remote quantity 37→38 appeared on the open list, without a gesture. | PASS |
| Admin/supervisor Queue | After customer logout and admin login, A:49/B:79 were authorized; remote A:49→50 appeared on the mounted Queue. | PASS |
| Open cart add/change/remove | Mounted cart 38→empty after remote removal; remote addition 39 and quantity 40 each appeared automatically. | PASS |
| Missed events during Realtime downtime | Cart stayed 40 while backend became 41. Restart at 08:29:26 UTC restored 41 before 08:29:45 (≤19-second observation bound); subsequent 42 arrived live. | PASS |
| Network interruption/reconnect | Owned USB API/Metro relays stopped; list 43 stayed stale while backend became 44. Restart restored 44 automatically within 30 seconds. | PASS |
| Background/foreground | App backgrounded at 45; remote 46 changed while away. Switcher snapshot remained 45; foreground fetched 46 automatically. | PASS |
| Logout and role isolation | Customer logout left Welcome/login during remote 49, with no protected data. Admin login exposed A/B and Queue. User then signed out/in as customer: only A:51 and customer tabs remained; other-customer B:79→80 stayed excluded while A:51→52 arrived live. | PASS |
| Token rotation | On the mounted customer session, consumed-refresh count increased 8→10; subsequent remote 45 arrived live. Only counts, never token values, were recorded. | PASS |
| Cold restoration and subsequent live update | Xcode stopped the process at 46; backend became 47. Unlocked cold launch restored Customer, current 47 and customer-only tabs. Remote 48 then arrived automatically. | PASS |
| Manual fallback, customer and staff | With Realtime stopped, customer list 42 stayed stale until header Refresh retrieved 43; admin Queue 50 similarly retrieved 51. Neither required navigation. | PASS |

Most immediate live changes were visible on the next observation, approximately
five seconds later; these are observation bounds, not performance benchmarks.
The pre-merge equivalent implementation also passed the empty-list Refresh
regression (remove→empty, add 26→26) and the complete matrix. The final merged
rerun above is separate evidence, not inferred from that earlier run.

Fixes: the USB relay now forwards authenticated Realtime WebSocket upgrades only
to its fixed loopback gateway; Orders/Queue have accessible Refresh controls,
including empty states; the paired CI pooler probe waits for an authenticated
SQL query rather than relying solely on HTTP health. Mobile checks passed 202
unit tests, 30 setup tests, typecheck and lint (zero errors, existing warnings).
Backend passed 31 unit tests; both exact-main CI runs above passed all required
jobs. Companion workflows and documented copies pin mobile runtime `c127ef6`;
later documentation and squash-equivalent commits do not require repinning.

### Environment limitations and cleanup

A Mac disk-full event interrupted the native build and aborted Docker's storage
journal. The user freed space and authorized/completed a Colima restart; existing
volumes and the unrelated warehouse stack were preserved. Backend health and
Realtime checks were rerun before the final device cases.

Physical cable changes can change the USB address and require the documented
prepare/rebuild procedure. During role switching, iOS routed the configured
link-local API/Metro requests over Wi-Fi and timed out; local backend checks
still passed. Physical user-assisted connectivity/login recovery restored the
same build and the remaining role/queue cases passed. This is a recorded local
transport limitation, not a claim that every cable/lock transition is seamless.
Keep the iPhone unlocked through cold-start secure-storage restoration, then
lock for Mirroring. Mirroring cannot reliably scroll this app's Settings, so
the user performed physical sign-outs. Failed attempts were not counted as passes.

User signed out after testing. Owned fictional fixtures were removed and the
fixture session revoked; temporary token lifetime was restored and verified as
3,600 seconds. Owned API/Metro services and Compose project were stopped, preserving
volumes and unrelated work. No native binary or release was published and no
existing `v0.2.2-demo` tag was changed.

This closes source-demo iPhone orders/cart only with refresh after reconnect.
Stock/invoice subscriptions are outside scope. The Android API-36 observations
of 2026-09-22 remain historical; no Android device rerun occurred on this Mac.
Later closure commits change documentation only. Production SMS/onboarding,
hosting/DNS/TLS, alerts, off-host backup/recovery objectives, retention, billing
and capacity still require operator decisions. Grafana findings and PostgREST
component-inventory/scan coverage remain open regardless of application CI.


## Merged customer-history Android emulator smoke — 2026-09-21

The exact reviewed pair was mobile
`09919ebfbce1f6e819363eca7711c23dd29b155f` and backend
`a1ad80741ddff97d4f9eb47a0066094f76ea476a`. Mobile main CI run
`35605871279` and backend main CI run `35606744913` passed; the backend run used
the same pinned mobile implementation commit. Existing `v0.2.2-demo` tags were
not moved.

A fresh Android Debug build completed, installed, and launched on the headless
`Medium_Phone_API_36.1` AVD (`sdk_gphone64_x86_64`, API 36). The emulator used
ADB reverse mappings for the checkout-owned loopback API and Metro only. Public
configuration bootstrap and fictional customer OTP login succeeded. The
assigned customer showed two GRNs in the GRN list and three completed records in
the expanded Recent Dispatches section. After `am force-stop`, a launcher cold
start restored the authenticated Orders screen.

This closes the merged-pair Android smoke required for the customer-history
repair. It verifies native build/install, loopback connectivity, login, the two
repaired history views, and authenticated cold restoration in emulator scope.
It does not add physical camera, OEM, USB, printer/sensor, signed-distribution,
iOS onboarding, or production evidence.

## Final merged physical-iPhone source-demo acceptance — 2026-09-22

The final tested implementation pair is mobile
`9ba56ff122dc38dc57d6100de4c27599023d22b1` and backend
`cf18f1e43ab613310b1b13339ab97e8533861f9b`, merged through mobile
[#18](https://github.com/abhiguru/rn-warehouse-template/pull/18) and backend
[#13](https://github.com/abhiguru/supabase-warehouse-template/pull/13). Exact-main
CI passed in mobile run
[`35686164009`](https://github.com/abhiguru/rn-warehouse-template/actions/runs/35686164009)
and backend run
[`35686198287`](https://github.com/abhiguru/supabase-warehouse-template/actions/runs/35686198287).
The existing `v0.2.2-demo` tags were not moved.

The physical target was an iPhone 15 running iOS 26.6.2, attached by USB and
signed locally with a Personal Team. The Mac used Xcode 26.3, `xcrun` 72,
CocoaPods 1.16.2, Git 2.50.1 and Node.js 22.23.1. Generated native files,
signing identifiers, profiles and configuration remained ignored and local.
The tracked `scripts/ios-usb.mjs` relay and `docs/IOS_USB_DEVELOPMENT.md`
procedure kept the API and Metro on the USB link-local path; the OTP service,
database and API were never exposed on Wi-Fi, LAN or a public listener. USB
disconnect/reconnect and address change recovery were exercised.

| Source-demo iPhone case | Result |
| --- | --- |
| Clean checkout, configuration, build, install and launch | PASS — locked dependencies, generated mode-0600 configuration, clean iOS prebuild/pods, Personal Team Debug signing, physical installation, public bootstrap and launch completed from the final source. The tracked warm-link plugin survived regeneration. |
| Fictional login and role boundaries | PASS — admin and assigned-customer OTP login succeeded. Admin exposed Queue, Customers, Items, Users and Item Pricing. Customer exposed Orders, GRN, Dispatch, Invoices and Reports only; staff screens and denied routes remained inaccessible. |
| Restoration, refresh and logout | PASS — warm/cold restoration, expired-token refresh, stop/relaunch, reboot/unlock persistence and logout/relogin passed. Forced SecureStore read/write failures failed closed without AsyncStorage credential fallback; the instrumentation was removed. |
| Interrupted requests and retry | PASS — bootstrap/OTP failure, GRN image upload interruption and GRN stock submission interruption showed errors without false success. A single retry after USB recovery created exactly one image/stock result. |
| Refresh races and definitive revocation | PASS — concurrent validity probes used one refresh, logout won against a delayed refresh, and the late response did not restore credentials. Revoked/disabled sessions cleared credentials and returned to login, including after relaunch. Assignment-only denial and network failure preserved a valid session and displayed the correct error. |
| Customer GRN and dispatch history | PASS — on the final merged build the assigned customer displayed its Example Customer A GRNs, opened item details showing 100 received, 79 in stock and 21 dispatched, and displayed the two authorized per-item dispatch rows (20 and 1). Staff-only records and another customer's data remained denied; failures render retryable errors rather than empty success. |
| Camera, picker and image lifecycle | PASS — permission denial showed the explanation; retry/grant opened the camera. Real capture and native picker uploads produced thumbnails, reopening displayed both images, deletion removed one, and admin/customer access boundaries held. |
| Warehouse walkthrough | PASS — GRN creation/reopen, photos, partial and final dispatch, stock/cart add/change/remove, customer-aware Item Pricing, invoice preview/save and invoice-to-GRN navigation passed with fictional data. Duplicate lot selection now explains that the item is already present and offers **View All**. Readable Example fixtures replaced timestamp-suffixed customer names. |
| Pricing and invoice arithmetic | PASS — Example Potatoes used monthly ₹5, labour ₹2 and tax 5%; the accepted invoice showed 100 received/dispatched bags, ₹500 storage, ₹200 labour, ₹35 tax and ₹735 total, saved and reopened successfully. |
| Four private documents | PASS — GRN, dispatch, invoice and customer-stock PDF generation reached the native iOS share sheet. Signed paths were rewritten to the configured USB API origin and cross-customer/private URL checks passed. |
| Warm/cold links and malformed input | PASS — allowed and denied role routes, warm and fully stopped launch, Unicode/repeated parameters, malformed percent encoding and invalid bytes were exercised without crash or authorization bypass. |
| Privacy/default telemetry | PASS — telemetry stayed disabled, generated configuration remained ignored and mode 0600, no credentials or private signed URLs were committed, and wrong-account document/image access was denied. |
| Setup rerun, persistence and owned restart | PASS — migration/doctor/health/contract/API checks passed, setup rerun preserved configuration and fictional data, and checkout-owned stop/restart restored the same healthy service. |

The complete pre-merge physical run used the exact reviewed implementation trees
later squash-merged and supplied the stock/cart, pricing, invoice, private-PDF,
navigation, destructive fault-injection, camera, reboot, deep-link and mutation
evidence. The final merged rerun repeated clean USB bootstrap, admin/customer
roles and the repaired assigned-customer GRN/per-item dispatch history on the
physical iPhone. iPhone Mirroring intermittently dropped its control channel and
would not activate one filter-sheet header target; that Mac mirroring limitation
did not change the physical-device results already observed directly.

The earlier merged customer-history pair passed the fresh Android API-36
emulator build/login/history/cold-restoration smoke recorded above. The final
pair passed Android JS export and shared regression tests, but this Mac had no
Android SDK, so an exact-final-pair emulator run was not repeated. The ordered
handoff explicitly left Android execution on the Linux host; this does not
reduce the completed physical-iPhone matrix.

This closes the local source-demo iPhone matrix. Production signing,
App Store/TestFlight distribution, enabled telemetry delivery, production
SMS/TLS/operations, retention/privacy deployment, printing, sensors, Realtime,
payments and unsupported integrations remain separate production gates.

## Physical Android acceptance — 2026-09-18

Post-release acceptance passed on a user-connected, USB-authorized physical
Samsung SM-A346E (serial `RZC…56FB`), Android 15/API 35, with
`ro.kernel.qemu=0`.
The freshly installed debug package was `com.example.warehousemanager`, version
`0.1.0`/code `1`, built from mobile
`7a9c6449c01600ccbbe92b1071df845a63d0f861` and paired with backend
`1898dc79588f5db0a6d6dae520d5fa663548eb8f` in the checkout-owned
`warehouse-v021-review` project.

| Case | Result |
| --- | --- |
| Fresh install and demo login | PASS — package was absent before install; admin and customer OTP login succeeded. |
| Secure restoration and logout | PASS — force-stop/cold launch restored the encrypted admin session; logout cleared session/user caches and re-login succeeded. |
| Offline and retry | PASS — removing only the API reverse mapping produced the fail-closed configuration screen; restoring it and retrying returned to authenticated Orders. |
| Deep link and roles | PASS — authenticated cold `warehousemanager://customers` launch succeeded; customer `/users` access rendered Access Denied. |
| Camera and picker | PASS — denial produced the permission explanation, retry/grant opened the physical Samsung camera, a captured photo returned, and Android Photo Picker returned a second image without broad media permission. |
| PDF | PASS — invoice PDF generation/download opened Android's native share sheet with `Invoice_483303912_FY2026-2027.pdf`; no share target was selected. |
| USB cleanup | PASS — only `tcp:28000` and `tcp:8081` were added for the isolated run; both were removed and Metro was stopped. |

This run closes the physical Android core matrix. It does not establish iOS,
production deployment, signed distribution, printer/sensor hardware, native
telemetry delivery, or app-store acceptance.

## Source-demo emulator acceptance — 2026-09-18

The source-demo release baseline was built from fresh public sibling clones on
Linux with Android SDK/API 36 and installed on `Medium_Phone_API_36.1`. That build
completed 608 Gradle tasks, bundled 3,072 modules, fetched loopback bootstrap
configuration, logged in through the native UI, and restored an authenticated
cold start to Orders. Earlier acceptance on the same reviewed code line covered
theme/status-bar and modal restoration, protected navigation, Android photo
picker upload/reopen/delete/storage cleanup, and native PDF share/open flows.
Clean onboarding proved setup rerun, owned stop/restart, configuration/data
preservation, and ownership-scoped shutdown.

The development-client bootstrap URL is explicitly ignored as an application
deep link; three regressions and the fresh native cold-start scenario pass. This
is emulator evidence for the supported source demo. The later physical Android
record above supplies separate device evidence. iOS, printing, and sensors remain
unverified by this emulator result; the later iOS evidence is recorded above.

## Historical pre-release evidence

See [the dated verification ledger](RESUME_VERIFICATION_2026-09-15.md)
for current local checks and open native/review gates. Evidence below dated
2026-09-14 or earlier describes the historical release checkpoint. The
pending mobile authentication/privacy fixes and backend follow-up commits
are outside the immutable `v0.2.1-demo` tags. Local follow-up results do
not establish merged-main CI or physical-device acceptance.

## Historical compile evidence — 2026-09-13

Source baseline: `75e42324b6c9317d8432c1caebe122e4cafa4fdf`, Expo SDK 54,
React Native 0.81.5. The Linux public-clone test passes dependency installation,
75 Jest tests, typecheck, lint, bootstrap and dependency tests.

Native follow-up at `96d92a287f2ce8a27b2587fcebe482eb4fe988b2` explicitly
aligns Expo Font and NetInfo with SDK 54. A fresh public fetch and `npm ci`, Expo's
SDK compatibility check, and all eight bootstrap/dependency tests pass. The
Android ARM64 debug build below also passes at this commit.

| Evidence | Status |
| --- | --- |
| Android native generation (`expo prebuild --platform android --no-install`) | Pass in a fresh scratch clone |
| ARM64 debug APK compilation | Pass on Linux; `:app:assembleDebug`, 594 tasks, 6m 57s |
| Physical Android device | Historical Linux compile host had no attached device; later physical Android acceptance is recorded above. |
| iOS native compilation | Historical Linux compile host had no Xcode; the later complete physical-iPhone record is above. |
| Camera, reboot, offline and deep-link acceptance | Later completed in the physical-device records above. |
| Printer, sensors, Realtime | Unsupported/unverified for the default demo; keep disabled |

An Android JavaScript/Hermes export or successful native generation is **not** a
compiled APK or a physical-device test. Use this runbook to record real evidence,
not to mark device checks complete automatically.

### Recorded Android compile evidence

- Node 22.23.2, npm 10.9.8, OpenJDK 21.0.12, Gradle 8.14.3.
- SDK platform 36; Build Tools 36.0.0 and 35.0.0; NDK 27.1.12297006 and
  27.0.12077973 (Worklets Core); CMake 3.22.1. Missing components in the initial
  scratch SDK copy caused two prerequisite failures before the successful build.
- SDK files were copied from installed public tools into an isolated scratch SDK;
  Gradle used a new cache, two workers and disabled SDK auto-downloads. Existing
  SDK files, private repositories and production signing assets were not changed.
- APK: `app-debug.apk`, 79,543,019 bytes, ARM64 only, application ID
  `com.example.warehousemanager`, min SDK 24 / target SDK 36.
- SHA-256: `b3a9c69e73daec23be4d5ddfa9852d127a6108853d4d723e0d821153a0fb05e2`.
- This local debug artifact is **not attached to the source release** and was
  not installed or launched. Build/deprecation warnings remain. The template's
  app/runtime version is still `0.1.0`; the `v0.2.0-demo` source tag is not an
  app-store binary version or a production signing approval.

## Build using your own environment

Start with a fresh public clone, Node 22.18+, `bash setup.sh`, and a local-demo
backend. Android requires Android Studio/SDK, the SDK/NDK versions selected by the
generated Gradle project, and a compatible JDK. iOS requires a supported Mac,
Xcode and CocoaPods. Do not reuse private signing credentials or EAS ownership.

```bash
# Generate in a fresh clone; do not use --clean on native work you need to keep.
npx expo prebuild --platform android --no-install

# Compile and install on your explicitly selected Android test device.
npx expo run:android --device

# On a Mac, compile and install on an iOS simulator/device.
npx expo run:ios --device
```

An APK-only check, run from `android/`, is:

```bash
./gradlew :app:assembleDebug --no-daemon --max-workers=2 \
  -PreactNativeArchitectures=arm64-v8a
```

Record target architectures. A debug build uses test signing and usually needs
Metro; it is not a signed app-store release. Do not publish generated signing
files, `.env`, Gradle credentials, logs or unreviewed binary attachments.

If using EAS, configure a **new project you own** and authorize any cloud build
costs explicitly. This repository does not supply production signing assets.

For the standard USB-connected Android demo:

```bash
adb devices -l
adb -s YOUR_TEST_DEVICE reverse tcp:18000 tcp:18000
adb -s YOUR_TEST_DEVICE reverse tcp:8081 tcp:8081
npx expo start --localhost
```

Use the corresponding port if running an isolated scratch backend. Keep demo OTP
authentication on loopback; do not make it LAN/public merely to connect a phone.
For iOS, use a backend reachable through the Mac's local development arrangement;
physical iOS does not support Android's `adb reverse` mechanism.

## Manual acceptance matrix

Use only fictional demo data. Record pass/fail/not-applicable per platform, app
commit, backend commit, OS, build ID, device model and test timestamp.

1. **Fresh install and roles:** login as demo admin and assigned customer. Confirm
   correct screens and data boundaries; anonymous/other-customer access is denied.
2. **Persistence:** force-close and reopen, then reboot/unlock the device. Check
   session recovery/renewal and profile reload. Exercise secure-storage failure in
   an instrumented test build: no AsyncStorage credential fallback or false login
   success. Confirm logout and restart do not resurrect a revoked session.
3. **Refresh races:** test expiry during parallel requests, logout during refresh,
   refresh replay, revoked account and changed assignments. Existing unit tests
   do not establish every device/race outcome.
4. **Camera/images:** allow and deny camera access, capture a real image, upload,
   confirm/read and delete it. Verify customer access before/after confirmation
   and deletion. Test only barcode features actually present in the checkout.
5. **Offline/retry:** interrupt connectivity during reads, OTP, uploads and a stock
   mutation. Ensure accurate error/pending state, no false success, no data loss,
   and no duplicate stock change on retry/reconnect. Do not assume automatic
   SQLite synchronization: no SQLite dependency or general offline-sync engine
   has been established in this release.
6. **Deep links:** cold/warm launch, Unicode and repeated parameters, redirects,
   malformed percent encodings and unauthorized routes. Decoder 0.5.0 and
   navigation regressions are included in `v0.2.2-demo`; this still requires actual
   native route acceptance. Use only the isolated test app for adversarial input.
7. **Documents:** open/share all four generated PDFs; verify private URLs expire
   and cannot disclose another customer's document through the API.
8. **Privacy:** default-empty telemetry DSN emits no crash events. If enabled in a
   dedicated test project, inspect actual received payloads, native crashes and
   breadcrumbs for redaction. Verify permissions/privacy declarations against
   observed collection; the server retention policy is an operator requirement,
   not automatically configured by this mobile code.
9. **Business acceptance:** prices, taxes, invoice totals, payments, order states,
   idempotency and recovery require independently specified expected results.
   A successful save or malformed-input rejection does not verify calculations.

## Result record

```text
App commit / backend commit:
Platform, OS, model, architecture:
Build type, application ID, artifact SHA-256:
Tester / timestamp:
Each case: PASS | FAIL | NOT RUN | NOT APPLICABLE
Observed result and redacted evidence:
Remaining defects and release limitations:
```

Keep device identifiers, tokens and customer information out of published logs.
For future releases, do not mark overall native acceptance complete until every
required platform and physical-device flow has current evidence.

References: [Expo local builds](https://docs.expo.dev/guides/local-app-development/),
[native generation](https://docs.expo.dev/workflow/continuous-native-generation/).
