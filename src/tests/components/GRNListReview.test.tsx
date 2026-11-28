/**
 * The GRN tab after its 2026-10-18 design review (style guide 13.6, 13.7, 14.5, 14.9):
 *
 *  - Swipe actions only for the roles that have them; the same actions offered to screen readers.
 *  - A failed refresh keeps the rows under a strip; a failed first page or new filter is the error state;
 *    a failed next page is the last row with Try again; offline, the top of the list says when it loaded.
 *  - Pages of whole receipts (backend migration 98): the next page starts after the receipts received,
 *    and a facility without 98 pages lines as before.
 *  - Which cards are open is kept by the list: a card that leaves the screen and comes back keeps its
 *    state, and no other card takes it. Expand all also opens the cards loaded later.
 *  - The header's busy line while new results load over the rows on screen.
 */
import React from 'react';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { grnListElement } from '../helpers/grnListElement';
import { nb } from '@/components/common/DetailTable';
import { getAllGRNItems, getAssignedCustomerGRNItems } from '@/services/grn-service';
import { resetFlashListWindow, setFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import { StyleSheet } from 'react-native';
import { BRANDS, getTokens } from '@/theme/tokens';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
// The shared stand-in hands its props to the host element, ref included; Testing Library then gives the list's ref the host instance, which has no scrollToOffset. Drop the ref, as the old renderer's null did.
jest.mock('@shopify/flash-list', () => {
  const mock = require('@/tests/helpers/windowedFlashListMock');
  return { ...mock, FlashList: ({ ref: _ref, ...props }: { ref?: unknown }) => mock.FlashList(props) };
});
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/grn-service', () => ({
  getAllGRNItems: jest.fn(),
  getAssignedCustomerGRNItems: jest.fn(),
  // The screen's one read (WH-29): the same two reads, without the phone cache.
  getGRNListPage: (params: object, ids: string[] | null) => {
    const service = require('@/services/grn-service');
    return ids ? service.getAssignedCustomerGRNItems(ids, params) : service.getAllGRNItems(params);
  },
  withReceiptPages: (request: { p_filters?: object }) => ({ ...request, p_filters: { ...request.p_filters, page_by: 'receipt' } }),
  countReceipts: (items: { grn_id?: string; id: string }[]) => new Set(items.map((item) => item.grn_id || item.id)).size,
}));
jest.mock('@/features/filters/configs', () => ({ GRN_FILTERS: { listKey: 'grn-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
// The header is the shared one; here it is a host element that keeps its props.
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: (props: object) => require('react').createElement('FilteredListHeader', props),
  filteredEmptyProps: () => ({ activeFilterCount: 0 }),
}));
let mockFilters = {
  request: { p_sort_by: 'gr_no', p_sort_order: 'desc' } as Record<string, unknown>,
  sort: { field: 'gr_no', order: 'desc' },
  search: '',
  values: {},
  hasAny: false,
  setSearch: jest.fn(),
  apply: jest.fn(),
  clear: jest.fn(),
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
let mockPermissions = { canCreate: true, canUpdate: true, role: 'staff' };
jest.mock('@/hooks/useCapability', () => ({ useCapability: () => true }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => mockPermissions }));
let mockOffline = false;
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
let mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'staff', assignedCustomerIds: ['customer-fictional-1'] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

/** Lines of receipt `n`: `lines` lots of 10 bags each. */
const receipt = (n: number, lines = 1, date = '2026-10-01') =>
  Array.from({ length: lines }, (_, line) => ({
    id: `g${n}`,
    grn_id: `g${n}`,
    grn_item_id: `g${n}-line-${line}`,
    gr_no: `RV${15000 - n}`,
    date,
    customer_id: 'customer-fictional-1',
    customer_name: 'Fictional Orchard',
    supervisor_name: null,
    registration: null,
    item_name: `Fictional item ${line}`,
    packaging: 'Bag',
    qty: 10,
    stock: 10,
    weight: 50,
    rack: null,
    package_mark: null,
  }));
type Line = ReturnType<typeof receipt>[number];

const answer = (items: Line[], more = false, unit: 'line' | 'receipt' = 'receipt') => ({
  success: true,
  message: '',
  data: { items, pagination: { total_count: 99, limit: 20, offset: 0, has_more: more, unit } },
});
const failure = { success: false, message: 'Network unavailable', data: null };

async function renderList() {
  await render(grnListElement());
}

beforeEach(() => {
  jest.clearAllMocks();
  // Answers queued by an earlier test must not reach this one.
  jest.mocked(getAllGRNItems).mockReset();
  jest.mocked(getAssignedCustomerGRNItems).mockReset();
  resetFlashListWindow();
  mockFilters = { ...mockFilters, request: { p_sort_by: 'gr_no', p_sort_order: 'desc' }, sort: { field: 'gr_no', order: 'desc' } };
  mockPermissions = { canCreate: true, canUpdate: true, role: 'staff' };
  mockOffline = false;
  mockState = { ...mockState, auth: { userProfile: { ...mockState.auth.userProfile, role: 'staff' } } };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

type Host = ReturnType<typeof screen.getByTestId>;
// A negative check must also see an element that is mounted but hidden.
const anywhere = { includeHiddenElements: true } as const;
const present = (testID: string) => expect(screen.getByTestId(testID)).toBeOnTheScreen();
const absent = (testID: string) => expect(screen.queryByTestId(testID, anywhere)).not.toBeOnTheScreen();
const host = (testID: string) => screen.getByTestId(testID);
const card = (n: number) => screen.queryByTestId(`grn-card-g${n}`);
const toggle = (n: number) => screen.queryByTestId(`grn-card-toggle-g${n}`);
// Open means expanded on the screen. A toggle that is expanded but hidden is neither: it fails here, as the old walk (which saw hidden nodes) would have.
const isOpen = (n: number) => {
  const open = Boolean(toggle(n)?.props.accessibilityState?.expanded);
  const mounted = Boolean(screen.queryByTestId(`grn-card-toggle-g${n}`, anywhere)?.props.accessibilityState?.expanded);
  if (open !== mounted) throw new Error(`toggle ${n} is expanded but hidden`);
  return open;
};
const user = () => userEvent.setup({ delay: 0 });
const press = (node: Host | null) => user().press(node as Host);
/** Every host element below one, in order (the stand-in hosts "FlashList" and "FilteredListHeader" have no role, label or text). */
const below = (node: Host): Host[] => node.children.flatMap((child) => (!child || typeof child === 'string' ? [] : [child as Host, ...below(child as Host)]));
const allHosts = () => [screen.root as Host, ...below(screen.root as Host)];
const byType = (type: string) => {
  const found = allHosts().filter((node) => (node.type as unknown) === type);
  if (found.length !== 1) throw new Error(`expected one ${type}, found ${found.length}`);
  return found[0];
};
const list = () => byType('FlashList');
const header = () => byType('FilteredListHeader');
const textOf = (node: Host) =>
  [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join('');
// What is drawn on screen, and (for a negative or a count) everything mounted, hidden or not.
const texts = () => screen.queryAllByText(/^/).map(textOf);
const allTexts = () => screen.queryAllByText(/^/, anywhere).map(textOf);
const endReached = () => fireEvent(list(), 'endReached');
const refresh = () => act(async () => { await list().props.refreshControl.props.onRefresh(); });
/** The Swipeable around a card, or null when the card is not in one (read from the fiber; Testing Library shows host views only). */
const swipeableOf = (n: number) => {
  let fiber = host(`grn-card-g${n}`).unstable_fiber;
  while (fiber && fiber.type !== Swipeable) fiber = fiber.return;
  return fiber;
};

/** How many Swipeables are drawn in all (the old test required exactly one per card): every one that has a drawn element below it, read from the fiber (it is no host view). */
const swipeableCount = () => {
  const found = new Set<unknown>();
  for (const node of allHosts()) {
    for (let fiber = node.unstable_fiber; fiber; fiber = fiber.return) {
      if (fiber.type === Swipeable && !found.has(fiber.alternate)) found.add(fiber);
    }
  }
  return found.size;
};

describe('actions by role', () => {
  it('a customer account gets a plain card: no swipe, no actions, no "Edit" anywhere', async () => {
    mockPermissions = { canCreate: false, canUpdate: false, role: 'customer' };
    mockState = { ...mockState, auth: { userProfile: { ...mockState.auth.userProfile, role: 'customer' } } };
    jest.mocked(getAssignedCustomerGRNItems).mockResolvedValue(answer(receipt(1)) as never);
    await renderList();

    expect(swipeableOf(1)).toBeNull();
    expect(swipeableCount()).toBe(0);
    expect(card(1)?.props.accessibilityActions).toBeUndefined();
    expect(card(1)).toHaveProp('accessibilityHint', 'Opens the GRN.');
    expect(allTexts()).not.toContain('Edit');
  });

  it('staff get Print and Edit in the swipe and as screen-reader actions that do the same', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1)) as never);
    await renderList();

    expect(swipeableOf(1)).not.toBeNull();
    expect(swipeableCount()).toBe(1);
    expect(card(1)?.props.accessibilityActions).toEqual([
      { name: 'print', label: 'Print GRN RV14999' },
      { name: 'edit', label: 'Edit GRN RV14999' },
    ]);
    expect(card(1)).toHaveProp('accessibilityHint', 'Opens the GRN. Print and Edit are in the actions menu.');

    await fireEvent(card(1) as Host, 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    expect(router.push).toHaveBeenCalledWith('/grn-edit/g1/step1');

    expect(byType('PrintRangeDialog').props.visible).toBe(false);
    await fireEvent(card(1) as Host, 'accessibilityAction', { nativeEvent: { actionName: 'print' } });
    expect(byType('PrintRangeDialog').props.visible).toBe(true);
  });
});

describe('load errors (style guide 14.9)', () => {
  it('a failed refresh keeps the rows under a strip, and Try again loads them again', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1)) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    await refresh();

    present('grn-stale-strip');
    expect(card(1)).toBeOnTheScreen();

    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1)) as never);
    await press(screen.getByTestId('grn-stale-strip-retry'));
    await waitFor(() => absent('grn-stale-strip'));
  });

  it('shows the skeleton, never the empty state, while a new first page is pending', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([]) as never);
    await renderList();
    expect(texts()).toContain('No GRNs yet');

    let release!: (value: unknown) => void;
    jest.mocked(getAllGRNItems).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }) as never);
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { stock_status: 'low_stock' } } };
    await screen.rerender(grnListElement());

    const busy = allHosts().filter((node) => node.props.accessibilityState?.busy === true && node.props.accessibilityLabel);
    expect(busy.length).toBeGreaterThan(0);
    expect(allTexts()).not.toContain('No GRNs yet');
    await act(async () => { release(answer([]) as never); });
  });

  it('a failed first page is the error state with Try again', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(failure as never);
    await renderList();

    expect(texts()).toContain("Couldn't load GRNs");
    absent('grn-card-g1');
  });

  it('a failed new filter does not pass the old rows off as its answer', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1)) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { stock_status: 'low_stock' } } };
    await screen.rerender(grnListElement());

    absent('grn-card-g1');
    absent('grn-stale-strip');
    expect(texts()).toContain("Couldn't load GRNs");
  });

  it('a failed next page is the last row with Try again, which asks for the same page', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    await endReached();

    present('grn-load-more-error');
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(2)) as never);
    await press(screen.getByLabelText('Try loading more GRNs again'));

    const offsets = jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params?.p_offset);
    expect(offsets).toEqual([0, 1, 1]);
    expect(card(2)).toBeOnTheScreen();
  });

  it('offline, the top of the list says when the GRNs were loaded', async () => {
    mockOffline = true;
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1)) as never);
    await renderList();

    present('grn-last-updated');
  });
});

describe('pages of whole receipts', () => {
  it('asks for receipts, and starts the next page after the receipts received', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1, 3), ...receipt(2, 2), ...receipt(3, 2)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(4)) as never);
    await renderList();
    await endReached();

    const calls = jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params);
    expect(calls[0]).toMatchObject({ p_offset: 0, p_limit: 20, p_filters: { page_by: 'receipt' } });
    expect(calls[1]).toMatchObject({ p_offset: 3, p_limit: 20, p_filters: { page_by: 'receipt' } });
  });

  it('pages lines, as before, when the facility has no migration 98', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1, 3), ...receipt(2, 2), ...receipt(3, 2)], true, 'line') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(4), false, 'line') as never);
    await renderList();
    await endReached();

    expect(jest.mocked(getAllGRNItems).mock.calls[1][0]).toMatchObject({ p_offset: 7, p_limit: 80 });
  });
});

describe('repeated lines on a next page (code review 2026-10-18, R1-01)', () => {
  it('a receipt the next page repeats is not added to its card twice, and the offset counts the raw page', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1), ...receipt(2), ...receipt(3, 2)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(3, 2), ...receipt(4)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(5)) as never);
    await renderList();
    present('grn-card-stock-g3');
    await endReached();

    const stockOf = (n: number) => [within(host(`grn-card-stock-g${n}`)).queryAllByText(/^/)[1].props.children].flat().join('');
    // The number left in stock (the card no longer prints "of N bags"): 20 once, not 40 if the repeat were added again.
    expect(stockOf(3)).toBe('20');
    expect(allTexts().filter((text) => text === '2 items')).toHaveLength(1);

    await endReached();
    // Page 1 held 3 receipts, page 2 answered 2 (one a repeat): the server has counted 5.
    expect(jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 3, 5]);
  });

  it('a line mode page that repeats a line does not show it twice', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1), ...receipt(2, 2)], true, 'line') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(2, 2).slice(1), ...receipt(3)], false, 'line') as never);
    await renderList();
    await endReached();

    expect(allTexts().filter((text) => text === '2 items')).toHaveLength(1);
    expect(jest.mocked(getAllGRNItems).mock.calls.length).toBe(2);
  });
});

describe('the unit changes while the list is open (R1-03)', () => {
  it('an answer in receipts after pages counted in lines reloads from the first page', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1, 3), ...receipt(2, 2), ...receipt(3, 2)], true, 'line') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(4), true, 'receipt') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1), ...receipt(2)], true, 'receipt') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(3)) as never);
    await renderList();
    await endReached();

    const calls = jest.mocked(getAllGRNItems).mock.calls.map(([params]) => [params?.p_offset, params?.p_limit]);
    expect(calls).toEqual([[0, 20], [7, 80], [0, 20]]);
    // The rows are those of the reload, not a mixture.
    absent('grn-card-g4');
    expect([1, 2].map((n) => card(n) !== null)).toEqual([true, true]);
    // And the next page continues in receipts.
    await endReached();
    expect(jest.mocked(getAllGRNItems).mock.calls[3][0]).toMatchObject({ p_offset: 2, p_limit: 20 });
  });
});

describe('a next page that is no longer wanted (R1-08)', () => {
  const deferred = () => {
    let finish!: (value: unknown) => void;
    const promise = new Promise((resolve) => { finish = resolve; });
    return { promise, finish };
  };

  it('is dropped when it is answered after a new filter, and the next offset is the new first page\'s', async () => {
    const later = deferred();
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never);
    jest.mocked(getAllGRNItems).mockImplementationOnce(() => later.promise as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(7), ...receipt(8)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(9)) as never);
    await renderList();
    await endReached();
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { stock_status: 'in_stock' } } };
    await screen.rerender(grnListElement());
    await act(async () => { later.finish(answer(receipt(2))); });

    absent('grn-card-g2');
    expect(card(7)).toBeOnTheScreen();
    await endReached();
    expect(jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 1, 0, 2]);
  });

  it('is dropped when it is answered after a refresh', async () => {
    const later = deferred();
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never);
    jest.mocked(getAllGRNItems).mockImplementationOnce(() => later.promise as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(3)) as never);
    await renderList();
    await endReached();
    await refresh();
    await act(async () => { later.finish(answer(receipt(2))); });

    absent('grn-card-g2');
    await endReached();
    expect(jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 1, 0, 1]);
  });
});

describe('the end of the list after a failed next page (R1-04)', () => {
  it('does not ask again by itself; only Try again does', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    await endReached();
    present('grn-load-more-error');

    await endReached();
    expect(jest.mocked(getAllGRNItems)).toHaveBeenCalledTimes(2);
    present('grn-load-more-error');
  });
});

describe('a reload that fails on a list with no rows (R1-05)', () => {
  it('shows the error state, not the old empty state', async () => {
    const requestA = mockFilters.request;
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([]) as never);
    jest.mocked(getAllGRNItems).mockImplementationOnce(() => new Promise(() => {}) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(failure as never);
    await renderList();
    expect(texts()).toContain('No GRNs yet');

    // The filter is changed and changed back before the answer: the same request is asked again, and fails.
    mockFilters = { ...mockFilters, request: { ...requestA, p_filters: { stock_status: 'in_stock' } } };
    await screen.rerender(grnListElement());
    mockFilters = { ...mockFilters, request: { ...requestA } };
    await screen.rerender(grnListElement());

    expect(texts()).toContain("Couldn't load GRNs");
    expect(allTexts()).not.toContain('No GRNs yet');
  });
});

describe('swipe state belongs to the GRN (R1-06)', () => {
  it('each swipeable is keyed by its GRN, so a recycled cell cannot keep another GRN\'s open swipe', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer([...receipt(1), ...receipt(2)]) as never);
    await renderList();

    // Fiber read: the key of the Swipeable above each card (it is no host view, so no query reaches it).
    expect([swipeableOf(1)?.key, swipeableOf(2)?.key]).toEqual(['g1', 'g2']);
    expect(swipeableCount()).toBe(2);
  });
});

describe('a filter on lines (code review 2026-10-18, R1-02)', () => {
  it('without one, the card counts its items and says nothing more', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1, 3)) as never);
    await renderList();

    expect(texts()).toContain('3 items');
    absent('grn-card-filtered-note-g1');
    expect(card(1)?.props.accessibilityLabel).not.toContain('Only the items that match');
  });

  it('with one, the card says "matching items" and that only those are shown, also to a screen reader', async () => {
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { item_ids: ['item-fictional-1'] } } };
    jest.mocked(getAllGRNItems).mockResolvedValue(answer([...receipt(1, 3), ...receipt(2)]) as never);
    await renderList();

    expect(texts()).toEqual(expect.arrayContaining(['3 matching items', '1 matching item']));
    expect(allTexts()).not.toContain('3 items');
    expect(allTexts().filter((text) => text === 'Only the items that match the filters are shown.')).toHaveLength(2);
    expect(card(1)?.props.accessibilityLabel).toContain('3 matching items');
    expect(card(1)?.props.accessibilityLabel).toContain('Only the items that match the filters are shown.');
  });

  it('a customer, date or GRN number filter keeps whole GRNs and adds no note', async () => {
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { customer_ids: ['customer-fictional-1'], gr_no_from: 'RV1' } } };
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1, 3)) as never);
    await renderList();

    expect(texts()).toContain('3 items');
    absent('grn-card-filtered-note-g1');
  });
});

describe('open cards', () => {
  it('a card keeps its state when it leaves the screen and comes back, and no other card takes it', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer([...receipt(1), ...receipt(2)]) as never);
    await renderList();
    await press(toggle(1));
    expect([isOpen(1), isOpen(2)]).toEqual([true, false]);

    // GRN 1 scrolls off the screen, then back.
    await act(async () => setFlashListWindow(1));
    absent('grn-card-g1');
    expect(isOpen(2)).toBe(false);
    await act(async () => setFlashListWindow());

    expect([isOpen(1), isOpen(2)]).toEqual([true, false]);
  });

  it('Expand all opens every card, also those loaded later; one can then be closed on its own', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1), ...receipt(2)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(3)) as never);
    await renderList();

    await act(async () => header().props.expand.onToggle());
    expect(header().props.expand.expanded).toBe(true);
    await endReached();
    expect([1, 2, 3].map((n) => isOpen(n))).toEqual([true, true, true]);

    await press(toggle(2));
    expect([1, 2, 3].map((n) => isOpen(n))).toEqual([true, false, true]);
  });
});

describe('the header', () => {
  it('shows its busy line while new results load over the rows on screen', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1)) as never);
    await renderList();
    expect(header().props.busy).toBe(false);

    let finish!: (value: unknown) => void;
    jest.mocked(getAllGRNItems).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }) as never);
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { stock_status: 'in_stock' } } };
    await screen.rerender(grnListElement());
    expect(header().props.busy).toBe(true);

    await act(async () => { finish(answer(receipt(1))); });
    expect(header().props.busy).toBe(false);
  });

  it('date headings count GRNs, as a lower bound while more pages remain', async () => {
    mockFilters = { ...mockFilters, request: { p_sort_by: 'date', p_sort_order: 'desc' }, sort: { field: 'date', order: 'desc' } };
    jest.mocked(getAllGRNItems).mockResolvedValue(answer([...receipt(1), ...receipt(2)], true) as never);
    await renderList();

    // The figure is hidden from screen readers (the heading's label says it), so it is mounted but not on the accessibility tree.
    expect(allTexts()).toContain('2+');
    expect(screen.getAllByLabelText(/, more than 2 GRNs$/, anywhere)).toHaveLength(1);
  });
});

describe.each(BRANDS.flatMap((brand) => (['light', 'dark'] as const).map((mode) => [brand, mode] as const)))('in %s %s', (brand, mode) => {
  it('draws the cards, the open table and the stale strip from that theme', async () => {
    mockState = { ...mockState, theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1, 2)) as never).mockResolvedValueOnce(failure as never);
    await renderList();
    await press(toggle(1));
    await refresh();

    const backgrounds = allHosts()
      .map((node) => StyleSheet.flatten(node.props.style)?.backgroundColor)
      .filter(Boolean);
    expect(backgrounds).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.table.headerFill, t.status.critical.background]));
  });
});

describe('a page served from the phone\'s saved copy while the phone is online (WH-124)', () => {
  const OLD = new Date('2026-09-20T18:26:00').getTime();
  const saved = (items: Line[]) => ({ ...answer(items), fromCache: true, cachedAt: OLD }) as never;
  const updated = () => texts().filter((text) => /Last updated/.test(text)).join('|');

  it('says when the page was loaded, with its date, though the phone has a connection', async () => {
    mockOffline = false;
    jest.mocked(getAllGRNItems).mockResolvedValue(saved(receipt(1)));
    await renderList();

    expect(card(1)).toBeOnTheScreen();
    present('grn-last-updated');
    expect(updated()).toMatch(/20\/09\/26/);
    expect(updated()).toMatch(/6:26/);
  });

  it('the line goes when a later load succeeds', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(saved(receipt(1))).mockResolvedValueOnce(answer(receipt(2)) as never);
    await renderList();
    present('grn-last-updated');
    mockFilters = { ...mockFilters, request: { p_sort_by: 'date', p_sort_order: 'asc' }, sort: { field: 'date', order: 'asc' } };
    await screen.rerender(grnListElement());

    expect(card(2)).toBeOnTheScreen();
    absent('grn-last-updated');
  });

  it('a page loaded from the server, online, shows no line', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1)) as never);
    await renderList();
    absent('grn-last-updated');
  });
});
