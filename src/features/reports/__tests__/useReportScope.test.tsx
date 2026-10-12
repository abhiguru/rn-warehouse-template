/**
 * Whose data a report shows, by role, assigned customers, the route and what
 * the account opened before.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useReportScope, type ReportScope } from '../useReportScope';

const mockDispatch = jest.fn();
const mockPush = jest.fn();
let mockState: Record<string, unknown> = {};
let mockParams: Record<string, string> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => ({ origin: 'https://warehouse.example.test', instanceId: 'instance-a' }),
}));
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const GREEN = { id: 'c1', name: 'Green Valley Traders' };
const RIVER = { id: 'c2', name: 'Riverbank Produce' };

function signIn(profile: Record<string, unknown>, lastCustomer: Record<string, unknown> = {}) {
  mockState = {
    auth: { userProfile: { id: 'user-a', ...profile } },
    reportPrefs: { byScope: { [SCOPE]: { sort: {}, pinned: [], recent: [], lastCustomer, usedAt: 1 } } },
  };
}
function use() {
  let scope!: ReportScope;
  const Probe = () => {
    scope = useReportScope('grn-activity');
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  return { scope: () => scope, run: (callback: () => void) => act(() => callback()), rerender: () => act(() => renderer.update(<Probe />)) };
}
const actions = () => mockDispatch.mock.calls.map(([action]) => action as { type: string; payload: Record<string, unknown> });

beforeEach(() => {
  mockDispatch.mockClear();
  mockPush.mockClear();
  mockParams = {};
});

describe('a warehouse role', () => {
  it.each(['admin', 'supervisor', 'staff'])('%s starts on every customer', role => {
    signIn({ role });
    const { scope } = use();
    expect(scope().level).toEqual({ kind: 'customers' });
    expect(scope().isWarehouseUser).toBe(true);
    expect(scope().changeCustomer).toBeUndefined();
  });

  it('opens a customer by pushing the same report with the customer in the route, and remembers it', () => {
    signIn({ role: 'staff' });
    const probe = use();
    probe.run(() => probe.scope().openCustomer(GREEN));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c1', customerName: 'Green Valley Traders' } });
    expect(actions()).toContainEqual({
      type: 'reportPrefs/setReportCustomer',
      payload: expect.objectContaining({ scope: SCOPE, reportId: 'grn-activity', customer: GREEN }),
    });
  });

  it('shows the customer a route names, from the list or from a link in another report', () => {
    signIn({ role: 'staff' });
    mockParams = { customerId: 'c2', customerName: 'Riverbank Produce' };
    expect(use().scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: 'Riverbank Produce' });
  });

  it('offers the customer opened last in this report on the customers list only', () => {
    signIn({ role: 'staff' }, { 'grn-activity': GREEN, 'stock-aging': RIVER });
    expect(use().scope().lastCustomer).toEqual(GREEN);
    mockParams = { customerId: 'c2', customerName: 'Riverbank Produce' };
    expect(use().scope().lastCustomer).toBeUndefined();
  });
});

describe('a customer account', () => {
  it('with one customer goes straight to it', () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [GREEN] });
    const { scope } = use();
    expect(scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: 'Green Valley Traders' });
    expect(scope().changeCustomer).toBeUndefined();
  });

  it('with several chooses one, and can go back to choose another', () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1', 'c2'], assignedCustomers: [GREEN, RIVER] });
    const probe = use();
    expect(probe.scope().level).toEqual({ kind: 'choose' });
    probe.run(() => probe.scope().chooseCustomer(RIVER));
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: 'Riverbank Produce' });
    expect(mockPush).not.toHaveBeenCalled();
    expect(actions()).toContainEqual({
      type: 'reportPrefs/setReportCustomer',
      payload: expect.objectContaining({ reportId: 'grn-activity', customer: RIVER }),
    });
    probe.run(() => probe.scope().changeCustomer?.());
    expect(probe.scope().level).toEqual({ kind: 'choose' });
  });

  it('with several starts on the one it opened last, if that customer is still its own', () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1', 'c2'], assignedCustomers: [GREEN, RIVER] }, { 'grn-activity': RIVER });
    expect(use().scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: 'Riverbank Produce' });
    // The customer was taken from the account since.
    signIn({ role: 'customer', assignedCustomerIds: ['c1', 'c3'], assignedCustomers: [GREEN] }, { 'grn-activity': RIVER });
    expect(use().scope().level).toEqual({ kind: 'choose' });
  });

  it('is shown nothing for a route that names somebody else\'s customer, whatever name the route gives', () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [GREEN] });
    mockParams = { customerId: 'c9', customerName: 'Green Valley Traders' };
    expect(use().scope().level).toEqual({ kind: 'none' });
    mockParams = { customerId: 'c1' };
    expect(use().scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: 'Green Valley Traders' });
  });

  it('with no customer linked is shown nothing', () => {
    signIn({ role: 'customer', assignedCustomerIds: [] });
    expect(use().scope().level).toEqual({ kind: 'none' });
  });
});

it('notes the report as opened, once', () => {
  signIn({ role: 'staff' });
  const probe = use();
  probe.rerender();
  expect(actions().filter(action => action.type === 'reportPrefs/noteReportOpened')).toEqual([
    { type: 'reportPrefs/noteReportOpened', payload: expect.objectContaining({ scope: SCOPE, reportId: 'grn-activity' }) },
  ]);
});
