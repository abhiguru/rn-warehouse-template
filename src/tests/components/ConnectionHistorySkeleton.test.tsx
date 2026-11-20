/** WH-215: Connection history shows skeleton cards (one progressbar named Loading…) while the days load, not a spinner, and the days replace them. */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
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

/** Every host component name in the rendered tree (a native spinner has no role or text to query by). */
const hostTypes = (json: ReturnType<typeof screen.toJSON>): string[] =>
  [json ?? []].flat().flatMap((node) => (typeof node === 'string' ? [] : [node.type, ...hostTypes(node.children as never)]));

const INTRO = /^The last 30 days\./;

it('draws three skeleton cards while loading, and no spinner', async () => {
  jest.mocked(getConnectionHistory).mockReturnValue(new Promise(() => undefined) as never);
  await render(<ConnectionHistoryScreen />);
  expect(screen.getAllByLabelText('Loading…')).toHaveLength(1);
  expect(screen.getByLabelText('Loading…')).toHaveProp('accessibilityRole', 'progressbar');
  const cards = screen.getAllByLabelText('Loading content');
  expect(cards.length).toBeGreaterThanOrEqual(3);
  cards.forEach((card) => expect(card).toBeBusy());
  // The tree holds no native spinner.
  expect(hostTypes(screen.toJSON())).not.toContain('ActivityIndicator');
});

it('takes the skeleton away once the days have come', async () => {
  jest.mocked(getConnectionHistory).mockResolvedValue([] as never);
  await render(<ConnectionHistoryScreen />);
  expect(await screen.findByText(INTRO)).toBeOnTheScreen();
  expect(screen.queryByLabelText('Loading…')).not.toBeOnTheScreen();
});

it('offers the screen-reader Refresh action on the intro text, and it reads the days again (WH-220)', async () => {
  jest.mocked(getConnectionHistory).mockReset();
  jest.mocked(getConnectionHistory).mockResolvedValue([] as never);
  await render(<ConnectionHistoryScreen />);
  const target = screen.getByText(INTRO);
  expect(target).toHaveProp('accessibilityActions', [{ name: 'refresh', label: 'Refresh' }]);
  const before = jest.mocked(getConnectionHistory).mock.calls.length;
  await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
  expect(jest.mocked(getConnectionHistory).mock.calls.length).toBe(before + 1);
});
