/**
 * WH-301 review Medium, Design 2026-11-28 (the bar with the sync feature off and unsent work on the phone), Dev 8d6a1b9b:
 * `useUnsentOnlyBar` and `OfflineStatusBar unsentOnly` show the status bar's second line ALONE (no copy rows, no "Up to date",
 * no "Offline. Last updated", no "Try again"), its tap opens "Unsent items", the held line shows when only held items remain,
 * and the bar is gone at zero.
 *
 * Real: the unsent store and queue, `useUnsentOnlyBar`, `deriveUnsentLine`, `OfflineStatusBar`, the English texts. Faked at the
 * edge: the phone's connectivity (`useIsOffline`), the signed-in session and the copy hooks (the feature is off), the router, the theme.
 *
  * Wording: key `components.offlineStatus.unsentFeatureOff` (Design 2026-11-28, Dev 503f3f8f), told whether connected or not while nothing is being sent; the `sending` line while a send pass runs online.
 */
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { bootUnsent, rawRun, server, type UnsentPhone } from '@/tests/unsent/unsentPhone';

const mockPush = jest.fn();
let mockOffline = false;

const waits = { kind: 'testRecord', body: {}, what: 'New GRN', customer: 'asha Traders' };

async function phoneWithFeatureOff(): Promise<UnsentPhone> {
  const phone = await bootUnsent({ sync: false });
  phone.kinds.registerSendKind('testRecord', { lane: 'record', send: async () => ({ kind: 'transient' }) });
  await phone.store.initUnsent();
  jest.doMock('@/hooks/usePhoneCopyStatus', () => ({
    useCopySession: () => true,
    useCopyFeatureOn: () => false,
    usePhoneCopyStatus: () => ({ feature: 'off', phase: 'empty', running: null, current: false, asOf: null, lastRunFailed: false, storageLow: false, copyBytes: null }),
  }));
  jest.doMock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
  jest.doMock('@/hooks/useTheme', () => {
    const { getTokens } = jest.requireActual('@/theme/tokens');
    const current = () => getTokens('orange', 'light');
    return { useTokens: () => current(), useThemedStyles: (factory: (t: unknown) => unknown) => factory(current()) };
  });
  jest.doMock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));
  jest.doMock('expo-router', () => ({ router: { push: mockPush } }));
  jest.doMock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
  require('@testing-library/react-native/dist/matchers/extend-expect');
  return phone;
}

function parts() {
  const rtl = require('@testing-library/react-native/pure') as typeof import('@testing-library/react-native/pure');
  const React = require('react') as typeof import('react');
  const { OfflineStatusBar } = require('@/components/OfflineStatusBar') as typeof import('@/components/OfflineStatusBar');
  const { useUnsentOnlyBar } = require('@/features/unsent/useUnsentOnlyBar') as typeof import('@/features/unsent/useUnsentOnlyBar');
  /** What app/_layout.tsx draws: the unsent-only bar when `useUnsentOnlyBar()` says so. */
  const Layout = () => (useUnsentOnlyBar() ? React.createElement(OfflineStatusBar, { unsentOnly: true }) : null);
  return { rtl, React, Layout };
}

beforeEach(() => {
  resetEnv();
  files.reset();
  server.reset();
  env.subject = 'user-1';
  mockOffline = false;
  mockPush.mockClear();
});
afterEach(async () => {
  jest.restoreAllMocks();
  await eraseEverything();
});

describe('the bar with the sync feature off', () => {
  it('shows only the unsent line, with no copy line', async () => {
    const phone = await phoneWithFeatureOff();
    await phone.queue.enqueue(waits);
    await phone.queue.enqueue(waits);
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));

    expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('2 items not sent yet. Tap to see them.');
    expect(rtl.screen.queryByTestId('offline-status-bar-line1')).not.toBeOnTheScreen();
    expect(rtl.screen.queryByText(/Up to date|Last updated|Try again/)).not.toBeOnTheScreen();
    expect(rtl.screen.queryByTestId('offline-status-bar-retry')).not.toBeOnTheScreen();
  });

  it('opens Unsent items when tapped', async () => {
    const phone = await phoneWithFeatureOff();
    await phone.queue.enqueue(waits);
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));

    await rtl.userEvent.setup({ delay: 0 }).press(rtl.screen.getByTestId('offline-status-bar'));
    expect(mockPush).toHaveBeenCalledWith('/unsent-items');
  });

  it('offline: the line still tells the count and still opens Unsent items', async () => {
    mockOffline = true;
    const phone = await phoneWithFeatureOff();
    await phone.queue.enqueue(waits);
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));

    expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('1 item not sent yet. Tap to see it.');
    expect(rtl.screen.queryByTestId('offline-status-bar-line1')).not.toBeOnTheScreen();
    await rtl.userEvent.setup({ delay: 0 }).press(rtl.screen.getByTestId('offline-status-bar'));
    expect(mockPush).toHaveBeenCalledWith('/unsent-items');
  });

  // Design 2026-11-28 (Dev 503f3f8f): the line has no time, because the time stops nothing now; the same words online or offline.
  it('offline: reads "{{count}} items not sent yet. Tap to see them." with no "by {{time}}" (unsentFeatureOff), the same words as online', async () => {
    mockOffline = true;
    const phone = await phoneWithFeatureOff();
    await phone.queue.enqueue(waits);
    await phone.queue.enqueue(waits);
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));

    expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('2 items not sent yet. Tap to see them.');
    expect(rtl.screen.getByTestId('offline-status-bar-line2')).not.toHaveTextContent(/send (it|them) by/);
  });

  it('online, while a send pass runs it shows the existing "Sending 2 items…" line, and the feature-off line again once the pass ends', async () => {
    const phone = await phoneWithFeatureOff();
    let release!: () => void;
    await phone.queue.enqueue(waits);
    await phone.queue.enqueue(waits);
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));
    expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('2 items not sent yet. Tap to see them.');

    // The server now takes its time over the item: a send pass is running until it answers.
    phone.kinds.registerSendKind('testRecord', { lane: 'record', send: () => new Promise(resolve => { release = () => resolve({ kind: 'transient' }); }) });
    let pass!: Promise<void>;
    await rtl.act(async () => { pass = phone.engine.sendNow('send-now'); });
    await rtl.waitFor(() => expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('Sending 2 items…'));

    await rtl.act(async () => { release(); await pass; });
    await rtl.waitFor(() => expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('2 items not sent yet. Tap to see them.'));
  });

  it('is neutral in style', async () => {
    const phone = await phoneWithFeatureOff();
    await phone.queue.enqueue(waits);
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));
    const { getTokens } = require('@/theme/tokens') as typeof import('@/theme/tokens');
    expect(rtl.screen.getByTestId('offline-status-bar')).toHaveStyle({ backgroundColor: getTokens('orange', 'light').status.neutral.background });
  });

  it('in Gujarati it reads from the locale, with Gujarati digits for the count', async () => {
    const phone = await phoneWithFeatureOff();
    await phone.queue.enqueue(waits);
    await phone.queue.enqueue(waits);
    const { setLanguage } = require('@/i18n') as typeof import('@/i18n');
    await setLanguage('gu');
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));
    expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('૨ એન્ટ્રી મોકલવાની બાકી છે. જોવા ટૅપ કરો.');
    await setLanguage('en');
  });

  it('with only held items left it shows the held line', async () => {
    const phone = await phoneWithFeatureOff();
    const { id } = await phone.queue.enqueue(waits);
    await rawRun(`UPDATE items SET state = 'held' WHERE id = '${id}'`);
    await (require('@/features/unsent/unsentStore') as typeof import('@/features/unsent/unsentStore')).refreshUnsent();
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));

    expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('1 of your items is held. Tap to see it.');
  });

  it('is gone once the last item is gone', async () => {
    const phone = await phoneWithFeatureOff();
    const { id } = await phone.queue.enqueue(waits);
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));
    expect(rtl.screen.getByTestId('offline-status-bar')).toBeOnTheScreen();

    await rtl.act(async () => { await phone.queue.deleteItem(id); });
    expect(rtl.screen.queryByTestId('offline-status-bar')).not.toBeOnTheScreen();
  });

  it('is not drawn at all with nothing unsent', async () => {
    await phoneWithFeatureOff();
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));
    expect(rtl.screen.queryByTestId('offline-status-bar')).not.toBeOnTheScreen();
  });

  it('is not drawn while the feature is on (the copy bar is the layout\'s then)', async () => {
    const phone = await phoneWithFeatureOff();
    await phone.queue.enqueue(waits);
    jest.doMock('@/hooks/usePhoneCopyStatus', () => ({ useCopySession: () => true, useCopyFeatureOn: () => true }));
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));
    expect(rtl.screen.queryByTestId('offline-status-bar')).not.toBeOnTheScreen();
  });
});

describe('with the feature ON the line is as it was (no feature-off wording)', () => {
  const summary = (count: number, limitReached = false) => ({ count, sendBy: Date.parse('2026-11-28T10:00:00+05:30'), limitReached, unreadable: false, waitingForAdmin: 0, held: 0 });

  it.each([
    ['online: "Sending"', false, summary(2), { key: 'sending', count: 2 }],
    ['offline: "Connect and send them by {{time}}"', true, summary(2), { key: 'unsent', count: 2, time: Date.parse('2026-11-28T10:00:00+05:30') }],
    ['the 2-hour limit line', false, summary(2, true), { key: 'unsentLimit', count: 2 }],
  ])('%s', async (_name, offline, unsent, line) => {
    await bootUnsent();
    const { deriveUnsentLine } = require('@/features/phone-copy/statusBarState') as typeof import('@/features/phone-copy/statusBarState');
    expect(deriveUnsentLine(unsent as never, offline, null)).toEqual(line);
  });
});

describe('the sending flag across a session change (Dev d3045325)', () => {
  it('the next person\'s bar does not say "Sending" for the earlier person\'s pass', async () => {
    const phone = await phoneWithFeatureOff();
    await phone.queue.enqueue(waits);
    mockOffline = false;
    phone.kinds.registerSendKind('testRecord', { lane: 'record', send: () => new Promise(() => undefined) });
    const { rtl, React, Layout } = parts();
    await rtl.render(React.createElement(Layout));
    await rtl.act(async () => { void phone.engine.sendNow('send-now'); });
    await rtl.waitFor(() => expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('Sending 1 item…'));

    await rtl.act(async () => { await phone.phone.registry.runSessionScopedClears({ dispatch: () => undefined } as never); });

    expect(rtl.screen.getByTestId('offline-status-bar-line2')).toHaveTextContent('1 item not sent yet. Tap to see it.');
  });
});
