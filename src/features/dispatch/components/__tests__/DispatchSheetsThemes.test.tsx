/**
 * Renders the dispatch item sheets in all four themes (brand × mode) and checks
 * that they take their surfaces and lot status from tokens.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { LotBottomSheet } from '../LotBottomSheet';
import { GRNItemBottomSheet } from '../GRNItemBottomSheet';
import type { GRNDetailItem } from '@/types/dispatch.types';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return React.createElement('BottomSheet', { backgroundStyle: props.backgroundStyle }, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetFlatList: (props: any) =>
      React.createElement(
        'List',
        null,
        props.data.length
          ? props.data.map((item: any) =>
              React.createElement(React.Fragment, { key: item.id ?? item.item_id }, props.renderItem({ item })))
          : props.ListEmptyComponent()
      ),
  };
});

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

function backgrounds(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => typeof node.type === 'string')
    .map(node => StyleSheet.flatten(node.props.style ?? node.props.backgroundStyle)?.backgroundColor)
    .filter((c): c is string => typeof c === 'string');
}

const lot = (id: string, stock: number): GRNDetailItem =>
  ({
    id,
    item_id: 'potato',
    item_name: 'Potatoes',
    quantity: 100,
    stock,
    package_mark: 'PM',
    rack: 'B-14',
    weight: 50,
  }) as GRNDetailItem;

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders LotBottomSheet with status words for unavailable lots', () => {
    const tree = renderIn(
      brand,
      mode,
      <LotBottomSheet
        isVisible
        onClose={jest.fn()}
        onSelect={jest.fn()}
        lots={[lot('a', 10), lot('b', 0), lot('c', 5)]}
        addedLotIds={['c']}
        currentValue={{ id: 'a' }}
        grnInfo={{ id: 'g1', gr_no: '311' }}
      />
    );
    const bgs = backgrounds(tree);
    expect(bgs).toContain(t.surface.sheet);
    expect(bgs).toContain(t.surface.selected);
    expect(bgs).toContain(t.status.negative.background);
    expect(bgs).toContain(t.status.informative.background);
    expect(tree.root.findByProps({ children: 'Out of stock' })).toBeTruthy();
    expect(tree.root.findByProps({ children: 'Already added' })).toBeTruthy();
  });

  it('renders GRNItemBottomSheet and its empty state', () => {
    const tree = renderIn(
      brand,
      mode,
      <GRNItemBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} items={[lot('a', 10)]} />
    );
    expect(backgrounds(tree)).toContain(t.surface.card);

    const empty = renderIn(
      brand,
      mode,
      <GRNItemBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} items={[]} />
    );
    expect(empty.root.findByProps({ children: 'No items in stock' })).toBeTruthy();
  });
});
