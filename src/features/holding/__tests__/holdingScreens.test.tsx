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
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
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
/** What the screen last asked of its stack header (title, whether it is shown). */
// The Jest environment's font scale is 2 (buttons stack); a case sets 1 for the single row of buttons.
const mockWindow = { fontScale: 2 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 360, height: 800, scale: 2, fontScale: mockWindow.fontScale }),
}));
const mockHeader: { options: Record<string, unknown> | undefined } = { options: undefined };
const mockStorage = { sign: (path: string): { data: { signedUrl: string } | null; error: unknown } => ({ data: { signedUrl: `https://files.example.test/${path}` }, error: null }) };
const mockGrn = { answer: (_grnId: string): unknown => ({ success: false, message: 'none', error: 'none' }) };

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
  const client = async () => ({ rpc, storage: { from: () => ({ createSignedUrl: async (path: string) => mockStorage.sign(path) }) } });
  return { ...base, getAuthenticatedClient: client, getSupabaseClient: client, getSupabaseWithJWT: client, RequestTimeoutError: class RequestTimeoutError extends Error {} };
});
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => ({ ...require('@/tests/phoneCopy/phoneEnv').mockFactories.lan(), setLanContext: () => undefined, viaCurrentPath: (url: string) => url }));
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
  Stack: {
    Screen: (props: { options?: Record<string, unknown> }) => {
      mockHeader.options = props.options;
      return require('@/tests/helpers/stackScreenMock').StackScreenMock(props);
    },
  },
  useFocusEffect: require('@/tests/components/focusHarness').useFocusEffect,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn(), useHaptics: () => ({ selection: jest.fn(), light: jest.fn(), medium: jest.fn() }) }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn(), TOAST_DURATION_MS: 4000, registerToastHost: () => () => undefined }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
// The LAN-path link rewrite is lanTransport's own (and tested there); a signed link is shown as it is.
jest.mock('@/hooks/useLanStatus', () => ({ ...jest.requireActual('@/hooks/useLanStatus'), useViaCurrentPath: (url: string) => url }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/services/grn-detail-service', () => ({ ...jest.requireActual('@/services/grn-detail-service'), getGRNDetails: async (grnId: string) => mockGrn.answer(grnId) }));

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

/** A list row of `get_held_items` (contract 11.5), fictional people and phone (GRN-only under WH-381). */
const listRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  kind: 'newGrn',
  what: { key: 'offline.unsent.whatNewGrn' },
  customer_name: 'asha Traders',
  recorded_by_name: 'Ravi Fictional',
  recorded_at: '2026-11-27T09:00:00+05:30',
  phone: 'Fictional Android phone',
  reason: 'noRate',
  reason_data: { lines: [{ item_name: 'Beans' }] },
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
  mockStorage.sign = path => ({ data: { signedUrl: `https://files.example.test/${path}` }, error: null });
  mockGrn.answer = () => ({ success: false, message: 'none', error: 'none' });
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
  mockWindow.fontScale = 2;
  jest.restoreAllMocks();
});

describe('S1: the strip on the GRN tab (WH-381: GRN-only)', () => {
  const managerRow = (id: string, needsDecision = true, kind = 'newGrn'): FeedRow => ({
    id, row: { id, kind, state: 'held', needs_decision: needsDecision, lines: null },
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

  it('WH-381: historical newDispatch rows do not count on HeldStrip', async () => {
    await loadCopy([managerRow('h-disp', true, 'newDispatch')]);
    await show(HeldStrip());
    expect(engine.isCopyReadable()).toBe(true);
    expect(screen.queryByTestId('holding-strip')).not.toBeOnTheScreen();
  });

  it('is hidden with nothing to decide (a photos follower only)', async () => {
    await loadCopy([managerRow('h9', false)]);
    await show(HeldStrip());
    expect(engine.isCopyReadable()).toBe(true);
    expect(screen.queryByTestId('holding-strip')).not.toBeOnTheScreen();
  });

  it('is hidden for staff, whatever the copy holds', async () => {
    signIn('staff');
    await loadCopy([{ id: 'h1', row: { id: 'h1', kind: 'newGrn', state: 'held', lines: null } }]);
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
  it('is not offered where the facility keeps no phone copy (no sync)', () => {
    const rows = reportHubSections('admin', [], [], { sync: false } as never).flatMap(section => section.reports);
    expect(rows.find(r => r.id === ('holding-list' as never))).toBeUndefined();
  });
  it('Gujarati: the row\'s second line is "નિર્ણય બાકી હોય તેવી રોકેલી એન્ટ્રી"', async () => {
    await setLanguage('gu');
    const [row] = offered('admin');
    expect(row.description).toBe('નિર્ણય બાકી હોય તેવી રોકેલી એન્ટ્રી');
  });
  it('English: the row\'s second line is "Refused items waiting for a decision"', () => {
    expect(offered('admin')[0].description).toBe('Refused items waiting for a decision');
  });
  it('is not offered on a server without the holding list (section 7)', () => {
    setFacilityRelease(SERVER, { schemaHead: OLD_HEAD });
    expect(offered('admin')).toHaveLength(0);
  });
});

describe('S3: the Holding list', () => {
  const TAGS: [string, string, Record<string, unknown>][] = [
    ['noRate', 'No rate', {}],
    ['numberUsed', 'Number used', {}],
    ['numberFormat', 'Wrong number', {}],
    ['deleted', 'Deleted', {}],
    ['locked', 'Locked', {}],
    ['dateRefused', 'Date refused', {}],
    ['duplicate', 'Duplicate?', {}],
    ['belowDispatched', 'Below dispatched', {}],
    ['followsHeld', 'Waits', { follows: 'r-noRate', can_accept: false }],
    ['moved', 'Moved', { reason_data: { admin_name: 'Neha Fictional', recorder_name: 'Ravi Fictional', moved_at: '2026-11-27T08:00:00+05:30' } }],
    ['other', 'Refused', {}],
  ];

  it('shows the note, each row with what, customer, who and the tag of its reason (all eleven GRN reasons)', async () => {
    mockServer.answers.get_held_items = () => listAnswer(TAGS.map(([reason, , extra]) => listRow(`r-${reason}`, { reason, reason_data: {}, ...extra })));
    await show(HoldingListScreen());
    expect(await screen.findByTestId('holding-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('holding-list-note')).toHaveTextContent('Held items stay here until someone accepts or rejects them.');
    for (const [reason, tag] of TAGS) {
      expect(screen.getByTestId(`holding-row-tag-r-${reason}`)).toHaveTextContent(tag);
    }
    const first = screen.getByTestId('holding-row-r-noRate');
    expect(first).toHaveTextContent(/New GRN/);
    expect(first).toHaveTextContent(/asha Traders/);
    expect(first).toHaveTextContent(/Ravi Fictional/);
    expect(first).toHaveTextContent(/Fictional Android phone/);
    expect(mockServer.calls.filter(c => c.name === 'get_held_items')).toHaveLength(1);
  });

  it('lists a follower directly under the item it follows, tagged "Waits"', async () => {
    mockServer.answers.get_held_items = () => listAnswer([
      listRow('a'),
      listRow('b', { reason: 'followsHeld', follows: 'a', can_accept: false, kind: 'photos', what: { key: 'offline.unsent.whatPhotosNewGrn', params: { count: 1 } } }),
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
    expect(screen.getByTestId('holding-row-tag-a')).toHaveTextContent('દર નથી');
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
    await openItem(listRow('h1', { kind: 'grnEdit', reason: 'belowDispatched', reason_data: { requested: 6, dispatched_qty: 10 } }), { accept_possible: false });
    expect(screen.getByText('Held item')).toBeOnTheScreen();
    for (const fact of ['asha Traders', 'Ravi Fictional', 'Fictional Android phone']) {
      expect(screen.getAllByText(new RegExp(fact)).length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId('held-item-reason')).toHaveTextContent(/6 is less than the 10 already dispatched from this lot\./);
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

describe('S4 wording (Design 7.11a (c)): the Held item\'s header facts are labelled', () => {
  const facts: [string, string, string][] = [
    ['Customer', 'વેપારી', 'asha Traders'],
    ['Recorded by', 'નોંધનાર', 'Ravi Fictional'],
    ['Phone', 'ફોન', 'Fictional Android phone'],
  ];

  it('English: Customer, Recorded by, Recorded at and Phone, each label with its value', async () => {
    await openItem(listRow('h1'), { accept_possible: false });
    for (const [label, , value] of facts) {
      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.getByText(value)).toBeOnTheScreen();
    }
    expect(screen.getByText('Recorded at')).toBeOnTheScreen();
  });

  it('Gujarati: વેપારી, નોંધનાર, નોંધ્યાનો સમય and ફોન', async () => {
    await setLanguage('gu');
    await openItem(listRow('h1'), { accept_possible: false });
    for (const [, label, value] of facts) {
      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.getByText(value)).toBeOnTheScreen();
    }
    expect(screen.getByText('નોંધ્યાનો સમય')).toBeOnTheScreen();
  });
});

describe('WH-304 Design findings on the Held item page (7.3, 7.5, 7.11f)', () => {
  const grnBody = (items: unknown) => ({ v: 1, args: { p_customer_id: 'c1', p_items: items } });

  it('finding 2: the stack header is shown, titled "Held item", with Back that goes back', async () => {
    await openItem(listRow('h1'), { accept_possible: false });
    expect(mockHeader.options).toMatchObject({ title: 'Held item', headerShown: true });
    await user.press(screen.getByRole('button', { name: /Back/ }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('finding 2, Gujarati: the header title is "રોકેલી એન્ટ્રી"', async () => {
    await setLanguage('gu');
    await openItem(listRow('h1'), { accept_possible: false });
    expect(mockHeader.options).toMatchObject({ title: 'રોકેલી એન્ટ્રી', headerShown: true });
  });

  it('finding 3: a held new GRN lists its lines, with mark and rack when it has them and without when not', async () => {
    await openItem(
      listRow('h1', { reason: 'duplicate', reason_data: {} }),
      { accept_possible: true, body: grnBody([{ item_name: 'Apple', qty: 1, packaging: 'bag', package_mark: 'ZZ-1', rack: 'D-4' }, { item_name: 'Beans', qty: 2, packaging: 'bag' }]) }
    );
    const record = screen.getByTestId('held-item-record');
    expect(within(record).getByText('Apple, ZZ-1, 1 Bag, Rack D-4')).toBeOnTheScreen();
    expect(within(record).getByText('Beans, 2 Bag')).toBeOnTheScreen();
  });

  it('finding 3: a malformed p_items (missing, not an array, odd fields) shows an empty record and does not crash', async () => {
    for (const body of [{ v: 1, args: {} }, { v: 1, args: { p_items: 'Apple' } }, { v: 1, args: { p_items: [null, 5, { qty: {} }, { item_name: 'Apple', qty: [], rack: 7 }] } }]) {
      mockServer.calls = [];
      await openItem(listRow('h1'), { accept_possible: false, body });
      expect(screen.getByTestId('held-item-record')).toBeOnTheScreen();
      expect(screen.getByTestId('held-item-reject')).toBeEnabled();
      await screen.unmount();
    }
  });

  it('finding 5, large text: the buttons stack, each the full width', async () => {
    await openItem(listRow('h1', { reason: 'duplicate', reason_data: {} }), { accept_possible: true });
    for (const id of ['held-item-reject', 'held-item-correct', 'held-item-accept']) {
      expect(StyleSheet.flatten(screen.getByTestId(id).props.style)).toMatchObject({ width: '100%' });
    }
  });

  it('finding 5: the three buttons share the full width of the bar (each grows)', async () => {
    mockWindow.fontScale = 1;
    await openItem(listRow('h1', { reason: 'duplicate', reason_data: {} }), { accept_possible: true });
    for (const id of ['held-item-reject', 'held-item-correct', 'held-item-accept']) {
      expect(StyleSheet.flatten(screen.getByTestId(id).props.style)).toMatchObject({ flex: 1 });
    }
  });

  it('finding 4: a duplicate with the other GRN names it and its day, and the hint says which to open', async () => {
    await openItem(
      listRow('h1', { reason: 'duplicate', reason_data: { existing_number: 'A-3', existing_created_at: '2026-11-27T03:20:00+00:00' } }),
      { accept_possible: true }
    );
    expect(screen.getByTestId('held-item-reason')).toHaveTextContent('GRN A-3 for the same customer, item and quantity was saved on 27/11/26.');
    expect(screen.getByTestId('held-item-hint')).toHaveTextContent('Open GRN A-3 to compare; Accept if both are real, or reject.');
  });

  it('finding 4, 7.11f: a duplicate missing either field reads the no-reference words', async () => {
    await openItem(listRow('h1', { reason: 'duplicate', reason_data: { existing_number: 'A-3' } }), { accept_possible: true });
    expect(screen.getByTestId('held-item-reason')).toHaveTextContent('A GRN for the same customer, item and quantity already exists.');
    expect(screen.getByTestId('held-item-hint')).toHaveTextContent('Look for it in the GRN list to compare; Accept if both are real, or reject.');
  });

  it('finding 4, Gujarati: the date in Gujarati digits, the GRN number in 0-9', async () => {
    await setLanguage('gu');
    await openItem(
      listRow('h1', { reason: 'duplicate', reason_data: { existing_number: 'A-3', existing_created_at: '2026-11-27T03:20:00+00:00' } }),
      { accept_possible: true }
    );
    expect(screen.getByTestId('held-item-reason')).toHaveTextContent('૨૭/૧૧/૨૬ એ એ જ વેપારી, આઇટમ અને જથ્થા માટે આવક પાવતી A-3 સાચવાઈ છે.');
  });

  it('finding 1: a user agent as the phone is left out of the page, with no "Phone" label (no okhttp text anywhere)', async () => {
    await openItem(listRow('h1', { phone: 'okhttp/4.9.2' }), { accept_possible: false });
    expect(screen.queryByText('Phone')).not.toBeOnTheScreen();
    expect(screen.queryByText(/okhttp/)).not.toBeOnTheScreen();
  });

  it('finding 1: the server\'s device_name is the Phone fact, even beside a user agent in phone', async () => {
    await openItem(listRow('h1', { phone: 'okhttp/4.9.2', device_name: 'Fictional Android phone' }), { accept_possible: false });
    expect(screen.getByText('Phone')).toBeOnTheScreen();
    expect(screen.getByText('Fictional Android phone')).toBeOnTheScreen();
  });

  it('finding 1: the Holding list footnote of a row with a user agent is "name · time" with no phone', async () => {
    mockServer.answers.get_held_items = () => listAnswer([listRow('h1', { phone: 'Mozilla/5.0 (Linux; Android 14)' })]);
    await show(HoldingListScreen());
    const row = await screen.findByTestId('holding-row-h1');
    expect(row).toHaveTextContent(/Ravi Fictional · [^·]+$/);
    expect(screen.queryByText(/Mozilla/)).not.toBeOnTheScreen();
  });
});

describe('A-4: Correct on the Held item', () => {
  const lotChange = (overrides: Record<string, unknown> = {}) =>
    listRow('lc1', { kind: 'lotChange', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } }, ...overrides });
  const lotBody = { lotId: 'l06', grnId: 'g-B1', recordedAt: '2026-11-27T09:00:00+05:30', changes: { rack: { from: 'B-2', to: 'C-2' } } };
  const open = (row: Record<string, unknown>) => openItem(row, { accept_possible: false, body: lotBody, current: [{ field: 'rack', line_ref: 'l06', current: 'D-4', held: 'C-2' }] });
  const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it.each([
    ['newGrn', '/grn-edit/[id]/step1'],
    ['grnEdit', '/grn-edit/[id]/step1'],
  ])('%s: Correct opens the kind\'s own form on the held id, and asks the server for nothing', async (kind, pathname) => {
    await openItem(listRow('h9', { kind }), { accept_possible: false });
    await user.press(screen.getByTestId('held-item-correct'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname, params: { id: 'held-h9' } });
    expect(decideCalls()).toHaveLength(0);
  });

  it('WH-381: newDispatch has no Correct button', async () => {
    await openItem(listRow('h9', { kind: 'newDispatch', reason: 'other', reason_data: {} }), { accept_possible: false });
    expect(screen.queryByTestId('held-item-correct')).not.toBeOnTheScreen();
  });

  it('photos: there is no Correct button', async () => {
    await openItem(listRow('h9', { kind: 'photos', reason: 'other', reason_data: {} }), { accept_possible: true });
    expect(screen.queryByTestId('held-item-correct')).not.toBeOnTheScreen();
  });

  it('grnEdit: Correct is offered, next to Accept and Reject', async () => {
    await openItem(listRow('h9', { kind: 'grnEdit', reason: 'other', reason_data: {} }), { accept_possible: true });
    expect(screen.getByTestId('held-item-correct')).toBeOnTheScreen();
  });

  it('a field change: Correct opens the sheet with the held value and "Accept with changes"; Save decides with the corrected body, once', async () => {
    await open(lotChange());
    await user.press(screen.getByTestId('held-item-correct'));
    expect(await screen.findByTestId('quick-change-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('quick-change-save')).toHaveTextContent('Accept with changes');
    expect(screen.getByLabelText('Rack')).toHaveDisplayValue('C-2');

    await user.clear(screen.getByLabelText('Rack'));
    await user.type(screen.getByLabelText('Rack'), 'D-9');
    mockServer.answers.decide_held_item = () => decideOk('lc1', 'accepted', { grn_id: 'g-B1', gr_no: 'B1' });
    await user.press(screen.getByTestId('quick-change-save'));

    expect(decideCalls()).toHaveLength(1);
    expect(decideCalls()[0].args).toMatchObject({
      p_id: 'lc1',
      p_action: 'accept',
      p_decision_key: expect.stringMatching(KEY),
      p_body: { lotId: 'l06', grnId: 'g-B1', changes: { rack: { to: 'D-9', from: 'B-2' } } },
    });
    expect(mockServer.calls.map(c => c.name)).not.toEqual(expect.arrayContaining(['save_grn', 'update_grn', 'save_lot_change']));
    expect(toasts()).toContain('Accepted: GRN B1 updated');
  });

  it('a refused corrected accept tells the reason and its fix on the sheet, and the item stays held', async () => {
    await open(lotChange());
    await user.press(screen.getByTestId('held-item-correct'));
    await user.clear(await screen.findByLabelText('Rack'));
    await user.type(screen.getByLabelText('Rack'), 'D-9');
    mockServer.answers.decide_held_item = () => ({
      data: { success: false, error_code: 'WH409', reason: 'LOT_NOT_FOUND', error: 'gone', message: 'gone', lot_ids: ['l06'] },
      error: null,
    });
    await user.press(screen.getByTestId('quick-change-save'));

    const refused = await screen.findByTestId('quick-change-refused');
    expect(refused).toHaveTextContent('GRN B1 was deleted. Reject.');
    expect(screen.getByTestId('quick-change-sheet')).toBeOnTheScreen();
    expect(toasts()).toHaveLength(0);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('A-6: the photos of a held item on the Held item page', () => {
  const photo = (id: string, extra: Record<string, unknown> = {}) => ({ client_photo_id: id, role: 'header', path: `held/h1/${id}.jpg`, state: 'confirmed', line_ref: null, ...extra });

  it('draws a tile for each confirmed photo, read only, from a link signed by storage', async () => {
    await openItem(listRow('h1'), { photos: [photo('p1'), photo('p2')] });
    const grid = await screen.findByTestId('held-item-photos');
    expect(within(grid).getByTestId('held-photo-p1')).toBeOnTheScreen();
    expect(within(grid).getByTestId('held-photo-p2')).toBeOnTheScreen();
    expect(within(grid).getByTestId('held-photo-p1')).toHaveAccessibleName('GRN photo');
  });

  it('a photo storage will not sign is the "Photo needs a connection" tile', async () => {
    mockStorage.sign = () => ({ data: null, error: { message: 'offline' } });
    await openItem(listRow('h1'), { photos: [photo('p1')] });
    expect(await screen.findByTestId('held-photo-needs-connection-p1', {}, { timeout: 3000 })).toHaveTextContent('Photo needs a connection');
  });

  it('a photo the recorder\'s phone reported missing is the "Photo missing" tile, with no file asked for', async () => {
    const signed: string[] = [];
    mockStorage.sign = path => { signed.push(path); return { data: { signedUrl: `https://files.example.test/${path}` }, error: null }; };
    await openItem(listRow('h1'), { photos: [photo('p1'), photo('p2', { state: 'missing', path: null })] });
    expect(await screen.findByTestId('held-photo-missing-p2')).toHaveTextContent('Photo missing');
    expect(screen.getByTestId('held-photo-p1')).toBeOnTheScreen();
    expect(signed).toEqual(['held/h1/p1.jpg']);
  });

  it('Gujarati: "ફોટો ખૂટે છે"', async () => {
    await setLanguage('gu');
    await openItem(listRow('h1'), { photos: [photo('p2', { state: 'missing', path: null })] });
    expect(await screen.findByTestId('held-photo-missing-p2')).toHaveTextContent('ફોટો ખૂટે છે');
  });

  it('an item with no photos draws no grid', async () => {
    await openItem(listRow('h1'), { photos: [] });
    expect(screen.queryByTestId('held-item-photos')).not.toBeOnTheScreen();
  });
});

describe('DQ13 (Design 7.11d): the Held item page of a held GRN edit', () => {
  const GRN = 'g-B1';
  const editRow = () => listRow('ge1', { kind: 'grnEdit', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['customer_id', 'linesAdded'] } } });
  const editBody = (extra: Record<string, unknown> = {}) => ({
    v: 1, grnId: GRN, loadedAt: '2026-11-27T08:00:00Z', recordedAt: '2026-11-27T09:00:00+05:30',
    header: { customer_id: { from: { id: 'c1', name: 'asha Traders' }, to: { id: 'c2', name: 'Beta Traders' } } },
    linesAdded: [{ clientLineId: 'n1', item_id: 'i9', item_name: 'Potato', packaging: 'Bag', qty: 40, weight: 0, rack: null, package_mark: 'AB-12' }],
    linesRemoved: [{ lotId: 'l07', item_name: 'Rice', qty: 30 }],
    ...extra,
  });
  const open = (body: unknown = editBody()) => openItem(editRow(), { accept_possible: true, body });

  it('lists the lines added and removed under their titles, "item, mark, quantity", and a changed header field by its form label', async () => {
    mockGrn.answer = () => ({ success: true, data: { grn: { items: [{ id: 'l07', item_name: 'Rice', qty: 30, packaging: 'Bag', package_mark: 'K-1' }] } } });
    await open();
    const added = screen.getByTestId('held-item-linesAdded');
    expect(within(added).getByRole('header')).toHaveTextContent('Lines added');
    expect(within(added).getByText(/^Potato, AB-12, 40 /)).toBeOnTheScreen();
    const removed = screen.getByTestId('held-item-linesRemoved');
    expect(within(removed).getByRole('header')).toHaveTextContent('Lines removed');
    expect(within(removed).getByText(/^Rice, K-1, 30 /)).toBeOnTheScreen();
    expect(within(screen.getByTestId('held-item-record')).getByText('Customer Beta Traders')).toBeOnTheScreen();
  });

  it('a removed line the server still holds with the same quantity has no "Now on the server" line, and an added line never has one', async () => {
    mockGrn.answer = () => ({ success: true, data: { grn: { items: [{ id: 'l07', item_name: 'Rice', qty: 30, packaging: 'Bag', package_mark: null }] } } });
    await open();
    await screen.findByTestId('held-item-linesRemoved');
    expect(screen.queryByTestId('held-item-line-current')).not.toBeOnTheScreen();
  });

  it('a removed line whose quantity differs on the server: "Now on the server: Rice 35 …"', async () => {
    mockGrn.answer = () => ({ success: true, data: { grn: { items: [{ id: 'l07', item_name: 'Rice', qty: 35, packaging: 'Bag', package_mark: null }] } } });
    await open();
    expect(await screen.findByTestId('held-item-line-current')).toHaveTextContent(/^Now on the server: Rice 35 /);
  });

  it('a removed line that is gone from the server: "Already removed on the server"', async () => {
    mockGrn.answer = () => ({ success: true, data: { grn: { items: [{ id: 'l99', item_name: 'Beans', qty: 1, packaging: 'Bag', package_mark: null }] } } });
    await open();
    expect(await screen.findByTestId('held-item-line-current')).toHaveTextContent('Already removed on the server');
  });

  it('Gujarati: the group titles and "Already removed on the server" in Design\'s words', async () => {
    await setLanguage('gu');
    mockGrn.answer = () => ({ success: true, data: { grn: { items: [{ id: 'l99', item_name: 'Beans', qty: 1, packaging: 'Bag', package_mark: null }] } } });
    await open();
    expect(within(screen.getByTestId('held-item-linesAdded')).getByRole('header')).toHaveTextContent('આઇટમ ઉમેરી');
    expect(within(screen.getByTestId('held-item-linesRemoved')).getByRole('header')).toHaveTextContent('આઇટમ કાઢી');
    expect(await screen.findByTestId('held-item-line-current')).toHaveTextContent('સર્વર પર પહેલેથી કાઢી નાખેલી');
  });

  it('a group with no lines is not drawn', async () => {
    await open(editBody({ linesAdded: undefined, linesRemoved: undefined }));
    expect(screen.queryByTestId('held-item-linesAdded')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('held-item-linesRemoved')).not.toBeOnTheScreen();
  });

  it('offline: the needs-connection state replaces the item, with no Correct, and nothing is asked or written', async () => {
    mockNet.offline = true;
    await setReachable(false);
    engine.setCopyOffline(true);
    mockParams = { id: 'ge1' };
    mockServer.answers.get_held_item = () => itemAnswer(editRow(), { accept_possible: true, body: editBody() });
    await show(HeldItemScreen());
    expect(await screen.findByTestId('held-item-needs-connection')).toBeOnTheScreen();
    expect(screen.queryByTestId('held-item-correct')).not.toBeOnTheScreen();
    expect(mockServer.calls).toHaveLength(0);
  });
});

describe('DQ11 (c): the Correct sheet of a held field change names the lot', () => {
  const row = () => listRow('lc1', { kind: 'lotChange', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } } });
  const extra = { accept_possible: false, body: { lotId: 'l06', grnId: 'g-B1', recordedAt: '2026-11-27T09:00:00+05:30', changes: { rack: { from: 'B-2', to: 'C-2' } } }, current: [] };

  it('"Beans · GRN B1" and the customer, from the lot in the GRN the page loads', async () => {
    mockGrn.answer = () => ({ success: true, data: { grn: { items: [{ id: 'l06', item_name: 'Beans' }, { id: 'l07', item_name: 'Rice' }] } } });
    await openItem(row(), extra);
    await user.press(screen.getByTestId('held-item-correct'));
    const subtitle = await screen.findByTestId('quick-change-subtitle');
    expect(within(subtitle).getByText('Beans · GRN B1')).toBeOnTheScreen();
    expect(within(subtitle).getByText('asha Traders')).toBeOnTheScreen();
  });

  it('a lot that is gone from the GRN: "GRN B1" and the customer', async () => {
    mockGrn.answer = () => ({ success: true, data: { grn: { items: [{ id: 'l99', item_name: 'Rice' }] } } });
    await openItem(row(), extra);
    await user.press(screen.getByTestId('held-item-correct'));
    const subtitle = await screen.findByTestId('quick-change-subtitle');
    expect(within(subtitle).getByText('GRN B1')).toBeOnTheScreen();
    expect(within(subtitle).queryByText(/Rice/)).not.toBeOnTheScreen();
    expect(within(subtitle).queryByText(/·/)).not.toBeOnTheScreen();
    expect(within(subtitle).getByText('asha Traders')).toBeOnTheScreen();
  });
});

describe('a staff account that is not the recorder gets no held-item data', () => {
  it('opening a held item it does not own (recorder\'s view) shows nothing of it and asks the server for nothing', async () => {
    signIn('staff');
    mockParams = { id: 'someone-elses', own: '1' };
    mockServer.answers.get_held_item = () => itemAnswer(listRow('someone-elses'));
    await show(HeldItemScreen());
    expect(await screen.findByTestId('held-item-screen')).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load this. Check your connection and try again.")).toBeOnTheScreen();
    expect(screen.queryByText('asha Traders')).not.toBeOnTheScreen();
    expect(mockServer.calls.filter(c => c.name === 'get_held_item' || c.name === 'get_held_items')).toHaveLength(0);
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
    await act(async () => { answer(decideOk('h1', 'accepted', { grn_id: 'g-77', gr_no: 'G-77' })); });

    expect(decideCalls()).toHaveLength(1);
    expect(decideCalls()[0].args).toMatchObject({ p_id: 'h1', p_action: 'accept' });
    expect(decideCalls()[0].args.p_body ?? null).toBeNull();
    expect(toasts()).toContain('Accepted as G-77');
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

describe('DQ14: an accept whose answer lists replaced entries says so, on every accept path', () => {
  const REPLACED = [{ field: 'rack', newer: 'D-4', sent: 'C-2' }];
  const lotRow = () => listRow('lc1', { kind: 'lotChange', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } } });
  const lotExtra = { accept_possible: true, body: { lotId: 'l06', grnId: 'g-B1', recordedAt: '2026-11-27T09:00:00+05:30', changes: { rack: { from: 'B-2', to: 'C-2' } } }, current: [{ field: 'rack', line_ref: 'l06', current: 'D-4', held: 'C-2' }] };
  const editRow = () => listRow('ge1', { kind: 'grnEdit', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['note'] } } });
  const editExtra = { accept_possible: true, body: { v: 1, grnId: 'g-B1', loadedAt: null, recordedAt: '2026-11-27T09:00:00+05:30', header: { note: { from: null, to: 'Recorder note' } } } };
  const SAID = 'Accepted: GRN B1 updated. It replaced a newer entry. Check the GRN.';

  it('plain Accept of a held GRN edit', async () => {
    await openItem(editRow(), editExtra);
    mockServer.answers.decide_held_item = () => decideOk('ge1', 'accepted', { grn_id: 'g-B1', gr_no: 'B1', replaced: REPLACED });
    await user.press(screen.getByTestId('held-item-accept'));
    expect(showToast).toHaveBeenCalledWith(SAID, { durationMs: 8000 });
  });

  it('plain Accept of a rack or mark change', async () => {
    await openItem(lotRow(), lotExtra);
    mockServer.answers.decide_held_item = () => decideOk('lc1', 'accepted', { grn_id: 'g-B1', gr_no: 'B1', replaced: REPLACED });
    await user.press(screen.getByTestId('held-item-accept'));
    expect(showToast).toHaveBeenCalledWith(SAID, { durationMs: 8000 });
  });

  it('the quick-change sheet\'s "Accept with changes"', async () => {
    await openItem(lotRow(), lotExtra);
    await user.press(screen.getByTestId('held-item-correct'));
    await user.clear(await screen.findByLabelText('Rack'));
    await user.type(screen.getByLabelText('Rack'), 'D-9');
    mockServer.answers.decide_held_item = () => decideOk('lc1', 'accepted', { grn_id: 'g-B1', gr_no: 'B1', replaced: REPLACED });
    await user.press(screen.getByTestId('quick-change-save'));
    expect(showToast).toHaveBeenCalledWith(SAID, { durationMs: 8000 });
  });

  it.each([
    ['an empty replaced list', []],
    ['no replaced list', undefined],
  ])('plain Accept with %s says only "Accepted: GRN B1 updated"', async (_name, replaced) => {
    await openItem(editRow(), editExtra);
    mockServer.answers.decide_held_item = () => decideOk('ge1', 'accepted', { grn_id: 'g-B1', gr_no: 'B1', ...(replaced ? { replaced } : {}) });
    await user.press(screen.getByTestId('held-item-accept'));
    expect(showToast).toHaveBeenCalledWith('Accepted: GRN B1 updated');
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

describe('WH-302 design fix: held-item Correct mode keeps QuickChangeSheet scrollable with fixed footer and drag guard', () => {
  const lotRow = () => listRow('lc1', { kind: 'lotChange', reason: 'other', reason_data: {}, what: { key: 'offline.unsent.whatChange', params: { number: 'B1', fields: ['rack'] } } });
  const lotExtra = {
    accept_possible: true,
    body: { lotId: 'l06', grnId: 'g-B1', recordedAt: '2026-11-27T09:00:00+05:30', changes: { rack: { from: 'B-2', to: 'C-2' } } },
    current: [{ field: 'rack', line_ref: 'l06', current: 'D-4', held: 'C-2' }],
  };

  it('keeps Cancel and Accept with changes in footer outside the ScrollView and guards scrollToEnd after drag', async () => {
    const scrollToEnd = jest
      .spyOn(ScrollView.prototype as unknown as { scrollToEnd: (options?: { animated?: boolean }) => void }, 'scrollToEnd')
      .mockImplementation(() => undefined);
    await openItem(lotRow(), lotExtra);
    await user.press(screen.getByTestId('held-item-correct'));

    const scroll = await screen.findByTestId('quick-change-sheet');
    expect(scroll.type).toBe('RCTScrollView');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.bounces).toBe(false);
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 1 });
    expect(within(scroll).queryByTestId('quick-change-cancel')).not.toBeOnTheScreen();
    expect(within(scroll).queryByTestId('quick-change-save')).not.toBeOnTheScreen();

    const modalSheet = screen.container.queryAll(node => node.props.accessibilityViewIsModal === true)[0];
    const sheetViews = modalSheet.children.filter((child): child is typeof scroll => typeof child !== 'string');
    const content = sheetViews.find(view => within(view).queryByTestId('quick-change-sheet') !== null);
    const footer = sheetViews.find(view => within(view).queryByTestId('quick-change-save') !== null);
    expect(content).toBeDefined();
    expect(footer).toBeDefined();
    expect(footer).not.toBe(content);
    expect(StyleSheet.flatten(content!.props.style).flexShrink).toBe(1);
    expect(within(footer!).getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
    expect(within(footer!).getByRole('button', { name: 'Accept with changes' })).toBeOnTheScreen();

    await fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 420 } } });
    await fireEvent(screen.getByTestId('quick-change-mark'), 'focus');
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: true });

    await fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 220 } } });
    expect(scrollToEnd).toHaveBeenCalledTimes(2);
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: false });

    await fireEvent(scroll, 'scrollBeginDrag');
    await fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 180 } } });
    expect(scrollToEnd).toHaveBeenCalledTimes(2);
  });
});
