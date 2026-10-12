/**
 * The deletion of a facility account seen from My facilities (the High finding
 * of the second review). The real `deleteAccount` thunk empties the profile in
 * the store the moment it starts, so the route guard shows My facilities while
 * the deletion and its cleanup are still running. At that moment the list still
 * names the facility as the sole approved one. My facilities must not open it:
 * that would file a new access request for the account just deleted.
 *
 * `deleteFacilityAccount` is the real one; the `deleteAccount` thunk is a mock
 * that renders My facilities at the point where the real thunk has emptied the
 * store, then finishes.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FacilitiesScreen from '../../../app/facilities';
import { deleteFacilityAccount } from '@/store/centralSignOut';
import { addMyFacility, loadMyFacilities, soleApprovedFacility, updateMyFacility } from '@/config/centralFacilities';
import { getCentralState, resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { openFacility } from '@/config/openFacility';

const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: {} }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => true, getCentralLoginConfig: () => ({ origin: 'x', issuer: 'x' }) }));
jest.mock('@/config/centralSession', () => ({ fetchCentralProfile: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/config/openFacility', () => ({
  openFacility: jest.fn(async () => ({ kind: 'login' })),
  beginFacilitySmsSignIn: jest.fn(),
  consumeOpenOutcome: jest.fn(),
}));
jest.mock('@/store/centralSignOut', () => jest.requireActual('@/store/centralSignOut'));
let mockActive: unknown = null;
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: jest.fn(() => mockActive),
  clearOperatorServer: jest.fn(async () => { mockActive = null; }),
}));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn(async () => 'left') }));
jest.mock('@/store/slices/authSlice', () => ({ deleteAccount: jest.fn(() => ({ type: 'test/deleteAccount' })) }));

const facility = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
const USER = { id: 'asha', phoneNumber: '919000000001', name: 'Asha Fictional', createdAt: '' };
let tree: ReactTestRenderer | undefined;
/** The list loads through the store's serialised queue and AsyncStorage: a few turns. */
const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetCentralStateForTests();
  mockActive = facility;
  await addMyFacility('asha', { origin: facility.origin, name: 'North Cold Store', instanceId: facility.instanceId });
  await updateMyFacility('asha', facility.origin, { status: 'approved', opened: true });
  // A cold start that skipped the list straight into this facility: the skip is unspent.
  setCentralState({ status: 'signedIn', user: USER, autoOpenSpent: false });
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

it('My facilities, shown while the deletion is still running, opens nothing', async () => {
  expect(soleApprovedFacility(await loadMyFacilities('asha'))?.origin).toBe(facility.origin);
  let releaseDeletion!: () => void;
  let storeEmptied!: () => void;
  const emptied = new Promise<void>(resolve => { storeEmptied = resolve; });
  const dispatch = jest.fn(() => ({
    unwrap: async () => {
      // logout.pending has emptied the store; the thunk now waits for the cleanup
      // and the server revocation, and the guard shows My facilities meanwhile.
      storeEmptied();
      await new Promise<void>(resolve => { releaseDeletion = resolve; });
    },
  }));

  const deletion = deleteFacilityAccount(dispatch);
  await emptied;
  await act(async () => { tree = create(<FacilitiesScreen />); });
  await flush();
  // The list on screen still names the facility, approved, and nothing was opened.
  const texts = tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
  expect(texts).toContain('North Cold Store');
  expect(texts).toContain('Approved');
  expect(openFacility).not.toHaveBeenCalled();
  expect(getCentralState().autoOpenSpent).toBe(true);

  releaseDeletion();
  expect(await deletion).toBe('left');
  await flush();
  expect(openFacility).not.toHaveBeenCalled();
  expect(await loadMyFacilities('asha')).toEqual([]);
});

it('for comparison: the same screen with the skip unspent would open the facility', async () => {
  await act(async () => { tree = create(<FacilitiesScreen />); });
  await flush();
  expect(openFacility).toHaveBeenCalledWith(facility.origin, 'North Cold Store');
});
