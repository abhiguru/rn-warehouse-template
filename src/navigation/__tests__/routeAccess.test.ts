import fs from 'fs';
import path from 'path';
import { decideRoute, isPublicRoute, PUBLIC_ROUTES } from '../routeAccess';

const signedOut = { isSignedIn: false };
const as = (role: string) => ({ isSignedIn: true, role });

/** The first path part of every route file under app/ (layouts are not routes). */
function topLevelRoutes(): string[] {
  const appDir = path.resolve(__dirname, '../../../app');
  return fs
    .readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.name !== '__tests__' && entry.name !== '_layout.tsx')
    .map((entry) => entry.name.replace(/\.tsx$/, ''));
}

describe('signed out', () => {
  it('every route under app/ except the listed public ones goes to sign-in', () => {
    const routes = topLevelRoutes();
    // The list is read from the folder, so a new route is covered without touching this test.
    expect(routes.length).toBeGreaterThan(30);
    const allowed = routes.filter((route) => decideRoute(route, signedOut) === 'allow').sort();
    expect(allowed).toEqual([...PUBLIC_ROUTES].sort());
    const refused = routes.filter((route) => !PUBLIC_ROUTES.includes(route));
    expect(refused.map((route) => decideRoute(route, signedOut))).toEqual(refused.map(() => 'login'));
  });

  it.each([
    [['reports', 'stock-summary']],
    [['customers']],
    [['users']],
    [['user-edit', 'user-1']],
    [['item-pricing']],
    [['item-price-history']],
    [['sensors']],
    [['list-filters']],
    [['settings']],
    // Help names the facility and its server: signed-in only.
    [['help']],
    [['grn-details', 'grn-1']],
    [['(tabs)']],
    [['(tabs)', 'reports']],
    [[]],
    [['+not-found']],
  ])('%j goes to sign-in', (segments) => {
    expect(decideRoute(segments, signedOut)).toBe('login');
  });

  it.each(['login', 'otp', 'operator-server', 'pending-enrollment', 'terms-of-service', 'privacy-policy'])(
    '%s stays open',
    (route) => {
      expect(isPublicRoute(route)).toBe(true);
      expect(decideRoute(route, signedOut)).toBe('allow');
    }
  );

  it('Help needs a facility session with central login too', () => {
    expect(isPublicRoute('help')).toBe(false);
    expect(decideRoute(['help'], { isSignedIn: false, central: { signedIn: false, facilitySms: false } })).toBe('centralLogin');
    expect(decideRoute(['help'], { isSignedIn: false, central: { signedIn: true, facilitySms: false } })).toBe('facilities');
    expect(decideRoute(['help'], { isSignedIn: true, role: 'customer', central: { signedIn: true, facilitySms: false } })).toBe('allow');
  });

  it('a route that only begins like a public one is not public', () => {
    expect(isPublicRoute('login-help')).toBe(false);
    expect(isPublicRoute(['otp2'])).toBe(false);
    expect(isPublicRoute('constructor')).toBe(false);
  });
});

describe('signed in', () => {
  it('the sign-in screen sends a signed-in person home; the code step does not', () => {
    expect(decideRoute(['login'], as('staff'))).toBe('home');
    // The code step sets the profile and then navigates itself.
    expect(decideRoute(['otp'], as('staff'))).toBe('allow');
    // Opened from Settings while signed in.
    expect(decideRoute(['operator-server'], as('admin'))).toBe('allow');
    expect(decideRoute(['terms-of-service'], as('customer'))).toBe('allow');
  });

  it.each([
    // route, admin, supervisor, staff, customer
    ['(tabs)', 'allow', 'allow', 'allow', 'allow'],
    ['settings', 'allow', 'allow', 'allow', 'allow'],
    ['profile', 'allow', 'allow', 'allow', 'allow'],
    ['help', 'allow', 'allow', 'allow', 'allow'],
    ['reports/stock-summary', 'allow', 'allow', 'allow', 'allow'],
    ['reports/stock-aging', 'allow', 'allow', 'allow', 'allow'],
    ['reports/item-stock-summary', 'allow', 'allow', 'allow', 'allow'],
    ['reports/operations-dashboard', 'allow', 'allow', 'home', 'home'],
    ['item-pricing', 'allow', 'allow', 'allow', 'home'],
    ['item-pricing-form', 'allow', 'allow', 'allow', 'home'],
    ['item-price-history', 'allow', 'allow', 'home', 'home'],
    ['sensors', 'allow', 'allow', 'allow', 'home'],
    ['sensor-detail/[id]', 'allow', 'allow', 'allow', 'home'],
    ['users', 'allow', 'allow', 'home', 'home'],
    ['user-edit/[id]', 'allow', 'allow', 'home', 'home'],
    ['enrollment-review', 'allow', 'home', 'home', 'home'],
    ['customers', 'allow', 'allow', 'home', 'home'],
    ['customer-form', 'allow', 'allow', 'home', 'home'],
    ['customer-edit/[id]', 'allow', 'allow', 'home', 'home'],
    ['items', 'allow', 'allow', 'home', 'home'],
    ['item-form', 'allow', 'allow', 'home', 'home'],
    ['item-edit/[id]', 'allow', 'allow', 'home', 'home'],
    // The own-profile edit is for every role.
    ['user/edit/[userId]', 'allow', 'allow', 'allow', 'allow'],
  ])('%s: admin %s, supervisor %s, staff %s, customer %s', (route, admin, supervisor, staff, customer) => {
    expect(['admin', 'supervisor', 'staff', 'customer'].map((role) => decideRoute(route, as(role)))).toEqual([
      admin,
      supervisor,
      staff,
      customer,
    ]);
  });

  it('a session without a profile is not judged by role', () => {
    expect(decideRoute('users', { isSignedIn: true, role: undefined })).toBe('allow');
  });
});
