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
 * The navigation also waits for the root navigator: the router throws ("Attempted to
 * navigate before mounting the Root Layout component") when asked earlier. Until then
 * `GuardedScreen` keeps its spinner in place of the refused screen.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigationContainerRef, useRouter, useSegments } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { useTokens } from '@/hooks/useTheme';
import { t as translate } from '@/i18n';
import { isCentralLoginConfigured } from '@/config/envConfig';
import { useCentralState } from '@/hooks/useCentralState';
import { useFacilityCapabilities } from '@/hooks/useCapability';
import {
  CENTRAL_ROUTES,
  CENTRAL_SIGN_IN_ROUTES,
  decideRoute,
  isPublicRoute,
  routeParts,
  type RouteAuthState,
  type RouteDecision,
} from './routeAccess';

/** A navigation state as far as the guard reads it. */
type RootState = { index?: number; routes: ReadonlyArray<{ name: string; state?: RootState }> };

/**
 * expo-router's own wrapper route around the root layout (INTERNAL_SLOT_NAME in
 * expo-router/build/constants). Written out here so that the app does not import from the
 * package's build folder; RouteGuardLiveRoute.test.tsx fails when the two differ.
 */
export const ROUTER_ROOT = '__root';

/**
 * The app's root stack as the navigator holds it right now: its route names, bottom first
 * ("facilities", "(tabs)", "grn-details/[id]"), and which one is shown. Undefined when it
 * cannot be read.
 */
function liveRootStack(state: RootState | undefined): { names: string[]; index: number } | undefined {
  let current = state;
  while (current && current.routes.length > 0) {
    const index = current.index ?? current.routes.length - 1;
    const route = current.routes[index];
    if (!route) return undefined;
    if (route.name !== ROUTER_ROOT) return { names: current.routes.map((entry) => entry.name), index };
    current = route.state;
  }
  return undefined;
}

/** The route the root stack shows right now, read from the navigator itself. */
export function liveRootRoute(state: RootState | undefined): string | undefined {
  const stack = liveRootStack(state);
  return stack?.names[stack.index];
}

const isCentralScreen = (name: string): boolean => {
  const [first] = routeParts(name);
  return first !== undefined && (CENTRAL_ROUTES.includes(first) || CENTRAL_SIGN_IN_ROUTES.includes(first));
};

/**
 * True when entering a facility must first take the root stack down to one route: a
 * central login screen lies under the route that is shown, or the route that is shown is a
 * central one with anything under it (My facilities over the hidden home of a facility whose
 * session was ended while it stayed selected).
 */
export function centralScreensInTheWay(state: RootState | undefined): boolean {
  const stack = liveRootStack(state);
  if (!stack || stack.index === 0) return false;
  return isCentralScreen(stack.names[stack.index]) || stack.names.slice(0, stack.index).some(isCentralScreen);
}

/** True when My facilities lies in the root stack under the route that is shown. */
export function myFacilitiesBelow(state: RootState | undefined): boolean {
  const stack = liveRootStack(state);
  return stack !== undefined && stack.names.slice(0, stack.index).includes('facilities');
}

/** True when the route that is shown has anything under it in the root stack. */
export function anythingBelow(state: RootState | undefined): boolean {
  const stack = liveRootStack(state);
  return stack !== undefined && stack.index > 0;
}

/**
 * The root navigator, for code that is neither a component nor a hook (myFacilities.ts):
 * set while the guard below is mounted, which is whenever the app's screens are.
 */
let rootNavigation: { isReady?: () => boolean; getRootState?: () => unknown } | undefined;

/** The root navigator's state right now; undefined when no guard is mounted or it cannot be read. */
export function currentRootState(): RootState | undefined {
  if (!rootNavigation?.isReady?.()) return undefined;
  return rootNavigation.getRootState?.() as RootState | undefined;
}

export function useRouteAuthState(): RouteAuthState {
  const { userProfile, session, user } = useAppSelector((state) => state.auth);
  const central = useCentralState();
  const capabilities = useFacilityCapabilities();
  // The same meaning of "signed in" as the tabs layout: a profile, or a user with a session.
  const state: RouteAuthState = {
    isSignedIn: Boolean(userProfile) || (Boolean(user) && Boolean(session)),
    role: userProfile?.role,
    capabilities,
  };
  // Only a build with a central origin knows the central state; without one nothing changes.
  if (isCentralLoginConfigured())
    state.central = { signedIn: central.status === 'signedIn', facilitySms: central.facilitySmsOrigin !== null };
  return state;
}

/** True once the root navigator can take a navigation; re-renders when that happens. */
function useNavigationReady(): boolean {
  const navigationRef = useNavigationContainerRef();
  const [ready, setReady] = useState(() => navigationRef.isReady());
  useEffect(() => {
    if (ready) return undefined;
    const check = () => {
      if (navigationRef.isReady()) setReady(true);
    };
    // It may have become ready between the render and this effect.
    check();
    // SDK 58 (React Navigation 8) dropped the container's 'ready' event; the container emits
    // 'state' when it mounts, which is when the ref becomes ready.
    return navigationRef.addListener('state', check);
  }, [navigationRef, ready]);
  return ready;
}

/**
 * Sends the focused route to sign-in or home when it is not for this person. With central
 * login configured it also sends a person who is signed in nowhere to central sign-in, and
 * one who is signed in centrally but in no facility to My facilities.
 *
 * @param authRestored false until the stored session has been read; nothing happens before
 */
export function useRootRouteGuard(authRestored: boolean): RouteDecision {
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();
  const segments = useSegments();
  const { isSignedIn, role, central, capabilities } = useRouteAuthState();
  const centralSignedIn = central?.signedIn;
  const facilitySms = central?.facilitySms;
  const navigationReady = useNavigationReady();
  const path = segments.join('/');
  const decision: RouteDecision = authRestored
    ? decideRoute(segments, {
        isSignedIn,
        role,
        capabilities,
        ...(centralSignedIn === undefined ? {} : { central: { signedIn: centralSignedIn, facilitySms: Boolean(facilitySms) } }),
      })
    : 'allow';

  // What the effect below reads besides its dependencies: the navigator, and the sign-in
  // state of this render. Held in a ref so that the effect runs exactly when it always has
  // (a new decision, a new path, the navigator becoming ready), with or without central login.
  const live = useRef({ navigationRef, isSignedIn, role, capabilities, centralSignedIn, facilitySms });
  useEffect(() => {
    live.current = { navigationRef, isSignedIn, role, capabilities, centralSignedIn, facilitySms };
  });
  useEffect(() => {
    rootNavigation = navigationRef;
    return () => {
      if (rootNavigation === navigationRef) rootNavigation = undefined;
    };
  }, [navigationRef]);

  // The navigator can be behind the segments (React Navigation 8 commits a navigation after the
  // route store has already moved). When the effect below finds that the shown route is allowed
  // although the segments are not, it listens for the navigator's next 'state' event, which runs
  // the effect again: "once they catch up" in the comment inside it. The listener is registered
  // there and then (a state event between a render and a later effect would be missed) and
  // dropped when the event comes, when the effect runs again, or on unmount.
  const [stateTick, setStateTick] = useState(0);
  const stopWaiting = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWaiting.current?.(), []);

  // The way out already requested for the refused root route that is on screen. The requests
  // are carried out one after another, and the first of them (dismissAll) can move `path` within
  // that route (a form's own stack goes from step 2 to step 1) before the replace has landed;
  // asking again then would repeat the whole way out.
  const issued = useRef<{ decision: RouteDecision; root: string | undefined } | null>(null);
  useEffect(() => {
    stopWaiting.current?.();
    stopWaiting.current = null;
    if (decision === 'allow') issued.current = null;
    if (!navigationReady || decision === 'allow') return;
    if (issued.current?.decision === decision && issued.current.root === segments[0]) return;
    const now = live.current;
    // Without central login the navigator's state is not consulted: the lines below this
    // block are all there is, as before.
    let leaveCentralScreens = false;
    let backToMyFacilities = false;
    let leaveFacilityScreens = false;
    let leaveForSignIn = false;
    if (now.centralSignedIn !== undefined) {
      const rootState = now.navigationRef.getRootState?.() as RootState | undefined;
      // A server change rebuilds the navigation tree, and the guard's first replace then
      // brings in My facilities while useSegments() still names the route the stack started
      // on. Replacing again from that stale name would throw away what the new screen has
      // just asked for (the waiting screen, the linking step). The navigator's own route is
      // what is shown: when that one is allowed, the segments are only behind and this
      // effect runs again once they catch up.
      const shown = liveRootRoute(rootState);
      if (
        shown !== undefined &&
        decideRoute(shown, {
          isSignedIn: now.isSignedIn,
          role: now.role,
          capabilities: now.capabilities,
          central: { signedIn: now.centralSignedIn, facilitySms: Boolean(now.facilitySms) },
        }) === 'allow'
      ) {
        const stop = navigationRef.addListener('state', () => {
          stop();
          if (stopWaiting.current === stop) stopWaiting.current = null;
          setStateTick((tick) => tick + 1);
        });
        stopWaiting.current = stop;
        return;
      }
      // A facility session has arrived on a central screen (the code step after a correct
      // code; My facilities over a facility's hidden home): replacing only that screen would
      // leave My facilities under the facility's home, or a second home on the first.
      leaveCentralScreens = decision === 'home' && centralScreensInTheWay(rootState);
      // A refused screen on top of My facilities (the waiting screen that found no request
      // to wait for and left for the facility's sign-in): go back to the My facilities
      // under it. Replacing would put a second one on top, both mounted.
      backToMyFacilities = decision === 'facilities' && myFacilitiesBelow(rootState);
      // The facility ended the session on a screen pushed over its home, and it stays the
      // selected server, so nothing rebuilds the tree: My facilities takes the place of the
      // whole stack, not of that one screen, or the home would wait hidden under it.
      leaveFacilityScreens = decision === 'facilities' && !backToMyFacilities && anythingBelow(rootState);
      // Sign-in, central or the facility's own, is a start: nothing stays under it. The
      // facility session that ends on a screen pushed over the home, after the central session
      // has ended, would otherwise leave [(tabs), central-login], and Back from there shows a
      // spinner and then central sign-in again.
      leaveForSignIn = (decision === 'login' || decision === 'centralLogin') && anythingBelow(rootState);
    }
    // dismissAll has no target: POP_TO_TOP goes to the focused navigator first. That is the
    // root stack here, because GuardedScreen has already unmounted the refused screen, and
    // with it any stack layout of its own (a form past its first step). A refused route that
    // stayed mounted with its own stack would pop that stack instead, and would need an
    // action aimed at the root stack.
    issued.current = { decision, root: segments[0] };
    if (decision === 'login') {
      if (leaveForSignIn) router.dismissAll();
      router.replace('/login');
    } else if (decision === 'home') {
      if (leaveCentralScreens) router.dismissAll();
      router.replace('/');
    } else if (decision === 'centralLogin') {
      if (leaveForSignIn) router.dismissAll();
      router.replace('/central-login');
    } else if (decision === 'facilities') {
      if (backToMyFacilities) router.dismissTo('/facilities');
      else {
        if (leaveFacilityScreens) router.dismissAll();
        router.replace('/facilities');
      }
    }
    // `path` is listed so a second refused route is replaced as well.
  }, [decision, path, router, navigationReady, stateTick]);

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
  const decision = decideRoute(routeName, auth);
  if (decision === 'allow') return children;
  // With central login the facility's own sign-in screens are not for a person who belongs
  // on My facilities or central sign-in: they are not mounted while the guard replaces them.
  if (isPublicRoute(routeName) && decision !== 'facilities' && decision !== 'centralLogin') return children;
  return (
    <View style={[styles.pending, { backgroundColor: t.background.base }]} testID="route-guard-pending">
      <ActivityIndicator size="large" color={t.brand.tint} accessibilityLabel={translate('nav.loading')} />
    </View>
  );
}
