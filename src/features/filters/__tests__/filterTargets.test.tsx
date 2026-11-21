/**
 * Filter parts after the GRN list review of 2026-10-18:
 *
 *  - Apply stays pressable while a range is the wrong way round; a press says what to fix and applies
 *    nothing (style guide §10). Only something not yet entered disables it.
 *  - A sheet's header action (Reset) is a whole touch target, not text with a hitSlop (§11.2).
 *  - The list header's busy line shows only while new results load, and takes no space (§14.5).
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { touchTarget } from '@/theme/tokens';
import { ApplyFiltersButton } from '../components/ApplyFiltersButton';
import { SheetFrame } from '../components/SheetFrame';
import { FilteredListHeader } from '../components/FilteredListHeader';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../configs', () => ({ FILTER_CONFIGS: { 'grn-list': { fields: [], fastFilters: [] } } }));
jest.mock('../components/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('../components/ListSearchField', () => ({ ListSearchField: () => null }));
// The moving line itself is FioriLinearProgress's own test; here only where it sits.
jest.mock('@/components/FioriLinearProgress', () => ({ FioriLinearProgress: 'FioriLinearProgress' }));

const counted = { count: 24, loading: false };

describe('Apply', () => {
  it('stays pressable with a wrong range, says what to fix and applies nothing', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const onPress = jest.fn();
    const user = userEvent.setup({ delay: 0 });
    await render(
      <ApplyFiltersButton result={counted} noun={['item', 'items']} onPress={onPress} blockedMessage="The minimum is larger than the maximum." />
    );
    const button = screen.getByRole('button', { name: /Show 24 items/ });
    expect(button).toBeEnabled();

    await user.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('The minimum is larger than the maximum.');
    announce.mockRestore();
  });

  it('applies when nothing is wrong', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup({ delay: 0 });
    await render(<ApplyFiltersButton result={counted} noun={['item', 'items']} onPress={onPress} />);
    await user.press(screen.getByRole('button', { name: /Show 24 items/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('sheet header', () => {
  it('makes Reset and the Close X whole touch targets (WH-219: the X replaces Cancel at the end)', async () => {
    await render(
      <SheetFrame visible title="Stock" onClose={jest.fn()} action={{ label: 'Reset', onPress: jest.fn() }}>
        <Text>Body</Text>
      </SheetFrame>
    );
    for (const label of ['Reset', 'Close']) {
      const target = screen.getByRole('button', { name: label });
      const style = StyleSheet.flatten(typeof target.props.style === 'function' ? target.props.style({ pressed: false }) : target.props.style);
      expect(target.props.hitSlop).toBeUndefined();
      expect(style.minHeight).toBe(touchTarget);
      expect(style.minWidth).toBeGreaterThanOrEqual(touchTarget);
    }
  });
});

describe('list header busy line', () => {
  const filters = { search: '', setSearch: jest.fn() } as never;
  const config = { listKey: 'grn-list', fields: [], fastFilters: [], sort: { options: [], default: { field: 'gr_no', order: 'desc' } } } as never;
  const busyLine = async (busy: boolean) => {
    await render(<FilteredListHeader title="GRNs" config={config} filters={filters} busy={busy} />);
    // No role or text exists for the line; it is found by its testID.
    return screen.queryByTestId('list-header-busy');
  };

  it('is drawn only while new results load, laid over the bar so nothing moves', async () => {
    expect(await busyLine(false)).toBeNull();
    await screen.unmount();
    const line = await busyLine(true);
    expect(line).not.toBeNull();
    expect(StyleSheet.flatten(line!.props.style)).toMatchObject({ position: 'absolute', left: 0, right: 0, bottom: 0 });
    expect(line!.props.pointerEvents).toBe('none');
  });
});
