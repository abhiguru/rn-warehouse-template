/** WH-215: Connection history shows skeleton cards (one progressbar named Loading…) while the days load, not a spinner, and the days replace them. */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ConnectionHistoryScreen from '../../../app/connection-history';
import { getConnectionHistory } from '@/services/connectionHistoryService';

let mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin', name: 'Dev Admin' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/connectionHistoryService', () => ({ getConnectionHistory: jest.fn() }));

let tree: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => { tree?.unmount(); }); tree = undefined; });

const loading = () => tree!.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === 'Loading…');

it('draws three skeleton cards while loading, and no spinner', async () => {
  jest.mocked(getConnectionHistory).mockReturnValue(new Promise(() => undefined) as never);
  await act(async () => { tree = create(<ConnectionHistoryScreen />); });
  expect(loading()).toHaveLength(1);
  expect(tree!.root.findAll(node => node.props.accessibilityState?.busy === true && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel !== 'Loading…').length).toBeGreaterThanOrEqual(3);
  expect(tree!.root.findAll(node => (node.type as unknown) === 'ActivityIndicator')).toEqual([]);
});

it('takes the skeleton away once the days have come', async () => {
  jest.mocked(getConnectionHistory).mockResolvedValue([] as never);
  await act(async () => { tree = create(<ConnectionHistoryScreen />); });
  expect(loading()).toEqual([]);
});
