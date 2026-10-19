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
import TestRenderer, { act } from 'react-test-renderer';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../configs', () => ({ FILTER_CONFIGS: { 'grn-list': { fields: [], fastFilters: [] } } }));
jest.mock('../components/FilterBar', () => ({ FilterBar: () => 'FilterBar' }));
jest.mock('../components/ListSearchField', () => ({ ListSearchField: () => null }));
// The moving line itself is FioriLinearProgress's own test; here only where it sits.
jest.mock('@/components/FioriLinearProgress', () => ({ FioriLinearProgress: 'FioriLinearProgress' }));

const counted = { count: 24, loading: false };

describe('Apply', () => {
  it('stays pressable with a wrong range, says what to fix and applies nothing', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ApplyFiltersButton result={counted} noun={['item', 'items']} onPress={onPress} blockedMessage="The minimum is larger than the maximum." />
      );
    });
    const button = renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0];
    expect(button.props.disabled).toBeFalsy();

    act(() => button.props.onPress());

    expect(onPress).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('The minimum is larger than the maximum.');
    announce.mockRestore();
  });

  it('applies when nothing is wrong', () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<ApplyFiltersButton result={counted} noun={['item', 'items']} onPress={onPress} />);
    });
    act(() => renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0].props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('sheet header', () => {
  it('makes Reset a whole touch target, as Cancel is', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SheetFrame visible title="Stock" onClose={jest.fn()} action={{ label: 'Reset', onPress: jest.fn() }}>
          <Text>Body</Text>
        </SheetFrame>
      );
    });
    for (const label of ['Reset', 'Cancel']) {
      const target = renderer.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
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
  const busyLine = (busy: boolean) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<FilteredListHeader title="GRNs" config={config} filters={filters} busy={busy} />);
    });
    return renderer.root.findAll((node) => node.props.testID === 'list-header-busy' && typeof node.type === 'string');
  };

  it('is drawn only while new results load, laid over the bar so nothing moves', () => {
    expect(busyLine(false)).toHaveLength(0);
    const [line] = busyLine(true);
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ position: 'absolute', left: 0, right: 0, bottom: 0 });
    expect(line.props.pointerEvents).toBe('none');
  });
});
