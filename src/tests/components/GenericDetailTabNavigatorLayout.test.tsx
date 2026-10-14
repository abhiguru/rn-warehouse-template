/**
 * Layout rule for the detail tab strip: it takes its content's height at any font scale and
 * never shrinks. A horizontal ScrollView is flexShrink 1 by default; at font scale 2.0 on GRN
 * details the strip was laid out shorter than it painted and the first Dispatches header sat
 * under it (phone run 2026-10-14).
 */
import React from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { act, create } from 'react-test-renderer';
import { GenericDetailTabNavigator, TAB_ICONS } from '@/components/common/GenericDetailTabNavigator';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

describe('GenericDetailTabNavigator layout', () => {
  it('the tab strip does not shrink or grow in the column above the tab content', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <GenericDetailTabNavigator
          tabs={[{ key: 'a', label: 'A', icon: TAB_ICONS.overview }]}
          activeTab="a"
          onTabChange={jest.fn()}
        />
      );
    });
    const strip = tree.root.findByType(ScrollView);
    const style = StyleSheet.flatten(strip.props.style);
    expect(style.flexShrink).toBe(0);
    expect(style.flexGrow).toBe(0);
    act(() => tree.unmount());
  });
});
