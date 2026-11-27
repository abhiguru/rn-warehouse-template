/**
 * WH-304 screens for supervisors and administrators (contract product/tech/app-offline-holding-list.md sections 5.1, 5.2,
 * 5.4, 6, 7, 11.5; cases S1-S4, S6-S8, S11 (list, item, strip, reject dialog), S13, S14 (toast); Design offline-capture.md
 * 7.1-7.7, 7.9 DQ1-DQ8, 7.10). Words and testIDs are Design's, word for word.
 *
 * Real: the screens, the holding API module, the phone copy (strip count), the Reports hub's filter, i18n.
 * Faked at the edge: the server's RPC answers (`mockServer`, and `env.feed` for the sync RPCs), the phone's native modules
 * (phoneEnv.ts), the connection, expo-router, the toast host, icons and safe area.
 *
 * Not here: S5 (Correct opens each kind's form in `heldId` mode; slice A-4, waits for WH-161/302/303 forms), the recorder's
 * views (recorderHeld.test.ts), K and T cases (handOver.test.ts, heldStock.test.ts).
 *
 * ===== AGREE WITH DEVELOPMENT (ASSUMED) =====
 *  - Modules: `@/features/holding/HoldingListScreen` and `@/features/holding/HeldItemScreen` default-export the screens
 *    (`app/holding-list.tsx`, `app/held-item/[id].tsx` re-export them); the item screen reads its id from
 *    `useLocalSearchParams().id`. `@/features/holding/HeldStrip` exports `HeldStrip` (or default) with no props.
 *  - The screens call `get_held_items`, `get_held_item` and `decide_held_item` through the app's supabase client `.rpc`
 *    with the argument names of section 2.3 / 2.4 (`p_id`, `p_action`, `p_decision_key`, `p_reason`, `p_body`).
 *  - A row's `what` is the object the phone handed over: `{ key: <offline.unsent.what* key>, params?: {...} }`.
 *  - A held item's field change names the field as the lot row does ("Rack").
 *  - The Holding list is pushed as `/holding-list` and an item as `/held-item/<id>`; after a decision the screen goes back
 *    (`router.back()`).
 *  - `holding.alreadyDecided` is shown as a toast or on screen (either is accepted here).
 *  - Reports row: `REPORTS` gains `holding-list` gated to managers with feature `holdingList`, title "Holding list".
 *  - `backendHasFeature('holdingList')` is on for a current `schemaHead` (`…9999_…`) and off for `…209_…`.
 * ============================================
 */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as engine from '@/features/phone-copy/syncEngine';
import * as copyDb from '@/features/phone-copy/copyDb';
import { env, resetEnv, setReachable } from '@/tests/phoneCopy/phoneEnv';
import { seedWarehouse } from '@/tests/phoneCopy/grnDataset';
import type { FeedRow } from '@/tests/phoneCopy/fakeFeed';
import { resetScreenFocus } from '@/tests/components/focusHarness';
import { saveOperatorServer } from '@/config/operatorServer';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { setFacilityRelease } from '@/config/backendFeatures';
import { reportHubSections } from '@/components/reports/reportHubSections';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';
import themeReducer from '@/store/slices/themeSlice';
import listFilterReducer from '@/store/slices/listFilterSlice';
import reportPrefsReducer from '@/store/slices/reportPrefsSlice';
import { setLanguage } from '@/i18n';
import { showToast } from '@/utils/toast';

type Answer = { data: unknown; error: unknown };
const mockServer = {
  calls: [] as { name: string; args: Record<string, any> }[],
  answers: {} as Record<string, (args: Record<string, any>) => Answer | Promise<Answer>>,
};
let mockRole = 'admin';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.fileSystem());
jest.mock('@/config/supabaseConfig', () => {
  const phoneEnv = require('@/tests/phoneCopy/phoneEnv');
  const base = phoneEnv.mockFactories.supabase();
  const rpc = async (name: string, args: Record<string, any> = {}) => {
    if (name.startsWith('get_sync_')) {
      const answer = await phoneEnv.env.feed.rpc(name, args);
      // A format-5 feed lists `held_items` for staff-side roles, never for a customer account (contract 11.7).
      if (name === 'get_sync_start' && answer.data?.success && phoneEnv.env.feed.format >= 5 && mockRole !== 'customer') {
        return { data: { ...answer.data, entities: [...answer.data.entities, 'held_items'] }, error: null };
      }
      return answer;
    }
    mockServer.calls.push({ name, args });
    const answer = mockServer.answers[name];
    return answer ? answer(args) : { data: null, error: { message: 'No internet connection', code: 'NETWORK' } };
  };
  const client = async () => ({ rpc });
  return { ...base, getAuthenticatedClient: client, getSupabaseClient: client, RequestTimeoutError: class RequestTimeoutError extends Error {} };
});
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined }));
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
  subscribe(listener: () => void) {
    mockNet.listeners.add(listener);
    return () => { mockNet.listeners.delete(listener); };
  },
  set(offline: boolean) {
    mockNet.offline = offline;
    for (const listener of [...mockNet.listeners]) listener();
  },
};
jest.mock('@/hooks/useNetworkStatus', () => {
  const { useSyncExternalStore } = require('react');
  const useOffline = () => useSyncExternalStore(mockNet.subscribe, () => mockNet.offline);
  return { useIsOffline: useOffline, useNetworkStatus: () => ({ isConnected: !useOffline(), type: 'wifi' }) };
});
let mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => ({
  router: mockRouter,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
  Stack: { Screen: require('@/tests/helpers/stackScreenMock').StackScreenMock },
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn(), useHaptics: () => ({ selection: jest.fn(), light: jest.fn(), medium: jest.fn() }) }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn(), TOAST_DURATION_MS: 4000, registerToastHost: () => () => undefined }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));

const SERVER = { origin: 'https://warehouse.example.test', instanceId: 'instance-a', displayName: 'Fictional Cold Store', companyName: 'Fictional Cold Store' };
const HOLDING_HEAD = '00000000009999_wh304_holding_list';
const OLD_HEAD = '00000000000209_lot_quick_change';

// The modules this card adds; loaded per test so a missing module fails each case on its own.
const HoldingListScreen = (): React.ComponentType => require('@/features/holding/HoldingListScreen').default;
const HeldItemScreen = (): React.ComponentType => require('@/features/holding/HeldItemScreen').default;
const HeldStrip = (): React.ComponentType => {
  const mod = require('@/features/holding/HeldStrip');
  return mod.HeldStrip ?? mod.default;
};

const user = userEvent.setup({ delay: 0 });

async function show(Screen: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>);
}

function signIn(role: 'admin' | 'supervisor' | 'staff' | 'customer') {
  mockRole = role;
  const store = configureStore({ reducer: { auth: authReducer, theme: themeReducer, listFilters: listFilterReducer, reportPrefs: reportPrefsReducer } });
  mockStore = store as unknown as typeof mockStore;
  store.dispatch(setUserProfile({ id: `profile-${role}-1`, role, name: 'Neha Fictional' } as never));
}

/** A list row of `get_held_items` (contract 11.5), fictional people and phone. */
const listRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  kind: 'newDispatch',
  what: { key: 'offline.unsent.whatNewDispatch' },
  customer_name: 'asha Traders',
  recorded_by_name: 'Ravi Fictional',
  recorded_at: '2026-11-27T09:00:00+05:30',
  phone: 'Fictional Android phone',
  reason: 'stockShort',
  reason_data: { lines: [{ lot_id: 'l03', item_name: 'Beans', available: 4, requested: 6 }] },
  state: 'held',
  follows: null,
  needs_decision: true,
  can_accept: true,
  decided_by_name: null,
  decided_at: null,
  reject_reason: null,
  result: null,
  ...overrides,
});
/** `get_held_item`'s answer: the list row's keys plus the item's own, at the top level (contract 11.5). */
const itemAnswer = (row: Record<string, unknown>, extra: Record<string, unknown> = {}): Answer => ({
  data: { success: true, ...row, body: {}, accepted_body: null, photos: [], followers: [], accept_possible: false, current: [], ...extra },
  error: null,
});
const listAnswer = (rows: Record<string, unknown>[]): Answer => ({ data: { success: true, rows, total: rows.length }, error: null });
const decideOk = (id: string, state: 'accepted' | 'rejected', result: Record<string, unknown> | null): Answer => ({
  data: { success: true, id, state, result, decided_by_name: 'Neha Fictional', decided_at: '2026-11-27T10:00:00+05:30', now_acceptable: [] },
  error: null,
});
const decideCalls = () => mockServer.calls.filter(c => c.name === 'decide_held_item');
const toasts = () => jest.mocked(showToast).mock.calls.map(call => call[0]);
const rowIds = () => screen.getAllByTestId(/^holding-row-(?!tag-)/).map(el => el.props.testID as string);

async function openItem(row: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  mockParams = { id: String(row.id) };
  mockServer.answers.get_held_item = () => itemAnswer(row, extra);
  await show(HeldItemScreen());
  return screen.findByTestId('held-item-screen');
}

beforeEach(async () => {
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) jest.spyOn(console, level).mockImplementation(() => undefined);
  jest.mocked(showToast).mockClear();
  for (const fn of Object.values(mockRouter)) fn.mockClear();
  mockServer.calls = [];
  mockServer.answers = {};
  mockParams = {};
  resetEnv();
  seedWarehouse();
  mockNet.offline = false;
  resetScreenFocus();
  await saveOperatorServer(SERVER);
  setFacilityCapabilities(SERVER, { sync: true });
  setFacilityRelease(SERVER, { schemaHead: HOLDING_HEAD });
  signIn('admin');
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  engine.setCopyOffline(false);
  await copyDb.eraseCopy();
  await AsyncStorage.clear();
  resetFacilityCapabilities();
  await setLanguage('en');
  jest.restoreAllMocks();
});

describe('S1: the strip on the GRN and Dispatch tabs', () => {
  const managerRow = (id: string, needsDecision = true): FeedRow => ({
    id, row: { id, kind: 'newDispatch', state: 'held', needs_decision: needsDecision, lines: [{ lot_id: 'l03', qty: 1 }] },
  });
  async function loadCopy(rows: FeedRow[]) {
    env.feed.format = 5;
    env.feed.rows.held_items = rows;
    await engine.startPhoneCopy();
    expect(await engine.syncNow('open')).toBe('done');
  }

  it.each([
    ['admin', '1 held item needs a decision', [managerRow('h1')]],
    ['supervisor', '3 held items need a decision', [managerRow('h1'), managerRow('h2'), managerRow('h3'), managerRow('h4', false)]],
  ] as const)('%s: shows "%s" from the copy and opens the Holding list', async (role, text, rows) => {
    signIn(role);
    await loadCopy([...rows]);
    await show(HeldStrip());
    const strip = await screen.findByTestId('holding-strip');
    expect(strip).toHaveTextContent(text);
    await user.press(screen.getByRole('button', { name: new RegExp(`^${text}, opens the Holding list`) }));
    expect(mockRouter.push).toHaveBeenCalledWith('/holding-list');
  });

  it('is hidden with nothing to decide (a photos follower only)', async () => {
    await loadCopy([managerRow('h9', false)]);
    await show(HeldStrip());
    expect(engine.isCopyReadable()).toBe(true);
    expect(screen.queryByTestId('holding-strip')).not.toBeOnTheScreen();
  });

  it('is hidden for staff, whatever the copy holds', async () => {
    signIn('staff');
    await loadCopy([{ id: 'h1', row: { id: 'h1', kind: 'newDispatch', state: 'held', lines: [{ lot_id: 'l03', qty: 1 }] } }]);
    await show(HeldStrip());
    expect(engine.isCopyReadable()).toBe(true);
    expect(screen.queryByTestId('holding-strip')).not.toBeOnTheScreen();
  });

  it('S11: Gujarati, with Gujarati digits for the count', async () => {
    await setLanguage('gu');
    await loadCopy([managerRow('h1'), managerRow('h2'), managerRow('h3')]);
    await show(HeldStrip());
    expect(await screen.findByTestId('holding-strip')).toHaveTextContent('૩ રોકેલી એન્ટ્રી પર નિર્ણય બાકી છે');
  });
});

describe('S2: the Reports tab row', () => {
  const offered = (role: string) =>
    reportHubSections(role, [], [], { sync: true } as never).flatMap(section => section.reports).filter(r => r.id === ('holding-list' as never));

  it.each(['admin', 'supervisor'])('is offered to %s as "Holding list"', role => {
    const [row] = offered(role);
    expect(row).toBeDefined();
    expect(row.title).toBe('Holding list');
  });
  it.each(['staff', 'customer'])('is not offered to %s', role => {
    expect(offered(role)).toHaveLength(0);
  });
  it('is not offered on a server without the holding list (section 7)', () => {
    setFacilityRelease(SERVER, { schemaHead: OLD_HEAD });
    expect(offered('admin')).toHaveLength(0);
  });
});

describe('S3: the Holding list', () => {
  const TAGS: [string, string, Record<string, unknown>][] = [
    ['stockShort', 'Stock short', {}],
    ['noRate', 'No rate', {}],
    ['numberUsed', 'Number used', {}],
    ['numberFormat', 'Wrong number', {}],
    ['deleted', 'Deleted', {}],
    ['locked', 'Locked', {}],
    ['dateRefused', 'Date refused', {}],
    ['duplicate', 'Duplicate?', {}],
    ['belowDispatched', 'Below dispatched', {}],
    ['followsHeld', 'Waits', { follows: 'r-stockShort', can_accept: false }],
    ['moved', 'Moved', { reason_data: { admin_name: 'Neha Fictional', recorder_name: 'Ravi Fictional', moved_at: '2026-11-27T08:00:00+05:30' } }],
    ['other', 'Refused', {}],
  ];

  it('shows the note, each row with what, customer, who and the tag of its reason (all twelve)', async () => {
    mockServer.answers.get_held_items = () => listAnswer(TAGS.map(([reason, , extra]) => listRow(`r-${reason}`, { reason, reason_data: {}, ...extra })));
    await show(HoldingListScreen());
    expect(await screen.findByTestId('holding-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('holding-list-note')).toHaveTextContent('Held items stay here until someone accepts or rejects them.');
    for (const [reason, tag] of TAGS) {
      expect(screen.getByTestId(`holding-row-tag-r-${reason}`)).toHaveTextContent(tag);
    }
    const first = screen.getByTestId('holding-row-r-stockShort');
    expect(first).toHaveTextContent(/New dispatch/);
    expect(first).toHaveTextContent(/asha Traders/);
    expect(first).toHaveTextContent(/Ravi Fictional/);
    expect(first).toHaveTextContent(/Fictional Android phone/);
    expect(mockServer.calls.filter(c => c.name === 'get_held_items')).toHaveLength(1);
  });

  it('lists a follower directly under the item it follows, tagged "Waits"', async () => {
    mockServer.answers.get_held_items = () => listAnswer([
      listRow('a'),
      listRow('b', { reason: 'followsHeld', follows: 'a', can_accept: false, kind: 'photos', what: { key: 'offline.unsent.whatPhotosNewDispatch', params: { count: 1 } } }),
      listRow('c', { reason: 'other', reason_data: {} }),
    ]);
    await show(HoldingListScreen());
    await screen.findByTestId('holding-row-a');
    expect(rowIds()).toEqual(['holding-row-a', 'holding-row-b', 'holding-row-c']);
    expect(screen.getByTestId('holding-row-tag-b')).toHaveTextContent('Waits');
  });

  it('a moved row is "recorded by" the recorder, never the administrator, with the Moved tag', async () => {
    mockServer.answers.get_held_items = () => listAnswer([
      listRow('m', { reason: 'moved', recorded_by_name: 'Ravi Fictional', reason_data: { admin_name: 'Neha Fictional', recorder_name: 'Ravi Fictional', moved_at: '2026-11-27T08:00:00+05:30' } }),
    ]);
    await show(HoldingListScreen());
    const row = await screen.findByTestId('holding-row-m');
    expect(row).toHaveTextContent(/Ravi Fictional/);
    expect(row).not.toHaveTextContent(/Neha Fictional/);
    expect(screen.getByTestId('holding-row-tag-m')).toHaveTextContent('Moved');
  });

  it('opens a held item from its row', async () => {
    mockServer.answers.get_held_items = () => listAnswer([listRow('a')]);
    await show(HoldingListScreen());
    await user.press(await screen.findByTestId('holding-row-a'));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.stringMatching(/^\/held-item\/a$/));
  });

  it('empty: "Nothing held" and its line', async () => {
    mockServer.answers.get_held_items = () => listAnswer([]);
    await show(HoldingListScreen());
    const empty = await screen.findByTestId('holding-empty');
    expect(empty).toHaveTextContent(/Nothing held/);
    expect(empty).toHaveTextContent(/Items the server refuses appear here for a decision\./);
  });

  it('offline: the needs-connection state, and the server is not asked', async () => {
    mockNet.offline = true;
    await setReachable(false);
    engine.setCopyOffline(true);
    mockServer.answers.get_held_items = () => listAnswer([listRow('a')]);
    await show(HoldingListScreen());
    expect(await screen.findByTestId('holding-needs-connection')).toBeOnTheScreen();
    expect(screen.queryByTestId('holding-row-a')).not.toBeOnTheScreen();
    expect(mockServer.calls.filter(c => c.name === 'get_held_items')).toHaveLength(0);
  });

  it('S11: Gujarati words of the note, tags and empty state', async () => {
    await setLanguage('gu');
    mockServer.answers.get_held_items = () => listAnswer([
      listRow('a'),
      listRow('b', { reason: 'followsHeld', follows: 'a', can_accept: false }),
      listRow('c', { reason: 'moved', reason_data: { admin_name: 'Neha Fictional', recorder_name: 'Ravi Fictional', moved_at: '2026-11-27T08:00:00+05:30' } }),
      listRow('d', { reason: 'other', reason_data: {} }),
    ]);
    await show(HoldingListScreen());
    expect(await screen.findByTestId('holding-list-note')).toHaveTextContent('કોઈ સ્વીકારે કે નકારે ત્યાં સુધી રોકેલી એન્ટ્રી અહીં રહે છે.');
    expect(screen.getByTestId('holding-row-tag-a')).toHaveTextContent('સ્ટોક ઓછો');
    expect(screen.getByTestId('holding-row-tag-b')).toHaveTextContent('રાહ જુએ છે');
    expect(screen.getByTestId('holding-row-tag-c')).toHaveTextContent('ખસેડેલી');
    expect(screen.getByTestId('holding-row-tag-d')).toHaveTextContent('નકાર્યું');
  });

  it('S11: Gujarati empty state', async () => {
    await setLanguage('gu');
    mockServer.answers.get_held_items = () => listAnswer([]);
    await show(HoldingListScreen());
    const empty = await screen.findByTestId('holding-empty');
    expect(empty).toHaveTextContent(/કંઈ રોકેલું નથી/);
    expect(empty).toHaveTextContent(/સર્વર જે નકારે તે નિર્ણય માટે અહીં આવે છે\./);
  });
});

describe('S4: the Held item', () => {
  it('shows the header facts, the reason with its figures and the fix hint; no Accept while accept_possible is false', async () => {
    await openItem(listRow('h1'), { accept_possible: false });
    expect(screen.getByText('Held item')).toBeOnTheScreen();
    for (const fact of ['asha Traders', 'Ravi Fictional', 'Fictional Android phone']) {
      expect(screen.getAllByText(new RegExp(fact)).length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId('held-item-reason')).toHaveTextContent(/has 4 left; this dispatch takes 6\./);
    expect(screen.getByTestId('held-item-hint')).toHaveTextContent('Correct the quantity, or reject.');
    expect(screen.getByTestId('held-item-record')).toBeOnTheScreen();
    expect(screen.queryByTestId('held-item-accept')).not.toBeOnTheScreen();
    expect(screen.getByTestId('held-item-correct')).toBeEnabled();
    expect(screen.getByTestId('held-item-reject')).toBeEnabled();
    expect(mockServer.calls.find(c => c.name === 'get_held_item')?.args).toMatchObject({ p_id: 'h1' });
  });

  it('offers Accept when accept_possible is true (the cause is gone)', async () => {
    await openItem(listRow('h1', { reason: 'noRate', reason_data: {} }), { accept_possible: true });
    expect(screen.getByTestId('held-item-accept')).toBeEnabled();
  });

  it('a missing figure leaves its clause out: no placeholder, "undefined" or "unknown"', async () => {
    await openItem(listRow('h1', { reason: 'deleted', reason_data: {} }));
    const reason = screen.getByTestId('held-item-reason');
    expect(reason).not.toHaveTextContent(/\{\{|\}\}|undefined|unknown|null|NaN/);
    expect(screen.getByTestId('held-item-hint')).toHaveTextContent('Reject.');
  });

  it('a follower of a held item: Accept and Correct disabled under the follows line, Reject enabled', async () => {
    await openItem(listRow('f1', { reason: 'followsHeld', follows: 'h1', can_accept: false, kind: 'lotChange', what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } } }), { accept_possible: false });
    expect(screen.getByTestId('held-item-follows')).toHaveTextContent('Decide the earlier item, then Accept or Reject this one.');
    expect(screen.getByTestId('held-item-accept')).toBeDisabled();
    expect(screen.getByTestId('held-item-correct')).toBeDisabled();
    expect(screen.getByTestId('held-item-reject')).toBeEnabled();
  });

  it('a photos item has no Correct', async () => {
    await openItem(listRow('p1', { kind: 'photos', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatPhotos', params: { count: 2, number: 'B1' } } }), { accept_possible: true });
    expect(screen.queryByTestId('held-item-correct')).not.toBeOnTheScreen();
    expect(screen.getByTestId('held-item-accept')).toBeEnabled();
    expect(screen.getByTestId('held-item-reject')).toBeEnabled();
  });

  it('a decided item is read-only: no Accept, Correct or Reject', async () => {
    await openItem(listRow('d1', { state: 'rejected', decided_by_name: 'Meera Fictional', decided_at: '2026-11-27T10:00:00+05:30', reject_reason: 'Goods did not leave' }));
    for (const id of ['held-item-accept', 'held-item-correct', 'held-item-reject']) expect(screen.queryByTestId(id)).not.toBeOnTheScreen();
  });

  it('S11: Gujarati action words and the stock-short tag words', async () => {
    await setLanguage('gu');
    await openItem(listRow('h1', { reason: 'noRate', reason_data: {} }), { accept_possible: true });
    expect(screen.getByTestId('held-item-accept')).toHaveTextContent('સ્વીકારો');
    expect(screen.getByTestId('held-item-correct')).toHaveTextContent('સુધારો');
    expect(screen.getByTestId('held-item-reject')).toHaveTextContent('નકારો');
    expect(screen.getByText('રોકેલી એન્ટ્રી')).toBeOnTheScreen();
  });
});

describe('S6: Reject', () => {
  it('asks for a reason (Reject disabled while empty), sends it, toasts "Rejected" and goes back', async () => {
    await openItem(listRow('h1'));
    mockServer.answers.decide_held_item = () => decideOk('h1', 'rejected', null);
    await user.press(screen.getByTestId('held-item-reject'));

    const dialog = await screen.findByTestId('held-reject-dialog');
    expect(within(dialog).getByText('Reject this item?')).toBeOnTheScreen();
    expect(within(dialog).getByText('Why? The person who recorded it will see this.')).toBeOnTheScreen();
    const confirm = within(dialog).getByRole('button', { name: 'Reject' });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByTestId('held-reject-reason'), 'Goods did not leave');
    expect(within(screen.getByTestId('held-reject-dialog')).getByRole('button', { name: 'Reject' })).toBeEnabled();
    await user.press(within(screen.getByTestId('held-reject-dialog')).getByRole('button', { name: 'Reject' }));

    expect(decideCalls()).toHaveLength(1);
    expect(decideCalls()[0].args).toMatchObject({ p_id: 'h1', p_action: 'reject', p_reason: 'Goods did not leave' });
    expect(typeof decideCalls()[0].args.p_decision_key).toBe('string');
    expect(toasts()).toContain('Rejected');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('S11: the reject dialog in Gujarati', async () => {
    await setLanguage('gu');
    await openItem(listRow('h1'));
    await user.press(screen.getByTestId('held-item-reject'));
    const dialog = await screen.findByTestId('held-reject-dialog');
    expect(within(dialog).getByText('આ એન્ટ્રી નકારશો?')).toBeOnTheScreen();
    expect(within(dialog).getByText('શા માટે? નોંધનાર વ્યક્તિ આ જોશે.')).toBeOnTheScreen();
  });
});

describe('S7: a double tap on Accept is one decision', () => {
  it('sends decide_held_item once, and the toast names the new number', async () => {
    await openItem(listRow('h1', { reason: 'noRate', reason_data: {} }), { accept_possible: true });
    let answer!: (a: Answer) => void;
    mockServer.answers.decide_held_item = () => new Promise<Answer>(resolve => { answer = resolve; });
    const accept = screen.getByTestId('held-item-accept');
    await user.press(accept);
    await user.press(accept);
    await act(async () => { answer(decideOk('h1', 'accepted', { dispatch_id: 'd-77', disp_no: 'D-77' })); });

    expect(decideCalls()).toHaveLength(1);
    expect(decideCalls()[0].args).toMatchObject({ p_id: 'h1', p_action: 'accept' });
    expect(decideCalls()[0].args.p_body ?? null).toBeNull();
    expect(toasts()).toContain('Accepted as D-77');
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('S8: another manager decided it meanwhile', () => {
  it.each([
    ['accepted', 'Meera Fictional already accepted this item.'],
    ['rejected', 'Meera Fictional already rejected this item.'],
  ])('%s: says so in that form and goes back to the list', async (state, words) => {
    await openItem(listRow('h1', { reason: 'noRate', reason_data: {} }), { accept_possible: true });
    mockServer.answers.decide_held_item = () => ({
      data: { success: false, error_code: 'WH409', reason: 'HELD_ALREADY_DECIDED', error: 'already decided', message: 'already decided', state, decided_by_name: 'Meera Fictional', decided_at: '2026-11-27T09:30:00+05:30' },
      error: null,
    });
    await user.press(screen.getByTestId('held-item-accept'));
    const said = toasts().includes(words) || screen.queryByText(words) !== null;
    expect(said).toBe(true);
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('S13: a held field change shows the server\'s present value', () => {
  it('"Now on the server: Rack D-4" for a held rack change to C-2', async () => {
    await openItem(
      listRow('lc1', { kind: 'lotChange', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } } }),
      { accept_possible: true, body: { lotId: 'l06', grnId: 'g-B1', recordedAt: '2026-11-27T09:00:00+05:30', changes: { rack: { from: 'B-2', to: 'C-2' } } }, current: [{ field: 'rack', line_ref: 'l06', current: 'D-4', held: 'C-2' }] },
    );
    expect(screen.getByTestId('held-item-current')).toHaveTextContent('Now on the server: Rack D-4');
  });

  it('S11: in Gujarati', async () => {
    await setLanguage('gu');
    await openItem(
      listRow('lc1', { kind: 'lotChange', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } } }),
      { accept_possible: true, current: [{ field: 'rack', line_ref: 'l06', current: 'D-4', held: 'C-2' }] },
    );
    expect(screen.getByTestId('held-item-current')).toHaveTextContent(/^હાલ સર્વર પર: .+ D-4$/);
  });
});

describe('S14: accepting a field change', () => {
  it('toasts "Accepted: GRN B1 updated" from result.gr_no', async () => {
    await openItem(
      listRow('lc1', { kind: 'lotChange', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } } }),
      { accept_possible: true, current: [{ field: 'rack', line_ref: 'l06', current: 'D-4', held: 'C-2' }] },
    );
    mockServer.answers.decide_held_item = () => decideOk('lc1', 'accepted', { grn_id: 'g-B1', gr_no: 'B1' });
    await user.press(screen.getByTestId('held-item-accept'));
    expect(toasts()).toContain('Accepted: GRN B1 updated');
    expect(toasts()).not.toContain('Accepted as B1');
  });
});
