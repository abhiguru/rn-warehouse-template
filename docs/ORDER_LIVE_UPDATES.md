# Order/cart live updates

The source demo subscribes to `public.orders` while an authenticated order list,
supervisor queue or customer cart is mounted, the app is active and the network
is connected. Stock and invoice subscriptions are not included.

Events are invalidation signals: the screen refetches using its existing
custom-session RPC/RLS path, never by copying socket records into local state.
Bursts are coalesced and an event received during a fetch queues another fetch.
A successful join/rejoin triggers a full refetch to recover missed changes.
Manual refresh remains available when Realtime is unreachable.
Use the refresh-arrow button in the Orders or Order Queue header; it uses the
same authorized API fetch as pull-to-refresh and stays available for empty
lists. Its busy state prevents duplicate presses. A navigation-triggered fetch
does not count as a manual-refresh or live-update acceptance pass.

The dedicated Supabase client obtains the current custom JWT for connection and
heartbeat authentication. It does not use GoTrue sessions or fall back to an
anonymous subscription. A session-generation change disconnects immediately,
cancels pending refreshes and rejects late token reads. Background/offline
transitions remove the subscription; foreground/network restoration creates it
again. Order/cart fetch results from an obsolete session are discarded.

Use the companion backend with Realtime enabled in its default Compose services.
Older immutable release tags do not include this mobile behavior. No schema
change is needed: the existing orders publication and customer RLS are used.

## Verification

Automated coverage checks burst coalescing, queued refetch, reconnect refresh,
rotated token reads, expired-session rejection, logout races, late socket events,
background/foreground transitions, offline/online transitions and account change.
The backend delivery probe separately checks administrator/customer delivery,
unrelated-customer exclusion, reconnect and invalid-token denial.

Android API-36 emulator acceptance on 2026-09-22 passed using the existing
native debug shell and the changed Metro bundle against the owned loopback demo:
restored session, automatic order-list timestamp refresh, live cart insertion
(quantity 7), missed-event recovery (quantity 9 after Realtime stop/restart),
and cleanup back to an empty cart. No manual refresh was used for these changes.

The full mobile suite passed 29 suites / 200 tests, setup 28 tests, typecheck,
lint (zero errors; existing warnings), and Android export. Earlier physical
iPhone acceptance predates this feature; iOS live-update UI acceptance still
requires the separate Mac/device. Production native signing is also separate.
Production scale, soak, host-loss and latency objectives remain operator-dependent.

The remaining physical-iPhone regression has a single-session procedure and
case matrix in [IOS_ORDER_LIVE_ACCEPTANCE.md](IOS_ORDER_LIVE_ACCEPTANCE.md).
