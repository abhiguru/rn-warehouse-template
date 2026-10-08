/**
 * App State Manager Component
 *
 * Centralized handler for app lifecycle events. Manages:
 * - Token expiry checks on foreground return
 * - React Query cache invalidation for stale data
 * - Coordination of background/foreground transitions
 *
 * This component should be placed high in the component tree,
 * inside Redux Provider and QueryClientProvider.
 *
 * @module components/AppStateManager
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { checkTokenExpiry, selectUserProfile } from '@/store/slices/authSlice';
import { useAppState, STALE_THRESHOLDS, shouldRefreshAfterBackground } from '@/hooks/useAppState';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AppStateManager');

interface AppStateManagerProps {
  /** Child components */
  children: React.ReactNode;
}

/**
 * App State Manager
 *
 * Handles app lifecycle events:
 * 1. On foreground return:
 *    - Check token expiry and show warning if needed
 *    - Invalidate stale React Query caches
 * 2. On background:
 *    - No active operations needed (timers handled by individual components)
 *
 * @example
 * ```tsx
 * <Provider store={store}>
 *   <QueryClientProvider client={queryClient}>
 *     <AppStateManager>
 *       <App />
 *     </AppStateManager>
 *   </QueryClientProvider>
 * </Provider>
 * ```
 */
export function AppStateManager({ children }: AppStateManagerProps) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  // Use memoized selector to prevent re-renders on unrelated auth state changes
  const userProfile = useAppSelector(selectUserProfile);

  // Track if this is initial mount (skip first foreground callback)
  const isInitialMount = useRef(true);

  // Handle foreground return
  const handleForeground = useCallback(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (__DEV__) {
      logger.info('App returned to foreground');
    }

    // Only perform authenticated user actions if logged in
    if (userProfile) {
      // Check token expiry when returning to foreground
      dispatch(checkTokenExpiry()).catch((error) => {
        if (__DEV__) {
          logger.warn('Token expiry check failed:', error);
        }
      });
    }
  }, [dispatch, userProfile]);

  // Handle background entry
  const handleBackground = useCallback(() => {
    if (__DEV__) {
      logger.info('App entering background');
    }
    // Background entry handling - currently no active operations needed
    // Individual components (like usePrintJobPolling) handle their own cleanup
  }, []);

  // Use app state hook with callbacks
  const { backgroundDuration, isAppActive } = useAppState({
    onForeground: handleForeground,
    onBackground: handleBackground,
  });

  // Invalidate stale queries based on background duration
  useEffect(() => {
    // Only process when returning from background (backgroundDuration is set)
    if (backgroundDuration === null || !isAppActive) return;

    // Determine what to invalidate based on background duration
    if (shouldRefreshAfterBackground(backgroundDuration, STALE_THRESHOLDS.EXTENDED)) {
      // Extended background (15+ min) - invalidate all queries for full refresh
      if (__DEV__) {
        logger.info(`Extended background (${Math.round(backgroundDuration / 1000)}s) - invalidating all queries`);
      }
      queryClient.invalidateQueries();
    } else if (shouldRefreshAfterBackground(backgroundDuration, STALE_THRESHOLDS.NORMAL)) {
      // Normal background (5+ min) - invalidate list queries only
      if (__DEV__) {
        logger.info(`Normal background (${Math.round(backgroundDuration / 1000)}s) - invalidating list queries`);
      }
      // Invalidate list queries (they're more likely to have changed)
      queryClient.invalidateQueries({ queryKey: ['grn', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['order', 'list'] });
    }
    // Brief background (< 5 min) - no action needed, stale-while-revalidate handles it
  }, [backgroundDuration, isAppActive, queryClient]);

  // Mark initial mount as complete after first render
  useEffect(() => {
    // After a brief delay, mark initial mount as complete
    // This ensures we don't miss the first real foreground event
    const timer = setTimeout(() => {
      isInitialMount.current = false;
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return <>{children}</>;
}

export default AppStateManager;
