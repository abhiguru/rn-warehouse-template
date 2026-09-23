# Physical-iPhone order/cart live-update acceptance

Later status (2026-09-23): an affected physical-iPhone regression against the
unmerged backend gateway fix `53b983d3916dd44ec22c6ac2db05136ca81f3875`
and mobile `c943de56b460852e8bca71fbe481b40d0c5265e6` passed the
observed customer Orders/cart, Realtime reconnect, manual fallback, USB recovery,
cold restoration, admin Queue and logout cases on local bundle `20260923.3`.
This does not supersede the complete merged-pair matrix below. Backend PR #42
remains open with failing CI; see the later, redacted case table and cleanup in
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md#later-gateway-fix-iphone-retest--2026-09-23-pre-merge-pair).

Completed on 2026-09-23 with mobile
`c943de56b460852e8bca71fbe481b40d0c5265e6` and backend
`8c682e4d4b83d4f4a8cb2dc252a00702478b11f9` on physical iPhone 15 / iOS 26.6.2,
Xcode 26.3, local Debug bundle `20260923.2`. Every case below passed in the final
merged-pair rerun. See [NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md#physical-iphone-orderscart-live-update-closure--2026-09-23)
for the redacted observations, exact-main CI links, setup limitations and cleanup.
This procedure remains available for reproduction with fictional demo data.

## Prepare the exact pair

On the Mac, clone this repository and the companion backend as siblings in a
local, non-synchronized directory. Record `git rev-parse HEAD` for both before
building. Use the exact implementation pair above. This document is added by a
later mobile documentation commit, so keep it open from `main` when checking out
the tested mobile implementation commit. The immutable `v0.2.2-demo` tags
predate live updates. Follow the backend's `docs/CLEAN_INSTALL.md` with
an isolated project and loopback ports, then
[IOS_USB_DEVELOPMENT.md](IOS_USB_DEVELOPMENT.md) for the USB-only API/Metro relay,
Personal Team Debug build, and owned cleanup. The backend must start Realtime
and pass `npm run test:realtime`; capture the command result before UI testing.

Verify the same backend is reached from the iPhone by logging in as the demo
admin and assigned customer. Keep the backend on loopback and relay only over
the trusted USB link. Capture device model, iOS/Xcode versions, test date,
backend/mobile SHAs, and local build identifier. Keep credentials, device IDs,
real customer data and personal images out of the evidence.

## Complete the matrix

Use an authenticated second session or a controlled fictional-data fixture to
change an existing order and its cart while the iPhone screen is open. Record
the order/cart identifiers privately for cleanup. A visible automatic update
without pull-to-refresh is required for the live cases; a successful manual
refresh alone does not pass them.

| Case | Action and required observation |
| --- | --- |
| Customer order list | Open the assigned customer's order list; change its order from the second session. The list updates without a gesture. |
| Supervisor queue | Open the admin/supervisor queue; change a visible order. The queue updates without a gesture. |
| Open cart | Add, change quantity, then remove a fictional cart line remotely. The iPhone cart reflects each state without a gesture. |
| Missed events | With the cart visible, stop only this checkout's Realtime service; change the cart while disconnected; restart Realtime. The missed state appears after rejoin without a gesture or app restart. |
| Network and app lifecycle | Disconnect/reconnect the iPhone's network within the trusted test setup, then background/foreground the app with a remote change during each interruption. The screen refreshes after connection/restoration and does not show stale data indefinitely. |
| Session isolation | Log out, change the former user's order, and verify no protected data or late update appears. Log into the other demo role; verify only that role's authorized orders, then change a visible order and observe a fresh live update. |
| Token rotation | In the isolated demo, use a shortened access-token lifetime or wait for a normal rotation. While the screen stays mounted, verify a later remote order change still arrives through the refreshed session. Restore any temporary demo lifetime setting in cleanup; do not record token values. |
| Restoration and fallback | Cold-launch with a previously valid session, confirm the right role and current order/cart data, then verify live changes still arrive. While Realtime is unavailable, manual refresh remains usable through the existing authorized API path. |

For each case, record pass/fail, the visible before/after value and whether an
automatic refresh occurred; note any reconnect delay. Check backend Realtime
delivery/isolation logs without copying tokens into the record. Also run the
mobile test, setup, typecheck and lint commands from the root README, and the
backend's required CI checks for the exact commits. Reuse the earlier physical
iPhone matrix only for behavior untouched by this feature; record any additional
fix and rerun the affected cases.
Stock and invoice subscriptions are outside the selected scope; do not mark them
failed or silently add schema/permission changes for this acceptance run.

Publish the redacted case table and exact commit/CI links in
[NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md), then update
[AI_AGENT_HANDOFF.md](AI_AGENT_HANDOFF.md) and the paired PR evidence. Complete
this review on the Mac with its connected iPhone. For the later gateway fix,
the user requested a new agent handoff after physical testing; see
[AI_AGENT_HANDOFF.md](AI_AGENT_HANDOFF.md). Finally stop the USB helper and only the owned backend Compose project,
verify their listeners are gone, and leave both source checkouts clean. This
is source-demo iOS acceptance, separate from production signing and App Store
distribution.
