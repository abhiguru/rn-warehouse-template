/**
 * Whose data a report shows, by role, assigned customers, the route and what
 * the account opened before; and under which name: the facility's own, never
 * the one a route carries.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { forgetCustomerNames, trustedCustomerName } from '../customerNames';
import { PUSH_GUARD_MS, clearDestinationFilters, useReportScope, type ReportScope } from '../useReportScope';

// The real question to the facility, not the stand-in every other test gets (jest.setup.js).
jest.unmock('@/features/reports/customerNames');

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

// The facility's `customers` table as the signed-in account may read it: id -> name.
type NameAnswer = { data: { id: string; name: string | null }[] | null; error: Error | null };
let mockCustomers: Record<string, string | null> = {};
/** Set by a test that holds the facility's answer back, or makes it fail. */
let mockAnswer: ((ids: string[]) => Promise<NameAnswer>) | undefined;
const mockNameQuery = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        in: (column: string, ids: string[]) => {
          mockNameQuery(table, columns, column, ids);
          return mockAnswer ? mockAnswer(ids) : Promise.resolve(mockTable(ids));
        },
      }),
    }),
  }),
}));
function mockTable(ids: string[]): NameAnswer {
  return { data: ids.filter(id => id in mockCustomers).map(id => ({ id, name: mockCustomers[id] })), error: null };
}

const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-a']);
const GREEN = { id: 'c1', name: 'Green Valley Traders' };
const RIVER = { id: 'c2', name: 'Riverbank Produce' };
/** A link can carry any name beside a customer's id. */
const LINK_TO_GREEN = { customerId: 'c1', customerName: 'Other Company' };
const NAME_QUERY = (id: string) => ['customers', 'id, name', 'id', [id]];

function signIn(profile: Record<string, unknown>, lastCustomer: Record<string, unknown> = {}) {
  mockState = {
    auth: { userProfile: { id: 'user-a', ...profile } },
    reportPrefs: { byScope: { [SCOPE]: { sort: {}, pinned: [], recent: [], lastCustomer, usedAt: 1 } } },
  };
}
/** One turn of the event loop: every promise already resolved has run by then. */
const turn = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const mounted: TestRenderer.ReactTestRenderer[] = [];
function use() {
  let scope!: ReportScope;
  // The name of every render, to show what was never on screen, not only what is there at the end.
  const names: string[] = [];
  const Probe = () => {
    scope = useReportScope('grn-activity');
    if (scope.level.kind === 'customer') names.push(scope.level.customerName);
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  mounted.push(renderer);
  return {
    scope: () => scope,
    names: () => [...new Set(names)],
    run: (callback: () => void) => act(() => callback()),
    rerender: () => act(() => renderer.update(<Probe />)),
    /** Let the facility's answer, when it is not held back, arrive. */
    settle: () => act(async () => { await turn(); }),
  };
}
/** Hold the facility's answers back; the returned function lets them arrive (from the table as it is then). */
function holdAnswers() {
  const waiting: (() => void)[] = [];
  mockAnswer = ids => new Promise<NameAnswer>(resolve => { waiting.push(() => resolve(mockTable(ids))); });
  return () =>
    act(async () => {
      waiting.splice(0).forEach(answer => answer());
      await turn();
    });
}
const actions = () => mockDispatch.mock.calls.map(([action]) => action as { type: string; payload: Record<string, unknown> });
const remembered = () => actions().filter(action => action.type === 'reportPrefs/setReportCustomer').map(action => action.payload.customer);

beforeEach(() => {
  forgetCustomerNames();
  mockDispatch.mockClear();
  mockPush.mockClear();
  mockNameQuery.mockClear();
  mockParams = {};
  mockCustomers = {};
  mockAnswer = undefined;
});
afterEach(() => {
  act(() => mounted.splice(0).forEach(renderer => renderer.unmount()));
});

describe('a warehouse role', () => {
  it.each(['admin', 'supervisor', 'staff'])('%s starts on every customer', role => {
    signIn({ role });
    const { scope } = use();
    expect(scope().level).toEqual({ kind: 'customers' });
    expect(scope().isWarehouseUser).toBe(true);
    expect(scope().changeCustomer).toBeUndefined();
    expect(mockNameQuery).not.toHaveBeenCalled();
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
    // The row's name is the facility's own: it is what the report that opens will show.
    expect(trustedCustomerName('c1')).toBe('Green Valley Traders');
  });

  it('opens a customer once for a double tap, and another one after the first push has gone through', () => {
    const now = jest.spyOn(Date, 'now');
    try {
      signIn({ role: 'staff' });
      const probe = use();
      now.mockReturnValue(2_000_000);
      probe.run(() => probe.scope().openCustomer(GREEN));
      now.mockReturnValue(2_000_000 + PUSH_GUARD_MS - 1);
      probe.run(() => probe.scope().openCustomer(GREEN));
      probe.run(() => probe.scope().openCustomer(RIVER));
      expect(mockPush.mock.calls.map(([route]) => route.params.customerId)).toEqual(['c1']);
      // The double tap is not remembered as the customer opened last either.
      expect(remembered()).toEqual([GREEN]);
      expect(trustedCustomerName('c2')).toBe('');
      now.mockReturnValue(2_000_000 + PUSH_GUARD_MS);
      probe.run(() => probe.scope().openCustomer(RIVER));
      expect(mockPush.mock.calls.map(([route]) => route.params.customerId)).toEqual(['c1', 'c2']);
    } finally {
      now.mockRestore();
    }
  });

  it("shows the customer of a row it tapped under the row's name at once, without asking the facility", async () => {
    signIn({ role: 'staff' });
    const list = use();
    list.run(() => list.scope().openCustomer(RIVER));
    // The route the tap pushed.
    mockParams = mockPush.mock.calls[0][0].params;
    const probe = use();
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: 'Riverbank Produce' });
    await probe.settle();
    expect(probe.names()).toEqual(['Riverbank Produce']);
    expect(mockNameQuery).not.toHaveBeenCalled();
  });

  it("keeps the tapped row's name whatever name the route carries", async () => {
    signIn({ role: 'staff' });
    const list = use();
    list.run(() => list.scope().openCustomer(RIVER));
    mockParams = { customerId: 'c2', customerName: 'Other Company' };
    const probe = use();
    await probe.settle();
    expect(probe.names()).toEqual(['Riverbank Produce']);
  });

  it("shows no name for a link until the facility has answered, then the facility's name, and never the link's", async () => {
    signIn({ role: 'staff' });
    mockCustomers = { c1: 'Green Valley Traders' };
    const answer = holdAnswers();
    mockParams = LINK_TO_GREEN;
    const probe = use();
    // The customer's data is asked for by the id at once; only the name waits.
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: '' });
    await probe.settle();
    expect(mockNameQuery.mock.calls).toEqual([NAME_QUERY('c1')]);
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: '' });

    await answer();
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: 'Green Valley Traders' });
    expect(probe.names()).toEqual(['', 'Green Valley Traders']);
    // Asked once, and a link is not what "Last opened" remembers.
    expect(mockNameQuery).toHaveBeenCalledTimes(1);
    expect(remembered()).toEqual([]);
  });

  it.each([
    ['cannot be reached', () => Promise.reject(new Error('Network request failed'))],
    ['refuses the read', async (): Promise<NameAnswer> => ({ data: null, error: new Error('permission denied') })],
    ['has no such customer', async (): Promise<NameAnswer> => ({ data: [], error: null })],
    ['has no name for the customer', async (): Promise<NameAnswer> => ({ data: [{ id: 'c1', name: null }], error: null })],
  ])('still shows the customer of a link, without a name, when the facility %s', async (_what, answer) => {
    signIn({ role: 'staff' });
    mockAnswer = answer;
    mockParams = LINK_TO_GREEN;
    const probe = use();
    await probe.settle();
    expect(mockNameQuery.mock.calls).toEqual([NAME_QUERY('c1')]);
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: '' });
    expect(probe.names()).toEqual(['']);
  });

  it('offers the customer opened last in this report on the customers list only', () => {
    signIn({ role: 'staff' }, { 'grn-activity': GREEN, 'stock-aging': RIVER });
    expect(use().scope().lastCustomer).toEqual(GREEN);
    mockParams = { customerId: 'c2', customerName: 'Riverbank Produce' };
    expect(use().scope().lastCustomer).toBeUndefined();
  });

  it('offers "Last opened" under the name the phone kept, but does not take that name for the facility\'s', async () => {
    // Kept by a version of the app that stored the name a link carried.
    const stored = { id: 'c1', name: 'Other Company' };
    signIn({ role: 'staff' }, { 'grn-activity': stored });
    mockCustomers = { c1: 'Green Valley Traders' };
    const list = use();
    expect(list.scope().lastCustomer).toEqual(stored);

    list.run(() => list.scope().openCustomer(list.scope().lastCustomer!));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/reports/grn-activity', params: { customerId: 'c1', customerName: 'Other Company' } });
    expect(trustedCustomerName('c1')).toBe('');
    // Nothing is stored again from what the phone kept.
    expect(remembered()).toEqual([]);

    // The report it opens asks for the name, and what the phone keeps is put right.
    mockParams = mockPush.mock.calls[0][0].params;
    const probe = use();
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: '' });
    await probe.settle();
    expect(probe.names()).toEqual(['', 'Green Valley Traders']);
    expect(remembered()).toEqual([GREEN]);
    expect(actions()).toContainEqual({
      type: 'reportPrefs/setReportCustomer',
      payload: expect.objectContaining({ scope: SCOPE, reportId: 'grn-activity', customer: GREEN }),
    });
  });

  it('forgets the names when the session changes', async () => {
    signIn({ role: 'staff' });
    const list = use();
    list.run(() => list.scope().openCustomer(RIVER));
    mockParams = { customerId: 'c2' };
    const probe = use();
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: 'Riverbank Produce' });

    // Sign-out, forced sign-out, a new sign-in and a facility switch all advance the session.
    await act(async () => {
      advanceSessionGeneration();
      await turn();
    });
    expect(trustedCustomerName('c2')).toBe('');
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: '' });
  });
});

describe('a customer account', () => {
  it('with one customer goes straight to it', () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [GREEN] });
    const { scope } = use();
    expect(scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: 'Green Valley Traders' });
    expect(scope().changeCustomer).toBeUndefined();
    // The profile names the customer: the facility is not asked.
    expect(mockNameQuery).not.toHaveBeenCalled();
  });

  it('with one customer and a profile that carries ids only (as a sign-in stores it) asks the facility for the name', async () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1'] });
    mockCustomers = { c1: 'Green Valley Traders' };
    const probe = use();
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: '' });
    await probe.settle();
    expect(mockNameQuery.mock.calls).toEqual([NAME_QUERY('c1')]);
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: 'Green Valley Traders' });
  });

  it("opened by a link to its own customer shows no name until the facility has answered, and never the link's", async () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1'] });
    mockCustomers = { c1: 'Green Valley Traders' };
    const answer = holdAnswers();
    mockParams = LINK_TO_GREEN;
    const probe = use();
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: '' });
    await probe.settle();
    expect(mockNameQuery.mock.calls).toEqual([NAME_QUERY('c1')]);

    await answer();
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c1', customerName: 'Green Valley Traders' });
    expect(probe.names()).toEqual(['', 'Green Valley Traders']);
  });

  it("opened by a link to its own customer shows the profile's name for it, not the link's", async () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [GREEN] });
    mockParams = LINK_TO_GREEN;
    const probe = use();
    await probe.settle();
    expect(probe.names()).toEqual(['Green Valley Traders']);
    expect(mockNameQuery).not.toHaveBeenCalled();
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

  it("with several and a profile that carries ids only shows the picked customer under the picker's name at once", async () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1', 'c2'] });
    const probe = use();
    expect(probe.scope().level).toEqual({ kind: 'choose' });
    // The picker read its list from the facility and hands the row that was picked.
    probe.run(() => probe.scope().chooseCustomer(RIVER));
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: 'Riverbank Produce' });
    await probe.settle();
    expect(probe.names()).toEqual(['Riverbank Produce']);
    expect(mockNameQuery).not.toHaveBeenCalled();
  });

  it('with several starts on the one it opened last, if that customer is still its own', () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1', 'c2'], assignedCustomers: [GREEN, RIVER] }, { 'grn-activity': RIVER });
    expect(use().scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: 'Riverbank Produce' });
    // The customer was taken from the account since.
    signIn({ role: 'customer', assignedCustomerIds: ['c1', 'c3'], assignedCustomers: [GREEN] }, { 'grn-activity': RIVER });
    expect(use().scope().level).toEqual({ kind: 'choose' });
  });

  it("with several starts on the one it opened last under the facility's name, not the one the phone kept", async () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1', 'c2'] }, { 'grn-activity': { id: 'c2', name: 'Other Company' } });
    mockCustomers = { c2: 'Riverbank Produce' };
    const probe = use();
    expect(probe.scope().level).toEqual({ kind: 'customer', customerId: 'c2', customerName: '' });
    await probe.settle();
    expect(mockNameQuery.mock.calls).toEqual([NAME_QUERY('c2')]);
    expect(probe.names()).toEqual(['', 'Riverbank Produce']);
    // What the phone keeps is put right.
    expect(remembered()).toEqual([RIVER]);
  });

  it('is shown nothing for a route that names somebody else\'s customer, whatever name the route gives', async () => {
    signIn({ role: 'customer', assignedCustomerIds: ['c1'], assignedCustomers: [GREEN] });
    mockParams = { customerId: 'c9', customerName: 'Green Valley Traders' };
    const refused = use();
    expect(refused.scope().level).toEqual({ kind: 'none' });
    await refused.settle();
    // Nothing is asked about a customer the account is not given.
    expect(mockNameQuery).not.toHaveBeenCalled();
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

// SR-06: a search typed for an earlier visit must not narrow the customer's report that opens.
describe('opening a customer clears that customer\'s search there', () => {
  it('openCustomer clears only the destination customer\'s search, before it pushes', () => {
    signIn({ role: 'staff' });
    const probe = use();
    let clearedBeforePush = false;
    mockPush.mockImplementationOnce(() => {
      clearedBeforePush = actions().some(action => action.type === 'listFilters/clearListFilterScope');
    });
    probe.run(() => probe.scope().openCustomer(RIVER));
    expect(actions().filter(action => action.type === 'listFilters/clearListFilterScope')).toEqual([
      { type: 'listFilters/clearListFilterScope', payload: { key: 'report-grn-activity-customer', scope: 'c2', choices: false } },
    ]);
    expect(clearedBeforePush).toBe(true);
  });

  it('a double tap clears once, as it pushes once', () => {
    signIn({ role: 'staff' });
    const probe = use();
    probe.run(() => probe.scope().openCustomer(GREEN));
    probe.run(() => probe.scope().openCustomer(GREEN));
    expect(actions().filter(action => action.type === 'listFilters/clearListFilterScope')).toHaveLength(1);
  });

  it('clearDestinationFilters clears the search and, when asked, the choices', () => {
    const dispatch = jest.fn();
    clearDestinationFilters(dispatch, 'invoice-history', 'c1', { choices: true });
    clearDestinationFilters(dispatch, 'stock-aging', 'c2');
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: 'listFilters/clearListFilterScope', payload: { key: 'report-invoice-history-customer', scope: 'c1', choices: true } },
      { type: 'listFilters/clearListFilterScope', payload: { key: 'report-stock-aging-customer', scope: 'c2', choices: false } },
    ]);
  });

  it('clearDestinationFilters does nothing for a report without a customer level or without a customer', () => {
    const dispatch = jest.fn();
    clearDestinationFilters(dispatch, 'operations-dashboard', 'c1', { choices: true });
    clearDestinationFilters(dispatch, 'grn-activity', '');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
