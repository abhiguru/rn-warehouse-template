# Physical iPhone development over USB

This is a local source-demo development path, not production hosting. Keep the
backend bound to `127.0.0.1`; never expose the fictional OTP service to Wi-Fi,
LAN, a tunnel, or the public internet. iOS does not support `adb reverse`.

## Fresh checkout

Use macOS with full Xcode, CocoaPods and Node.js 22.18+. Clone this repository
and `supabase-warehouse-template` as siblings. Follow the backend's
`docs/CLEAN_INSTALL.md` to create an isolated checkout-owned Compose project,
unused loopback ports and new configuration. Do not copy credentials, native
trees, dependencies or signing assets from another checkout.

Use a local, non-synchronized directory such as `~/ws/warehouse-demo`. Do not
build in iCloud Drive/Desktop/Documents: automatic file eviction can make
dependency files appear empty and invalidate both builds and container mounts.

Connect one iPhone by USB, unlock it, trust this Mac, and enable Developer Mode.
Then, from this repository:

```bash
npm ci
node scripts/create-env.mjs
node scripts/ios-usb.mjs status --api-port 18000
node scripts/ios-usb.mjs prepare --api-port 18000
(cd ios && pod install)
node scripts/ios-usb.mjs start --api-port 18000
```

Replace `18000` with your isolated backend's actual API port throughout. The
backend's two public origins remain `http://localhost:PORT`. The helper rewrites
only configuration and PDF-link JSON responses to the current USB origin;
authorization and signed paths are unchanged. File bodies stream unchanged.
The helper supplies the Expo public bootstrap URL without persisting credentials.

Open the generated `ios/WarehouseManager.xcworkspace` in Xcode. Select your own
Personal Team and a unique development bundle identifier, choose the connected
iPhone and Run. Keep signing changes in the ignored native tree. If required,
set your compliant Node path in ignored `ios/.xcode.env.local`. Do not commit
team IDs, provisioning profiles, device identifiers or generated native files.

## Network boundaries and reconnects

Discovery uses Apple's USB NCM driver and its IPv4 link-local address, not Wi-Fi
or a guessed LAN address. More than one active USB address fails closed. The API
relay and Metro proxy bind only that USB address. Metro itself binds
`127.0.0.1:8082` through the version-checked Expo adapter; Expo's `--localhost`
flag alone is insufficient to constrain its listener. Defaults are USB Metro
8081 and internal Metro 8082; override using `--metro-port` and
`--internal-metro-port`. All three ports must be distinct and unprivileged.

Verify with `lsof -nP -iTCP:8081 -iTCP:8082 -iTCP:18000 -sTCP:LISTEN`.
There must be no wildcard, Wi-Fi or LAN listener for this workflow.

The helper polls for USB disconnection/address changes. It closes only its own
relays and Metro child, then starts them on the new USB address. If the address
changed, repeat `prepare`, reapply local signing if necessary, and rebuild/install
in Xcode. The compiled Debug bundle URL cannot silently follow a new address.
Release builds continue to use the bundled JavaScript, not this development URL.

## Stop and recover

Ctrl-C in the helper terminal stops only that helper's relays and Metro child.
Its ignored `.expo/ios-usb.lock` prevents overlapping helper sessions. A dead PID
lock is recovered automatically; a live PID causes a refusal, never a process
kill. If a stale lock refers to a reused PID, inspect it manually and stop only
the session you own. Never use broad `pkill node`, `killall`, or Docker pruning.
Stop the backend separately with its checkout-owned `stop.sh` and project name.
Configuration and volumes must remain intact.

Camera capture cannot run through Apple's iPhone Mirroring. Disconnect mirroring
and use the physical phone for capture/permission tests, then lock it to resume
mirroring. Do not include personal photos or unrelated phone screens in durable
acceptance evidence.
