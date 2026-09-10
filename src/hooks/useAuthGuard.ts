/**
 * Auth Guard Hook
 *
 * S10 Fix: Provides authentication guard for protected routes.
 * Redirects to login if user is not authenticated.
 *
 * Usage:
 *   const { isAuthenticated, isLoading } = useAuthGuard();
 *   if (isLoading) return <LoadingScreen />;
 *   // Component continues only if authenticated (auto-redirects otherwise)
 */

import { useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAppSelector } from '@/store/hooks';

interface AuthGuardResult {
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether auth check is still in progress */
  isLoading: boolean;
  /** User profile if authenticated */
  userProfile: unknown | null;
}

/**
 * Hook to guard protected routes.
 * Automatically redirects to login if not authenticated.
 *
 * @param options.redirectTo - Where to redirect if not authenticated (default: '/login')
 * @param options.skipRedirect - If true, don't redirect, just return auth state
 */
export function useAuthGuard(options: {
  redirectTo?: string;
  skipRedirect?: boolean;
} = {}): AuthGuardResult {
  const { redirectTo = '/login', skipRedirect = false } = options;
  const router = useRouter();
  const segments = useSegments();
  const { userProfile, session, user, isLoading: authLoading } = useAppSelector(
    (state) => state.auth
  );
  const [hasRedirected, setHasRedirected] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const isAuthenticated = !!(userProfile || (user && session));
  const isLoading = authLoading && !initialCheckDone;

  useEffect(() => {
    // Wait for initial auth check to complete
    if (authLoading) {
      return;
    }

    // Mark initial check as done
    if (!initialCheckDone) {
      setInitialCheckDone(true);
    }

    // Skip if already on auth screens
    const inAuthGroup = segments[0] === '(auth)' || segments[0] === 'login' || segments[0] === 'otp';
    if (inAuthGroup) {
      return;
    }

    // Redirect if not authenticated and haven't already redirected
    if (!isAuthenticated && !skipRedirect && !hasRedirected) {
      if (__DEV__) {
        console.log('[AuthGuard] Not authenticated, redirecting to', redirectTo);
      }
      setHasRedirected(true);
      router.replace(redirectTo);
    }
  }, [authLoading, initialCheckDone, isAuthenticated, skipRedirect, redirectTo, router, segments, hasRedirected]);

  return {
    isAuthenticated,
    isLoading,
    userProfile: isAuthenticated ? userProfile : null,
  };
}

export default useAuthGuard;
