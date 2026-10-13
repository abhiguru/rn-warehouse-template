/**
 * The time, moved on once a minute while the screen is in front of the person.
 *
 * Staleness is the absence of events: no Realtime change says a sensor went quiet. The
 * sensor screens pass this `now` to the status rules (./sensorStatus.ts) and redraw their
 * rows with it, so "No recent data" and "Updated 5 min ago" move by themselves, without a
 * request. A screen covered by another, or an app in the background, keeps no timer; on
 * its return the time is read at once.
 */
import { useEffect, useState } from 'react';
import { useAppForeground, useRouteFocus } from '@/hooks/useRouteFocus';

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
