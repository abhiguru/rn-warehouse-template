/**
 * MasterListHeader (G-07): the search field, the count line and the
 * refresh-failed strip of the Customers, Items and Users lists.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { MasterListHeader, type MasterListHeaderProps } from '@/components/common';

let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: mockTheme }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// The barrel also exports the store-bound search sheet; it is not under test here.
jest.mock('../SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));

const REFRESH_FAILED = "Couldn't refresh items. Showing the list from 10:42 am.";

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

const mount = (props: Partial<MasterListHeaderProps> = {}) => render(element(props));

const field = () => screen.getByLabelText('Search items');

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockTheme = { preference: 'light', brand: 'orange' };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MasterListHeader', () => {
  it('shows the search field and the count line, and no refresh strip', async () => {
    await mount();

    expect(field()).toHaveProp('placeholder', 'Search items');
    expect(screen.getByText('91 items')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
    expect(screen.queryByText(REFRESH_FAILED)).not.toBeOnTheScreen();
  });

  it('reads the count out when it changes, and wraps it rather than cutting it', async () => {
    await mount();
    const count = screen.getByText('91 items');
    expect(count).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(count).not.toHaveProp('numberOfLines');
  });

  it('leaves the count line out when there is no count', async () => {
    await mount({ countText: undefined });
    expect(screen.queryByText('91 items')).not.toBeOnTheScreen();
    expect(field()).toBeOnTheScreen();
  });

  it('shows a failed reload with "Try again", which asks once', async () => {
    const { rerender } = await mount();
    const onRetry = jest.fn();

    await rerender(element({ refreshError: { message: REFRESH_FAILED, onRetry } }));

    expect(screen.getByText(REFRESH_FAILED)).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    // The search field and the count stay with the strip.
    expect(field()).toBeOnTheScreen();
    expect(screen.getByText('91 items')).toBeOnTheScreen();
  });

  it('gives "Try again" a full touch target', async () => {
    await mount({ refreshError: { message: REFRESH_FAILED, onRetry: jest.fn() } });
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Try again' }).props.style);
    const { touchTarget } = jest.requireActual('@/theme/tokens');
    expect(style.minHeight).toBeGreaterThanOrEqual(touchTarget);
  });

  it('searches after 300 ms with two characters, and not for one', async () => {
    await mount();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.type(field(), 'p');
    await jest.advanceTimersByTimeAsync(300);
    expect(onSearch).not.toHaveBeenCalled();

    await user.type(field(), 'o');
    await jest.advanceTimersByTimeAsync(299);
    expect(onSearch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('po');
  });

  describe.each(BRANDS.flatMap(b => (['light', 'dark'] as Mode[]).map(m => [b, m] as const)))('%s %s', (brand, mode) => {
    it('sits on the header surface, the count in secondary text', async () => {
      mockTheme = { preference: mode, brand };
      const t = getTokens(brand, mode);
      await mount({ refreshError: { message: REFRESH_FAILED, onRetry: jest.fn() } });

      // The root is the header container.
      expect(StyleSheet.flatten(screen.root!.props.style).backgroundColor).toBe(t.surface.header);
      expect(StyleSheet.flatten(screen.getByText('91 items').props.style).color).toBe(t.text.secondary);
      expect(StyleSheet.flatten(screen.getByRole('alert').props.style).backgroundColor).toBe(t.status.negative.background);
    });
  });
});
