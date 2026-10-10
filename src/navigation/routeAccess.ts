/**
 * Which routes need a signed-in profile, and which need a role.
 *
 * One table for the whole app (app/_layout.tsx applies it to every screen of the root
 * stack), so a route added under app/ is protected unless it is listed as public here.
 */

import { canOpenScreen, type RoleGatedScreen } from '@/config/roles';

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
  'customer-form': 'masterData',
  'customer-edit': 'masterData',
  items: 'masterData',
  'item-form': 'masterData',
  'item-edit': 'masterData',
  users: 'userManagement',
  'user-edit': 'userManagement',
  'enrollment-review': 'enrollmentReview',
  'item-pricing': 'itemPricing',
  'item-pricing-form': 'itemPricing',
  sensors: 'sensors',
  'sensor-detail': 'sensors',
  'reports/operations-dashboard': 'operationsDashboard',
};

export interface RouteAuthState {
  /** A profile in the store, or a Supabase user with a session */
  isSignedIn: boolean;
  /** The profile's role; undefined while there is no profile */
  role?: string | null;
}

/**
 *   allow  render the screen
 *   login  signed out on a protected route: go to sign-in
 *   home   signed in on the sign-in screen, or on a screen the role is not offered
 */
export type RouteDecision = 'allow' | 'login' | 'home';

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

/**
 * What to do with one route for the current sign-in state. Call it only after the stored
 * session has been restored: before that "signed out" is not yet known.
 */
export function decideRoute(route: string | readonly string[], auth: RouteAuthState): RouteDecision {
  const parts = routeParts(route);
  if (isPublicRoute(parts)) {
    // Only the sign-in screen itself sends a signed-in person away. The code step sets the
    // profile and then navigates on its own, and the facility choice and legal pages are
    // opened from Settings while signed in.
    return auth.isSignedIn && parts[0] === 'login' ? 'home' : 'allow';
  }
  if (!auth.isSignedIn) return 'login';
  const gate = roleGateFor(parts);
  // A Supabase session without a profile has no role yet; the screens' own checks apply.
  if (gate && auth.role != null && !canOpenScreen(auth.role, gate)) return 'home';
  return 'allow';
}
