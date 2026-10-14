/**
 * Renders the dispatch object cells in all four themes (brand × mode): surfaces
 * come from tokens, the status tag carries a word, and no brand fill is used.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import { MemoizedDispatchItem } from '@/components/list-items/MemoizedDispatchItem';
import { RecentDispatchedOrderCard } from '@/components/list-items/RecentDispatchedOrderCard';
import type { Dispatch } from '@/services/dispatch-service';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function renderIn(brand: string, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function hostStyles(tree: ReactTestRenderer) {
  return tree.root
    .findAll(node => typeof node.type === 'string')
    .map(node => StyleSheet.flatten(node.props.style) ?? {});
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).join(''));
}

const dispatch = {
  dispatch_id: 'd1',
  disp_no: '42',
  disp_date: '2026-10-09',
  customer_name: 'Patel Traders',
  total_qty: 120,
  // Still sent by the backend; the card no longer shows a total weight.
  total_weight: 6000,
  total_items: 2,
  registration: 'GJ01AB1234',
  items: [
    { grn_item_id: 'g1', item_name: 'Potatoes', rack: 'B-14', package_mark: 'PM', weight: 50, gr_no: '311', grn_qty: 200, disp_qty: 100 },
  ],
} as unknown as Dispatch;

const recent: RecentDispatchedOrder = {
  dispatch_id: 'd2',
  disp_no: '43',
  disp_date: '2026-10-09',
  customer_id: 'c1',
  customer_name: 'Patel Traders',
  order_id: 'o1',
  order_no: '1042',
  item_count: 1,
  total_qty: 1,
  registration: null,
  created_by_name: 'Asha',
  items: [],
} as RecentDispatchedOrder;

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders MemoizedDispatchItem as a token object cell with a status word', () => {
    const tree = renderIn(brand, mode, <MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} />);
    const bgs = hostStyles(tree).map(s => s.backgroundColor);
    expect(bgs).toContain(t.surface.card);
    expect(bgs).toContain(t.status.positive.background);
    expect(bgs).not.toContain(t.brand.fill);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Dispatch 42', 'Complete', '120 bags']));
    expect(texts(tree).some(text => /kg/i.test(text))).toBe(false);
  });

  it('renders RecentDispatchedOrderCard as a token object cell with a status word', () => {
    const tree = renderIn(brand, mode, <RecentDispatchedOrderCard dispatch={recent} onPress={jest.fn()} />);
    const bgs = hostStyles(tree).map(s => s.backgroundColor);
    expect(bgs).toContain(t.surface.card);
    expect(bgs).not.toContain(t.brand.fill);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Dispatch 43', 'Dispatched', '1 bag', 'Order 1042']));
  });
});

// M9-9: the memo comparators looked at the totals only, so a card kept its old
// lines after a refetch that changed lines without changing a total.
describe('a refetched dispatch whose lines changed is drawn again', () => {
  const render = (element: React.ReactElement) => renderIn('orange', 'light', element);
  const allText = (tree: ReactTestRenderer) => texts(tree).join(' | ');

  it('dispatch card: a line swapped for another of the same quantity and weight', () => {
    const onPress = jest.fn();
    const words = undefined as never;
    const element = (value: Dispatch) => <MemoizedDispatchItem dispatch={value} onPress={onPress} globalExpanded globalExpandedKey={1} words={words} />;
    const tree = render(element(dispatch));
    expect(allText(tree)).toContain('B-14');

    const edited = { ...dispatch, items: [{ ...(dispatch.items as any[])[0], rack: 'C-02' }] } as unknown as Dispatch;
    act(() => tree.update(element(edited)));
    expect(allText(tree)).toContain('C-02');
    expect(allText(tree)).not.toContain('B-14');
    act(() => tree.unmount());
  });

  it('recent order card: the name of who made it', () => {
    const onPress = jest.fn();
    const element = (value: RecentDispatchedOrder) => <RecentDispatchedOrderCard dispatch={value} onPress={onPress} />;
    const tree = render(element(recent));
    expect(allText(tree)).toContain('Asha');
    act(() => tree.update(element({ ...recent, created_by_name: 'Meera' })));
    expect(allText(tree)).toContain('Meera');
    act(() => tree.unmount());
  });
});

// Phone review 2026-10-14 (UX-06). A lot stores one weight, the weight of one bag.
// The card printed "250 kg" under "5 bags" (a total) and headed the table column
// "Kg" over 50 (one bag). The owner's decision: no total weight anywhere, and a
// weight of one bag says "each".
describe('weights on the dispatch cards', () => {
  const render = (element: React.ReactElement) => renderIn('orange', 'light', element);
  const labels = (tree: ReactTestRenderer) =>
    tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);
  const line = { grn_item_id: 'g1', item_name: 'Potatoes', rack: 'B-14', package_mark: 'PM', weight: 50, gr_no: '311', grn_qty: 200, disp_qty: 5 };
  /** 5 bags of 50 kg: the total the card used to print was 250 kg. */
  const fiveBags = (over: Partial<typeof line> | { weight: number | null; rack?: string | null } = {}) =>
    ({ ...dispatch, total_qty: 5, total_weight: 250, total_items: 1, items: [{ ...line, ...over }] }) as unknown as Dispatch;
  const recentFiveBags = (over: { weight?: number | null; rack?: string | null } = {}) =>
    ({ ...recent, total_qty: 5, items: [{ item_name: 'Potatoes', disp_qty: 5, rack: 'B-14', package_mark: 'PM', gr_no: '311', weight: 50, ...over }] }) as RecentDispatchedOrder;
  const open = (value: Dispatch) => render(<MemoizedDispatchItem dispatch={value} onPress={jest.fn()} globalExpanded globalExpandedKey={1} />);
  const openRecent = (value: RecentDispatchedOrder) => {
    const tree = render(<RecentDispatchedOrderCard dispatch={value} onPress={jest.fn()} />);
    const toggle = tree.root.find(node => typeof node.props.onPress === 'function' && node.props.accessibilityState?.expanded === false);
    act(() => toggle.props.onPress());
    return tree;
  };
  /** The style of the table's weight heading: its column. */
  const weightColumn = (tree: ReactTestRenderer) =>
    StyleSheet.flatten(tree.root.find(node => (node.type as unknown) === 'Text' && node.props.children === 'Kg each').props.style);

  let tree: ReactTestRenderer;
  afterEach(() => {
    act(() => tree.unmount());
    setLanguage('en');
  });

  it('dispatch card, closed: "5 bags" and no "250 kg", shown or spoken', () => {
    tree = render(<MemoizedDispatchItem dispatch={fiveBags()} onPress={jest.fn()} />);

    expect(texts(tree)).toContain('5 bags');
    expect(texts(tree)).not.toContain('250 kg');
    expect(texts(tree).some(text => /kg/i.test(text))).toBe(false);
    const spoken = labels(tree).find(label => label.startsWith('Dispatch 42'))!;
    expect(spoken).toContain('5 bags');
    expect(spoken).not.toMatch(/kg/i);
  });

  it('dispatch card, open: the column is headed "Kg each" over 50, and the line is read "50 kg each"', () => {
    tree = open(fiveBags());

    expect(texts(tree)).toEqual(expect.arrayContaining(['Kg each', '50', '311/200', '5']));
    expect(texts(tree)).not.toContain('Kg');
    expect(texts(tree)).not.toContain('250 kg');
    expect(labels(tree)).toContain('Potatoes, rack B-14, 50 kg each, GRN 311, 5 dispatched');
  });

  it('recent dispatch card, open: the same heading, number and reading', () => {
    tree = openRecent(recentFiveBags());

    expect(texts(tree)).toEqual(expect.arrayContaining(['Kg each', '50', '311', '5']));
    expect(texts(tree)).not.toContain('Kg');
    expect(labels(tree)).toContain('Potatoes, rack B-14, 50 kg each, GRN 311, 5 dispatched');
  });

  it.each([[0], [null]])('a line whose lot has no weight (%s) shows a dash, not 0, and is read without a weight', (weight) => {
    tree = open(fiveBags({ weight }));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Kg each', '—']));
    expect(texts(tree)).not.toContain('0');
    expect(labels(tree)).toContain('Potatoes, rack B-14, GRN 311, 5 dispatched');
    expect(labels(tree).some(label => /kg/i.test(label))).toBe(false);
    act(() => tree.unmount());

    tree = open(fiveBags({ weight, rack: null }));
    expect(labels(tree)).toContain('Potatoes, GRN 311, 5 dispatched');
    act(() => tree.unmount());

    tree = openRecent(recentFiveBags({ weight }));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Kg each', '—']));
    expect(texts(tree)).not.toContain('0');
    expect(labels(tree)).toContain('Potatoes, rack B-14, GRN 311, 5 dispatched');
    act(() => tree.unmount());

    tree = openRecent(recentFiveBags({ weight, rack: null }));
    expect(labels(tree)).toContain('Potatoes, GRN 311, 5 dispatched');
  });

  it('in Gujarati: "દરેક kg" over ૫૦, read as દરેક ૫૦ કિલો, and without a weight read without one', () => {
    setLanguage('gu');
    tree = open(fiveBags());
    expect(texts(tree)).toEqual(expect.arrayContaining(['દરેક kg', '૫૦']));
    expect(labels(tree)).toContain('Potatoes, રેક B-14, દરેક ૫૦ કિલો, આવક પાવતી 311, ૫ નંગ જાવક');
    act(() => tree.unmount());

    tree = open(fiveBags({ weight: null }));
    expect(labels(tree)).toContain('Potatoes, રેક B-14, આવક પાવતી 311, ૫ નંગ જાવક');
    act(() => tree.unmount());

    tree = open(fiveBags({ weight: null, rack: null }));
    expect(labels(tree)).toContain('Potatoes, આવક પાવતી 311, ૫ નંગ જાવક');
  });

  // The drawn width cannot be measured here. "Kg each" in the heading style needs about
  // 47 dp at font scale 1.0 and about 61 dp at 1.3; the column gives it 64 dp to write in.
  it('the weight column leaves its heading 64 dp to write in, on both cards', () => {
    tree = open(fiveBags());
    const column = weightColumn(tree);
    expect((column.width as number) - (column.paddingRight as number)).toBeGreaterThanOrEqual(64);
    expect(column.width).toBeLessThanOrEqual(72);
    act(() => tree.unmount());

    tree = openRecent(recentFiveBags());
    const recentColumn = weightColumn(tree);
    expect((recentColumn.width as number) - (recentColumn.paddingRight as number)).toBeGreaterThanOrEqual(64);
    expect(recentColumn.width).toBeLessThanOrEqual(72);
  });
});
