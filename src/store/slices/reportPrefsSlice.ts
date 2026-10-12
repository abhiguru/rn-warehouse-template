/**
 * What a person last chose on the report screens (docs/STYLE_GUIDE.md §14.10):
 * the period, each report's sort, the reports they pinned and opened last, and
 * the customer they last opened in a report.
 *
 * Unlike list filters this slice is persisted, so the choices are there after
 * the app is closed. Everything is kept per scope (facility, instance and
 * account), so one account never sees another's. The period, sorts, pins and
 * recent reports name no facility data and outlive a sign-out. The last
 * customer does name facility data: it is forgotten for every scope on
 * sign-out, forced sign-out, account deletion and a facility switch
 * (src/store/sessionScopedState.ts), and so only survives closing the app.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DATE_PRESETS, REPORT_DATE_PRESETS } from '@/features/filters/datePresets';
import type { DatePresetId, DateRangeValue, SortState } from '@/features/filters/types';
import { logout } from './authSlice';

export interface ReportCustomerRef {
  id: string;
  name: string;
}
export interface ReportScopePrefs {
  /** One period for every report that has one, so it carries from report to report. */
  period?: DateRangeValue;
  /** Sort per list key: a report's customers list and its one-customer view sort separately. */
  sort: Record<string, SortState>;
  /** Report ids, in the order they were pinned. */
  pinned: string[];
  /** Report ids, most recently opened first. */
  recent: string[];
  /** The customer last opened, per report id. */
  lastCustomer: Record<string, ReportCustomerRef>;
  /** When this scope was last written, to drop the oldest scopes. */
  usedAt: number;
}
export interface ReportPrefsState {
  byScope: Record<string, ReportScopePrefs>;
}

/** Scopes kept: a phone is shared by few accounts, and each holds a few hundred bytes. */
export const MAX_REPORT_SCOPES = 5;
export const MAX_RECENT_REPORTS = 5;

const initialState: ReportPrefsState = { byScope: {} };
const emptyScope = (): ReportScopePrefs => ({ sort: {}, pinned: [], recent: [], lastCustomer: {}, usedAt: 0 });

function touch(state: ReportPrefsState, scope: string, at: number): ReportScopePrefs {
  const entry = (state.byScope[scope] ??= emptyScope());
  entry.usedAt = at;
  const scopes = Object.keys(state.byScope);
  if (scopes.length > MAX_REPORT_SCOPES) {
    scopes
      .sort((a, b) => state.byScope[b].usedAt - state.byScope[a].usedAt)
      .slice(MAX_REPORT_SCOPES)
      .forEach(old => delete state.byScope[old]);
  }
  return entry;
}

function forgetCustomers(state: ReportPrefsState) {
  for (const entry of Object.values(state.byScope)) entry.lastCustomer = {};
}

/** Every action carries the time it was made, so the reducers stay pure. */
const timed = <T extends object>(payload: T) => ({ payload: { ...payload, at: Date.now() } });
type Timed<T> = PayloadAction<T & { at: number }>;

const reportPrefsSlice = createSlice({
  name: 'reportPrefs',
  initialState,
  reducers: {
    setReportPeriod: {
      reducer(state, action: Timed<{ scope: string; period: DateRangeValue }>) {
        touch(state, action.payload.scope, action.payload.at).period = action.payload.period;
      },
      prepare: (payload: { scope: string; period: DateRangeValue }) => timed(payload),
    },
    setReportSort: {
      reducer(state, action: Timed<{ scope: string; listKey: string; sort: SortState }>) {
        touch(state, action.payload.scope, action.payload.at).sort[action.payload.listKey] = action.payload.sort;
      },
      prepare: (payload: { scope: string; listKey: string; sort: SortState }) => timed(payload),
    },
    toggleReportPin: {
      reducer(state, action: Timed<{ scope: string; reportId: string }>) {
        const entry = touch(state, action.payload.scope, action.payload.at);
        const { reportId } = action.payload;
        entry.pinned = entry.pinned.includes(reportId) ? entry.pinned.filter(id => id !== reportId) : [...entry.pinned, reportId];
      },
      prepare: (payload: { scope: string; reportId: string }) => timed(payload),
    },
    noteReportOpened: {
      reducer(state, action: Timed<{ scope: string; reportId: string }>) {
        const entry = touch(state, action.payload.scope, action.payload.at);
        const { reportId } = action.payload;
        entry.recent = [reportId, ...entry.recent.filter(id => id !== reportId)].slice(0, MAX_RECENT_REPORTS);
      },
      prepare: (payload: { scope: string; reportId: string }) => timed(payload),
    },
    /** Remember the customer opened in a report, or forget it when none is given. */
    setReportCustomer: {
      reducer(state, action: Timed<{ scope: string; reportId: string; customer?: ReportCustomerRef }>) {
        const entry = touch(state, action.payload.scope, action.payload.at);
        const { reportId, customer } = action.payload;
        if (customer) entry.lastCustomer[reportId] = { id: customer.id, name: customer.name };
        else delete entry.lastCustomer[reportId];
      },
      prepare: (payload: { scope: string; reportId: string; customer?: ReportCustomerRef }) => timed(payload),
    },
    /** Session teardown: customers belong to the facility that was just left, whoever's scope they are in. */
    forgetReportCustomers(state) {
      forgetCustomers(state);
    },
  },
  extraReducers: builder => {
    builder.addCase(logout.fulfilled, state => {
      forgetCustomers(state);
    });
  },
});

export const {
  setReportPeriod,
  setReportSort,
  toggleReportPin,
  noteReportOpened,
  setReportCustomer,
  forgetReportCustomers,
} = reportPrefsSlice.actions;
export default reportPrefsSlice.reducer;

const EMPTY: ReportScopePrefs = Object.freeze({ sort: {}, pinned: [], recent: [], lastCustomer: {}, usedAt: 0 }) as ReportScopePrefs;
/** The choices of one scope. A missing scope (signed out, or nothing chosen yet) reads as empty. */
export const selectReportPrefs = (state: { reportPrefs?: ReportPrefsState }, scope: string | null): ReportScopePrefs =>
  (scope && state.reportPrefs?.byScope[scope]) || EMPTY;

// ---------------------------------------------------------------------------
// Reading what was stored. The file on the phone is outside the app's control
// (an older version wrote it, or it is damaged), so every part is checked and a
// part that is not what this version writes is dropped, never trusted.
// ---------------------------------------------------------------------------

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Report ids, list keys and sort fields are short words of the app's own. */
const WORD = /^[A-Za-z0-9_-]{1,64}$/;
const PRESET_IDS = new Set<string>([...DATE_PRESETS, ...REPORT_DATE_PRESETS].map(preset => preset.id));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const words = (value: unknown, limit: number): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && WORD.test(entry)))].slice(0, limit)
    : [];

function readPeriod(value: unknown): DateRangeValue | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.preset === 'string' && PRESET_IDS.has(value.preset)) return { preset: value.preset as DatePresetId };
  const from = typeof value.from === 'string' && ISO_DAY.test(value.from) ? value.from : undefined;
  const to = typeof value.to === 'string' && ISO_DAY.test(value.to) ? value.to : undefined;
  // A report's period needs both of its days.
  return from && to && from <= to ? { from, to } : undefined;
}

function readScope(value: unknown): ReportScopePrefs | undefined {
  if (!isRecord(value)) return undefined;
  const entry = emptyScope();
  const period = readPeriod(value.period);
  if (period) entry.period = period;
  if (isRecord(value.sort)) {
    for (const [listKey, sort] of Object.entries(value.sort)) {
      if (
        WORD.test(listKey) &&
        isRecord(sort) &&
        typeof sort.field === 'string' &&
        WORD.test(sort.field) &&
        (sort.order === 'asc' || sort.order === 'desc')
      ) {
        entry.sort[listKey] = { field: sort.field, order: sort.order };
      }
    }
  }
  entry.pinned = words(value.pinned, 32);
  entry.recent = words(value.recent, MAX_RECENT_REPORTS);
  if (isRecord(value.lastCustomer)) {
    for (const [reportId, customer] of Object.entries(value.lastCustomer)) {
      if (WORD.test(reportId) && isRecord(customer) && typeof customer.id === 'string' && customer.id !== '' && typeof customer.name === 'string') {
        entry.lastCustomer[reportId] = { id: customer.id, name: customer.name };
      }
    }
  }
  entry.usedAt = typeof value.usedAt === 'number' && Number.isFinite(value.usedAt) ? value.usedAt : 0;
  return entry;
}

/** The stored choices, with anything that is not this version's shape left out. */
export function sanitizeReportPrefs(value: unknown): ReportPrefsState {
  const state: ReportPrefsState = { byScope: {} };
  if (!isRecord(value) || !isRecord(value.byScope)) return state;
  const scopes = Object.entries(value.byScope)
    .map(([scope, entry]) => [scope, readScope(entry)] as const)
    .filter((pair): pair is readonly [string, ReportScopePrefs] => pair[1] !== undefined)
    .sort((a, b) => b[1].usedAt - a[1].usedAt)
    .slice(0, MAX_REPORT_SCOPES);
  // fromEntries defines own properties, so a stored key such as "__proto__" stays a plain key.
  state.byScope = Object.fromEntries(scopes);
  return state;
}
