/**
 * The route tables in routeAccess.ts name routes by their first segment (two for a single report).
 * A table row that names no file under app/ protects nothing (a renamed screen would silently lose
 * its gate), and a screen that checks the role itself without a row would be open to the wrong role
 * for the moment before its own check runs.
 */
import fs from 'fs';
import path from 'path';
import { ROLE_GATED_ROUTES, PUBLIC_ROUTES, CENTRAL_ROUTES, CENTRAL_SIGN_IN_ROUTES } from '../routeAccess';

const APP_DIR = path.resolve(__dirname, '../../../app');
const SOURCE = /\.(tsx|ts)$/;

/** Every file and folder under app/ as a route path with extensions removed, and (group) folders dropped. */
function routePaths(dir = APP_DIR, prefix = ''): { files: string[]; folders: string[] } {
  const files: string[] = [];
  const folders: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const isGroup = /^\(.*\)$/.test(entry.name);
    if (entry.isDirectory()) {
      const route = isGroup ? prefix : `${prefix}${entry.name}`;
      if (!isGroup) folders.push(route);
      const inner = routePaths(path.join(dir, entry.name), isGroup ? prefix : `${route}/`);
      files.push(...inner.files);
      folders.push(...inner.folders);
    } else if (SOURCE.test(entry.name)) {
      files.push(`${prefix}${entry.name.replace(SOURCE, '')}`);
    }
  }
  return { files, folders };
}

const ROUTES = routePaths();
const resolves = (key: string) => ROUTES.files.includes(key) || ROUTES.folders.includes(key);

function sourceFilesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '__tests__') return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFilesUnder(full) : SOURCE.test(entry.name) ? [full] : [];
  });
}

describe('route tables', () => {
  it('finds the app routes it is checked against', () => {
    expect(ROUTES.files).toEqual(expect.arrayContaining(['login', 'customers', 'reports/operations-dashboard']));
    expect(ROUTES.folders).toEqual(expect.arrayContaining(['customer', 'reports']));
  });

  it.each(Object.keys(ROLE_GATED_ROUTES))('role-gated route %s names a file or folder under app/', key => {
    expect(resolves(key)).toBe(true);
  });

  it.each([...PUBLIC_ROUTES, ...CENTRAL_SIGN_IN_ROUTES, ...CENTRAL_ROUTES])(
    'public and central route %s names a file or folder under app/',
    key => {
      expect(resolves(key)).toBe(true);
    }
  );

  it('has a row for every route file that checks the role itself with canOpenScreen', () => {
    const checking = sourceFilesUnder(APP_DIR).filter(file => /\bcanOpenScreen\(/.test(fs.readFileSync(file, 'utf8')));
    // The scan must see the screens that do check, or the assertion below would pass on nothing.
    expect(checking.length).toBeGreaterThanOrEqual(6);
    const missing = checking
      .map(file => path.relative(APP_DIR, file).replace(SOURCE, '').split(path.sep))
      .filter(parts => {
        const [first, second] = parts;
        return !(`${first}/${second}` in ROLE_GATED_ROUTES) && !(first in ROLE_GATED_ROUTES);
      })
      .map(parts => parts.join('/'));
    expect(missing).toEqual([]);
  });
});
