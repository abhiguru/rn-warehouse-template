/**
 * My facilities and a facility the association no longer lists: it is tagged Unavailable,
 * is not opened by itself at start, and a tap offers "Remove from my list".
 */
import React from 'react';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FacilitiesScreen from '../../../app/facilities';
import { addMyFacility, loadMyFacilities, updateMyFacility } from '@/config/centralFacilities';
import { resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { fetchFacilityCatalogue } from '@/config/centralSession';
import { openFacility } from '@/config/openFacility';
import { showAlert } from '@/utils/alert';

let mockAuth: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: mockAuth }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useIsFocused: () => true, useFocusEffect: require('./focusHarness').useFocusEffect }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => true, getCentralLoginConfig: () => ({ origin: 'x', issuer: 'x' }) }));
jest.mock('@/config/centralSession', () => ({
  fetchCentralProfile: jest.fn(async () => ({ ok: true })),
  fetchFacilityCatalogue: jest.fn(),
}));
jest.mock('@/config/openFacility', () => ({
  openFacility: jest.fn(async () => ({ kind: 'login' })),
  beginFacilitySmsSignIn: jest.fn(),
  consumeOpenOutcome: jest.fn(),
  EARLIER_SESSION_TITLES: {},
}));

const DEV = { origin: 'https://dev-cold.example.test', name: 'Dev Cold Storage' };
const TEMP = { origin: 'https://temp-cold.example.test', name: 'Temp Cold Storage' };
const USER = { id: 'asha', phoneNumber: '919000000001', name: 'Asha Fictional', createdAt: '' };
const flush = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
};
const catalogueOf = (...origins: string[]) =>
  jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: true, facilities: origins.map(origin => ({ id: origin, name: origin, city: '', town: '', district: '', origin, operator: '', online: true, lastSeenAt: null })) } as never);

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuth = {};
  await AsyncStorage.clear();
  resetCentralStateForTests();
  await addMyFacility('asha', { ...DEV, source: 'catalogue' });
  await updateMyFacility('asha', DEV.origin, { status: 'approved', opened: true });
  setCentralState({ status: 'signedIn', user: USER, autoOpenSpent: false });
});

it('tags a facility that is no longer listed Unavailable and does not open it by itself', async () => {
  catalogueOf(TEMP.origin);
  await render(<FacilitiesScreen />);
  await flush();
  expect(openFacility).not.toHaveBeenCalled();
  expect(screen.getByTestId(`facility-status-${DEV.origin}`)).toHaveTextContent('Unavailable');
});

it('still opens the sole approved facility by itself when it is listed', async () => {
  catalogueOf(DEV.origin);
  await render(<FacilitiesScreen />);
  await flush();
  expect(openFacility).toHaveBeenCalledWith(DEV.origin, DEV.name);
});

it('keeps the stored state when the catalogue cannot be read', async () => {
  jest.mocked(fetchFacilityCatalogue).mockResolvedValue({ ok: false, code: 'unavailable', message: 'x' } as never);
  await render(<FacilitiesScreen />);
  await flush();
  expect(openFacility).toHaveBeenCalledWith(DEV.origin, DEV.name);
});

it('a tap on it explains and offers Remove from my list, which removes it', async () => {
  catalogueOf(TEMP.origin);
  await render(<FacilitiesScreen />);
  await flush();
  await userEvent.press(screen.getByTestId(`facility-${DEV.origin}`));
  expect(openFacility).not.toHaveBeenCalled();
  const [, message, buttons] = jest.mocked(showAlert).mock.calls[0];
  expect(message).toBe('Dev Cold Storage is no longer listed by the association.');
  const remove = (buttons as Array<{ text: string; onPress?: () => void }>).find(b => b.text === 'Remove from my list')!;
  await act(async () => { remove.onPress!(); });
  await flush();
  expect(await loadMyFacilities('asha')).toEqual([]);
});

it('shows the stored sign-out reason at the top of the list', async () => {
  mockAuth = { signOutReason: "This server's sign-in keys were changed. Please sign in again." };
  catalogueOf(DEV.origin);
  await render(<FacilitiesScreen />);
  await flush();
  expect(screen.getByTestId('sign-out-reason')).toBeOnTheScreen();
});

it('offers the screen-reader Refresh action on the account row, and it reads the catalogue again (WH-220)', async () => {
  catalogueOf(DEV.origin);
  await render(<FacilitiesScreen />);
  await flush();
  const target = screen.getByTestId('central-account-row');
  expect(target.props.accessibilityActions).toContainEqual({ name: 'refresh', label: 'Refresh' });
  expect(target).toHaveProp('accessibilityRole', 'button');
  const before = jest.mocked(fetchFacilityCatalogue).mock.calls.length;
  await fireEvent(target, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
  await flush();
  expect(jest.mocked(fetchFacilityCatalogue).mock.calls.length).toBeGreaterThan(before);
});
