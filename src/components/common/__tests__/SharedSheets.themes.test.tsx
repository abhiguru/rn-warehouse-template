/**
 * Renders the shared sheets and detail tabs in all four themes (brand x mode)
 * and checks they take their colours from the semantic tokens.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import ChangeLogBottomSheet from '../../ChangeLogBottomSheet';
import { RolePickerBottomSheet } from '../../RolePickerBottomSheet';
import { ItemsSummaryBottomSheet } from '../ItemsSummaryBottomSheet';
import { SearchableBottomSheet } from '../SearchableBottomSheet';
import { GenericDetailTabNavigator, TAB_ICONS } from '../GenericDetailTabNavigator';

let mockState: { theme: { preference: string; brand: string }; auth: { userProfile: { id: string } } } = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'u1' } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const ReactMock = require('react');
  return {
    GestureHandlerRootView: (props: { children?: React.ReactNode }) => ReactMock.createElement('GHRoot', null, props.children),
    Swipeable: (props: { children?: React.ReactNode }) => ReactMock.createElement('Swipeable', null, props.children),
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/hooks', () => ({
  useSearchAutocomplete: () => ({
    searchQuery: '',
    results: [],
    isLoading: false,
    handleSearchChange: jest.fn(),
    clearSearch: jest.fn(),
    performSearchNow: jest.fn(),
    searchTimeoutRef: { current: null },
  }),
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  const passthrough = (name: string) => (props: { children?: React.ReactNode }) =>
    ReactMock.createElement(name, props, props.children);
  return {
    __esModule: true,
    default: ReactMock.forwardRef((props: { children?: React.ReactNode }, _ref: unknown) =>
      ReactMock.createElement('BottomSheet', props, props.children)),
    BottomSheetModal: ReactMock.forwardRef((props: { children?: React.ReactNode }, ref: unknown) => {
      ReactMock.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return ReactMock.createElement('BottomSheetModal', props, props.children);
    }),
    BottomSheetView: passthrough('BottomSheetView'),
    BottomSheetScrollView: passthrough('BottomSheetScrollView'),
    BottomSheetBackdrop: passthrough('BottomSheetBackdrop'),
    BottomSheetTextInput: ReactMock.forwardRef((props: object, _ref: unknown) =>
      ReactMock.createElement('BottomSheetTextInput', props)),
    BottomSheetFlatList: (props: {
      data: unknown[];
      ListEmptyComponent?: React.ComponentType | (() => React.ReactNode);
      ListFooterComponent?: React.ComponentType | (() => React.ReactNode);
    }) => {
      const Empty = props.ListEmptyComponent as React.ComponentType | undefined;
      const Footer = props.ListFooterComponent as React.ComponentType | undefined;
      return ReactMock.createElement(
        'FlatList',
        null,
        props.data.length === 0 && Empty ? ReactMock.createElement(Empty) : null,
        Footer ? ReactMock.createElement(Footer) : null
      );
    },
  };
});

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function renderIn(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { ...mockState, theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function hasStyle(tree: ReactTestRenderer, key: string, value: unknown) {
  return tree.root.findAll(node => {
    const props = node.props as Record<string, unknown>;
    const styles = [props.style, props.backgroundStyle, props.handleIndicatorStyle]
      .flatMap(s => [].concat((s as never) ?? []))
      .flat(3)
      .filter(Boolean) as Array<Record<string, unknown>>;
    return styles.some(s => s && s[key] === value);
  }).length > 0;
}

describe.each(THEMES)('shared sheets in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('change log sheet uses the sheet surface and grab handle tokens', () => {
    const tree = renderIn(brand, mode,
      <ChangeLogBottomSheet isVisible onClose={jest.fn()} customer={null} entries={[]} loading={false} />);
    expect(hasStyle(tree, 'backgroundColor', t.surface.sheet)).toBe(true);
    expect(hasStyle(tree, 'backgroundColor', t.border.separator)).toBe(true);
    act(() => tree.unmount());
  });

  it('role picker marks the current role and uses tokens', () => {
    const tree = renderIn(brand, mode,
      <RolePickerBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} currentRole="staff" callerRole="supervisor" />);
    expect(hasStyle(tree, 'backgroundColor', t.surface.sheet)).toBe(true);
    const radios = tree.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.type !== 'string');
    expect(radios.some(r => r.props.accessibilityState?.checked)).toBe(true);
    act(() => tree.unmount());
  });

  // Style guide 3.8: each role has its own palette colour (admin 0, supervisor 5, staff 8, customer 6), and the icon
  // colour follows the mode only through `avatarColorsAt`. The expectations here are the theme's tokens, read by index.
  it('role picker draws each role icon on its own avatar background, in the literal text token of the mode', () => {
    const tree = renderIn(brand, mode,
      <RolePickerBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} currentRole="staff" callerRole="admin" />);
    // The icons that sit in a circle of the avatar palette are the roles' (the close button's has none).
    const circleOf = (icon: { parent: { props: { style?: unknown } } | null }) =>
      (StyleSheet.flatten(icon.parent?.props.style as never) as { backgroundColor?: string } | undefined)?.backgroundColor;
    const icons = tree.root.findAll(n => (n.type as unknown) === 'Icon' && t.avatar.includes(circleOf(n as never) as string));
    expect(icons.map(icon => circleOf(icon as never))).toEqual([0, 5, 8, 6].map(index => t.avatar[index % t.avatar.length]));
    expect(new Set(icons.map(icon => circleOf(icon as never))).size).toBeGreaterThan(1);
    const text = mode === 'light' ? t.text.primary : t.overlay.onImage;
    for (const icon of icons) expect(icon.props.color).toBe(text);
    act(() => tree.unmount());
  });

  it('items summary sheet shows the empty state on the sheet surface', () => {
    const tree = renderIn(brand, mode,
      <ItemsSummaryBottomSheet<{ id: string }>
        isVisible
        onClose={jest.fn()}
        items={[]}
        getItemKey={i => i.id}
        getItemName={i => i.id}
        renderItem={i => <Text>{i.id}</Text>}
        getTotals={() => []}
        onDeleteItem={jest.fn()}
      />);
    expect(hasStyle(tree, 'backgroundColor', t.surface.sheet)).toBe(true);
    expect(hasStyle(tree, 'backgroundColor', t.overlay.scrim)).toBe(true);
    act(() => tree.unmount());
  });

  it('searchable sheet keeps the search field and uses field tokens', () => {
    const tree = renderIn(brand, mode,
      <SearchableBottomSheet<{ id: string }>
        isVisible
        onClose={jest.fn()}
        onSelect={jest.fn()}
        title="Select customer"
        searchFn={() => Promise.resolve([])}
        renderItem={i => <Text>{i.id}</Text>}
        keyExtractor={i => i.id}
      />);
    expect(hasStyle(tree, 'borderColor', t.border.field)).toBe(true);
    act(() => tree.unmount());
  });

  it('detail tabs underline the selected tab in brand tint', () => {
    const tree = renderIn(brand, mode,
      <GenericDetailTabNavigator
        tabs={[
          { key: 'overview', label: 'Overview', icon: TAB_ICONS.overview },
          { key: 'items', label: 'Items', icon: TAB_ICONS.items, badgeCount: 3 },
        ]}
        activeTab="overview"
        onTabChange={jest.fn()}
      />);
    expect(hasStyle(tree, 'backgroundColor', t.surface.header)).toBe(true);
    expect(hasStyle(tree, 'backgroundColor', t.brand.tint)).toBe(true);
    const tabs = tree.root.findAll(n => n.props.accessibilityRole === 'tab' && typeof n.type !== 'string');
    expect(tabs.some(tab => tab.props.accessibilityState?.selected)).toBe(true);
    // The badge is announced with the tab's own name, not as "3 items" for every tab.
    expect([...new Set(tabs.map(tab => tab.props.accessibilityLabel))]).toEqual(['Overview', 'Items, 3']);
    act(() => tree.unmount());
  });
});

describe('items summary sheet wording', () => {
  const { setLanguage } = jest.requireActual('@/i18n') as typeof import('@/i18n');
  afterEach(() => setLanguage('en'));

  const sheet = (props: { title?: string; entityName?: string } = {}) =>
    renderIn('orange', 'light',
      <ItemsSummaryBottomSheet<{ id: string }>
        isVisible
        onClose={jest.fn()}
        items={[{ id: 'Garlic' }]}
        getItemKey={i => i.id}
        getItemName={i => i.id}
        renderItem={i => <Text>{i.id}</Text>}
        getTotals={() => []}
        onDeleteItem={jest.fn()}
        onEditItem={jest.fn()}
        {...props}
      />);
  const spoken = (tree: ReactTestRenderer, prop: 'accessibilityLabel' | 'accessibilityHint') =>
    tree.root.findAll(n => typeof n.type === 'string' && typeof n.props[prop] === 'string').map(n => n.props[prop] as string);

  it('uses whole sentences for a list of items in both languages', () => {
    const english = sheet();
    expect(spoken(english, 'accessibilityLabel')).toContain('Close saved items');
    expect(spoken(english, 'accessibilityHint')).toContain('Opens this item for editing');
    act(() => english.unmount());

    setLanguage('gu');
    const gujarati = sheet();
    expect(spoken(gujarati, 'accessibilityLabel')).toContain('સાચવેલી આઇટમ બંધ કરો');
    expect(spoken(gujarati, 'accessibilityHint')).toContain('ફેરફાર માટે આ આઇટમ ખોલે છે');
    act(() => gujarati.unmount());
  });

  it("still places a caller's own word into the English sentences", () => {
    const tree = sheet({ title: 'Saved lots', entityName: 'lot' });
    expect(spoken(tree, 'accessibilityLabel')).toContain('Close saved lots');
    expect(spoken(tree, 'accessibilityHint')).toContain('Opens this lot for editing');
    act(() => tree.unmount());
  });
});
