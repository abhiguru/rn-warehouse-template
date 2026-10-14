/**
 * The role sheet is as tall as its four options (so at font scale 1.3 none is below the fold) and
 * scrolls only past a height limit (font scale 2.0). It used to be a fixed half of the screen.
 */
import React from 'react';
import { create, act } from 'react-test-renderer';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

let sheetProps: Record<string, unknown> = {};
jest.mock('@gorhom/bottom-sheet', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: Record<string, unknown>, _ref: unknown) => { sheetProps = props; return R.createElement(View, null, props.children); }),
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: (props: { children: React.ReactNode }) => R.createElement(View, { testID: 'scroll' }, props.children),
    BottomSheetView: (props: { children: React.ReactNode }) => R.createElement(View, null, props.children),
  };
});

import { RolePickerBottomSheet, roleSheetMaxContent } from '../RolePickerBottomSheet';

describe('role sheet sizing', () => {
  it('limits the content to the window below the status bar, with a margin', () => {
    expect(roleSheetMaxContent(891, 24)).toBe(891 - 24 - 48);
    // The navigation bar (bottom inset) is not part of the room: 48 dp more makes the limit 48 dp lower.
    expect(roleSheetMaxContent(891, 24, 48)).toBe(891 - 24 - 48 - 48);
    expect(roleSheetMaxContent(10, 24)).toBe(0);
  });

  it('sizes to its content up to that limit instead of a fixed half of the screen', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<RolePickerBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} currentRole="staff" callerRole="admin" />);
    });
    expect(sheetProps.snapPoints).toBeUndefined();
    expect(sheetProps.enableDynamicSizing).toBe(true);
    expect(typeof sheetProps.maxDynamicContentSize).toBe('number');
    expect(sheetProps.maxDynamicContentSize as number).toBeGreaterThan(400);
    act(() => tree.unmount());
  });
});
