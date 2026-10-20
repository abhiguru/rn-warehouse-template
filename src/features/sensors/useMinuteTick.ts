/**
 * The time, moved on once a minute while the screen is in front of the person.
 *
 * Staleness is the absence of events: no change arrives to say a sensor went quiet. The
 * sensor screens pass this `now` to the status rules (./sensorStatus.ts) and redraw their
 * rows with it, so "No recent data" and "Updated 5 min ago" move by themselves, without a
 * request. A screen covered by another, or an app in the background, keeps no timer; on
 * its return the time is read at once.
 */
import { useEffect, useState } from 'react';
import { useAppForeground, useRouteFocus } from '@/hooks/useRouteFocus';
import { useIsOffline } from '@/hooks/useNetworkStatus';

export const MINUTE_MS = 60_000;

export function useMinuteTick(): number {
  const focused = useRouteFocus(true);
  const foreground = useAppForeground();
  const inFront = focused && foreground;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!inFront) return undefined;
    // Back in front: what was true when the screen was left may not be now.
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, [inFront]);

  return now;
}

/**
 * The time the status rules are given, and whether the answer on screen could not be renewed.
 *
 * While the phone has no connection, or the last re-read failed, nothing newer can be had, so
 * letting the minute tick run on would turn every sensor "No recent data" only because the phone
 * cannot ask (review R4-14). Then the time stands at when the answer on screen was given
 * (`updatedAt`): the sensors keep the statuses they had, and the screen says it could not
 * update. When the phone is back online and a re-read works, the tick takes over again.
 *
 * @param updatedAt when the answer on screen was given
 * @param error the query's error, if its last read failed
 */
export function useSensorNow(updatedAt: number | undefined, error?: string | null): { now: number; phoneOffline: boolean } {
  const tick = useMinuteTick();
  const phoneOffline = useIsOffline();
  const cannotRenew = phoneOffline || Boolean(error);
  const now = cannotRenew && updatedAt !== undefined ? Math.min(tick, updatedAt) : tick;
  return { now, phoneOffline };
}
