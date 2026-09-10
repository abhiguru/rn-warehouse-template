/**
 * App State Lifecycle Hook
 *
 * Monitors AppState changes (active, background, inactive) and provides
 * centralized handling for foreground/background transitions.
 *
 * Features:
 * - Tracks current and previous app state
 * - Detects foreground return (background → active)
 * - Detects background entry (active → background)
 * - Provides isAppActive flag for components to pause/resume operations
 * - Executes callbacks on state transitions
 *
 * @module hooks/useAppState
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export interface AppStateCallbacks {
  /** Called when app returns to foreground (background → active) */
  onForeground?: () => void;
  /** Called when app goes to background (active → background) */
  onBackground?: () => void;
  /** Called on any app state change */
  onChange?: (newState: AppStateStatus, prevState: AppStateStatus) => void;
}

export interface UseAppStateResult {
  /** Current app state ('active' | 'background' | 'inactive') */
  appState: AppStateStatus;
  /** Previous app state */
  previousState: AppStateStatus | null;
  /** Whether app is currently in foreground (active state) */
  isAppActive: boolean;
  /** Time of last foreground return (for cache invalidation) */
  lastForegroundTime: number | null;
  /** Time spent in background (ms) - useful for deciding stale data threshold */
  backgroundDuration: number | null;
}

/**
 * Hook for monitoring and responding to app state changes
 *
 * @param callbacks - Optional callbacks for state transitions
 * @returns Current app state information
 *
 * @example
 * ```tsx
 * const { isAppActive, appState } = useAppState({
 *   onForeground: () => {
 *     // Refresh data when app comes back
 *     refetchData();
 *   },
 *   onBackground: () => {
 *     // Pause timers when going to background
 *     pausePolling();
 *   },
 * });
 * ```
 */
export function useAppState(callbacks?: AppStateCallbacks): UseAppStateResult {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const previousStateRef = useRef<AppStateStatus | null>(null);
  const backgroundTimeRef = useRef<number | null>(null);
  const [lastForegroundTime, setLastForegroundTime] = useState<number | null>(null);
  const [backgroundDuration, setBackgroundDuration] = useState<number | null>(null);

  // Store callbacks in refs to avoid re-subscriptions
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    const prevState = appState;

    if (__DEV__) {
      console.log(`[useAppState] State change: ${prevState} → ${nextAppState}`);
    }

    // Detect foreground return (background/inactive → active)
    if (prevState.match(/background|inactive/) && nextAppState === 'active') {
      const now = Date.now();
      setLastForegroundTime(now);

      // Calculate time spent in background
      if (backgroundTimeRef.current) {
        const duration = now - backgroundTimeRef.current;
        setBackgroundDuration(duration);

        if (__DEV__) {
          console.log(`[useAppState] Returned from background after ${Math.round(duration / 1000)}s`);
        }
      }

      backgroundTimeRef.current = null;

      // Execute foreground callback
      callbacksRef.current?.onForeground?.();
    }

    // Detect background entry (active → background)
    if (prevState === 'active' && nextAppState.match(/background|inactive/)) {
      backgroundTimeRef.current = Date.now();

      if (__DEV__) {
        console.log('[useAppState] Entering background');
      }

      // Execute background callback
      callbacksRef.current?.onBackground?.();
    }

    // Execute general change callback
    callbacksRef.current?.onChange?.(nextAppState, prevState);

    // Update state
    previousStateRef.current = prevState;
    setAppState(nextAppState);
  }, [appState]);

  useEffect(() => {
    // Subscribe to app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  return {
    appState,
    previousState: previousStateRef.current,
    isAppActive: appState === 'active',
    lastForegroundTime,
    backgroundDuration,
  };
}

/**
 * Threshold constants for determining data staleness
 */
export const STALE_THRESHOLDS = {
  /** 30 seconds - refetch if user was away briefly */
  BRIEF: 30 * 1000,
  /** 5 minutes - refetch for typical app switch */
  NORMAL: 5 * 60 * 1000,
  /** 15 minutes - force full refresh */
  EXTENDED: 15 * 60 * 1000,
} as const;

/**
 * Utility to determine if data should be considered stale based on background duration
 *
 * @param backgroundDuration - Time spent in background (ms)
 * @param threshold - Staleness threshold (ms)
 * @returns Whether data should be considered stale
 */
export function shouldRefreshAfterBackground(
  backgroundDuration: number | null,
  threshold: number = STALE_THRESHOLDS.NORMAL
): boolean {
  if (backgroundDuration === null) return false;
  return backgroundDuration >= threshold;
}

export default useAppState;
