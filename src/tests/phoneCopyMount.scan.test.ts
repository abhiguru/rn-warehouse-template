/**
 * WH-298 (spec A5 "on every tab"; Design 1.1; contract 8.1, T47, T48): the status bar is mounted once, at the root, where
 * today's offline banner is, so it is above every tab and every screen opened from them; it is chosen by the feature
 * switch with today's banner kept for a server without the feature; and the lifecycle component is mounted once.
 *
 * This is a source scan, not a render of the whole app: rendering the root layout needs the large set of stand-ins of
 * src/tests/navigation/RootIntoTabs.test.tsx, and a device check (Design's D1 to D10, Test's T53) covers what the scan
 * cannot: that the bar is visible above the header on each tab.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(rel);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : [];   // not the tests, this file included
  });

describe('the status bar is mounted once, at the root', () => {
  const layout = read('app/_layout.tsx');

  it('app/_layout.tsx renders OfflineStatusBar where OfflineBanner was, and keeps OfflineBanner for a server without the feature', () => {
    expect(layout).toMatch(/<OfflineStatusBar\b/);
    expect(layout).toMatch(/<OfflineBanner\b/);
    expect(layout).toMatch(/useCopyFeatureOn\s*\(/);
  });

  it('the bar is above the navigation stack, as the banner is, so it is above every tab and every screen under them', () => {
    const bar = layout.search(/<OfflineStatusBar\b/);
    const stack = layout.search(/<NavigationStack\b/);
    expect(bar).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(stack);
  });

  it('app/_layout.tsx mounts the lifecycle component that starts and stops the sync', () => {
    expect(layout.match(/<PhoneCopyLifecycle\b/g)).toHaveLength(1);
  });

  it('no other screen or layout mounts the bar or the lifecycle (one bar, not one per tab)', () => {
    const others = [...walk('app'), ...walk('src')].filter(file => file !== path.join('app', '_layout.tsx'));
    const mounts = others.filter(file => /<(OfflineStatusBar|PhoneCopyLifecycle)\b/.test(read(file)));
    expect(mounts).toEqual([]);
  });

  it('the screens below the bar get a zero top inset whenever the bar shows (BelowOfflineBanner)', () => {
    const below = layout.slice(layout.indexOf('function BelowOfflineBanner'));
    expect(below).toMatch(/useCopyFeatureOn|usePhoneCopyStatus/);
  });
});
