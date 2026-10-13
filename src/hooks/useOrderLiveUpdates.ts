import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { subscribeToOrderChanges } from '@/services/order-live-updates';

export interface OrderLiveUpdatesOptions {
  /**
   * Call `refresh` once when the screen is shown again after another screen covered
   * it, to recover the changes missed while it had no subscription. A list that
   * reloads on its own return passes false so the return loads once.
   */
  refreshOnFocus?: boolean;
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
 * Follows changes to orders while the signed-in user's order screen is shown, the
 * app is in the foreground and the device is online. Each subscription holds its own
 * realtime connection, so a screen that another screen covers (a tab left mounted, a
 * list under a pushed detail) gives its subscription up and catches up on its return.
 * The same holds for the app going to the background or the device going offline: the
 * subscription ends, and when both come back while the screen is shown it refreshes
 * once (lists too, since their own return load covers only navigation). The new
 * subscription's first join refreshes nothing, so this is the only catch-up then.
 */
export function useOrderLiveUpdates(
  refresh: () => void | Promise<void>,
  enabled = true,
  { refreshOnFocus = true }: OrderLiveUpdatesOptions = {},
) {
  const profile = useAppSelector(state => state.auth.userProfile);
  // A profile reloaded for the same account is not a new account: keep the connection.
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
  // Foreground and online: the conditions the subscription needs besides the screen.
  const live = active && isConnected;

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
      if (catchUpRef.current) void refreshRef.current();
    } else if (reconnected && focused && enabledRef.current) {
      void refreshRef.current();
    }
  }, [focused, live]);

  useEffect(() => {
    if (!enabled || profileId === null || !focused || !live) return;
    return subscribeToOrderChanges(() => refreshRef.current());
  }, [enabled, profileId, focused, live]);
}
