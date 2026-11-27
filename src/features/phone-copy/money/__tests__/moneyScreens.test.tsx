/**
 * WH-305 on screen, contract product/tech/app-offline-dues-statement.md 5, 8 and T12, T13, T14, T15, T16, T17, with Design
 * offline-capture.md 8.1, 8.2, 8.4 and the answers of 8.6 (DQ2 the old "As of" line goes, DQ3 a failed refresh, DQ5 activity
 * uses money.asOf* and its own empty title) and 8.7 (activity's chip shows the kept dates and is disabled offline), and Product's
 * PQ4 (activity offline shows the last kept answer whatever its period).
 *
 * Real: the three screens, ReportScaffold, the services, the store, the sync engine, the copy. Faked at the edge: the server's
 * answers, the phone's native modules, the connection, the navigator, FlashList's native drawing, and `Date` (one fixed
 * morning: 11:00 am on 27 Nov 2026 in India; timers are real).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - Kept answers are seeded with `writeMoneyAnswer({ kind, key, asOf, today, body })` of `money/moneyStore` (see moneyStore.test.ts).
 *  - testIDs are the contract's 5.1-5.3: money-age-line, money-age-strip, statement-not-here, dues-not-here,
 *    customer-activity-not-here, statement-header-needs-connection. The refresh sentence has no testID (found by its words).
 *  - The never-fetched states say their title and "It will load when you reconnect." as plain text of the ListEmptyState.
 *  - The activity period chip is a button whose name starts with the "{{from}} – {{to}}" of formatCardDate.
 *  - Not covered here: the invoice opened from a statement (Design 8.6 DQ1: no age line of its own). It needs the invoice-details
 *    harness; the case belongs with WH-348's detail screens.
 * ==================================
 */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import DuesScreen from '../../../../../app/reports/customer-dues';
import StatementScreen from '../../../../../app/reports/statement';
import ActivityScreen from '../../../../../app/reports/customer-activity';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { duesBody, NOW, seedMoney, statementBody, YESTERDAY, YESTERDAY_DAY } from '@/tests/phoneCopy/moneyDataset';
import { resetScreenFocus } from '@/tests/components/focusHarness';
import { forgetQueries, makeQueryUpdatesImmediate } from '@/tests/helpers/reportQueries';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { runSessionScopedClears } from '@/config/sessionScopedRegistry';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import themeReducer from '@/store/slices/themeSlice';
import { setLanguage } from '@/i18n';
import { formatCardDate } from '@/utils/formatters';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.fileSystem());
jest.mock('@/config/supabaseConfig', () => ({
  ...require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase(),
  RequestTimeoutError: class RequestTimeoutError extends Error {},
}));
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({
  ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(),
  setLanContext: () => undefined,
}));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn() }));
let mockStore: { getState: () => unknown; subscribe: (l: () => void) => () => void; dispatch: (a: never) => unknown };
jest.mock('@/store', () => ({ get store() { return mockStore; } }));
jest.mock('@/store/hooks', () => {
  const { useRef, useSyncExternalStore } = require('react');
  return {
    useAppSelector: (selector: (state: unknown) => unknown) => {
      const last = useRef(null);
      const read = () => {
        const state = mockStore.getState();
        if (!last.current || last.current.state !== state || last.current.selector !== selector) {
          last.current = { state, selector, value: selector(state) };
        }
        return last.current.value;
      };
      return useSyncExternalStore(mockStore.subscribe, read);
    },
    useAppDispatch: () => mockStore.dispatch,
  };
});
const mockNet = {
  offline: false,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) { mockNet.listeners.add(listener); return () => { mockNet.listeners.delete(listener); }; },
  set(offline: boolean) { mockNet.offline = offline; for (const listener of [...mockNet.listeners]) listener(); },
};
jest.mock('@/hooks/useNetworkStatus', () => {
  const { useSyncExternalStore } = require('react');
  const useOffline = () => useSyncExternalStore(mockNet.subscribe, () => mockNet.offline);
  return { useIsOffline: useOffline, useNetworkStatus: () => ({ isConnected: !useOffline(), type: 'wifi' }) };
});
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
  Redirect: () => null,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-paper', () => ({ ActivityIndicator: 'ActivityIndicator' }));
jest.mock('@/hooks/useCanPrint', () => ({ useCanPrint: () => false }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const draw = (part: unknown) => (typeof part === 'function' ? React.createElement(part) : part ?? null);
  return {
    FlashList: React.forwardRef((props: any, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({ scrollToOffset: () => {}, scrollToIndex: () => {} }));
      return React.createElement(React.Fragment, null, draw(props.ListHeaderComponent),
        props.data.map((item: any, index: number) =>
          React.createElement(React.Fragment, { key: props.keyExtractor(item, index) }, props.renderItem({ item, index }))),
        props.data.length ? null : draw(props.ListEmptyComponent), draw(props.ListFooterComponent));
    }),
  };
});

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const serverCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let serverAnswers: Record<string, unknown> = {};
const LOST = { data: null, error: { message: 'Network request failed' } };
let restoreQueries: () => void;
beforeAll(() => { restoreQueries = makeQueryUpdatesImmediate(); });
afterAll(() => restoreQueries());

async function signInAs(role: 'admin' | 'supervisor' | 'staff' | 'customer') {
  mockStore.dispatch(setUserProfile({ id: 'profile-1', role, name: 'Asha Fictional' } as never) as never);
}
beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(NOW), doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'time', 'timeEnd'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  resetEnv();
  seedMoney();
  env.feed.rows.customers.push({ id: 'c4', row: { id: 'c4', name: 'Dhruv Fictional', mobile: '09000000004', active: true, deleted_at: null } });
  forgetQueries();
  serverCalls.length = 0;
  serverAnswers = {};
  mockParams = {};
  mockNet.offline = false;
  resetScreenFocus();
  const feedRpc = env.feed.rpc;
  env.feed.rpc = async (name: string, args: Record<string, unknown> = {}) => {
    if (name.startsWith('get_sync_')) return feedRpc(name, args);
    serverCalls.push({ name, args });
    // A held read waits here: this wrapper answers money reads itself, so the feed's own gates are not reached.
    for (const gate of env.feed.gates) {
      if (gate.matches({ name, args })) { gate.onHit(); await gate.wait; }
    }
    const answer = serverAnswers[name];
    if (typeof answer === 'function') return (answer as (a: Record<string, unknown>) => unknown)(args) as never;
    return name in serverAnswers ? { data: answer, error: null } : LOST;
  };
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  const store = configureStore({ reducer: { auth: authReducer, listFilters: listFilterReducer, reportPrefs: reportPrefsReducer, theme: themeReducer } });
  mockStore = store as unknown as typeof mockStore;
  await signInAs('admin');
});
afterEach(async () => {
  forgetQueries();
  await runSessionScopedClears({ dispatch: () => undefined });
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  await setLanguage('en');
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function loadCopy() {
  await engine.startPhoneCopy();
  expect(await engine.syncNow('open')).toBe('done');
}
async function connection(offline: boolean) {
  await act(async () => { await setReachable(!offline); engine.setCopyOffline(offline); mockNet.set(offline); });
}
// The store is the build's (contract first); loaded at run time so the type check does not need it yet.
const keep = (kind: string, key: string, body: { as_of: string; today?: string }) =>
  (require('@/features/phone-copy/money/moneyStore') as { writeMoneyAnswer: (a: unknown) => Promise<boolean> }).writeMoneyAnswer({ kind, key, asOf: body.as_of, today: body.today ?? null, body });
const order = (first: string, second: string) => {
  const tree = JSON.stringify(screen.toJSON());
  return tree.indexOf(first) !== -1 && tree.indexOf(first) < tree.indexOf(second);
};
const statementFor = (id: string) => { mockParams = { customerId: id, customerName: id }; return <StatementScreen />; };
const EARLIER = /^These figures are from 26\/11\/26, 2:35\s?pm\. Rent has built up since; connect for today.s figures\.$/;
const EARLIER_NO_STOCK = /^These figures are from 26\/11\/26, 2:35\s?pm\. Connect for today.s figures\.$/;

describe('T12: Customer dues offline, from the kept answer', () => {
  it('draws the kept figures with the time computed above the first figure, and the old "As of" line is gone (DQ2)', async () => {
    await loadCopy();
    await keep('dues', '', duesBody());
    await connection(true);
    await render(<DuesScreen />);
    expect(await screen.findByTestId('money-age-line')).toHaveTextContent(/Figures as of 9:05\s?am today/i);
    expect(screen.getByText('Chirag Stores')).toBeOnTheScreen();
    expect(screen.getByText(/30\.00/)).toBeOnTheScreen();
    expect(screen.queryByText(/^As of /)).not.toBeOnTheScreen();
    expect(order('money-age-line', 'Due on invoices')).toBe(true);
    expect(serverCalls).toEqual([]);
  });

  it('shows the totals the server summed, not a sum of the rows', async () => {
    await loadCopy();
    await keep('dues', '', duesBody());
    await connection(true);
    await render(<DuesScreen />);
    expect(await screen.findByText(/3,007\.00/)).toBeOnTheScreen();
    expect(screen.queryByText(/3,003\.00/)).not.toBeOnTheScreen();
  });

  it('computed on an earlier day: the strip, with the rent sentence', async () => {
    await loadCopy();
    await keep('dues', '', duesBody({ asOf: YESTERDAY, today: YESTERDAY_DAY }));
    await connection(true);
    await render(<DuesScreen />);
    expect(await screen.findByTestId('money-age-strip')).toHaveTextContent(EARLIER);
    expect(screen.queryByTestId('money-age-line')).not.toBeOnTheScreen();
  });

  it('with no kept answer: "not on this phone yet", the second line, no Try again', async () => {
    await loadCopy();
    await connection(true);
    await render(<DuesScreen />);
    const empty = await screen.findByTestId('dues-not-here');
    expect(within(empty).getByText("Customer dues aren't on this phone yet")).toBeOnTheScreen();
    expect(within(empty).getByText('It will load when you reconnect.')).toBeOnTheScreen();
    expect(screen.queryByText('Try again')).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });
});

describe('T12: Statement offline', () => {
  it('draws the kept statement with the age line before the first figure', async () => {
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2'));
    await connection(true);
    await render(statementFor('c2'));
    expect(await screen.findByTestId('money-age-line')).toHaveTextContent(/Figures as of 9:05\s?am today/i);
    expect(screen.getByText('GRN A10')).toBeOnTheScreen();
    expect(screen.queryByText(/^As of /)).not.toBeOnTheScreen();
    expect(order('money-age-line', 'Due on invoices')).toBe(true);
    expect(serverCalls).toEqual([]);
  });

  it('an earlier day, goods in store in the answer: the strip with the rent sentence', async () => {
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2', { asOf: YESTERDAY, today: YESTERDAY_DAY }));
    await connection(true);
    await render(statementFor('c2'));
    expect(await screen.findByTestId('money-age-strip')).toHaveTextContent(EARLIER);
  });

  it('an earlier day, empty "in store" but goods in the copy (Bhavin Foods has lots): still the rent sentence (PQ3)', async () => {
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2', { asOf: YESTERDAY, today: YESTERDAY_DAY, inStore: false }));
    await connection(true);
    await render(statementFor('c2'));
    expect(await screen.findByTestId('money-age-strip')).toHaveTextContent(EARLIER);
  });

  it('an earlier day, nothing in store in the answer and no lot in the copy: no rent sentence', async () => {
    await loadCopy();
    await keep('statement', 'c4', statementBody('c4', { asOf: YESTERDAY, today: YESTERDAY_DAY, inStore: false }));
    await connection(true);
    await render(statementFor('c4'));
    const strip = await screen.findByTestId('money-age-strip');
    expect(strip).toHaveTextContent(EARLIER_NO_STOCK);
    expect(strip).not.toHaveTextContent('Rent has built up');
  });

  it('never fetched: "not on this phone yet", no Try again, Share PDF disabled with its line', async () => {
    await loadCopy();
    await connection(true);
    await render(statementFor('c3'));
    const empty = await screen.findByTestId('statement-not-here');
    expect(within(empty).getByText("This statement isn't on this phone yet")).toBeOnTheScreen();
    expect(within(empty).getByText('It will load when you reconnect.')).toBeOnTheScreen();
    expect(screen.queryByText('Try again')).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('kept: Share PDF is disabled and says why', async () => {
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2'));
    await connection(true);
    await render(statementFor('c2'));
    await screen.findByTestId('money-age-line');
    expect(screen.getByRole('button', { name: 'Share PDF, needs a connection' })).toBeDisabled();
    expect(screen.getByTestId('statement-header-needs-connection')).toBeOnTheScreen();
  });
});

describe('T13: online, the kept answer first and the new one in place', () => {
  it('shows the kept time while the request is out, then the new time, with no second line', async () => {
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2'));
    serverAnswers.get_customer_statement = { ...statementBody('c2', { asOf: NOW, invoiceTotal: 5555 }) };
    const gate = env.feed.hold(call => call.name === 'get_customer_statement');
    await render(statementFor('c2'));
    expect(await screen.findByTestId('money-age-line')).toHaveTextContent(/9:05\s?am/i);
    await gate.opened;
    expect(screen.getByText('GRN A10')).toBeOnTheScreen();
    await act(async () => { gate.release(); });
    expect(await screen.findByText(/Figures as of 11:00\s?am today/i)).toBeOnTheScreen();
    expect(screen.getAllByTestId('money-age-line')).toHaveLength(1);
    expect(screen.getByText(/5,555\.00/)).toBeOnTheScreen();
  });

  it('DQ3: a failed refresh keeps the figures and the age line, and adds the sentence and Try again; Try again asks again', async () => {
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2'));
    await render(statementFor('c2'));
    expect(await screen.findByText("Couldn't update just now.")).toBeOnTheScreen();
    expect(screen.getByTestId('money-age-line')).toHaveTextContent(/9:05\s?am/i);
    expect(screen.getByText('GRN A10')).toBeOnTheScreen();
    const asked = serverCalls.length;
    serverAnswers.get_customer_statement = statementBody('c2', { asOf: NOW });
    await userEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText(/Figures as of 11:00\s?am today/i)).toBeOnTheScreen();
    expect(serverCalls.length).toBeGreaterThan(asked);
    expect(screen.queryByText("Couldn't update just now.")).not.toBeOnTheScreen();
  });

  it('T9: an access refusal shows the refusal alone: the figures go and nothing stays kept', async () => {
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2'));
    serverAnswers.get_customer_statement = { success: false, error_code: '42501', error: 'Access denied' };
    await render(statementFor('c2'));
    await screen.findByText("Couldn't load the statement");
    expect(screen.queryByText('GRN A10')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('money-age-line')).not.toBeOnTheScreen();
    const db = await copyDb.openCopy((await (require('@/utils/cacheManager') as typeof import('@/utils/cacheManager')).getSessionCacheScope())!);
    expect(await db.all('SELECT kind FROM money_answers')).toEqual([]);
  });
});

describe('T9: an access refusal the server raises', () => {
  it('error.code 42501 with no body shows the refusal alone: the figures go and nothing stays kept', async () => {
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2'));
    serverAnswers.get_customer_statement = () => ({ data: null, error: { code: '42501', message: 'Access denied', details: null, hint: null } });
    await render(statementFor('c2'));
    await screen.findByText("Couldn't load the statement");
    expect(screen.queryByText('GRN A10')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('money-age-line')).not.toBeOnTheScreen();
    const db = await copyDb.openCopy((await (require('@/utils/cacheManager') as typeof import('@/utils/cacheManager')).getSessionCacheScope())!);
    expect(await db.all('SELECT kind FROM money_answers')).toEqual([]);
  });
});

describe('T14: Customer activity with the copy routing', () => {
  const activity = (id = 'c2') => ({
    success: true, data: { summary: { total_customers: 1, total_current_stock: 21, total_grns: 2, total_dispatches: 1, total_invoice_amount: 4321 },
      customers: [{ customer_id: id, customer_name: 'Bhavin Foods', customer_city: 'Fictional City', current_stock: 21, total_grns: 2, total_dispatches: 1, total_invoice_amount: 4321, last_activity_date: '2026-11-24', last_activity_type: 'grn' }] },
  });

  async function openOnlineThenOffline(role: 'admin' | 'staff') {
    await signInAs(role);
    await loadCopy();
    serverAnswers.get_all_customer_activity_summary = activity();
    const first = await render(<ActivityScreen />);
    expect(await screen.findByText('Bhavin Foods')).toBeOnTheScreen();
    const asked = serverCalls.find(c => c.name === 'get_all_customer_activity_summary')!.args;
    await first.unmount();
    forgetQueries();
    serverCalls.length = 0;
    await connection(true);
    return asked as { p_from_date: string; p_to_date: string };
  }

  it.each(['admin', 'staff'] as const)('%s: a key opened online shows offline with its time, as the strip family says', async role => {
    await openOnlineThenOffline(role);
    await render(<ActivityScreen />);
    expect(await screen.findByText('Bhavin Foods')).toBeOnTheScreen();
    expect(screen.getByTestId('money-age-line')).toHaveTextContent(/Figures as of 11:00\s?am today/i);
    expect(screen.queryByText(/Last updated/)).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('PQ4: the next day, the default period is another one, and the last kept answer still shows with its own dates; the chip is disabled', async () => {
    const asked = await openOnlineThenOffline('admin');
    jest.setSystemTime(Date.parse('2026-11-28T05:30:00.000Z'));
    await render(<ActivityScreen />);
    expect(await screen.findByText('Bhavin Foods')).toBeOnTheScreen();
    expect(screen.queryByTestId('customer-activity-not-here')).not.toBeOnTheScreen();
    expect(screen.getByTestId('money-age-strip')).toHaveTextContent(/^These figures are from 27\/11\/26, 11:00\s?am\. Rent has built up since; connect for today.s figures\.$/);
    const chip = screen.getByRole('button', { name: new RegExp(`^${formatCardDate(asked.p_from_date)} – ${formatCardDate(asked.p_to_date)}`) });
    expect(chip).toBeDisabled();
  });

  it('nothing ever kept: "Customer activity isn\'t on this phone yet" and the second line', async () => {
    await loadCopy();
    await connection(true);
    await render(<ActivityScreen />);
    const empty = await screen.findByTestId('customer-activity-not-here');
    expect(within(empty).getByText("Customer activity isn't on this phone yet")).toBeOnTheScreen();
    expect(within(empty).getByText('It will load when you reconnect.')).toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });
});

describe('T15, T16: where today\'s screens stay', () => {
  it('a customer account\'s Statement is kept like a manager\'s (WH-306): offline it draws the kept answer with its time in the strip, and no "As of" line', async () => {
    env.feed.format = 7;
    mockStore.dispatch(setUserProfile({ id: 'profile-2', role: 'customer', name: 'Bhavin Fictional', assignedCustomerIds: ['c2'] } as never) as never);
    await loadCopy();
    await keep('statement', 'c2', statementBody('c2'));
    await connection(true);
    await render(statementFor('c2'));
    expect(await screen.findByTestId('money-age-strip')).toHaveTextContent(/Figures as of 9:05\s?am today/i);
    expect(screen.getByText('GRN A10')).toBeOnTheScreen();
    expect(screen.queryByTestId('money-age-line')).not.toBeOnTheScreen();
    expect(screen.queryByText(/^As of /)).not.toBeOnTheScreen();
    expect(serverCalls).toEqual([]);
  });

  it('a customer account before feed format 7 has no copy: its Statement is a live read, with its own "As of" line and no age', async () => {
    mockStore.dispatch(setUserProfile({ id: 'profile-2', role: 'customer', name: 'Bhavin Fictional', assignedCustomerIds: ['c2'] } as never) as never);
    await engine.startPhoneCopy();
    expect(await engine.syncNow('open')).toBe('off');
    serverAnswers.get_customer_statement = statementBody('c2');
    await render(statementFor('c2'));
    expect(await screen.findByText(/^As of /)).toBeOnTheScreen();
    expect(screen.queryByTestId('money-age-line')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('money-age-strip')).not.toBeOnTheScreen();
  });

  it('feed format below the money step: both screens are as at 423dc73b (the "As of" line, a failure takes the figures away) and keep nothing', async () => {
    env.feed.format = 3;
    await loadCopy();
    serverAnswers.get_customer_dues = duesBody();
    const first = await render(<DuesScreen />);
    expect(await screen.findByText(/^As of /)).toBeOnTheScreen();
    expect(screen.queryByTestId('money-age-line')).not.toBeOnTheScreen();
    await first.unmount();
    serverAnswers = {};
    await render(<DuesScreen />);
    await screen.findByText("Couldn't load customer dues");
    expect(screen.queryByText('Chirag Stores')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('dues-not-here')).not.toBeOnTheScreen();
  });

  it('the feature off: the same', async () => {
    setFacilityCapabilities(SERVER, { sync: false });
    serverAnswers.get_customer_statement = statementBody('c2');
    await render(statementFor('c2'));
    expect(await screen.findByText(/^As of /)).toBeOnTheScreen();
    expect(screen.queryByTestId('money-age-line')).not.toBeOnTheScreen();
  });
});

describe('T17: Gujarati', () => {
  it('the age line, the strip and the three never-fetched titles are Design\'s words, with Gujarati digits', async () => {
    await setLanguage('gu');
    await loadCopy();
    await keep('dues', '', duesBody());
    await keep('statement', 'c2', statementBody('c2', { asOf: YESTERDAY, today: YESTERDAY_DAY }));
    await connection(true);
    const dues = await render(<DuesScreen />);
    const line = await screen.findByTestId('money-age-line');
    expect(line).toHaveTextContent(/^આજે [૦-૯]+:[૦-૯]+.* સુધીના આંકડા$/);
    expect(line).not.toHaveTextContent(/[0-9]/);
    expect(screen.getByText(/૩,૦૦૭\.૦૦/)).toBeOnTheScreen(); // 3,007.00 in Gujarati digits
    await dues.unmount();
    forgetQueries();
    const statement = await render(statementFor('c2'));
    const strip = await screen.findByTestId('money-age-strip');
    expect(strip).toHaveTextContent(/^આ આંકડા .* ના છે\. ત્યાર પછી ભાડું વધ્યું છે; આજના આંકડા માટે ઇન્ટરનેટ જોડો\.$/);
    expect(strip).not.toHaveTextContent(/[0-9]/);
    await statement.unmount();
    forgetQueries();
    await render(statementFor('c3'));
    const none = await screen.findByTestId('statement-not-here');
    expect(within(none).getByText('આ સ્ટેટમેન્ટ હજુ આ ફોનમાં નથી')).toBeOnTheScreen();
    expect(within(none).getByText('ફરી જોડાશો ત્યારે લોડ થશે.')).toBeOnTheScreen();
  });

  it('Customer dues and Customer activity never-fetched titles', async () => {
    await setLanguage('gu');
    await loadCopy();
    await connection(true);
    const dues = await render(<DuesScreen />);
    expect(within(await screen.findByTestId('dues-not-here')).getByText('વેપારીઓની બાકી રકમ હજુ આ ફોનમાં નથી')).toBeOnTheScreen();
    await dues.unmount();
    forgetQueries();
    await render(<ActivityScreen />);
    expect(within(await screen.findByTestId('customer-activity-not-here')).getByText('વેપારીની કામગીરી હજુ આ ફોનમાં નથી')).toBeOnTheScreen();
  });
});
