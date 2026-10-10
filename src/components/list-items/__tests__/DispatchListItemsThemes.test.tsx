/**
 * Renders the dispatch object cells in all four themes (brand × mode): surfaces
 * come from tokens, the status tag carries a word, and no brand fill is used.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
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
