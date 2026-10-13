/**
 * A report's period is stored as words ("Last 120 days") and turned into two
 * days when the request is made. Those days are counted from India's today, so
 * the request is made again when the day turns over in India, and only then:
 * not when it turns over in the clock zone of the phone.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { GRN_ACTIVITY_CUSTOMERS } from '@/features/filters/configs/reports/grnActivity';
import type { FilterContext } from '@/features/filters/types';
import { watchPhoneZone } from '@/tests/helpers/phoneZone';
import { indiaDay } from '@/utils/formatters';
import { useReportFilters } from '../useReportFilters';

const mockState: Record<string, unknown> = {
  auth: { userProfile: { id: 'user-a', role: 'staff' } },
  listFilters: { lists: {} },
  reportPrefs: { byScope: {} },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn(), logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

// The list hook under a report's keys a request of its own on the phone's day; a report does not
// use that request (it makes its own, below). It is stood in for here, so that the only reading
// of the clock left to watch is the report's.
const mockStaff: FilterContext = { role: 'staff', isWarehouseRole: true, assignedCustomers: [] };
const mockList = {
  ctx: mockStaff,
  fields: GRN_ACTIVITY_CUSTOMERS.fields,
  values: {},
  sort: undefined,
  request: {},
  search: '',
  activeCount: 0,
  hasAny: false,
  apply: jest.fn(),
  setField: jest.fn(),
  setSearch: jest.fn(),
  searchAsText: jest.fn(),
  setSort: jest.fn(),
  clear: jest.fn(),
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockList }));

// A minute to either side of midnight in India (18:30 UTC): the afternoon in New York, the next
// morning in Kiritimati. Not on a quarter of an hour, so midnight in no zone (see watchPhoneZone).
const SUNDAY_NIGHT = new Date('2026-10-11T18:29:07Z'); // 11 October, 23:59 in India
const MONDAY_MORNING = new Date('2026-10-11T18:31:07Z'); // 12 October, 00:01 in India

type Request = ReturnType<typeof GRN_ACTIVITY_CUSTOMERS.toRequest>;
/** The report choices of the account above on the facility the mock names (useReportPrefs). */
const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);

function mount() {
  let request!: Request;
  const Probe = () => {
    request = useReportFilters(GRN_ACTIVITY_CUSTOMERS).request;
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  return {
    request: () => request,
    /** The screen is drawn again, as it is when anything on it changes. */
    draw: () => act(() => renderer.update(<Probe />)),
  };
}

afterEach(() => jest.useRealTimers());

describe('the day a report\'s request is counted from', () => {
  it('is India\'s: the request is made again when the day turns over there', () => {
    jest.useFakeTimers({ now: SUNDAY_NIGHT });
    const report = mount();
    expect(report.request().period).toEqual({ from: '2026-06-14', to: '2026-10-11' });
    const first = report.request();

    // The same day: the same request object, so the report does not load again.
    report.draw();
    expect(report.request()).toBe(first);

    jest.setSystemTime(MONDAY_MORNING);
    report.draw();
    expect(report.request().period).toEqual({ from: '2026-06-15', to: '2026-10-12' });
  });

  it('turns "Today" over at midnight in India, and keeps "Last 120 days" as the period nobody chose', () => {
    jest.useFakeTimers({ now: SUNDAY_NIGHT });
    const report = mount();
    // Nobody chose a period: the default is unchanged.
    expect(report.request().period).toEqual({ from: '2026-06-14', to: '2026-10-11' });

    mockState.reportPrefs = { byScope: { [SCOPE]: { period: { preset: 'today' }, sort: {}, pinned: [], recent: [], lastCustomer: {}, usedAt: 1 } } };
    try {
      report.draw();
      expect(report.request().period).toEqual({ from: '2026-10-11', to: '2026-10-11' });
      jest.setSystemTime(MONDAY_MORNING);
      report.draw();
      expect(report.request().period).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    } finally {
      mockState.reportPrefs = { byScope: {} };
    }
  });

  it('is not the phone\'s: its own midnight makes the request again only where that is India\'s midnight too', () => {
    // A minute to either side of midnight on this machine. In the suite that is India's midnight;
    // run in another zone, it falls inside one day in India and must change nothing.
    const midnight = new Date(2026, 9, 12).getTime();
    const before = new Date(midnight - 60_000);
    const after = new Date(midnight + 60_000);
    jest.useFakeTimers({ now: before });
    const report = mount();
    const first = report.request();

    jest.setSystemTime(after);
    report.draw();
    const sameDayInIndia = indiaDay(before) === indiaDay(after);
    expect(report.request() === first).toBe(sameDayInIndia);
    expect(report.request().period.to).toBe(indiaDay(after));
  });

  it('is read from the clock without the phone\'s calendar', () => {
    // The suite's zone is India's, so a key made from the phone's day would turn over at the same
    // moment here. It would have to read the clock with the phone's calendar to do so.
    jest.useFakeTimers({ now: SUNDAY_NIGHT });
    const watch = watchPhoneZone([SUNDAY_NIGHT, MONDAY_MORNING]);
    try {
      const report = mount();
      jest.setSystemTime(MONDAY_MORNING);
      report.draw();
      expect(report.request().period).toEqual({ from: '2026-06-15', to: '2026-10-12' });
      expect(watch.reads).toEqual([]);
    } finally {
      watch.restore();
    }
  });
});
