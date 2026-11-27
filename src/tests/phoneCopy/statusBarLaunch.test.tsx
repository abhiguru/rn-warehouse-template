/**
 * WH-298 (Design offline-capture.md 1.5, ruling (a) of 2026-11-26): what the status bar shows while the phone copy is
 * being opened at launch. While the copy is still opening (the first 5 s) the bar is empty (neutral background; no
 * text, icon, screen-reader stop or announcement). "This phone isn't ready yet" (row 7) shows only once the phone knows
 * it has nothing usable, never with a copy on it; a first open that failed is made good by a later one; a first load cut
 * off in its first stage resumes. After 5 s without the copy the bar says it is opening; after a failed attempt it says
 * it couldn't open it and offers "Try again". A launch that opens within 5 s says neither.
 *
 * Real: `OfflineStatusBar`, `PhoneCopyLifecycle`, the engine, its store, the copy's database code.
 * Faked, at the edges only (phoneEnv.ts): the phone's database, secure storage, free space, connectivity, foreground,
 * the signed-in session and the server's answers; and the redux store hooks (the theme's starting state). A "slow open"
 * holds the database's first statement.
 */
import React, { Profiler } from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { env, resetEnv, setForeground, setReachable, controlAppState } from '@/tests/phoneCopy/phoneEnv';
import { failStatement, holdStatement } from '@/tests/phoneCopy/fakeExpoSqlite';
import { grnRow } from '@/tests/phoneCopy/fakeFeed';
import { setFacilityCapabilities, resetFacilityCapabilities } from '@/config/facilityCapabilities';
import { OfflineStatusBar } from '@/components/OfflineStatusBar';
import { PhoneCopyLifecycle } from '@/features/phone-copy/components/PhoneCopyLifecycle';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { getTokens } from '@/theme/tokens';
import { setLanguage } from '@/i18n';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.fileSystem());
// The bar's tests are about the copy: the unsent work is not opened (its file is kept open for a run, and this file wipes the fake phone before each test). Nothing is unsent here.
jest.mock('@/features/unsent/unsentStore', () => ({ ...jest.requireActual('@/features/unsent/unsentStore'), initUnsent: jest.fn(async () => undefined) }));
jest.mock('@/config/supabaseConfig', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
// The signed-in role (a copy load with no known role is refused, 67f79a73): a staff person, as bootPhone() gives.
jest.mock('@/store', () => ({ store: { getState: () => ({ auth: { userProfile: { id: 'profile-1', role: 'staff' } } }) } }));
// react-redux does not load under Jest here: the app's two store hooks read the real theme slice's starting state.
jest.mock('@/store/hooks', () => {
  const state = { theme: jest.requireActual('@/store/slices/themeSlice').default(undefined, { type: 'init' }) };
  return { useAppSelector: (select: (s: unknown) => unknown) => select(state), useAppDispatch: () => () => undefined };
});

const server = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
const NOT_READY = {
  en: "This phone isn't ready yet. Connect to load the warehouse.",
  gu: 'આ ફોન હજુ તૈયાર નથી. વખારની માહિતી લોડ કરવા ઇન્ટરનેટ જોડો.',
} as const;
const OFFLINE_WITH_TIME = { en: /^Offline\. Last updated .*10:42/, gu: /^ઑફલાઇન\. છેલ્લે અપડેટ થયું: / } as const;
const UPDATING_WITH_TIME = { en: /^Updating… Last updated .*10:42/, gu: /^અપડેટ થઈ રહ્યું છે… છેલ્લે અપડેટ થયું: / } as const;
const UP_TO_DATE = { en: 'Up to date', gu: 'અપડેટ છે' } as const;
const RETRY_NAME = 'Try updating again';
const OPENING = { en: 'Opening the records on this phone…', gu: 'આ ફોનની માહિતી ખોલી રહ્યા છીએ…' } as const;
const OPEN_FAILED = { en: "Couldn't open the records on this phone.", gu: 'આ ફોનની માહિતી ખોલી શકાઈ નથી.' } as const;
const OPEN_RETRY_NAME = { en: 'Try opening again', gu: 'ફરી ખોલવાનો પ્રયાસ કરો' } as const;
const TRY_AGAIN = { en: 'Try again', gu: 'ફરી પ્રયાસ કરો' } as const;

const settle = (ms = 50) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
/** Whatever a test holds is let go after it, so a failed test cannot leave the engine waiting for the next one. */
let held: { release: () => void }[] = [];
const keep = <T extends { release: () => void }>(gate: T): T => {
  held.push(gate);
  return gate;
};
const holdOpen = () => keep(holdStatement(/PRAGMA key/));
const holdCall = (matches: Parameters<typeof env.feed.hold>[0]) => keep(env.feed.hold(matches));
const toApp = (state: 'active' | 'background') => act(() => setForeground(state));
const reachable = (connected: boolean) => act(() => setReachable(connected));
/** Well inside the 5 s for which the bar stays empty (the exact limit has its own cases below). */
const BEFORE_OPENING_TEXT = 4_000;

/** Every commit of the bar, so a state shown "only for a moment" is seen too. */
let frames: { notReady: boolean; button: boolean; beforeOpenText: boolean }[] = [];
let watching = false;
const noteFrame = () => {
  if (!watching) return;
  frames.push({
    notReady: screen.queryByText(NOT_READY.en) !== null || screen.queryByText(NOT_READY.gu) !== null,
    button: screen.queryByRole('button') !== null,
    beforeOpenText: [OPENING.en, OPENING.gu, OPEN_FAILED.en, OPEN_FAILED.gu].some(text => screen.queryByText(text) !== null),
  });
};
const neverSaidNotReady = () => expect(frames.filter(f => f.notReady)).toHaveLength(0);
/** For the states that offer no action either. A failed open may offer "Try again" (Design 1.5). */
const neverNotReady = () => {
  expect(frames.filter(f => f.notReady)).toHaveLength(0);
  expect(frames.filter(f => f.button)).toHaveLength(0);
};

/** The app's launch: the bar and the lifecycle, mounted together as app/_layout.tsx does. */
async function launch() {
  frames = [];
  watching = false;
  const app = (running: boolean) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 800 }, insets: { top: 24, bottom: 0, left: 0, right: 0 } }}>
      <Profiler id="bar" onRender={noteFrame}>
        <OfflineStatusBar />
      </Profiler>
      {running ? <PhoneCopyLifecycle /> : null}
    </SafeAreaProvider>
  );
  // The bar is on screen first, so that every commit from the start of the copy onwards can be looked at.
  await render(app(false));
  watching = true;
  await screen.rerender(app(true));
  await settle();
}

/** Design 1.5, "Before the copy is opened": the neutral bar and nothing in it. */
function expectEmptyBar() {
  expect(screen.queryByText(/\S/)).not.toBeOnTheScreen();
  expect(screen.queryByTestId('offline-status-bar-icon')).not.toBeOnTheScreen();
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  const nodes = screen.container.queryAll(() => true);
  // No screen-reader stop and nothing for the live region to say.
  expect(nodes.filter(n => n.props.accessible === true || Boolean(n.props.accessibilityLabel))).toHaveLength(0);
  const neutral = getTokens('orange', 'light').status.neutral.background;
  expect(nodes.filter(n => StyleSheet.flatten(n.props.style)?.backgroundColor === neutral).length).toBeGreaterThan(0);
}

/** An earlier run of the app; its modules are separate, so this run starts as a cold launch over the same phone. */
async function earlierRun(use: (earlier: typeof engine) => Promise<void>) {
  let earlier!: { engine: typeof engine; env: typeof env };
  jest.isolateModules(() => {
    earlier = { env: require('@/tests/phoneCopy/phoneEnv').env, engine: require('@/features/phone-copy/syncEngine') };
  });
  earlier.env.feed = env.feed;
  await earlier.engine.startPhoneCopy();
  await use(earlier.engine);
  await earlier.engine.stopPhoneCopy();
  for (const [key, value] of earlier.env.secure) env.secure.set(key, value);
  env.feed.calls.length = 0;
}
const leaveCopyOnPhone = () => earlierRun(async earlier => {
  expect(await earlier.syncNow('open')).toBe('done');
});
/** The server stops answering at the first page: the copy is left in the first stage of its load. */
const leavePartLoadOnPhone = () => earlierRun(async earlier => {
  env.feed.failWhen = c => c.name === 'get_sync_page';
  expect(await earlier.syncNow('open')).toBe('failed');
  env.feed.failWhen = null;
});

/** The first open fails after the file is open: reading what the copy holds (the third read of `meta`) fails once. */
const failFirstReadOfCopy = () => failStatement(/SELECT v FROM meta/, new Error('disk I/O error'), 2);
/** The first open of a phone with no copy fails: secure storage does not take the new key, once. */
const failFirstKeyWrite = () => jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('keystore not ready'));

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-11-25T07:00:00Z') });
  resetEnv();
  controlAppState();
  resetFacilityCapabilities();
  setFacilityCapabilities(server as never, { sync: true });
  env.feed.rows.goodsreceived.push(grnRow('g1'));
});
afterEach(async () => {
  for (const gate of held.splice(0)) gate.release();
  await engine.stopPhoneCopy();
  await copyDb.eraseCopy();
  await setLanguage('en');
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each(['en', 'gu'] as const)('a slow open with a copy on the phone (%s)', language => {
  beforeEach(async () => {
    await leaveCopyOnPhone();
    await setLanguage(language);
  });

  it('online: the bar is empty until the copy is open, then "Updating…" and "Up to date"; never "not ready"', async () => {
    const open = holdOpen();
    const changes = holdCall(c => c.name === 'get_sync_changes');
    await launch();
    await settle(BEFORE_OPENING_TEXT);
    expectEmptyBar();
    open.release();
    await settle();
    expect(screen.getByText(UPDATING_WITH_TIME[language])).toBeOnTheScreen();
    changes.release();
    await settle();
    expect(screen.getByText(UP_TO_DATE[language])).toBeOnTheScreen();
    neverNotReady();
  });

  it('offline: the bar is empty until the copy is open, then "Offline. Last updated"; never "not ready"', async () => {
    env.reachable = false;
    const open = holdOpen();
    await launch();
    await settle(BEFORE_OPENING_TEXT);
    expectEmptyBar();
    open.release();
    await settle();
    expect(screen.getByText(OFFLINE_WITH_TIME[language])).toBeOnTheScreen();
    neverNotReady();
  });
});

describe('a first open that fails, with a copy on the phone', () => {
  beforeEach(leaveCopyOnPhone);

  it('online: the sync that follows opens the copy and the bar says what it holds', async () => {
    failFirstReadOfCopy();
    const changes = holdCall(c => c.name === 'get_sync_changes');
    await launch();
    expect(screen.getByText(UPDATING_WITH_TIME.en)).toBeOnTheScreen();
    changes.release();
    await settle();
    expect(screen.getByText(UP_TO_DATE.en)).toBeOnTheScreen();
    neverSaidNotReady();
  });

  it('online with the server failing: the later open still shows the copy, as "Couldn\'t update"', async () => {
    failFirstReadOfCopy();
    env.feed.failWhen = c => c.name === 'get_sync_changes';
    await launch();
    expect(screen.getByText(/^Couldn't update\. Last updated .*10:42/)).toBeOnTheScreen();
    neverSaidNotReady();
  });

  it('offline: the open is tried again by itself and shows "Offline. Last updated"', async () => {
    env.reachable = false;
    failFirstReadOfCopy();
    await launch();
    await reachable(false);
    neverSaidNotReady();
    await settle(60_000);
    expect(screen.getByText(OFFLINE_WITH_TIME.en)).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    neverSaidNotReady();
  });

  it('offline: recovers when the connection returns', async () => {
    env.reachable = false;
    failFirstReadOfCopy();
    await launch();
    await reachable(false);
    await settle(1_000);
    neverSaidNotReady();
    await reachable(true);
    await settle();
    expect(screen.getByText(UP_TO_DATE.en)).toBeOnTheScreen();
    neverSaidNotReady();
  });

  it('offline: coming back to the app opens the copy and shows "Offline. Last updated"', async () => {
    env.reachable = false;
    failFirstReadOfCopy();
    await launch();
    await toApp('background');
    await settle();
    await toApp('active');
    await settle();
    expect(screen.getByText(OFFLINE_WITH_TIME.en)).toBeOnTheScreen();
    neverSaidNotReady();
  });
});

describe('a first load cut off in its first stage, resumed', () => {
  const LOADING = 'Loading the warehouse onto this phone…';

  it('online at the next launch: "Loading the warehouse…", never "not ready", and it goes on from where it was', async () => {
    await leavePartLoadOnPhone();
    const next = holdCall(c => c.name === 'get_sync_page');
    await launch();
    expect(screen.getByText(LOADING)).toBeOnTheScreen();
    next.release();
    await settle();
    expect(screen.getByText(UP_TO_DATE.en)).toBeOnTheScreen();
    expect(env.feed.named('get_sync_start')).toHaveLength(0);
    neverNotReady();
  });

  it('offline at the next launch: "not ready" with "Try again", as nothing is usable yet', async () => {
    await leavePartLoadOnPhone();
    env.reachable = false;
    await launch();
    expect(screen.getByText(NOT_READY.en)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: RETRY_NAME })).toBeEnabled();
  });

  it('after the app was put away and brought back: never "not ready" while the load resumes', async () => {
    const first = holdCall(c => c.name === 'get_sync_page');
    await launch();
    expect(screen.getByText(LOADING)).toBeOnTheScreen();
    frames = [];
    await toApp('background');
    await settle();
    first.release();
    await toApp('active');
    await settle();
    expect(screen.getByText(UP_TO_DATE.en)).toBeOnTheScreen();
    expect(env.feed.named('get_sync_start')).toHaveLength(1);
    neverNotReady();
  });
});

describe('a phone with no copy', () => {
  it.each(['en', 'gu'] as const)('offline (%s): empty while opening, then "not ready" with "Try again"', async language => {
    await setLanguage(language);
    env.reachable = false;
    const open = holdOpen();
    await launch();
    await settle(BEFORE_OPENING_TEXT);
    expectEmptyBar();
    open.release();
    await settle();
    expect(screen.getByText(NOT_READY[language])).toBeOnTheScreen();
    expect(screen.getByTestId('offline-status-bar-retry')).toBeEnabled();
  });

  it('online, still opening: the bar is empty, with no "not ready" and no "Try again"', async () => {
    const open = holdOpen();
    await launch();
    await settle(BEFORE_OPENING_TEXT);
    expectEmptyBar();
    open.release();
    await settle();
    expect(screen.getByText(UP_TO_DATE.en)).toBeOnTheScreen();
  });

  it('online with the first load failing: "not ready", and "Try again" loads the phone', async () => {
    env.feed.failWhen = c => c.name === 'get_sync_start';
    await launch();
    expect(screen.getByText(NOT_READY.en)).toBeOnTheScreen();
    env.feed.failWhen = null;
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: RETRY_NAME }));
    await settle();
    expect(screen.getByText(UP_TO_DATE.en)).toBeOnTheScreen();
    expect(screen.queryByText(NOT_READY.en)).not.toBeOnTheScreen();
  });

  it('offline after a failed open: "not ready" only once a later open finds no copy', async () => {
    env.reachable = false;
    failFirstKeyWrite();
    // The second open is held, to look at the bar between the failure and the success.
    const second = holdOpen();
    await launch();
    neverSaidNotReady();
    await toApp('background');
    await settle();
    await toApp('active');
    await settle();
    neverSaidNotReady();
    second.release();
    await settle();
    expect(screen.getByText(NOT_READY.en)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: RETRY_NAME })).toBeEnabled();
  });

  it('offline after a failed open: the connection returning loads the phone', async () => {
    env.reachable = false;
    failFirstKeyWrite();
    const second = holdOpen();
    await launch();
    await reachable(false);
    await settle();
    neverSaidNotReady();
    await reachable(true);
    await settle();
    neverSaidNotReady();
    second.release();
    await settle();
    expect(screen.getByText(UP_TO_DATE.en)).toBeOnTheScreen();
    neverSaidNotReady();
  });
});

/** Design 1.5: a state before the copy is opened is neutral, one screen-reader stop and spoken once by the live region. */
function expectSaid(text: string, icon: 'sync' | 'cloud-alert-outline') {
  const bar = screen.getByTestId('offline-status-bar');
  expect(screen.getByText(text)).toBeOnTheScreen();
  expect(bar).toHaveProp('accessible', true);
  expect(bar).toHaveAccessibleName(text);
  expect(bar).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(bar).toHaveStyle({ backgroundColor: getTokens('orange', 'light').status.neutral.background });
  expect(screen.getByTestId('offline-status-bar-icon')).toHaveProp('name', icon);
}
const neverSaidItWasOpening = () => expect(frames.filter(f => f.beforeOpenText)).toHaveLength(0);

describe.each(['en', 'gu'] as const)('before the copy is opened (%s)', language => {
  beforeEach(() => setLanguage(language));

  it('a copy still not open: empty for 5 s, then "Opening…" with no action, then its real row', async () => {
    await leaveCopyOnPhone();
    env.reachable = false;
    const open = holdOpen();
    await launch();
    await settle(4_900);
    expectEmptyBar();
    neverSaidItWasOpening();
    await settle(100);
    expectSaid(OPENING[language], 'sync');
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    await settle(60_000);
    expectSaid(OPENING[language], 'sync');
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    open.release();
    await settle();
    expect(screen.getByText(OFFLINE_WITH_TIME[language])).toBeOnTheScreen();
    expect(screen.queryByText(OPENING[language])).not.toBeOnTheScreen();
    neverSaidNotReady();
  });

  it('a launch that opens within 5 s says nothing before its real row, then or later', async () => {
    await leaveCopyOnPhone();
    env.reachable = false;
    const open = holdOpen();
    await launch();
    await settle(BEFORE_OPENING_TEXT);
    expectEmptyBar();
    open.release();
    await settle();
    expect(screen.getByText(OFFLINE_WITH_TIME[language])).toBeOnTheScreen();
    await settle(60_000);
    expect(screen.getByText(OFFLINE_WITH_TIME[language])).toBeOnTheScreen();
    neverSaidItWasOpening();
    neverNotReady();
  });

  it('a failed attempt, with a copy: "Couldn\'t open" with "Try again", and the retry opens it', async () => {
    await leaveCopyOnPhone();
    env.reachable = false;
    // Both attempts of the launch fail: reading what the copy holds.
    failFirstReadOfCopy();
    failStatement(/SELECT v FROM meta/, new Error('disk I/O error'));
    await launch();
    expectSaid(OPEN_FAILED[language], 'cloud-alert-outline');
    const button = screen.getByRole('button', { name: OPEN_RETRY_NAME[language] });
    expect(button).toHaveTextContent(TRY_AGAIN[language]);
    expect(button).toBeEnabled();
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).press(button);
    await settle();
    expect(screen.getByText(OFFLINE_WITH_TIME[language])).toBeOnTheScreen();
    expect(screen.queryByText(OPEN_FAILED[language])).not.toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    neverSaidNotReady();
  });

  it('while the retry runs: the failure stays said, "Try again" is disabled, until the first real state', async () => {
    // A new phone: secure storage refuses the key twice, and the third attempt is slow.
    failFirstKeyWrite();
    failFirstKeyWrite();
    const third = holdOpen();
    await launch();
    expectSaid(OPEN_FAILED[language], 'cloud-alert-outline');
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: OPEN_RETRY_NAME[language] }));
    await settle(10_000);
    expectSaid(OPEN_FAILED[language], 'cloud-alert-outline');
    expect(screen.getByRole('button', { name: OPEN_RETRY_NAME[language] })).toBeDisabled();
    neverSaidNotReady();
    third.release();
    await settle();
    expect(screen.getByText(UP_TO_DATE[language])).toBeOnTheScreen();
    expect(screen.queryByText(OPEN_FAILED[language])).not.toBeOnTheScreen();
    neverSaidNotReady();
  });
});

describe('before the copy is opened: a new phone whose load is slow', () => {
  it('opened at once, waiting on the server for over 5 s: "Loading the warehouse…", never "Opening…"', async () => {
    const start = holdCall(c => c.name === 'get_sync_start');
    await launch();
    await settle(8_000);
    expect(screen.getByText('Loading the warehouse onto this phone…')).toBeOnTheScreen();
    neverSaidItWasOpening();
    start.release();
    await settle();
    expect(screen.getByText(UP_TO_DATE.en)).toBeOnTheScreen();
  });
});
