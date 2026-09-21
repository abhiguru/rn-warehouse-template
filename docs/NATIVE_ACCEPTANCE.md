# Native and physical-device acceptance

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

## iOS simulator acceptance — 2026-09-18

The source-demo application was built, installed and launched from
`WarehouseManager.xcworkspace` on an Apple-silicon Mac using Xcode 26.3
(17C529), CocoaPods 1.16.2 and Node.js 22.23.1. The target was an iPhone 17 Pro
simulator running iOS 26.2. The Debug application ID was
`com.example.warehousemanager`. Mobile source was
`51ee8d39b74238576339d95dd30f5a4bf8bb1fbc`; the paired backend was
`1898dc79588f5db0a6d6dae520d5fa663548eb8f`. Both match the requested `main`
handoff commits. Existing `v0.2.2-demo` tags were not moved.

| Case | Result |
| --- | --- |
| Clean native build and install | PASS — iOS prebuild, installation of 118 pods, Xcode Debug build, simulator installation and launch completed. Public configuration was fetched from the isolated loopback demo backend. |
| Fresh login and roles | PASS — fictional admin and assigned-customer OTP logins succeeded. Admin exposed Queue, Customers and Users; the customer exposed no Queue, Customers or Users controls. |
| Persistence and logout | PASS (simulator scope) — a stopped/cold-launched app restored the admin session. Admin and customer logout returned to login; a subsequent full stop/relaunch did not resurrect the customer session. Reboot/unlock and instrumented secure-storage failure remain NOT RUN. |
| Offline and retry | PARTIAL PASS — stopping only the API gateway made OTP fail without false success (`Network request failed`); restoring the gateway allowed the same request to reach verification and complete login. Mid-upload and stock-mutation interruption remain NOT RUN. |
| Deep links and authorization | PASS — an authenticated admin `warehousemanager://customers` launch opened the customer list; a customer `warehousemanager://users` launch rendered Access Denied. Unicode, repeated-parameter and malformed-encoding native cases remain NOT RUN. |
| Documents | PARTIAL PASS — an invoice displayed the independently seeded ₹100 total and generated a 21 KB PDF in the native iOS share sheet. The backend acceptance suite generated all four document types and passed its access-denial checks; manual native open/share of the other three remains NOT RUN. |
| Camera and picker | NOT APPLICABLE / NOT RUN — Simulator cannot establish real-camera capture. Native permission denial/grant, capture, picker upload/reopen/delete and physical-device lifecycle remain open. Backend image access/delete flows passed. |
| Refresh and stock races | PARTIAL PASS — backend API acceptance passed refresh replay, logout revocation, concurrent dispatch, oversell denial and idempotent business flows. The full native parallel-request and logout-during-refresh matrix remains NOT RUN. |
| Privacy | PASS for the default configuration — the telemetry DSN is empty/absent and the generated `.env` is ignored with mode `0600`. Enabled telemetry payload/redaction testing remains NOT RUN. |
| Clean rerun | PASS — the checksummed migration plan reported all 11 migrations already applied; the backend `.env` hash and `0600` mode were unchanged, and fictional customer rows remained 3 before and after. Doctor and live mobile-contract checks passed with zero missing RPCs or mismatches. |

Supporting source checks passed 20 Jest suites / 165 tests, typecheck, setup tests,
Expo dependency compatibility and lint with zero errors (existing warnings remain).
The backend API suite passed the OTP, authorization, GRN, dispatch, oversell,
invoice, image, role, concurrency, PDF, customer-order, rounding, refresh-replay
and logout-revocation flows. One backend unit fixture that expects a temporary
fake Docker executable to return exit 42 instead received exit 1; 15 of 16
backend unit tests passed. The 2026-09-21 review traced this to symlink-sensitive
CLI entry checks that skipped configuration generation, corrected them, and
passed 17/17 backend tests. The earlier live Docker-backed doctor, contract and
API suites passed separately.

The initial large migration stream was truncated by the sandbox-to-Colima stdin
bridge. The exact generated checksummed plan was copied into the isolated DB
container and applied there, after which doctor and API acceptance passed. This
workaround does not replace a normal unsandboxed `setup.sh --demo` verification.

This closes the simulator-eligible iOS checks, not physical-device acceptance.
The remaining iOS gate is a real iPhone run for camera/photo permissions and
capture, reboot/unlock persistence, secure-storage failure instrumentation,
network interruption during uploads and stock mutations, the remaining native
document paths, and distribution signing. Do not begin a later ordered item on
the strength of this simulator record alone if physical iOS evidence is required.

## iOS physical-device acceptance — 2026-09-18 to 2026-09-21

An iPhone 15 running iOS 26.6.2 was connected by USB and selected as the Xcode
run destination. Xcode registered a new local-development application ID under
the tester's Personal Team, built the Debug target, installed it, and launched it
after the device trusted the developer certificate. The temporary application ID
and generated native changes remain local to the ignored `ios/` tree; no release
tag or production signing asset was changed. Xcode 26.3, `xcrun` 72,
CocoaPods 1.16.2, Git 2.50.1 and the installed NVM Node.js 22.23.1 satisfied
the handoff prerequisites.

The physical app uses a temporary HTTP relay bound only to the iPhone USB
link-local interface. The relay forwards to the loopback demo backend and rewrites
only the advertised public demo origin; neither the OTP API nor the database was
bound to Wi-Fi or a public interface. Disconnecting USB removed that interface
and correctly produced the fail-closed configuration error. Reconnecting assigned
a new link-local address; refreshing the relay and Metro restored bootstrap.

| Case | Result |
| --- | --- |
| Signed build, install and launch | PASS — Personal Team provisioning, framework/app signing, installation and trusted-device launch completed. |
| Private demo connectivity | PASS — Metro and public configuration loaded on-device through the USB-only arrangement; no Wi-Fi/public backend listener was used. |
| Fresh admin login and role UI | PASS — fictional admin OTP login opened Orders. Settings identified the Demo Admin role and exposed Customers, Items, Users and Item Pricing. |
| Secure restoration and refresh | PASS — an Xcode stop/relaunch restored the cached admin profile; a later relaunch refreshed an expired JWT and restored the same session. After a full iPhone reboot and unlock, relaunching the existing installation without clearing app data restored the admin session directly to Orders. A temporary instrumented build then forced SecureStore reads and writes to fail: the saved customer session failed closed to login without an AsyncStorage credential fallback, and OTP verification reported failure rather than opening an authenticated screen. The fault injection was removed after the run. |
| Disconnect/offline behavior | PASS — removing the USB route caused bootstrap to time out and show the configuration error without false success; restoring the route recovered normally. While editing existing GRN `A0001`, removing only that route before adding a header photo produced an explicit upload failure and no false completed thumbnail; after reconnection, retrying the same photo succeeded with one new thumbnail. For a stock mutation, fictional GRN `A0002` was prepared with one Example Potatoes bag / 10 kg and one deferred header image. Submitting without the route reported `Network request failed` and remained on Review. After reconnection, one retry created the GRN; reopening it showed total quantity 1, stock 1, dispatched 0, weight 10 kg and an Images count of 1, with no duplicate stock change. |
| Logout and revocation | PASS — customer logout followed by a full stop/relaunch remained logged out; a later admin login and expired-token refresh restored only the current admin session. |
| Refresh races | PASS — a temporary instrumented physical-device build expired the saved access marker and issued three simultaneous validity checks; all three succeeded while the USB relay observed one refresh RPC per probe, confirming single-flight renewal. With that refresh response delayed for three seconds, logout completed first; the late refresh resolved false, secure storage remained invalid, and the phone visibly returned to login. The probes were removed after the run. For the assigned fictional customer, removing the warehouse assignment made the open stock view fail closed with `Customer access denied`; restoring the assignment immediately restored the same 100-unit/two-GRN view. Deactivating the account made the same protected view fail closed with `Session expired or revoked`; reactivation immediately restored the data. Backend acceptance separately covers refresh replay and server revocation. |
| Camera and images | PASS — camera grant and denial were exercised; denial displayed the required permission explanation. A real item photo and GRN header photo were captured and uploaded. Admin and assigned-customer reads succeeded, one image was deleted, and the customer subsequently saw only the remaining image. |
| Warehouse walkthrough | PASS — physical-device GRN `A0001` was created with 100 bags at 10 kg, 20 bags were dispatched, and the committed balance reopened as 80 bags / 800 kg. The assigned customer viewed the balance and completed cart add/change/remove. A default monthly Example Potatoes price (₹5, labour ₹2, tax 5%, 0–100 kg) was created after the customer-specific picker initially failed. The picker was subsequently fixed to normalize the standardized wrapped `search_customers` response; searching `Example` then displayed the matching customers on the physical iPhone. Dispatch `I0002` submitted the remaining 80 bags / 800 kg successfully. After aligning the monthly price's effective date with the GRN date, invoice `715118652` previewed 100 received/dispatched bags with ₹500 storage, ₹200 labour, ₹35 tax and ₹735 total, then saved successfully. |
| Documents | PASS — GRN `A0001`, dispatch `I0002`, invoice `715118652`, and the Example Customer A stock summary each generated a private PDF and opened the native iOS share sheet after the shared PDF service was fixed to rewrite loopback/internal signed-URL origins to the app's configured physical-device API origin. The focused seven-case PDF privacy/URL suite, typecheck and lint passed. |
| Deep links and authorization | PASS — on the physical iPhone, an authenticated admin `warehousemanager://customers` link opened the three-customer list from both warm and fully stopped launches. Warm Unicode plus repeated parameters reached the app, and malformed percent/invalid-byte input did not crash the decoder. After switching to the assigned customer, `warehousemanager://users` rendered **Access Denied** instead of the Users list. Xcode recorded each native URL delivery. The fix includes a tracked Expo config plugin so the generated native bridge survives `expo prebuild`, plus focused hook/plugin regression tests. |
| Acceptance defects | FAIL — the customer GRN list renders an empty state because it calls staff-only `get_all_grn_items`; customer recent dispatches likewise call staff-only `get_dispatch_list_with_items`. The pricing list exposes a timestamp-suffixed automated fixture name (`Review customer …`) in normal UI; the orange item-header number is only the pricing-record count, not an identifier leak. A newly revoked active session is denied protected data and displays the accurate `Session expired or revoked` reason, but remains on the failed screen instead of clearing credentials and returning to login. Two defects were fixed in the current worktree and confirmed on the physical iPhone: Item Pricing now normalizes direct and standardized wrapped customer-search results, and Dispatch duplicate-lot selection now disables the empty item selector, explains where the item is, and provides a working **View All** action. Focused regression tests and typecheck passed. |

This completes execution of the documented physical-iOS core matrix for ordered
item 3, with the listed defects still open. See
[the handoff review](HANDOFF_REVIEW_2026-09-21.md) for priorities, source revisions,
validation and the missing reproducible physical-USB setup procedure. It
does not waive the acceptance defects above or establish production signing,
App Store distribution, retention enforcement, or enabled native-telemetry
delivery. Telemetry remained disabled because no dedicated test DSN/project was
provided; the default-empty configuration emitted no crash events.

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
| Physical Android device | Not run: no device listed by `adb devices -l` |
| iOS native compilation | Not run: this host is Linux, without Xcode |
| Camera, reboot, offline and deep-link acceptance | Pending physical-device execution |
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
Do not mark overall native acceptance complete while either platform or required
physical-device flows remain untested.

References: [Expo local builds](https://docs.expo.dev/guides/local-app-development/),
[native generation](https://docs.expo.dev/workflow/continuous-native-generation/).
