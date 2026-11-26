/**
 * WH-366: after "Sign in again" removed the saved central sign-in (WH-363), My facilities opens the facility it left
 * selected, once, with no pick, even among several approved ones. If that one open fails, the person stays on My
 * facilities with the facility listed and the app does not try again by itself. Without that mark (an ordinary sign-in)
 * only a sole approved facility opens, as before.
 *
 * Real: `FacilitiesScreen` (app/facilities.tsx), the central state, the list's own rules (`soleApprovedFacility`).
 * Faked: the list the phone holds (`loadMyFacilities`), `openFacility` (the network and the switch sequence), the router
 * and the safe area. That "Sign in again" sets the mark only when it removed the central sign-in is covered by
 * src/tests/navigation/SignInAgain.test.tsx.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FacilitiesScreen from '../../../app/facilities';
import { getCentralState, resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { loadMyFacilities, type MyFacility } from '@/config/centralFacilities';
import { openFacility } from '@/config/openFacility';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: {} }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const navigation = { addListener: jest.fn(() => () => undefined) };
  return {
    router: {
      back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(),
      canDismiss: jest.fn(() => false), dismissAll: jest.fn(),
    },
    useNavigation: () => navigation,
    useIsFocused: () => true,
    useFocusEffect: require('./focusHarness').useFocusEffect,
  };
});
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/config/envConfig', () => ({
  getCentralLoginConfig: () => ({ origin: 'https://identity.example.test', issuer: 'https://identity.example.test' }),
  isCentralLoginConfigured: () => true,
  TERMS_VERSION: '2025-12',
}));
jest.mock('@/config/centralSession', () => ({
  requestCentralCode: jest.fn(),
  verifyCentralCode: jest.fn(),
  fetchFacilityCatalogue: jest.fn(),
  fetchCentralProfile: jest.fn(async () => ({ ok: true })),
  updateCentralName: jest.fn(),
}));
jest.mock('@/config/centralFacilities', () => ({
  ...jest.requireActual('@/config/centralFacilities'),
  loadMyFacilities: jest.fn(),
  addMyFacility: jest.fn(async () => {}),
  onMyFacilitiesChange: jest.fn(() => () => undefined),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => null }));
jest.mock('@/config/openFacility', () => ({
  openFacility: jest.fn(async () => ({ kind: 'login' })),
  beginFacilitySmsSignIn: jest.fn(async () => ({ kind: 'sms_offer' })),
  consumeOpenOutcome: jest.fn(() => true),
  completeFacilityLink: jest.fn(),
  resendFacilityLinkCode: jest.fn(),
  cancelFacilityLink: jest.fn(),
}));
jest.mock('@/store/centralSignOut', () => ({
  signOutEverywhere: jest.fn(async () => ({ ok: true })),
  signOutAllDevices: jest.fn(async () => ({ ok: true })),
  deleteAccountEverywhere: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ name }: { name: string }) => R.createElement(View, { testID: `icon-${name}` }) };
});
jest.mock('@/components/LanguageSwitch', () => ({ LanguageSwitch: () => null }));

const USER = { id: 'asha', phoneNumber: '919000000001', name: 'Asha Fictional', createdAt: '2026-10-12T06:00:12.000Z' };
const facility = (name: string, status: MyFacility['status'], gone = false): MyFacility => ({
  origin: `https://${name.toLowerCase().replace(/[^a-z]+/g, '-')}.example.test`,
  instanceId: null,
  name,
  city: 'Rajkot',
  status,
  lastOpenedAt: null,
  addedAt: '',
  source: 'catalogue',
  gone,
});
const NORTH = facility('North Cold Store', 'approved');
const SOUTH = facility('South Cold Store', 'approved');

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCentralStateForTests();
  // The start after a central sign-in: the one chance to skip the list is still there.
  setCentralState({ status: 'signedIn', user: USER, autoOpenSpent: false });
  jest.mocked(openFacility).mockResolvedValue({ kind: 'login' });
});

describe('after "Sign in again" (WH-366)', () => {
  it('opens the facility it left selected, once, with no pick, among several approved ones', async () => {
    setCentralState({ reopenOrigin: SOUTH.origin });
    jest.mocked(loadMyFacilities).mockResolvedValue([NORTH, SOUTH]);

    await render(<FacilitiesScreen />);

    expect(openFacility).toHaveBeenCalledTimes(1);
    expect(openFacility).toHaveBeenCalledWith(SOUTH.origin, 'South Cold Store');
    expect(getCentralState().reopenOrigin).toBeNull();
  });

  it('a failed open leaves My facilities with the facility listed, and nothing opens again by itself', async () => {
    setCentralState({ reopenOrigin: SOUTH.origin });
    jest.mocked(loadMyFacilities).mockResolvedValue([NORTH, SOUTH]);
    jest.mocked(openFacility).mockResolvedValue({ kind: 'failed', reason: 'unreachable' } as never);

    const first = await render(<FacilitiesScreen />);
    await first.unmount();
    // The person returns to My facilities (the screen mounts again): the chance is spent.
    await render(<FacilitiesScreen />);

    expect(openFacility).toHaveBeenCalledTimes(1);
    expect(getCentralState().autoOpenSpent).toBe(true);
    expect(screen.getByText('South Cold Store')).toBeOnTheScreen();
    expect(screen.getByText('North Cold Store')).toBeOnTheScreen();
  });

  it.each([
    ['revoked', SOUTH.origin, [NORTH, facility('South Cold Store', 'revoked')]],
    ['removed from the list', SOUTH.origin, [NORTH, facility('East Cold Store', 'approved')]],
    ['gone', SOUTH.origin, [NORTH, facility('South Cold Store', 'approved', true)]],
  ])('a facility that is %s is not opened, and the list shows', async (_what, origin, list) => {
    setCentralState({ reopenOrigin: origin });
    jest.mocked(loadMyFacilities).mockResolvedValue(list);

    await render(<FacilitiesScreen />);

    expect(openFacility).not.toHaveBeenCalled();
    expect(getCentralState().autoOpenSpent).toBe(true);
    expect(getCentralState().reopenOrigin).toBeNull();
  });

  it('with no mark (an ordinary sign-in), two approved facilities show the list and nothing opens', async () => {
    jest.mocked(loadMyFacilities).mockResolvedValue([NORTH, SOUTH]);

    await render(<FacilitiesScreen />);

    expect(openFacility).not.toHaveBeenCalled();
    expect(screen.getByText('North Cold Store')).toBeOnTheScreen();
  });
});
