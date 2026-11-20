/**
 * Renders the dispatch item sheets in all four themes (brand × mode) and checks
 * that they take their surfaces and lot status from tokens.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { LotBottomSheet } from '../LotBottomSheet';
import { GRNItemBottomSheet } from '../GRNItemBottomSheet';
import type { GRNDetailItem } from '@/types/dispatch.types';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return React.createElement('BottomSheet', { style: props.backgroundStyle }, props.children);
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

function setTheme(brand: string, mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
}

type Json = ReturnType<typeof screen.toJSON>;
/** Every background colour drawn, the sheet's own included (the stand-in draws it as the style of a BottomSheet node). */
function backgrounds(node: Json | Json[]): string[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(backgrounds);
  const own = StyleSheet.flatten(node.props.style as never)?.backgroundColor;
  const inside = (node.children ?? []).flatMap(child => (typeof child === 'string' ? [] : backgrounds(child)));
  return typeof own === 'string' ? [own, ...inside] : inside;
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

  it('renders LotBottomSheet with status words for unavailable lots', async () => {
    setTheme(brand, mode);
    await render(
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
    expect(screen.root).toHaveStyle({ backgroundColor: t.surface.sheet });
    const bgs = backgrounds(screen.toJSON());
    expect(bgs).toContain(t.surface.sheet);
    expect(bgs).toContain(t.surface.selected);
    expect(bgs).toContain(t.status.negative.background);
    expect(bgs).toContain(t.status.informative.background);
    expect(screen.getByText('Out of stock')).toBeOnTheScreen();
    expect(screen.getByText('Already added')).toBeOnTheScreen();
  });

  it('renders GRNItemBottomSheet and its empty state', async () => {
    setTheme(brand, mode);
    await render(<GRNItemBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} items={[lot('a', 10)]} />);
    expect(screen.root).toHaveStyle({ backgroundColor: t.surface.sheet });
    expect(backgrounds(screen.toJSON())).toContain(t.surface.card);
    // surface.card and surface.sheet are the same colour, so the sheet alone cannot show the card is drawn on it.
    expect(screen.getByRole('button', { name: /Potatoes/ })).toHaveStyle({ backgroundColor: t.surface.card });

    await screen.rerender(<GRNItemBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} items={[]} />);
    expect(screen.getByText('No items in stock')).toBeOnTheScreen();
  });
});
