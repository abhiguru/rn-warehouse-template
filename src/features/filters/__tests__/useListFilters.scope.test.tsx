/**
 * A list shown for one of several customers keeps its search per customer and its other
 * choices for the whole list (review 2026-10-13, SR-06): a GRN number searched for one
 * customer must not hide the next customer's GRNs.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import listFilterReducer from '@/store/slices/listFilterSlice';
import { GRN_ACTIVITY_CUSTOMER, type GRNRecordsRequest } from '../configs/reports/grnActivity';
import { useListFilters } from '../useListFilters';

const makeStore = () =>
  configureStore({
    reducer: {
      listFilters: listFilterReducer,
      auth: (state: unknown = { userProfile: { id: 'user-a', role: 'staff' } }) => state,
    },
  });
let mockStore: ReturnType<typeof makeStore>;
jest.mock('@/store/hooks', () => {
  const { useRef, useSyncExternalStore } = jest.requireActual('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
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
  };
});
jest.mock('@/store/slices/authSlice', () => ({ logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

type Filters = ReturnType<typeof useListFilters<GRNRecordsRequest>>;
const KEY = GRN_ACTIVITY_CUSTOMER.listKey;

/** Two customers' reports on screen at once, as a native stack keeps them. */
function mountTwo() {
  const shown: Record<string, Filters> = {};
  const Probe = ({ scope }: { scope?: string }) => {
    shown[scope ?? 'none'] = useListFilters(GRN_ACTIVITY_CUSTOMER, scope === undefined ? {} : { scope });
    return null;
  };
  act(() => {
    TestRenderer.create(
      <>
        <Probe scope="c1" />
        <Probe scope="c2" />
      </>
    );
  });
  return shown;
}

beforeEach(() => {
  mockStore = makeStore();
});

describe('useListFilters with a scope', () => {
  it('a search typed for one customer is not the other customer\'s', () => {
    const shown = mountTwo();
    act(() => {
      shown.c1.setSearch('E0014');
    });
    expect(shown.c1.search).toBe('E0014');
    expect(shown.c1.request.view.words).toEqual(['e0014']);
    expect(shown.c2.search).toBe('');
    expect(shown.c2.values.search).toBeUndefined();
    expect(shown.c2.request.view.words).toEqual([]);
    expect(shown.c2.hasAny).toBe(false);
    expect(mockStore.getState().listFilters.lists[KEY]).toEqual({ values: {}, searches: { c1: 'E0014' } });
  });

  it('a choice is shared by every customer of the list', () => {
    const shown = mountTwo();
    act(() => {
      shown.c1.setSearch('E0014');
    });
    act(() => {
      shown.c1.setField('invoiced', 'not_invoiced');
    });
    expect(shown.c1.request.view.invoiced).toBe('not_invoiced');
    expect(shown.c2.request.view.invoiced).toBe('not_invoiced');
    // The search stays with c1 when a choice is set there.
    expect(shown.c1.search).toBe('E0014');
    expect(shown.c2.search).toBe('');
  });

  it('apply writes the choices for all and the search for its own customer', () => {
    const shown = mountTwo();
    act(() => {
      shown.c2.apply({ invoiced: 'invoiced', search: 'A0006' });
    });
    expect(shown.c2.search).toBe('A0006');
    expect(shown.c1.search).toBe('');
    expect(shown.c1.values.invoiced).toBe('invoiced');
  });

  it('"search as text" is kept for its own customer only', () => {
    const shown = mountTwo();
    act(() => {
      shown.c1.setSearch('A0006');
      shown.c2.setSearch('B0002');
    });
    act(() => {
      shown.c1.searchAsText();
    });
    expect(shown.c1.values.searchLiteral).toBe(true);
    expect(shown.c2.values.searchLiteral).toBeUndefined();
  });

  it('Clear all forgets its own search and the shared choices, not the other customer\'s search', () => {
    const shown = mountTwo();
    act(() => {
      shown.c1.setSearch('E0014');
      shown.c2.setSearch('A0006');
    });
    act(() => {
      shown.c1.setField('invoiced', 'not_invoiced');
    });
    act(() => {
      shown.c1.clear();
    });
    expect(shown.c1.search).toBe('');
    expect(shown.c1.values.invoiced).toBeUndefined();
    expect(shown.c2.values.invoiced).toBeUndefined();
    expect(shown.c2.search).toBe('A0006');
  });

  it('keeps recent searches per customer', () => {
    const shown = mountTwo();
    expect(shown.c1.recentKey).toBe(`${KEY}:c1`);
    expect(shown.c2.recentKey).toBe(`${KEY}:c2`);
  });
});

describe('useListFilters without a scope', () => {
  it('keeps the search with the list, as before', () => {
    let filters!: Filters;
    const Probe = () => {
      filters = useListFilters(GRN_ACTIVITY_CUSTOMER);
      return null;
    };
    act(() => {
      TestRenderer.create(<Probe />);
    });
    act(() => {
      filters.setSearch('E0014');
    });
    expect(filters.search).toBe('E0014');
    expect(filters.recentKey).toBe(KEY);
    expect(mockStore.getState().listFilters.lists[KEY].values).toEqual({ search: 'E0014' });
  });
});
