/**
 * MasterListHeader (G-07): the search field, the count line and the
 * refresh-failed strip of the Customers, Items and Users lists.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { MasterListHeader, type MasterListHeaderProps } from '@/components/common';

let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: mockTheme }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
// The barrel also exports the store-bound search sheet; it is not under test here.
jest.mock('../SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));

const REFRESH_FAILED = "Couldn't refresh items. Showing the list from 10:42 am.";

let tree: ReactTestRenderer | null = null;
const onSearch = jest.fn();

function element(props: Partial<MasterListHeaderProps> = {}) {
  return (
    <MasterListHeader
      listKey="items-test"
      search=""
      onSearch={onSearch}
      placeholder="Search items"
      countText="91 items"
      {...props}
    />
  );
}

function mount(props: Partial<MasterListHeaderProps> = {}) {
  act(() => { tree = create(element(props)); });
  return tree!;
}

function texts() {
  return tree!.root
    .findAll(n => (n.type as unknown) === 'Text')
    .map(n => ([] as unknown[]).concat(n.props.children).join(''));
}
const field = () => tree!.root.find(n => (n.type as unknown) === 'TextInput');
const retryButtons = () =>
  tree!.root.findAll(n => n.props.accessibilityLabel === 'Try again' && typeof n.props.onPress === 'function');
/** How many "Try again" buttons are drawn (a TouchableOpacity is two nodes with one onPress). */
const retryCount = () => new Set(retryButtons().map(n => n.props.onPress)).size;
const type = (text: string) => act(() => { field().props.onChangeText(text); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockTheme = { preference: 'light', brand: 'orange' };
});

afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  jest.useRealTimers();
});

describe('MasterListHeader', () => {
  it('shows the search field and the count line, and no refresh strip', () => {
    mount();

    expect(field().props.accessibilityLabel).toBe('Search items');
    expect(field().props.placeholder).toBe('Search items');
    expect(texts()).toContain('91 items');
    expect(retryCount()).toBe(0);
    expect(texts()).not.toContain(REFRESH_FAILED);
  });

  it('reads the count out when it changes, and wraps it rather than cutting it', () => {
    mount();
    const count = tree!.root.find(n => (n.type as unknown) === 'Text' && n.props.children === '91 items');
    expect(count.props.accessibilityLiveRegion).toBe('polite');
    expect(count.props.numberOfLines).toBeUndefined();
  });

  it('leaves the count line out when there is no count', () => {
    mount({ countText: undefined });
    expect(texts()).not.toContain('91 items');
    expect(field()).toBeTruthy();
  });

  it('shows a failed reload with "Try again", which asks once', () => {
    mount();
    const onRetry = jest.fn();

    act(() => { tree!.update(element({ refreshError: { message: REFRESH_FAILED, onRetry } })); });

    expect(texts()).toContain(REFRESH_FAILED);
    expect(retryCount()).toBe(1);
    act(() => { retryButtons()[0].props.onPress(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
    // The search field and the count stay with the strip.
    expect(field()).toBeTruthy();
    expect(texts()).toContain('91 items');
  });

  it('gives "Try again" a full touch target', () => {
    mount({ refreshError: { message: REFRESH_FAILED, onRetry: jest.fn() } });
    const style = StyleSheet.flatten(retryButtons()[0].props.style);
    const { touchTarget } = jest.requireActual('@/theme/tokens');
    expect(style.minHeight).toBeGreaterThanOrEqual(touchTarget);
  });

  it('searches after 300 ms with two characters, and not for one', () => {
    mount();

    type('p');
    act(() => { jest.advanceTimersByTime(300); });
    expect(onSearch).not.toHaveBeenCalled();

    type('po');
    act(() => { jest.advanceTimersByTime(299); });
    expect(onSearch).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('po');
  });

  describe.each(BRANDS.flatMap(b => (['light', 'dark'] as Mode[]).map(m => [b, m] as const)))('%s %s', (brand, mode) => {
    it('sits on the header surface, the count in secondary text', () => {
      mockTheme = { preference: mode, brand };
      const t = getTokens(brand, mode);
      mount({ refreshError: { message: REFRESH_FAILED, onRetry: jest.fn() } });

      const container = tree!.root.findAll(n => (n.type as unknown) === 'View')[0];
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe(t.surface.header);
      const count = tree!.root.find(n => (n.type as unknown) === 'Text' && n.props.children === '91 items');
      expect(StyleSheet.flatten(count.props.style).color).toBe(t.text.secondary);
      const strip = tree!.root.findAll(n => {
        const style = StyleSheet.flatten(n.props.style ?? {}) as { backgroundColor?: string };
        return typeof n.type === 'string' && style.backgroundColor === t.status.negative.background;
      });
      expect(strip.length).toBeGreaterThan(0);
    });
  });
});
