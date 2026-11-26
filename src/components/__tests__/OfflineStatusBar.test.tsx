/**
 * WH-298 (spec A5, step 5; Design Part 1, 1.2, 1.4, 1.6; contract 8.3 to 8.5; T44, T45, T46): what the status bar says
 * and how a screen reader reads it. The real `OfflineStatusBar` and the real `deriveStatusBar` run; the phone copy's
 * published state and the phone's connectivity are the test's input.
 *
 * ===== AGREE WITH DEVELOPMENT (names the contract gives) =====
 *  - `@/components/OfflineStatusBar`: `OfflineStatusBar` takes no props; it reads `usePhoneCopyStatus()`
 *    (`@/hooks/usePhoneCopyStatus`, a `SyncSnapshot`) and `useIsOffline()` (`@/hooks/useNetworkStatus`).
 *  - testIDs: `offline-status-bar`, `offline-status-bar-line1`, `offline-status-bar-line2`, `offline-status-bar-icon`
 *    (its `name` prop is the icon), `offline-status-bar-retry`.
 *  - "Try again" calls `syncNow('retry')` of `@/features/phone-copy/syncEngine`; it is disabled while `snapshot.running` is set.
 *  - The bar's accessibilityLabel is line 1, then ". " and line 2 when there is a line 2.
 * =============================================================
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { OfflineStatusBar } from '@/components/OfflineStatusBar';
import { syncNow } from '@/features/phone-copy/syncEngine';
import type { SyncSnapshot } from '@/features/phone-copy/syncStore';
import { getTokens, space } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import { formatLoadedAt } from '@/utils/formatters';

let mockSnapshot: SyncSnapshot;
let mockOffline = false;
jest.mock('@/hooks/usePhoneCopyStatus', () => ({
  usePhoneCopyStatus: () => mockSnapshot,
  useCopyFeatureOn: () => true,
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/features/phone-copy/syncEngine', () => ({ syncNow: jest.fn(async () => 'done') }));
jest.mock('@/hooks/useTheme', () => {
  const { getTokens: tokensOf } = jest.requireActual('@/theme/tokens');
  const current = () => tokensOf('orange', 'light');
  return { useTokens: () => current(), useThemedStyles: (factory: (t: unknown) => unknown) => factory(current()) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));

// 05:12 UTC is 10:42 am in India, on the same day as the phone's clock below.
const AS_OF = '2026-11-25T05:12:00.000Z';
const tokens = getTokens('orange', 'light');
const snapshot = (patch: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
  feature: 'on', phase: 'ready', running: null, current: true, asOf: AS_OF, lastRunFailed: false, storageLow: false, copyBytes: 1000, ...patch,
});

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-11-25T07:00:00Z'), advanceTimers: true });
  jest.mocked(syncNow).mockClear();
  mockOffline = false;
  mockSnapshot = snapshot();
});
afterEach(async () => { jest.useRealTimers(); await setLanguage('en'); });

async function show(patch: Partial<SyncSnapshot> = {}, offline = false) {
  mockSnapshot = snapshot(patch);
  mockOffline = offline;
  await render(<OfflineStatusBar />);
  return screen.getByTestId('offline-status-bar');
}

describe('OfflineStatusBar: wording (Design 1.4, 1.5)', () => {
  it('"Up to date" when current', async () => {
    await show();
    expect(screen.getByTestId('offline-status-bar-line1')).toHaveTextContent('Up to date');
    expect(screen.queryByTestId('offline-status-bar-line2')).not.toBeOnTheScreen();
  });

  it('"Offline. Last updated 10:42 am" without a connection', async () => {
    expect(await show({ current: false }, true)).toHaveTextContent('Offline. Last updated 10:42 am');
  });

  it('"Updating… Last updated 10:42 am" for a copy past the minute while a sync runs', async () => {
    expect(await show({ current: false, running: 'changes' })).toHaveTextContent('Updating… Last updated 10:42 am');
  });

  it('"Couldn\'t update. Last updated 10:42 am" after a failed run', async () => {
    expect(await show({ current: false, lastRunFailed: true })).toHaveTextContent("Couldn't update. Last updated 10:42 am");
  });

  it('shows the date with the time for an earlier day, so it is not read as today', async () => {
    expect(await show({ current: false, asOf: '2026-11-14T05:12:00.000Z' }, true)).toHaveTextContent('Offline. Last updated 14/11/26, 10:42 am');
  });

  it('"Loading the warehouse onto this phone…" in stage one', async () => {
    const bar = await show({ phase: 'stage1', running: 'first-load', current: false, asOf: null });
    expect(bar).toHaveTextContent('Loading the warehouse onto this phone…');
  });

  it('"Older records are still loading." after the row\'s own line in stage two', async () => {
    const bar = await show({ phase: 'stage2', running: 'first-load', current: false });
    expect(bar).toHaveTextContent('Updating… Last updated 10:42 am. Older records are still loading.');
  });

  it('"Older records will load when you reconnect." in stage two while offline (not "still loading")', async () => {
    const bar = await show({ phase: 'stage2', current: false }, true);
    expect(bar).toHaveTextContent('Offline. Last updated 10:42 am. Older records will load when you reconnect.');
    expect(bar).not.toHaveTextContent('still loading');
  });

  // WH-299, S6 (Design 1.5 row 6): the two sentences are joined with ". ", in what is seen and what is read aloud.
  it.each<[string, Partial<SyncSnapshot>, boolean, string]>([
    ['up to date', { phase: 'stage2' }, false, 'Up to date. Older records are still loading.'],
    ['offline', { phase: 'stage2', current: false }, true, 'Offline. Last updated 10:42 am. Older records will load when you reconnect.'],
  ])('stage two, %s: joins the sentences with ". " and names the bar the same', async (_name, patch, offline, expected) => {
    const bar = await show(patch, offline);
    expect(screen.getByTestId('offline-status-bar-line1')).toHaveTextContent(expected);
    expect(bar).toHaveAccessibleName(expected);
  });

  it.each<[string, Partial<SyncSnapshot>, boolean, (time: string) => string]>([
    ['up to date', { phase: 'stage2' }, false, () => 'અપડેટ છે. જૂની માહિતી હજુ લોડ થઈ રહી છે.'],
    ['offline', { phase: 'stage2', current: false }, true,
      time => `ઑફલાઇન. છેલ્લે અપડેટ થયું: ${time}. જૂની માહિતી ફરી જોડાશો ત્યારે લોડ થશે.`],
  ])('stage two in Gujarati, %s: the same join', async (_name, patch, offline, expected) => {
    await setLanguage('gu');
    const bar = await show(patch, offline);
    const text = expected(formatLoadedAt(Date.parse(AS_OF)));
    expect(screen.getByTestId('offline-status-bar-line1')).toHaveTextContent(text);
    expect(bar).toHaveAccessibleName(text);
  });

  it('"This phone isn\'t ready yet. Connect to load the warehouse." with nothing loaded and no connection', async () => {
    const bar = await show({ phase: 'empty', current: false, asOf: null }, true);
    expect(bar).toHaveTextContent("This phone isn't ready yet. Connect to load the warehouse.");
  });

  it('"Phone storage is almost full. Free some space so records can be kept." replaces line 1', async () => {
    const bar = await show({ storageLow: true });
    expect(bar).toHaveTextContent('Phone storage is almost full. Free some space so records can be kept.');
    expect(bar).not.toHaveTextContent('Up to date');
  });

  it('in Gujarati the same state reads in Gujarati', async () => {
    await setLanguage('gu');
    expect(await show()).toHaveTextContent('અપડેટ છે');
  });
});

describe('OfflineStatusBar: style and icon (Design 1.2, 1.5)', () => {
  it('is neutral offline, with the cloud-off icon', async () => {
    const bar = await show({ current: false }, true);
    expect(bar).toHaveStyle({ backgroundColor: tokens.status.neutral.background });
    expect(screen.getByTestId('offline-status-bar-icon')).toHaveProp('name', 'cloud-off-outline');
  });

  it('is neutral and shows the check icon when current', async () => {
    const bar = await show();
    expect(bar).toHaveStyle({ backgroundColor: tokens.status.neutral.background });
    expect(screen.getByTestId('offline-status-bar-icon')).toHaveProp('name', 'check-circle-outline');
  });

  it('is critical, with the disk icon, when storage is low', async () => {
    const bar = await show({ storageLow: true });
    expect(bar).toHaveStyle({ backgroundColor: tokens.status.critical.background });
    expect(screen.getByTestId('offline-status-bar-icon')).toHaveProp('name', 'harddisk');
  });

  it('adds the top safe-area inset so it sits under the phone\'s own status bar', async () => {
    expect(await show()).toHaveStyle({ paddingTop: 24 + space.sm });
  });
});

describe('OfflineStatusBar: screen reader (Design 1.6, T46)', () => {
  it('is one stop whose name is the whole text', async () => {
    const bar = await show({ current: false }, true);
    expect(bar).toHaveProp('accessible', true);
    expect(bar).toHaveAccessibleName('Offline. Last updated 10:42 am');
  });

  it('is a polite live region and not an alert', async () => {
    const bar = await show();
    expect(bar).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(bar).not.toHaveProp('accessibilityRole', 'alert');
  });

  it('its name does not change across a routine sync (nothing is announced)', async () => {
    const quiet = await show();
    const before = quiet.props.accessibilityLabel;
    await screen.unmount();
    const syncing = await show({ running: 'changes' });
    expect(syncing.props.accessibilityLabel).toBe(before);
  });

  it('the icon is not a screen-reader stop', async () => {
    await show();
    expect(screen.getByTestId('offline-status-bar-icon')).toHaveProp('importantForAccessibility', 'no');
  });
});

describe('OfflineStatusBar: Try again (T45)', () => {
  it('is offered after a failed update, named "Try updating again", visible as "Try again"', async () => {
    await show({ current: false, lastRunFailed: true });
    const button = screen.getByRole('button', { name: 'Try updating again' });
    expect(button).toHaveTextContent('Try again');
    expect(screen.getByTestId('offline-status-bar-retry')).toBeOnTheScreen();
  });

  it('is offered when the phone is not ready', async () => {
    await show({ phase: 'empty', current: false, asOf: null }, true);
    expect(screen.getByRole('button', { name: 'Try updating again' })).toBeOnTheScreen();
  });

  it('is not offered offline with a copy, when current, while loading, or when storage is low', async () => {
    const cases: Array<[Partial<SyncSnapshot>, boolean]> = [
      [{ current: false }, true], [{}, false], [{ phase: 'stage1', running: 'first-load', current: false, asOf: null }, false], [{ storageLow: true }, false],
    ];
    for (const [patch, offline] of cases) {
      await show(patch, offline);
      expect(screen.queryByTestId('offline-status-bar-retry')).not.toBeOnTheScreen();
      await screen.unmount();
    }
  });

  it('a tap asks the engine for a retry, once', async () => {
    await show({ current: false, lastRunFailed: true });
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Try updating again' }));
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledWith('retry');
  });

  it('is disabled while a run is going, and a tap on it starts nothing', async () => {
    await show({ current: false, lastRunFailed: true, running: 'changes' });
    const button = screen.getByRole('button', { name: 'Try updating again' });
    expect(button).toBeDisabled();
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(button);
    expect(syncNow).not.toHaveBeenCalled();
  });
});
