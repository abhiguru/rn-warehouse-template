/**
 * The route table with central login configured (docs/CENTRAL_LOGIN.md): the state
 * "signed in centrally, no facility session" for every class of route, and that a
 * build without central login decides exactly as before.
 */
import fs from 'fs';
import path from 'path';
import { CENTRAL_ROUTES, CENTRAL_SIGN_IN_ROUTES, decideRoute, PUBLIC_ROUTES, type RouteAuthState } from '../routeAccess';

/** The first path part of every route file under app/ (layouts are not routes). */
function topLevelRoutes(): string[] {
  const appDir = path.resolve(__dirname, '../../../app');
  return fs
    .readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.name !== '__tests__' && entry.name !== '_layout.tsx')
    .map((entry) => entry.name.replace(/\.tsx$/, ''));
}

const central = (signedIn: boolean, facilitySms = false) => ({ signedIn, facilitySms });
/** Signed in nowhere. */
const nowhere: RouteAuthState = { isSignedIn: false, central: central(false) };
/** Signed in centrally, no facility session: the new state. */
const centralOnly: RouteAuthState = { isSignedIn: false, central: central(true) };
/** Inside a facility, opened with the central sign-in. */
const inFacility = (role: string): RouteAuthState => ({ isSignedIn: true, role, central: central(true) });
/** Inside a facility with a session from before central login (or after the central session ended). */
const facilityOnly = (role: string): RouteAuthState => ({ isSignedIn: true, role, central: central(false) });

const FACILITY_SIGN_IN = ['login', 'otp', 'operator-server'];
const LEGAL = ['terms-of-service', 'privacy-policy'];
const protectedRoutes = () =>
  topLevelRoutes().filter(
    (route) => !PUBLIC_ROUTES.includes(route) && !CENTRAL_ROUTES.includes(route) && !CENTRAL_SIGN_IN_ROUTES.includes(route)
  );

it('every central route is a real screen', () => {
  const routes = topLevelRoutes();
  for (const route of [...CENTRAL_ROUTES, ...CENTRAL_SIGN_IN_ROUTES]) expect(routes).toContain(route);
});

describe('central login on, signed in nowhere', () => {
  it('every protected route under app/ goes to central sign-in, not to a facility sign-in', () => {
    const routes = protectedRoutes();
    expect(routes.length).toBeGreaterThan(30);
    expect(routes.map((route) => decideRoute(route, nowhere))).toEqual(routes.map(() => 'centralLogin'));
    expect(decideRoute([], nowhere)).toBe('centralLogin');
    expect(decideRoute(['(tabs)', 'reports'], nowhere)).toBe('centralLogin');
  });

  it('the central sign-in and its code step are open', () => {
    expect(CENTRAL_SIGN_IN_ROUTES.map((route) => decideRoute(route, nowhere))).toEqual(['allow', 'allow']);
  });

  it('My facilities, the catalogue, the address entry, the linking step and the account need the central sign-in', () => {
    expect(CENTRAL_ROUTES.map((route) => decideRoute(route, nowhere))).toEqual(CENTRAL_ROUTES.map(() => 'centralLogin'));
  });

  it("a facility's own sign-in screens and the server address screen go to central sign-in", () => {
    expect(FACILITY_SIGN_IN.map((route) => decideRoute(route, nowhere))).toEqual(['centralLogin', 'centralLogin', 'centralLogin']);
  });

  it('the legal pages and the waiting screen stay open', () => {
    expect([...LEGAL, 'pending-enrollment'].map((route) => decideRoute(route, nowhere))).toEqual(['allow', 'allow', 'allow']);
  });
});

describe('central login on, signed in centrally, no facility session', () => {
  it('may open My facilities, the catalogue, the address entry, the linking step and the account', () => {
    expect(CENTRAL_ROUTES.map((route) => decideRoute(route, centralOnly))).toEqual(CENTRAL_ROUTES.map(() => 'allow'));
  });

  it('every protected route under app/ goes to My facilities instead of sign-in', () => {
    const routes = protectedRoutes();
    expect(routes.map((route) => decideRoute(route, centralOnly))).toEqual(routes.map(() => 'facilities'));
    expect(decideRoute([], centralOnly)).toBe('facilities');
    expect(decideRoute(['grn-details', 'grn-1'], centralOnly)).toBe('facilities');
    expect(decideRoute(['reports', 'operations-dashboard'], centralOnly)).toBe('facilities');
  });

  it('central sign-in sends the person to My facilities; the code step navigates itself', () => {
    expect(decideRoute('central-login', centralOnly)).toBe('facilities');
    expect(decideRoute('central-otp', centralOnly)).toBe('allow');
  });

  it("a facility's own sign-in screens and the server address screen go to My facilities", () => {
    expect(FACILITY_SIGN_IN.map((route) => decideRoute(route, centralOnly))).toEqual(['facilities', 'facilities', 'facilities']);
  });

  it('the legal pages and the waiting screen stay open', () => {
    expect([...LEGAL, 'pending-enrollment'].map((route) => decideRoute(route, centralOnly))).toEqual(['allow', 'allow', 'allow']);
  });
});

describe("central login on, signing in to a facility with that facility's own SMS code", () => {
  const sms: RouteAuthState = { isSignedIn: false, central: central(true, true) };

  it('the facility sign-in and its code step are in use', () => {
    expect(decideRoute('login', sms)).toBe('allow');
    expect(decideRoute('otp', sms)).toBe('allow');
  });

  it('every other place leads to that sign-in: protected routes and the central screens', () => {
    expect(decideRoute(['(tabs)'], sms)).toBe('login');
    expect(decideRoute('settings', sms)).toBe('login');
    expect(CENTRAL_ROUTES.map((route) => decideRoute(route, sms))).toEqual(CENTRAL_ROUTES.map(() => 'login'));
  });

  it('the server address screen is still not offered', () => {
    expect(decideRoute('operator-server', sms)).toBe('facilities');
  });
});

describe('central login on, inside a facility', () => {
  it('the facility screens follow the role table exactly as without central login', () => {
    for (const role of ['admin', 'supervisor', 'staff', 'customer']) {
      for (const route of protectedRoutes()) {
        const expected = decideRoute(route, { isSignedIn: true, role });
        expect([route, role, decideRoute(route, inFacility(role))]).toEqual([route, role, expected]);
        expect([route, role, decideRoute(route, facilityOnly(role))]).toEqual([route, role, expected]);
      }
    }
    expect(decideRoute('users', inFacility('staff'))).toBe('home');
    expect(decideRoute('users', inFacility('admin'))).toBe('allow');
  });

  it('the server address screen is not a way to change facility: Settings has "Switch facility"', () => {
    expect(decideRoute('operator-server', inFacility('admin'))).toBe('home');
    expect(decideRoute('operator-server', facilityOnly('admin'))).toBe('home');
    // Without central login it is opened from Settings while signed in.
    expect(decideRoute('operator-server', { isSignedIn: true, role: 'admin' })).toBe('allow');
  });

  it('a facility session that appears on a central screen enters the facility', () => {
    expect(CENTRAL_ROUTES.map((route) => decideRoute(route, inFacility('staff')))).toEqual(CENTRAL_ROUTES.map(() => 'home'));
    expect(decideRoute('central-login', inFacility('staff'))).toBe('home');
    expect(decideRoute('login', inFacility('staff'))).toBe('home');
  });

  it('a session from before central login keeps working, and central screens are not for it', () => {
    expect(decideRoute(['(tabs)'], facilityOnly('admin'))).toBe('allow');
    expect(decideRoute('settings', facilityOnly('admin'))).toBe('allow');
    expect(CENTRAL_ROUTES.map((route) => decideRoute(route, facilityOnly('admin')))).toEqual(CENTRAL_ROUTES.map(() => 'home'));
    expect(decideRoute('central-login', facilityOnly('admin'))).toBe('allow');
  });
});

describe('central login off', () => {
  const signedOut: RouteAuthState = { isSignedIn: false };

  it('the central screens are not offered to anyone', () => {
    const all = [...CENTRAL_ROUTES, ...CENTRAL_SIGN_IN_ROUTES];
    expect(all.map((route) => decideRoute(route, signedOut))).toEqual(all.map(() => 'login'));
    expect(all.map((route) => decideRoute(route, { isSignedIn: true, role: 'admin' }))).toEqual(all.map(() => 'home'));
  });

  it('no decision ever names a central destination', () => {
    const states: RouteAuthState[] = [signedOut, ...['admin', 'supervisor', 'staff', 'customer'].map((role) => ({ isSignedIn: true, role }))];
    for (const state of states) {
      for (const route of [...topLevelRoutes(), '', '(tabs)/reports', 'reports/operations-dashboard']) {
        expect(['allow', 'login', 'home']).toContain(decideRoute(route, state));
      }
    }
  });
});
