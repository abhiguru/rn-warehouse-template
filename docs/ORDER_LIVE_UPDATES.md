# Order and sensor refresh on a timer

The app no longer holds a Realtime connection. Screens that must stay current
re-read their data on a timer while they are shown. (Earlier versions subscribed to
`public.orders` and `public.sensor_latest` through Supabase Realtime; the backend's
Realtime service is no longer used by the app.)

## What re-reads, and how often

| Screen | Interval | Hook |
| --- | --- | --- |
| Orders list, Order queue, order screen (editor) | 15 s | `useOrderLiveUpdates` |
| Sensors list, sensor detail | 60 s | `useSensorLiveUpdates` |

Orders: a customer's change should show within 15 s. Sensors: the bridge posts at
most one reading a minute.

Both are wrappers of `useLiveUpdates(refresh, enabled, { refreshOnFocus, intervalMs })`
(`src/hooks/useLiveUpdates.ts`). The order screens re-read through their own
authorized API fetch (the same one as pull-to-refresh), never by copying pushed
records into local state. The sensor hook marks the sensor report queries
(`['report', 'sensors', ...]`) out of date so the screen asks again behind the rows.

## Rules

- The timer runs only while a profile is signed in, the screen is shown (not covered by
  another screen), the app is in the foreground, the device is online and the screen
  enabled the hook. The timer is cleared as soon as one of these stops holding, and on
  unmount.
- The first timed read comes one interval after those conditions hold, not at once: the
  screen loads itself on mount.
- Single flight, completion driven: the next timer starts when a read settles, so the
  interval is measured from the end of the previous read and timed reads never overlap. A
  tick that finds a read in flight is skipped. A catch-up read does not check for one in
  flight, so it may run beside a timed read that started before the screen was left.
- Catch-up: a screen shown again after another screen covered it reads once
  (`refreshOnFocus`; the lists load on their own return and pass false). The app coming
  back to the foreground or online while the screen is shown reads once. The first time
  the conditions hold reads nothing.
- A timed read reloads the rows already loaded (the list asks for as many rows as it
  holds), so a user who scrolled far gets a larger read every 15 s.
- The refresh-arrow button in the Orders or Order Queue header and pull-to-refresh are
  unchanged and work whether or not a timer is running.

## Verification

Jest with fake timers (`src/hooks/__tests__/useLiveUpdates.test.ts`,
`useOrderLiveUpdates.test.ts`, `useOrderLiveUpdates.focus.test.tsx`) covers: no read at
mount, a read after each interval, no overlap, stopping when unfocused, backgrounded,
offline, disabled or signed out, the catch-up rules, and the 15 s and 60 s intervals.
