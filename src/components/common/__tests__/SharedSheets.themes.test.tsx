/**
 * Renders the shared sheets and detail tabs in all four themes (brand x mode)
 * and checks they take their colours from the semantic tokens.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
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
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: (props: { children?: React.ReactNode }) => require('react').createElement('Swipeable', null, props.children),
}));
jest.mock('react-native-gesture-handler', () => {
  const ReactMock = require('react');
  return {
    GestureHandlerRootView: (props: { children?: React.ReactNode }) => ReactMock.createElement('GHRoot', null, props.children),
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
  return render(element);
}

type HostNode = { type: string; props: Record<string, unknown>; children: Array<HostNode | string> | null };
type HostEntry = { node: HostNode; parent: HostNode | null };

/** Every host element of the screen with its parent: the sheet mocks are host tags with no role or text to query by. */
function hostEntries(): HostEntry[] {
  const out: HostEntry[] = [];
  const walk = (node: HostNode, parent: HostNode | null) => {
    out.push({ node, parent });
    for (const child of node.children ?? []) if (typeof child !== 'string') walk(child, node);
  };
  const json = screen.toJSON() as HostNode | HostNode[] | null;
  for (const root of ([] as Array<HostNode | null>).concat(json)) if (root) walk(root, null);
  return out;
}

function hasStyle(key: string, value: unknown) {
  return hostEntries().some(({ node }) => {
    const props = node.props;
    const styles = [props.style, props.backgroundStyle, props.handleIndicatorStyle]
      .flatMap(s => [].concat((s as never) ?? []))
      .flat(3)
      .filter(Boolean) as Array<Record<string, unknown>>;
    return styles.some(s => s && s[key] === value);
  });
}

describe.each(THEMES)('shared sheets in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('change log sheet uses the sheet surface and grab handle tokens', async () => {
    await renderIn(brand, mode,
      <ChangeLogBottomSheet isVisible onClose={jest.fn()} customer={null} entries={[]} loading={false} />);
    expect(hasStyle('backgroundColor', t.surface.sheet)).toBe(true);
    expect(hasStyle('backgroundColor', t.border.separator)).toBe(true);
  });

  it('role picker marks the current role and uses tokens', async () => {
    await renderIn(brand, mode,
      <RolePickerBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} currentRole="staff" callerRole="supervisor" />);
    expect(hasStyle('backgroundColor', t.surface.sheet)).toBe(true);
    expect(screen.getAllByRole('radio', { checked: true }).length).toBeGreaterThan(0);
  });

  // Style guide 3.8: each role has its own palette colour (admin 0, supervisor 5, staff 8, customer 6), and the icon
  // colour follows the mode only through `avatarColorsAt`. The expectations here are the theme's tokens, read by index.
  it('role picker draws each role icon on its own avatar background, in the literal text token of the mode', async () => {
    await renderIn(brand, mode,
      <RolePickerBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} currentRole="staff" callerRole="admin" />);
    // The icons that sit in a circle of the avatar palette are the roles' (the close button's has none).
    const circleOf = (parent: HostNode | null) =>
      (StyleSheet.flatten(parent?.props.style as never) as { backgroundColor?: string } | undefined)?.backgroundColor;
    const icons = hostEntries()
      .filter(({ node, parent }) => node.type === 'Icon' && t.avatar.includes(circleOf(parent) as string))
      .map(({ node, parent }) => ({ node, circle: circleOf(parent) }));
    expect(icons.map(icon => icon.circle)).toEqual([0, 5, 8, 6].map(index => t.avatar[index % t.avatar.length]));
    expect(new Set(icons.map(icon => icon.circle)).size).toBeGreaterThan(1);
    const text = mode === 'light' ? t.text.primary : t.overlay.onImage;
    for (const icon of icons) expect(icon.node.props.color).toBe(text);
  });

  it('items summary sheet shows the empty state on the sheet surface', async () => {
    await renderIn(brand, mode,
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
    expect(hasStyle('backgroundColor', t.surface.sheet)).toBe(true);
    expect(hasStyle('backgroundColor', t.overlay.scrim)).toBe(true);
  });

  it('searchable sheet keeps the search field and uses field tokens', async () => {
    await renderIn(brand, mode,
      <SearchableBottomSheet<{ id: string }>
        isVisible
        onClose={jest.fn()}
        onSelect={jest.fn()}
        title="Select customer"
        searchFn={() => Promise.resolve([])}
        renderItem={i => <Text>{i.id}</Text>}
        keyExtractor={i => i.id}
      />);
    expect(hasStyle('borderColor', t.border.field)).toBe(true);
  });

  it('detail tabs underline the selected tab in brand tint', async () => {
    await renderIn(brand, mode,
      <GenericDetailTabNavigator
        tabs={[
          { key: 'overview', label: 'Overview', icon: TAB_ICONS.overview },
          { key: 'items', label: 'Items', icon: TAB_ICONS.items, badgeCount: 3 },
        ]}
        activeTab="overview"
        onTabChange={jest.fn()}
      />);
    expect(hasStyle('backgroundColor', t.surface.header)).toBe(true);
    expect(hasStyle('backgroundColor', t.brand.tint)).toBe(true);
    expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toBeOnTheScreen();
    // The badge is announced with the tab's own name, not as "3 items" for every tab.
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Items, 3', selected: false })).toBeOnTheScreen();
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

  it('uses whole sentences for a list of items in both languages', async () => {
    const english = await sheet();
    expect(screen.getAllByLabelText('Close').length).toBeGreaterThan(0);
    expect(screen.getAllByHintText('Opens this item for editing').length).toBeGreaterThan(0);
    await english.unmount();

    setLanguage('gu');
    await sheet();
    expect(screen.getAllByLabelText('બંધ કરો').length).toBeGreaterThan(0);
    expect(screen.getAllByHintText('ફેરફાર માટે આ આઇટમ ખોલે છે').length).toBeGreaterThan(0);
  });

  it("still places a caller's own word into the English sentences", async () => {
    await sheet({ title: 'Saved lots', entityName: 'lot' });
    expect(screen.getAllByLabelText('Close').length).toBeGreaterThan(0);
    expect(screen.getAllByHintText('Opens this lot for editing').length).toBeGreaterThan(0);
  });
});
