import { configureStore } from '@reduxjs/toolkit';
import { persistReducer, persistStore } from 'redux-persist';
import { restorePreferences } from '../persistence';
import reducer, {
  MAX_RECENT_REPORTS,
  MAX_REPORT_SCOPES,
  forgetReportCustomers,
  noteReportOpened,
  sanitizeReportPrefs,
  selectReportPrefs,
  setReportCustomer,
  setReportPeriod,
  setReportSort,
  toggleReportPin,
  type ReportPrefsState,
} from '../slices/reportPrefsSlice';

// The slice must not import authSlice (that closes a require cycle through sessionScopedState): it
// matches the sign-out action by its type string. Loading authSlice here fails the whole file.
jest.mock('../slices/authSlice', () => {
  throw new Error('reportPrefsSlice must not import authSlice');
});

const A = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const B = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-b']);

const reduce = (...actions: Parameters<typeof reducer>[1][]) =>
  actions.reduce<ReportPrefsState | undefined>((state, action) => reducer(state, action), undefined) as ReportPrefsState;

describe('report choices', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps one account\'s choices apart from another\'s', () => {
    const state = reduce(
      setReportPeriod({ scope: A, period: { preset: 'last240' } }),
      setReportSort({ scope: A, listKey: 'report-grn-activity', sort: { field: 'bags', order: 'desc' } }),
      setReportCustomer({ scope: A, reportId: 'grn-activity', customer: { id: 'c1', name: 'Fictional Traders' } }),
      setReportPeriod({ scope: B, period: { from: '2026-04-01', to: '2026-04-30' } })
    );
    const root = { reportPrefs: state };
    expect(selectReportPrefs(root, A).period).toEqual({ preset: 'last240' });
    expect(selectReportPrefs(root, A).sort).toEqual({ 'report-grn-activity': { field: 'bags', order: 'desc' } });
    expect(selectReportPrefs(root, A).lastCustomer).toEqual({ 'grn-activity': { id: 'c1', name: 'Fictional Traders' } });
    expect(selectReportPrefs(root, B).period).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(selectReportPrefs(root, B).lastCustomer).toEqual({});
  });

  it('reads as empty when signed out or when nothing was chosen', () => {
    const root = { reportPrefs: reduce(setReportPeriod({ scope: A, period: { preset: 'last240' } })) };
    expect(selectReportPrefs(root, null)).toEqual({ sort: {}, pinned: [], recent: [], lastCustomer: {}, usedAt: 0 });
    expect(selectReportPrefs(root, B).period).toBeUndefined();
    expect(selectReportPrefs({}, A).pinned).toEqual([]);
  });

  it('pins and unpins a report, and lists the reports opened last, newest first, without repeats', () => {
    let state = reduce(
      toggleReportPin({ scope: A, reportId: 'stock-summary' }),
      toggleReportPin({ scope: A, reportId: 'grn-activity' }),
      toggleReportPin({ scope: A, reportId: 'stock-summary' })
    );
    expect(state.byScope[A].pinned).toEqual(['grn-activity']);
    for (const reportId of ['a', 'b', 'c', 'd', 'e', 'f', 'b']) state = reducer(state, noteReportOpened({ scope: A, reportId }));
    expect(state.byScope[A].recent).toEqual(['b', 'f', 'e', 'd', 'c']);
    expect(state.byScope[A].recent).toHaveLength(MAX_RECENT_REPORTS);
  });

  it('forgets the customer of one report, and of every account when a session ends', () => {
    let state = reduce(
      setReportCustomer({ scope: A, reportId: 'grn-activity', customer: { id: 'c1', name: 'Fictional Traders' } }),
      setReportCustomer({ scope: A, reportId: 'stock-aging', customer: { id: 'c2', name: 'Riverbank Produce' } }),
      setReportCustomer({ scope: B, reportId: 'grn-activity', customer: { id: 'c3', name: 'Sunrise Agro Foods' } }),
      setReportPeriod({ scope: A, period: { preset: 'last364' } }),
      toggleReportPin({ scope: A, reportId: 'grn-activity' })
    );
    state = reducer(state, setReportCustomer({ scope: A, reportId: 'grn-activity' }));
    expect(state.byScope[A].lastCustomer).toEqual({ 'stock-aging': { id: 'c2', name: 'Riverbank Produce' } });

    for (const end of [forgetReportCustomers(), { type: 'auth/logout/fulfilled' }]) {
      const ended = reducer(state, end);
      expect(ended.byScope[A].lastCustomer).toEqual({});
      expect(ended.byScope[B].lastCustomer).toEqual({});
      // The choices that name no facility data stay.
      expect(ended.byScope[A].period).toEqual({ preset: 'last364' });
      expect(ended.byScope[A].pinned).toEqual(['grn-activity']);
    }
  });

  it('keeps the scopes used last and drops the oldest', () => {
    jest.useFakeTimers({ now: 1_000 });
    let state: ReportPrefsState | undefined;
    for (let index = 0; index <= MAX_REPORT_SCOPES; index++) {
      jest.setSystemTime(1_000 + index);
      state = reducer(state, setReportPeriod({ scope: `scope-${index}`, period: { preset: 'last120' } }));
    }
    expect(Object.keys(state!.byScope).sort()).toEqual(['scope-1', 'scope-2', 'scope-3', 'scope-4', 'scope-5']);
  });
});

describe('what is read back from the phone', () => {
  it('keeps what this version writes', () => {
    const written = reduce(
      setReportPeriod({ scope: A, period: { preset: 'thisFinancialYear' } }),
      setReportSort({ scope: A, listKey: 'report-grn-activity', sort: { field: 'bags', order: 'asc' } }),
      toggleReportPin({ scope: A, reportId: 'stock-summary' }),
      noteReportOpened({ scope: A, reportId: 'grn-activity' }),
      setReportCustomer({ scope: A, reportId: 'grn-activity', customer: { id: 'c1', name: 'Fictional Traders' } })
    );
    expect(sanitizeReportPrefs(JSON.parse(JSON.stringify(written)))).toEqual(written);
  });

  it('drops every part that is not', () => {
    expect(sanitizeReportPrefs(undefined)).toEqual({ byScope: {} });
    expect(sanitizeReportPrefs('{"byScope":{}}')).toEqual({ byScope: {} });
    expect(sanitizeReportPrefs({ byScope: [] })).toEqual({ byScope: {} });
    const read = sanitizeReportPrefs({
      byScope: {
        [A]: {
          period: { preset: 'everything' },
          sort: { 'report-grn-activity': { field: 'bags', order: 'sideways' }, ok: { field: 'date', order: 'desc' }, 'bad key!': { field: 'date', order: 'asc' } },
          pinned: ['stock-summary', 7, 'stock-summary', '<script>'],
          recent: 'grn-activity',
          lastCustomer: { 'grn-activity': { id: '', name: 'No id' }, 'stock-aging': { id: 'c2' }, 'stock-summary': { id: 'c9', name: 'Riverbank Produce' } },
          usedAt: 'yesterday',
          extra: { token: 'obsolete' },
        },
        [B]: 'not an entry',
      },
    });
    expect(read).toEqual({
      byScope: {
        [A]: {
          sort: { ok: { field: 'date', order: 'desc' } },
          pinned: ['stock-summary'],
          recent: [],
          lastCustomer: { 'stock-summary': { id: 'c9', name: 'Riverbank Produce' } },
          usedAt: 0,
        },
      },
    });
  });

  it('needs both days of a period, the right way round', () => {
    const period = (value: unknown) => sanitizeReportPrefs({ byScope: { [A]: { period: value } } }).byScope[A].period;
    expect(period({ from: '2026-04-01', to: '2026-04-30' })).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(period({ from: '2026-04-01' })).toBeUndefined();
    expect(period({ from: '2026-04-30', to: '2026-04-01' })).toBeUndefined();
    expect(period({ from: '1 April', to: '2026-04-30' })).toBeUndefined();
  });

  it('keeps a stored key such as "__proto__" a plain key', () => {
    const read = sanitizeReportPrefs(JSON.parse('{"byScope":{"__proto__":{"pinned":["stock-summary"]}}}'));
    expect(Object.keys(read.byScope)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>).pinned).toBeUndefined();
  });
});

describe('rehydration', () => {
  const initial = { theme: { dark: false }, reportPrefs: { byScope: {} } as ReportPrefsState };
  async function rehydrate(stored: Record<string, unknown>) {
    const storage = {
      getItem: async () =>
        JSON.stringify(Object.fromEntries(Object.entries({ ...stored, _persist: { version: -1, rehydrated: true } }).map(([key, value]) => [key, JSON.stringify(value)]))),
      setItem: async () => {},
      removeItem: async () => {},
    };
    const store = configureStore({
      reducer: persistReducer(
        { key: 'root', storage, timeout: 0, whitelist: ['theme', 'reportPrefs'], migrate: restorePreferences },
        (state = initial) => state
      ),
      middleware: defaults => defaults({ serializableCheck: false }),
    });
    let persistor!: ReturnType<typeof persistStore>;
    await new Promise<void>(resolve => {
      persistor = persistStore(store, undefined, resolve);
    });
    const state = store.getState();
    await persistor.flush();
    persistor.pause();
    return state;
  }

  it('restores the theme and the report choices', async () => {
    const state = await rehydrate({
      theme: { dark: true },
      reportPrefs: { byScope: { [A]: { period: { preset: 'last240' }, sort: {}, pinned: ['stock-summary'], recent: [], lastCustomer: {}, usedAt: 5 } } },
    });
    expect(state.theme).toEqual({ dark: true });
    expect(state.reportPrefs.byScope[A]).toEqual({ period: { preset: 'last240' }, sort: {}, pinned: ['stock-summary'], recent: [], lastCustomer: {}, usedAt: 5 });
  });

  it('starts empty on a phone that stored none: an older version of the app', async () => {
    const state = await rehydrate({ theme: { dark: true } });
    expect(state.theme).toEqual({ dark: true });
    expect(state.reportPrefs).toEqual({ byScope: {} });
  });

  it('starts empty when what was stored is damaged', async () => {
    const state = await rehydrate({ theme: { dark: true }, reportPrefs: 'damaged' });
    expect(state.reportPrefs).toEqual({ byScope: {} });
  });
});
