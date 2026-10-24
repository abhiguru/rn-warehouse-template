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
import { Swipeable } from 'react-native-gesture-handler';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import GRNListFiori from '@/components/GRNListFiori';
import { nb } from '@/components/common/DetailTable';
import { getAllGRNItems, getAssignedCustomerGRNItems } from '@/services/grn-service';
import { resetFlashListWindow, setFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import { StyleSheet } from 'react-native';
import { BRANDS, getTokens } from '@/theme/tokens';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/grn-service', () => ({
  getAllGRNItems: jest.fn(),
  getAssignedCustomerGRNItems: jest.fn(),
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
let mockPermissions = { canCreate: true, canUpdate: true };
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

const mounted: ReactTestRenderer[] = [];
async function renderList() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GRNListFiori />);
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Answers queued by an earlier test must not reach this one.
  jest.mocked(getAllGRNItems).mockReset();
  jest.mocked(getAssignedCustomerGRNItems).mockReset();
  resetFlashListWindow();
  mockFilters = { ...mockFilters, request: { p_sort_by: 'gr_no', p_sort_order: 'desc' }, sort: { field: 'gr_no', order: 'desc' } };
  mockPermissions = { canCreate: true, canUpdate: true };
  mockOffline = false;
  mockState = { ...mockState, auth: { userProfile: { ...mockState.auth.userProfile, role: 'staff' } } };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

const host = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0];
const card = (tree: ReactTestRenderer, n: number) => host(tree, `grn-card-g${n}`);
/** The pressable (not its drawn view) with this testID. */
const pressable = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll((node) => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const toggle = (tree: ReactTestRenderer, n: number) => pressable(tree, `grn-card-toggle-g${n}`);
const isOpen = (tree: ReactTestRenderer, n: number) => Boolean(toggle(tree, n)?.props.accessibilityState?.expanded);
const press = (node: ReactTestInstance) => act(async () => { await node.props.onPress(); });
const list = (tree: ReactTestRenderer) => tree.root.findByType('FlashList' as never);
const header = (tree: ReactTestRenderer) => tree.root.findByType('FilteredListHeader' as never);
const texts = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join(''));

describe('actions by role', () => {
  it('a customer account gets a plain card: no swipe, no actions, no "Edit" anywhere', async () => {
    mockPermissions = { canCreate: false, canUpdate: false };
    mockState = { ...mockState, auth: { userProfile: { ...mockState.auth.userProfile, role: 'customer' } } };
    jest.mocked(getAssignedCustomerGRNItems).mockResolvedValue(answer(receipt(1)) as never);
    const tree = await renderList();

    expect(tree.root.findAllByType(Swipeable)).toHaveLength(0);
    expect(card(tree, 1).props.accessibilityActions).toBeUndefined();
    expect(card(tree, 1).props.accessibilityHint).toBe('Opens the GRN.');
    expect(texts(tree)).not.toContain('Edit');
  });

  it('staff get Print and Edit in the swipe and as screen-reader actions that do the same', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1)) as never);
    const tree = await renderList();

    expect(tree.root.findAllByType(Swipeable)).toHaveLength(1);
    expect(card(tree, 1).props.accessibilityActions).toEqual([
      { name: 'print', label: 'Print' },
      { name: 'edit', label: 'Edit' },
    ]);
    expect(card(tree, 1).props.accessibilityHint).toBe('Opens the GRN. Print and Edit are in the actions menu.');

    act(() => card(tree, 1).props.onAccessibilityAction({ nativeEvent: { actionName: 'edit' } }));
    expect(router.push).toHaveBeenCalledWith('/grn-edit/g1/step1');

    expect(tree.root.findByType('PrintRangeDialog' as never).props.visible).toBe(false);
    act(() => card(tree, 1).props.onAccessibilityAction({ nativeEvent: { actionName: 'print' } }));
    expect(tree.root.findByType('PrintRangeDialog' as never).props.visible).toBe(true);
  });
});

describe('load errors (style guide 14.9)', () => {
  it('a failed refresh keeps the rows under a strip, and Try again loads them again', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1)) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.refreshControl.props.onRefresh(); });

    expect(host(tree, 'grn-stale-strip')).toBeDefined();
    expect(card(tree, 1)).toBeDefined();

    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1)) as never);
    await press(pressable(tree, 'grn-stale-strip-retry'));
    expect(host(tree, 'grn-stale-strip')).toBeUndefined();
  });

  it('a failed first page is the error state with Try again', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(failure as never);
    const tree = await renderList();

    expect(texts(tree)).toContain("Couldn't load GRNs");
    expect(card(tree, 1)).toBeUndefined();
  });

  it('a failed new filter does not pass the old rows off as its answer', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1)) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { stock_status: 'low_stock' } } };
    await act(async () => { tree.update(<GRNListFiori />); });

    expect(card(tree, 1)).toBeUndefined();
    expect(host(tree, 'grn-stale-strip')).toBeUndefined();
    expect(texts(tree)).toContain("Couldn't load GRNs");
  });

  it('a failed next page is the last row with Try again, which asks for the same page', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });

    expect(host(tree, 'grn-load-more-error')).toBeDefined();
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(2)) as never);
    await press(tree.root.findAll((node) => node.props.accessibilityLabel === 'Try loading more GRNs again' && typeof node.props.onPress === 'function')[0]);

    const offsets = jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params?.p_offset);
    expect(offsets).toEqual([0, 1, 1]);
    expect(card(tree, 2)).toBeDefined();
  });

  it('offline, the top of the list says when the GRNs were loaded', async () => {
    mockOffline = true;
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1)) as never);
    const tree = await renderList();

    expect(host(tree, 'grn-last-updated')).toBeDefined();
  });
});

describe('pages of whole receipts', () => {
  it('asks for receipts, and starts the next page after the receipts received', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1, 3), ...receipt(2, 2), ...receipt(3, 2)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(4)) as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });

    const calls = jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params);
    expect(calls[0]).toMatchObject({ p_offset: 0, p_limit: 20, p_filters: { page_by: 'receipt' } });
    expect(calls[1]).toMatchObject({ p_offset: 3, p_limit: 20, p_filters: { page_by: 'receipt' } });
  });

  it('pages lines, as before, when the facility has no migration 98', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1, 3), ...receipt(2, 2), ...receipt(3, 2)], true, 'line') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(4), false, 'line') as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });

    expect(jest.mocked(getAllGRNItems).mock.calls[1][0]).toMatchObject({ p_offset: 7, p_limit: 80 });
  });
});

describe('repeated lines on a next page (code review 2026-10-18, R1-01)', () => {
  it('a receipt the next page repeats is not added to its card twice, and the offset counts the raw page', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1), ...receipt(2), ...receipt(3, 2)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(3, 2), ...receipt(4)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(5)) as never);
    const tree = await renderList();
    expect(host(tree, 'grn-card-stock-g3')).toBeDefined();
    await act(async () => { await list(tree).props.onEndReached(); });

    const stockOf = (n: number) => [host(tree, `grn-card-stock-g${n}`).findAllByType('Text' as never)[0].props.children].flat().join('');
    expect(stockOf(3)).toBe(`20 of ${nb('20 bags')}`);
    expect(texts(tree).filter((text) => text === '2 items')).toHaveLength(1);

    await act(async () => { await list(tree).props.onEndReached(); });
    // Page 1 held 3 receipts, page 2 answered 2 (one a repeat): the server has counted 5.
    expect(jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 3, 5]);
  });

  it('a line mode page that repeats a line does not show it twice', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1), ...receipt(2, 2)], true, 'line') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(2, 2).slice(1), ...receipt(3)], false, 'line') as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });

    expect(texts(tree).filter((text) => text === '2 items')).toHaveLength(1);
    expect(jest.mocked(getAllGRNItems).mock.calls.length).toBe(2);
  });
});

describe('the unit changes while the list is open (R1-03)', () => {
  it('an answer in receipts after pages counted in lines reloads from the first page', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1, 3), ...receipt(2, 2), ...receipt(3, 2)], true, 'line') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(4), true, 'receipt') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1), ...receipt(2)], true, 'receipt') as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(3)) as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });

    const calls = jest.mocked(getAllGRNItems).mock.calls.map(([params]) => [params?.p_offset, params?.p_limit]);
    expect(calls).toEqual([[0, 20], [7, 80], [0, 20]]);
    // The rows are those of the reload, not a mixture.
    expect(card(tree, 4)).toBeUndefined();
    expect([1, 2].map((n) => card(tree, n) !== undefined)).toEqual([true, true]);
    // And the next page continues in receipts.
    await act(async () => { await list(tree).props.onEndReached(); });
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
    const tree = await renderList();
    await act(async () => { list(tree).props.onEndReached(); });
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { stock_status: 'in_stock' } } };
    await act(async () => { tree.update(<GRNListFiori />); });
    await act(async () => { later.finish(answer(receipt(2))); });

    expect(card(tree, 2)).toBeUndefined();
    expect(card(tree, 7)).toBeDefined();
    await act(async () => { await list(tree).props.onEndReached(); });
    expect(jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 1, 0, 2]);
  });

  it('is dropped when it is answered after a refresh', async () => {
    const later = deferred();
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never);
    jest.mocked(getAllGRNItems).mockImplementationOnce(() => later.promise as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(3)) as never);
    const tree = await renderList();
    await act(async () => { list(tree).props.onEndReached(); });
    await act(async () => { await list(tree).props.refreshControl.props.onRefresh(); });
    await act(async () => { later.finish(answer(receipt(2))); });

    expect(card(tree, 2)).toBeUndefined();
    await act(async () => { await list(tree).props.onEndReached(); });
    expect(jest.mocked(getAllGRNItems).mock.calls.map(([params]) => params?.p_offset)).toEqual([0, 1, 0, 1]);
  });
});

describe('the end of the list after a failed next page (R1-04)', () => {
  it('does not ask again by itself; only Try again does', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1), true) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    await act(async () => { await list(tree).props.onEndReached(); });
    expect(host(tree, 'grn-load-more-error')).toBeDefined();

    await act(async () => { await list(tree).props.onEndReached(); });
    expect(jest.mocked(getAllGRNItems)).toHaveBeenCalledTimes(2);
    expect(host(tree, 'grn-load-more-error')).toBeDefined();
  });
});

describe('a reload that fails on a list with no rows (R1-05)', () => {
  it('shows the error state, not the old empty state', async () => {
    const requestA = mockFilters.request;
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([]) as never);
    jest.mocked(getAllGRNItems).mockImplementationOnce(() => new Promise(() => {}) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    expect(texts(tree)).toContain('No GRNs yet');

    // The filter is changed and changed back before the answer: the same request is asked again, and fails.
    mockFilters = { ...mockFilters, request: { ...requestA, p_filters: { stock_status: 'in_stock' } } };
    await act(async () => { tree.update(<GRNListFiori />); });
    mockFilters = { ...mockFilters, request: { ...requestA } };
    await act(async () => { tree.update(<GRNListFiori />); });

    expect(texts(tree)).toContain("Couldn't load GRNs");
    expect(texts(tree)).not.toContain('No GRNs yet');
  });
});

describe('swipe state belongs to the GRN (R1-06)', () => {
  it('each swipeable is keyed by its GRN, so a recycled cell cannot keep another GRN\'s open swipe', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer([...receipt(1), ...receipt(2)]) as never);
    const tree = await renderList();

    const keys = tree.root.findAllByType(Swipeable).map((node) => (node as unknown as { _fiber: { key: string | null } })._fiber.key);
    expect(keys).toEqual(['g1', 'g2']);
  });
});

describe('a filter on lines (code review 2026-10-18, R1-02)', () => {
  it('without one, the card counts its items and says nothing more', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1, 3)) as never);
    const tree = await renderList();

    expect(texts(tree)).toContain('3 items');
    expect(host(tree, 'grn-card-filtered-note-g1')).toBeUndefined();
    expect(card(tree, 1).props.accessibilityLabel).not.toContain('Only the items that match');
  });

  it('with one, the card says "matching items" and that only those are shown, also to a screen reader', async () => {
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { item_ids: ['item-fictional-1'] } } };
    jest.mocked(getAllGRNItems).mockResolvedValue(answer([...receipt(1, 3), ...receipt(2)]) as never);
    const tree = await renderList();

    expect(texts(tree)).toEqual(expect.arrayContaining(['3 matching items', '1 matching item']));
    expect(texts(tree)).not.toContain('3 items');
    expect(texts(tree).filter((text) => text === 'Only the items that match the filters are shown.')).toHaveLength(2);
    expect(card(tree, 1).props.accessibilityLabel).toContain('3 matching items');
    expect(card(tree, 1).props.accessibilityLabel).toContain('Only the items that match the filters are shown.');
  });

  it('a customer, date or GRN number filter keeps whole GRNs and adds no note', async () => {
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { customer_ids: ['customer-fictional-1'], gr_no_from: 'RV1' } } };
    jest.mocked(getAllGRNItems).mockResolvedValue(answer(receipt(1, 3)) as never);
    const tree = await renderList();

    expect(texts(tree)).toContain('3 items');
    expect(host(tree, 'grn-card-filtered-note-g1')).toBeUndefined();
  });
});

describe('open cards', () => {
  it('a card keeps its state when it leaves the screen and comes back, and no other card takes it', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValue(answer([...receipt(1), ...receipt(2)]) as never);
    const tree = await renderList();
    await press(toggle(tree, 1));
    expect([isOpen(tree, 1), isOpen(tree, 2)]).toEqual([true, false]);

    // GRN 1 scrolls off the screen, then back.
    act(() => setFlashListWindow(1));
    expect(card(tree, 1)).toBeUndefined();
    expect(isOpen(tree, 2)).toBe(false);
    act(() => setFlashListWindow());

    expect([isOpen(tree, 1), isOpen(tree, 2)]).toEqual([true, false]);
  });

  it('Expand all opens every card, also those loaded later; one can then be closed on its own', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer([...receipt(1), ...receipt(2)], true) as never);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(3)) as never);
    const tree = await renderList();

    act(() => header(tree).props.expand.onToggle());
    expect(header(tree).props.expand.expanded).toBe(true);
    await act(async () => { await list(tree).props.onEndReached(); });
    expect([1, 2, 3].map((n) => isOpen(tree, n))).toEqual([true, true, true]);

    await press(toggle(tree, 2));
    expect([1, 2, 3].map((n) => isOpen(tree, n))).toEqual([true, false, true]);
  });
});

describe('the header', () => {
  it('shows its busy line while new results load over the rows on screen', async () => {
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1)) as never);
    const tree = await renderList();
    expect(header(tree).props.busy).toBe(false);

    let finish!: (value: unknown) => void;
    jest.mocked(getAllGRNItems).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }) as never);
    mockFilters = { ...mockFilters, request: { ...mockFilters.request, p_filters: { stock_status: 'in_stock' } } };
    await act(async () => { tree.update(<GRNListFiori />); });
    expect(header(tree).props.busy).toBe(true);

    await act(async () => { finish(answer(receipt(1))); });
    expect(header(tree).props.busy).toBe(false);
  });

  it('date headings count GRNs, as a lower bound while more pages remain', async () => {
    mockFilters = { ...mockFilters, request: { p_sort_by: 'date', p_sort_order: 'desc' }, sort: { field: 'date', order: 'desc' } };
    jest.mocked(getAllGRNItems).mockResolvedValue(answer([...receipt(1), ...receipt(2)], true) as never);
    const tree = await renderList();

    expect(texts(tree)).toContain('2+');
    expect(
      tree.root.findAll((node) => typeof node.type === 'string' && /, more than 2 GRNs$/.test(String(node.props.accessibilityLabel ?? '')))
    ).toHaveLength(1);
  });
});

describe.each(BRANDS.flatMap((brand) => (['light', 'dark'] as const).map((mode) => [brand, mode] as const)))('in %s %s', (brand, mode) => {
  it('draws the cards, the open table and the stale strip from that theme', async () => {
    mockState = { ...mockState, theme: { preference: mode, brand } };
    const t = getTokens(brand, mode);
    jest.mocked(getAllGRNItems).mockResolvedValueOnce(answer(receipt(1, 2)) as never).mockResolvedValueOnce(failure as never);
    const tree = await renderList();
    await press(toggle(tree, 1));
    await act(async () => { await list(tree).props.refreshControl.props.onRefresh(); });

    const backgrounds = tree.root
      .findAll((node) => typeof node.type === 'string')
      .map((node) => StyleSheet.flatten(node.props.style)?.backgroundColor)
      .filter(Boolean);
    expect(backgrounds).toEqual(expect.arrayContaining([t.background.base, t.surface.card, t.table.headerFill, t.status.critical.background]));
  });
});
