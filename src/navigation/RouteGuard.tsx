/**
 * The root authentication guard (app/_layout.tsx).
 *
 * Two parts share one decision (`decideRoute`):
 * - `useRootRouteGuard` navigates: it looks at the focused route and replaces it with the
 *   sign-in screen, or with the home tabs, when that route is not for this person.
 * - `GuardedScreen` wraps every screen of the root stack and shows a spinner in place of
 *   a screen that is about to be replaced, so the screen never mounts and sends nothing.
 *
 * Both run only after the stored session has been restored (the root layout renders the
 * stack after that), so a signed-in person is never sent to sign-in on a cold start.
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { decideRoute, isPublicRoute, type RouteAuthState, type RouteDecision } from './routeAccess';

export function useRouteAuthState(): RouteAuthState {
  const { userProfile, session, user } = useAppSelector((state) => state.auth);
  // The same meaning of "signed in" as the tabs layout: a profile, or a user with a session.
  return { isSignedIn: Boolean(userProfile) || (Boolean(user) && Boolean(session)), role: userProfile?.role };
}

/**
 * Sends the focused route to sign-in or home when it is not for this person.
 *
 * @param authRestored false until the stored session has been read; nothing happens before
 */
export function useRootRouteGuard(authRestored: boolean): RouteDecision {
  const router = useRouter();
  const segments = useSegments();
  const { isSignedIn, role } = useRouteAuthState();
  const path = segments.join('/');
  const decision: RouteDecision = authRestored ? decideRoute(segments, { isSignedIn, role }) : 'allow';

  useEffect(() => {
    if (decision === 'login') router.replace('/login');
    else if (decision === 'home') router.replace('/');
    // `path` is listed so a second refused route is replaced as well.
  }, [decision, path, router]);

  return decision;
}

const styles = StyleSheet.create({
  pending: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

/**
 * One screen of the root stack. `routeName` is the stack's name for it ("(tabs)",
 * "grn-details/[id]", "reports/stock-aging").
 */
export function GuardedScreen({ routeName, children }: { routeName: string; children: React.ReactElement }) {
  const auth = useRouteAuthState();
  const t = useTokens();
  // A public screen is never hidden: the sign-in screen stays mounted under the code step
  // while the profile arrives, and only the focused route is ever navigated away from.
  if (isPublicRoute(routeName) || decideRoute(routeName, auth) === 'allow') return children;
  return (
    <View style={[styles.pending, { backgroundColor: t.background.base }]} testID="route-guard-pending">
      <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel={translate('nav.loading')} />
    </View>
  );
}
