/**
 * "Today" in a stored filter means the day the list is read, not the day the
 * filter was set (M4-14): the app stays open past midnight and past 1 April.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useListFilters } from '../useListFilters';
import { DISPATCH_FILTERS, INVOICE_FILTERS } from '../configs';

const mockState = {
  auth: { userProfile: { role: 'staff' } },
  listFilters: { lists: { 'dispatch-list': { values: { date: { preset: 'today' } } } } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn(), logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

afterEach(() => jest.useRealTimers());

it('the request for "Today" follows the calendar when the list is drawn again', () => {
  expect(DISPATCH_FILTERS.listKey).toBe('dispatch-list');
  jest.useFakeTimers({ now: new Date(2026, 9, 10, 23, 50) });
  let request: any;
  const Probe = () => {
    request = useListFilters(DISPATCH_FILTERS).request;
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  expect(request.p_filters.date_from).toBe('2026-10-10T00:00:00+05:30');
  const before = request;

  // Same day: the same request object, so a list keyed on it does not load again.
  act(() => renderer.update(<Probe />));
  expect(request).toBe(before);

  jest.setSystemTime(new Date(2026, 9, 11, 0, 10));
  act(() => renderer.update(<Probe />));
  expect(request.p_filters.date_from).toBe('2026-10-11T00:00:00+05:30');
  expect(request.p_filters.date_to).toBe('2026-10-11T23:59:59.999+05:30');
});

it('the invoice Year filter offers the financial year of the day it is opened', () => {
  const years = () => {
    const field = INVOICE_FILTERS.fields.find(candidate => candidate.key === 'year') as { options: { value: string }[] };
    return field.options.map(option => option.value);
  };
  jest.useFakeTimers({ now: new Date(2026, 2, 31, 12, 0) });
  expect(years().slice(0, 2)).toEqual(['all', '2025']);
  jest.setSystemTime(new Date(2026, 3, 1, 12, 0));
  expect(years().slice(0, 2)).toEqual(['all', '2026']);
});

// M4-19: the profile can lose a customer while a filter naming it is stored.
it('reads stored filters through the account as it is now', () => {
  const state = mockState as any;
  const before = { auth: state.auth, lists: state.listFilters.lists };
  state.auth = { userProfile: { role: 'customer', assignedCustomers: [{ id: 'c1', name: 'A' }] } };
  state.listFilters.lists = { 'dispatch-list': { values: { customers: [{ id: 'c9', label: 'Revoked' }], package: 'red' } } };
  let filters!: ReturnType<typeof useListFilters>;
  const Probe = () => {
    filters = useListFilters(DISPATCH_FILTERS);
    return null;
  };
  act(() => {
    TestRenderer.create(<Probe />);
  });
  // One assigned customer: the Customer filter is hidden, so its stored value is not used or sent.
  expect(filters.values).toEqual({ package: 'red' });
  expect((filters.request as any).p_filters).toEqual({ package_mark: 'red' });
  state.auth = before.auth;
  state.listFilters.lists = before.lists;
});
