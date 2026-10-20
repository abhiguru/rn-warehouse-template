/**
 * Which routes need a signed-in profile, and which need a role.
 *
 * One table for the whole app (app/_layout.tsx applies it to every screen of the root
 * stack), so a route added under app/ is protected unless it is listed as public here.
 */

import { canOpenScreen, type RoleGatedScreen } from '@/config/roles';
import type { FacilityCapabilities } from '@/config/facilityCapabilities';

/**
 * Routes a signed-out person may open: sign-in, its code step, the facility choice, the
 * wait for a facility's approval (there is no profile yet), and the two legal pages that
 * the sign-in screen links to. Everything else under app/ needs a session.
 */
export const PUBLIC_ROUTES: readonly string[] = [
  'login',
  'otp',
  'operator-server',
  'pending-enrollment',
  'terms-of-service',
  'privacy-policy',
];

/**
 * Routes the app offers to some roles only. Keys are a route's first segment, or its first
 * two for a single report. The server refuses the same roles (see `canOpenScreen`).
 */
const ROLE_GATED_ROUTES: Readonly<Record<string, RoleGatedScreen>> = {
  customers: 'masterData',
  customer: 'masterData',
  'customer-form': 'masterData',
  'customer-edit': 'masterData',
  items: 'masterData',
  item: 'masterData',
  'item-form': 'masterData',
  'item-edit': 'masterData',
  users: 'userManagement',
  'user-edit': 'userManagement',
  'enrollment-review': 'enrollmentReview',
  'item-rates': 'itemPricing',
  'item-price-history': 'itemPriceHistory',
  'standard-rate': 'standardRate',
  sensors: 'sensors',
  'sensor-detail': 'sensors',
  'sensor-edit': 'sensorWrite',
  'reports/operations-dashboard': 'operationsDashboard',
};

/**
 * Central login (docs/CENTRAL_LOGIN.md), when the build is configured for it.
 * The two sign-in routes are open to a person who is not signed in centrally;
 * the others need the central session and no facility session.
 */
export const CENTRAL_SIGN_IN_ROUTES: readonly string[] = ['central-login', 'central-otp'];
export const CENTRAL_ROUTES: readonly string[] = [
  'facilities',
  'facility-catalogue',
  'facility-address',
  'facility-link',
  'central-account',
];

export interface CentralRouteState {
  /** Signed in at the association's identity service */
  signedIn: boolean;
  /**
   * A facility that does not accept association sign-in is being signed into with its own
   * SMS code: the facility sign-in screens are in use.
   */
  facilitySms: boolean;
}

export interface RouteAuthState {
  /** A profile in the store, or a Supabase user with a session */
  isSignedIn: boolean;
  /** The profile's role; undefined while there is no profile */
  role?: string | null;
  /** Present only when central login is configured in this build; absent, nothing below changes. */
  central?: CentralRouteState;
  /**
   * The facility's capabilities (src/config/facilityCapabilities.ts): a route of a
   * capability it does not have is sent home like a route the role is not offered.
   * Absent, only the role decides. The route guard always passes them.
   */
  capabilities?: FacilityCapabilities;
}

/**
 *   allow         render the screen
 *   login         signed out on a protected route: go to sign-in
 *   home          signed in on the sign-in screen, or on a screen the role or the facility
 *                 (its capabilities) does not offer
 *   centralLogin  central login on, signed in nowhere: go to central sign-in
 *   facilities    central login on, signed in centrally with no facility session: go to My facilities
 */
export type RouteDecision = 'allow' | 'login' | 'home' | 'centralLogin' | 'facilities';

/** The parts of a route, from `useSegments()` or from a stack route name ("reports/stock-aging"). */
export function routeParts(route: string | readonly string[]): string[] {
  const parts = typeof route === 'string' ? route.split('/') : [...route];
  return parts.filter((part) => part !== '');
}

export function isPublicRoute(route: string | readonly string[]): boolean {
  const [first] = routeParts(route);
  return first !== undefined && PUBLIC_ROUTES.includes(first);
}

function roleGateFor(parts: readonly string[]): RoleGatedScreen | undefined {
  const [first, second] = parts;
  if (first === undefined) return undefined;
  const two = second === undefined ? undefined : `${first}/${second}`;
  if (two !== undefined && Object.hasOwn(ROLE_GATED_ROUTES, two)) return ROLE_GATED_ROUTES[two];
  return Object.hasOwn(ROLE_GATED_ROUTES, first) ? ROLE_GATED_ROUTES[first] : undefined;
}

/** Where a person without a facility session belongs while central login is on. */
function centralStart(central: CentralRouteState): RouteDecision {
  return central.signedIn ? 'facilities' : 'centralLogin';
}

/**
 * The routes that exist for central login. Without central login in this build they are
 * not offered to anyone: they answer like any other protected route that is not for this
 * person.
 */
function decideCentralRoute(first: string, auth: RouteAuthState): RouteDecision {
  const central = auth.central;
  if (!central) return auth.isSignedIn ? 'home' : 'login';
  if (CENTRAL_SIGN_IN_ROUTES.includes(first)) {
    // Like the facility sign-in: only the sign-in screen itself sends a signed-in person
    // away. The code step stores the session and then navigates on its own.
    if (first !== 'central-login' || !central.signedIn) return 'allow';
    return auth.isSignedIn ? 'home' : 'facilities';
  }
  if (!central.signedIn) return auth.isSignedIn ? 'home' : 'centralLogin';
  // The person chose a facility's own SMS sign-in from My facilities.
  if (central.facilitySms && !auth.isSignedIn) return 'login';
  // Inside a facility these screens are reached through "Switch facility", which ends the
  // facility session first. A facility session that appears while one of them is shown is
  // a facility that was just opened: enter it.
  return auth.isSignedIn ? 'home' : 'allow';
}

/**
 * What to do with one route for the current sign-in state. Call it only after the stored
 * session has been restored: before that "signed out" is not yet known.
 */
export function decideRoute(route: string | readonly string[], auth: RouteAuthState): RouteDecision {
  const parts = routeParts(route);
  const [first] = parts;
  const central = auth.central;
  if (first !== undefined && (CENTRAL_SIGN_IN_ROUTES.includes(first) || CENTRAL_ROUTES.includes(first)))
    return decideCentralRoute(first, auth);
  if (isPublicRoute(parts)) {
    // Central login on, no facility session: the facility's own sign-in screens and the
    // server address screen are in use only for a facility that does not accept
    // association sign-in. Everyone else belongs on My facilities or central sign-in.
    // The server address screen is not offered at all: a facility is changed through My
    // facilities ("Enter address" under Add facility is its own route).
    if (central && first === 'operator-server') return auth.isSignedIn ? 'home' : centralStart(central);
    if (central && !auth.isSignedIn && (first === 'login' || first === 'otp') && !central.facilitySms)
      return centralStart(central);
    // Only the sign-in screen itself sends a signed-in person away. The code step sets the
    // profile and then navigates on its own, and the facility choice and legal pages are
    // opened from Settings while signed in.
    return auth.isSignedIn && first === 'login' ? 'home' : 'allow';
  }
  if (!auth.isSignedIn) {
    if (!central) return 'login';
    return central.facilitySms ? 'login' : centralStart(central);
  }
  const gate = roleGateFor(parts);
  // A Supabase session without a profile has no role yet; the screens' own checks apply.
  if (gate && auth.role != null && !canOpenScreen(auth.role, gate, auth.capabilities)) return 'home';
  return 'allow';
}
