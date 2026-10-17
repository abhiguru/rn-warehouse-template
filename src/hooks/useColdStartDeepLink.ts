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
import Constants from 'expo-constants';
import { useRouter, usePathname, useGlobalSearchParams, Href } from 'expo-router';
import { useAppSelector } from '@/store/hooks';

interface ColdStartDeepLinkResult {
  /** The initial URL that opened the app (if any) */
  initialUrl: string | null;
  /** Whether the initial URL has been processed */
  processed: boolean;
  /** Whether we're waiting for auth before navigating */
  pendingAuth: boolean;
}

/** The scheme a build registers when its configuration names none (app.json). */
const DEFAULT_APP_SCHEME = 'warehousemanager';

/**
 * The URI schemes this build registered natively, lower-cased. They come from the build's own
 * configuration (`scheme` in app.json, which app.config.js overrides from WAREHOUSE_APP_SCHEME),
 * a string or a list, so the native registration and this parser name the same scheme. The
 * old `EXPO_PUBLIC_APP_SCHEME` is not read.
 */
function appSchemes(): string[] {
  const configured: unknown = Constants.expoConfig?.scheme;
  const names = (Array.isArray(configured) ? configured : [configured])
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .map((name) => name.toLowerCase());
  return names.length > 0 ? names : [DEFAULT_APP_SCHEME];
}

/** Same characters the old `(.+)` pattern refused: a line break cannot be part of a route. */
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/**
 * Parses a deep link URL into a route path
 *
 * The scheme is the part before `://`, compared as text and case-insensitively (RFC 3986), never
 * built into a pattern: a scheme may hold `+`, `.` and `-`. The route after it keeps its case.
 *
 * @param url - Full URL (e.g., "warehousemanager://grn-details/123")
 * @returns Route path (e.g., "/grn-details/123") or null if invalid
 */
export function parseDeepLinkUrl(url: string): string | null {
  try {
    const separator = url.indexOf('://');
    if (separator > 0 && appSchemes().includes(url.slice(0, separator).toLowerCase())) {
      const rest = url.slice(separator + 3);

      // Expo uses this URL only to boot the development client. It is not an
      // application route and must not be replayed after auth restoration.
      const developmentClient = 'expo-development-client';
      if (
        rest === developmentClient ||
        (rest.startsWith(developmentClient) && '/?#'.includes(rest.charAt(developmentClient.length)))
      ) {
        return null;
      }

      // Handle the custom scheme (warehousemanager://path)
      if (rest.length > 0 && !LINE_BREAK.test(rest)) {
        return '/' + rest;
      }
    }

    // A web address is not an app link. The app registers its own scheme only (no
    // universal-link host is configured), so no site can name a route inside the app.
    if (/^https?:\/\//i.test(url)) {
      return null;
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

/** Screens of the sign-in flow: a warm link is ignored while one of them is focused. */
const SIGN_IN_PATHS: readonly string[] = [
  '/login',
  '/otp',
  '/operator-server',
  '/pending-enrollment',
  // Central login (docs/CENTRAL_LOGIN.md): its sign-in, the address entry and the linking step.
  '/central-login',
  '/central-otp',
  '/facility-address',
  '/facility-link',
];

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

/** True when every query value of the link is what the screen shown already has. */
function queryShown(routePath: string, shown: Record<string, string | string[] | undefined>): boolean {
  const withoutFragment = routePath.split('#')[0];
  const at = withoutFragment.indexOf('?');
  if (at < 0) return true;
  for (const [key, value] of new URLSearchParams(withoutFragment.slice(at + 1))) {
    const have = shown[key];
    if ((Array.isArray(have) ? have.join(',') : have) !== value) return false;
  }
  return true;
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
export function useColdStartDeepLink(
  authCheckSettled: boolean = true
): ColdStartDeepLinkResult {
  const router = useRouter();
  const currentPath = usePathname();
  // Read when a link arrives; held in a ref so a new params object does not resubscribe the listener.
  const shownParams = useRef<Record<string, string | string[] | undefined>>({});
  shownParams.current = useGlobalSearchParams();
  const { userProfile, isLoading } = useAppSelector((state) => state.auth);

  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const [processed, setProcessed] = useState(false);
  const [pendingAuth, setPendingAuth] = useState(false);

  // Store pending URL in ref to persist across re-renders
  const pendingUrlRef = useRef<string | null>(null);
  const hasCheckedInitialUrl = useRef(false);

  // Expo Router normally consumes warm links, but native delivery can race with
  // the router state on a running app. Listen explicitly so an already-running
  // authenticated session always applies the requested route.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (__DEV__) {
        console.log('[ColdStartDeepLink] Warm URL:', url);
      }

      const routePath = parseDeepLinkUrl(url);
      if (!routePath) return;

      // A link that arrives during sign-in does not take the screen away: a half-typed
      // code or facility address would be lost, and there is no session to open it with.
      if (SIGN_IN_PATHS.includes(currentPath)) return;

      setInitialUrl(url);

      if (isProtectedRoute(routePath) && (!authCheckSettled || isLoading)) {
        pendingUrlRef.current = routePath;
        setPendingAuth(true);
        setProcessed(false);
        return;
      }

      pendingUrlRef.current = null;
      setPendingAuth(false);
      setProcessed(true);

      // `currentPath` has no query or fragment: the path alone is compared, and the link's query
      // against the shown screen's params, so a link that expo-router has already opened is not
      // opened again, while one to the same screen with another query (another customer) is.
      if (currentPath !== routePath.split(/[?#]/)[0] || !queryShown(routePath, shownParams.current)) {
        router.replace(routePath as Href);
      }
    });

    return () => subscription.remove();
  }, [authCheckSettled, currentPath, isLoading, router]);

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
    if (!pendingUrlRef.current || !authCheckSettled || isLoading) return;

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

      // Expo Router may already hold the native target while the root auth
      // gate is mounted. Avoid remounting the same detail screen and issuing
      // its protected requests twice. `currentPath` has no query or fragment: the link's path
      // alone is compared, or a link with a query is opened a second time.
      if (currentPath !== pendingRoute.split(/[?#]/)[0]) {
        router.replace(pendingRoute as Href);
      }
    } else if (!isLoading) {
      // Auth loaded but user not authenticated
      // Let the protected screen's settled auth guard redirect to login.
      if (__DEV__) {
        console.log('[ColdStartDeepLink] User not authenticated, clearing pending URL');
      }

      pendingUrlRef.current = null;
      setPendingAuth(false);
      setProcessed(true);
    }
  }, [
    userProfile,
    isLoading,
    processed,
    router,
    authCheckSettled,
    currentPath,
  ]);

  return {
    initialUrl,
    processed,
    pendingAuth,
  };
}

export default useColdStartDeepLink;
