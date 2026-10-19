import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export interface LiveUpdatesOptions {
  /**
   * Call `refresh` once when the screen is shown again after another screen covered
   * it, to recover the changes missed while it was not re-reading. A list that
   * reloads on its own return passes false so the return loads once.
   */
  refreshOnFocus?: boolean;
}

export interface UseLiveUpdatesOptions extends LiveUpdatesOptions {
  /** Time between the end of one `refresh` and the start of the next, while the screen is shown. */
  intervalMs: number;
}

/**
 * Whether the screen around this component is the one shown. Outside a navigator
 * (a component rendered on its own, as in component tests) there is no screen to
 * leave, so it counts as shown. Whether a navigator is present does not change while
 * a component is mounted, so the hooks inside `useIsFocused` run the same way on
 * every render.
 */
function useScreenFocused(): boolean {
  try {
    return useIsFocused();
  } catch {
    return true;
  }
}

/**
 * Keeps a screen current by calling `refresh` on a timer while the signed-in user's
 * screen is shown, the app is in the foreground and the device is online. There is no
 * subscription and no connection to hold: a change made elsewhere shows within one
 * interval.
 *
 * Timer rules (the style of `usePolling`):
 * - The first timed call comes `intervalMs` after the conditions hold, not at once: the
 *   screen loads itself on mount.
 * - Completion driven. The next timer starts when a call settles, so the interval is
 *   measured from the end of the previous call.
 * - Single flight. A tick that finds a call in flight is skipped, never queued, so timed
 *   reads never overlap. A catch-up call (below) does not check: it may run beside a timed
 *   read that started before the screen was left.
 * - No timer runs while a condition is off (disabled, signed out, covered by another
 *   screen, in the background, offline). It is cleared on every change and on unmount.
 *
 * Catch-up: a screen shown again after another screen covered it refreshes once when
 * `refreshOnFocus` is set. The app coming back to the foreground or online while the
 * screen is shown refreshes once (lists too, since their own return load covers only
 * navigation). The first time the conditions hold refreshes nothing: the screen has
 * just loaded itself.
 *
 * `refresh` may change on every render: the latest one is called.
 */
export function useLiveUpdates(
  refresh: () => void | Promise<void>,
  enabled: boolean,
  { refreshOnFocus = true, intervalMs }: UseLiveUpdatesOptions,
): void {
  const profile = useAppSelector(state => state.auth.userProfile);
  // A profile reloaded for the same account is not a new account: keep the timer.
  const profileId = profile ? profile.id : null;
  const { isConnected } = useNetworkStatus();
  const focused = useScreenFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const catchUpRef = useRef(enabled && refreshOnFocus);
  catchUpRef.current = enabled && refreshOnFocus;
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;
  // Foreground and online: the conditions the timer needs besides the screen.
  const live = active && isConnected;
  const running = enabled && profileId !== null && focused && live;
  const runningRef = useRef(running);
  runningRef.current = running;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(0);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleRef = useRef<() => void>(() => undefined);

  // One call of `refresh`, counted as in flight until it settles; the next timer starts
  // then. A refresh that throws or rejects ends the call like any other.
  const call = useCallback(() => {
    inFlightRef.current += 1;
    let promise: Promise<void>;
    try {
      promise = Promise.resolve(refreshRef.current());
    } catch (error) {
      promise = Promise.reject(error);
    }
    void promise
      .catch(() => undefined)
      .then(() => {
        inFlightRef.current -= 1;
        if (mountedRef.current && runningRef.current && inFlightRef.current === 0) scheduleRef.current();
      });
  }, []);

  scheduleRef.current = () => {
    clearTimer();
    if (!mountedRef.current || !runningRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // A tick that finds a call in flight is skipped; its completion starts the next timer.
      if (inFlightRef.current > 0) return;
      call();
    }, intervalRef.current);
  };

  // Declared first: React runs setups in declaration order (also after a Fast Refresh or
  // under StrictMode, which run every cleanup and then every setup), and the timer effect
  // below needs `mountedRef` true when it schedules.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => listener.remove();
  }, []);

  // Shown again after another screen covered this one, or back in the foreground and
  // online after a drop while shown: catch up once. A return to the screen decides on
  // its own (a list loads itself then), even when the connection came back with it. A
  // first move to live (an app that started in the background) missed nothing.
  const wasFocusedRef = useRef(focused);
  const wasLiveRef = useRef(live);
  const hasBeenLiveRef = useRef(live);
  useEffect(() => {
    const returned = focused && !wasFocusedRef.current;
    const reconnected = live && !wasLiveRef.current && hasBeenLiveRef.current;
    wasFocusedRef.current = focused;
    wasLiveRef.current = live;
    if (live) hasBeenLiveRef.current = true;
    if (returned) {
      if (catchUpRef.current) call();
    } else if (reconnected && focused && enabledRef.current) {
      call();
    }
  }, [focused, live, call]);

  // The timer: started when every condition holds, cleared as soon as one stops holding.
  useEffect(() => {
    if (!running) return undefined;
    scheduleRef.current();
    return clearTimer;
  }, [running, clearTimer]);

  // A changed interval applies to the timer already waiting.
  useEffect(() => {
    if (timerRef.current !== null) scheduleRef.current();
  }, [intervalMs]);
}
