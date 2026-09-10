/**
 * Cold Start Deep Link Hook
 *
 * I10 Fix: Handles deep links when the app is opened from a cold start
 * (not already running in the background).
 *
 * expo-router handles deep links automatically, but there's a timing issue:
 * - On cold start, the app may navigate to a deep link route before auth is restored
 * - This hook captures the initial URL and re-navigates after auth is ready
 *
 * @module hooks/useColdStartDeepLink
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Linking, Platform } from 'react-native';
import { useRouter, usePathname, Href } from 'expo-router';
import { useAppSelector } from '@/store/hooks';

interface ColdStartDeepLinkResult {
  /** The initial URL that opened the app (if any) */
  initialUrl: string | null;
  /** Whether the initial URL has been processed */
  processed: boolean;
  /** Whether we're waiting for auth before navigating */
  pendingAuth: boolean;
}

/**
 * Parses a deep link URL into a route path
 *
 * @param url - Full URL (e.g., "gcsreactnative://grn-details/123")
 * @returns Route path (e.g., "/grn-details/123") or null if invalid
 */
function parseDeepLinkUrl(url: string): string | null {
  try {
    // Handle custom scheme (gcsreactnative://path)
    const scheme = process.env.EXPO_PUBLIC_APP_SCHEME || 'warehousemanager';
    const schemeMatch = url.match(new RegExp(`^${scheme}:\\/\\/(.+)$`));
    if (schemeMatch) {
      return '/' + schemeMatch[1];
    }

    // Handle https URLs (universal links)
    const httpsMatch = url.match(/^https?:\/\/[^/]+\/(.+)$/);
    if (httpsMatch) {
      return '/' + httpsMatch[1];
    }

    // Handle expo dev URLs
    if (url.includes('expo-development-client')) {
      const pathMatch = url.match(/--\/(.+)$/);
      if (pathMatch) {
        return '/' + pathMatch[1];
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Checks if a route requires authentication
 */
function isProtectedRoute(path: string): boolean {
  // Public routes that don't require auth
  const publicRoutes = ['/login', '/otp', '/'];

  // Check if path starts with any public route
  return !publicRoutes.some(
    (route) => path === route || (route !== '/' && path.startsWith(route))
  );
}

/**
 * Hook to handle deep links on cold start
 *
 * This hook:
 * 1. Captures the initial URL that opened the app
 * 2. If user is not authenticated and route is protected, stores the URL
 * 3. After auth completes, navigates to the stored URL
 *
 * @example
 * ```tsx
 * // Use in your app's root layout or bootstrap component
 * function App() {
 *   useColdStartDeepLink();
 *   return <Stack />;
 * }
 * ```
 */
export function useColdStartDeepLink(): ColdStartDeepLinkResult {
  const router = useRouter();
  const currentPath = usePathname();
  const { userProfile, isLoading } = useAppSelector((state) => state.auth);

  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const [processed, setProcessed] = useState(false);
  const [pendingAuth, setPendingAuth] = useState(false);

  // Store pending URL in ref to persist across re-renders
  const pendingUrlRef = useRef<string | null>(null);
  const hasCheckedInitialUrl = useRef(false);

  // Check for initial URL on mount (cold start)
  useEffect(() => {
    if (hasCheckedInitialUrl.current) return;
    hasCheckedInitialUrl.current = true;

    const checkInitialUrl = async () => {
      try {
        const url = await Linking.getInitialURL();

        if (__DEV__) {
          console.log('[ColdStartDeepLink] Initial URL:', url);
        }

        if (!url) {
          setProcessed(true);
          return;
        }

        setInitialUrl(url);

        const routePath = parseDeepLinkUrl(url);
        if (!routePath) {
          if (__DEV__) {
            console.log('[ColdStartDeepLink] Could not parse URL:', url);
          }
          setProcessed(true);
          return;
        }

        if (__DEV__) {
          console.log('[ColdStartDeepLink] Parsed route:', routePath);
        }

        // Check if this is a protected route
        if (isProtectedRoute(routePath)) {
          // Store for later navigation after auth
          pendingUrlRef.current = routePath;
          setPendingAuth(true);

          if (__DEV__) {
            console.log('[ColdStartDeepLink] Protected route, waiting for auth');
          }
        } else {
          // Public route, let expo-router handle it
          setProcessed(true);
        }
      } catch (error) {
        if (__DEV__) {
          console.error('[ColdStartDeepLink] Error checking initial URL:', error);
        }
        setProcessed(true);
      }
    };

    checkInitialUrl();
  }, []);

  // Navigate to pending URL after auth completes
  useEffect(() => {
    // Skip if no pending URL or still loading auth
    if (!pendingUrlRef.current || isLoading) return;

    // Skip if already processed
    if (processed) return;

    const pendingRoute = pendingUrlRef.current;

    if (userProfile) {
      // User is authenticated, navigate to pending route
      if (__DEV__) {
        console.log('[ColdStartDeepLink] Auth complete, navigating to:', pendingRoute);
      }

      // Clear pending URL
      pendingUrlRef.current = null;
      setPendingAuth(false);
      setProcessed(true);

      // Navigate to the pending route
      // Use replace to avoid back navigation to splash/login
      router.replace(pendingRoute as Href);
    } else if (!isLoading) {
      // Auth loaded but user not authenticated
      // Let the auth guard redirect to login
      if (__DEV__) {
        console.log('[ColdStartDeepLink] User not authenticated, clearing pending URL');
      }

      pendingUrlRef.current = null;
      setPendingAuth(false);
      setProcessed(true);
    }
  }, [userProfile, isLoading, processed, router]);

  return {
    initialUrl,
    processed,
    pendingAuth,
  };
}

export default useColdStartDeepLink;
