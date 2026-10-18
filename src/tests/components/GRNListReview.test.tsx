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
import { getAllGRNItems, getAssignedCustomerGRNItems } from '@/services/grn-service';
import { resetFlashListWindow, setFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import { StyleSheet } from 'react-native';
import { BRANDS, getTokens } from '@/theme/tokens';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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
