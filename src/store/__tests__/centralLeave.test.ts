/**
 * Leaving a facility with central login on (src/store/operatorSwitch.ts), and
 * ending the central sign-in (src/store/centralSignOut.ts): what is cleaned up,
 * in which order, and what is kept.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { leaveFacility } from '../operatorSwitch';
import { deleteAccountEverywhere, signOutEverywhere } from '../centralSignOut';
import { addMyFacility, loadMyFacilities } from '@/config/centralFacilities';
import { getCentralState, resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { deleteCentralAccount, signOutCentral } from '@/config/centralSession';
import { beginOperatorSwitch, getPendingEnrollmentToken, signOutPendingEnrollment, clearPendingEnrollment } from '@/config/supabaseConfig';
import { logout } from '@/store/slices/authSlice';
import { queryClient } from '@/lib/queryClient';

const mockEvents: string[] = [];
let mockActive: unknown = null;
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => true }));
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: jest.fn(() => mockActive),
  stageOperatorServer: jest.fn(),
  commitStagedOperatorServer: jest.fn(),
  clearOperatorServer: jest.fn(async () => { mockActive = null; mockEvents.push('clear server'); }),
}));
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorSwitch: jest.fn(() => { mockEvents.push('begin switch'); return true; }),
  endOperatorSwitch: jest.fn(() => { mockEvents.push('end switch'); }),
  getPendingEnrollmentToken: jest.fn(async () => null),
  clearPendingEnrollment: jest.fn(async () => { mockEvents.push('clear enrollment'); }),
  signOutPendingEnrollment: jest.fn(async () => { mockEvents.push('sign out enrollment'); }),
}));
jest.mock('@/config/centralSession', () => ({
  signOutCentral: jest.fn(async () => { mockEvents.push('central sign-out'); }),
  deleteCentralAccount: jest.fn(),
}));
jest.mock('@/store/slices/authSlice', () => ({ logout: jest.fn((options?: unknown) => ({ type: 'test/logout', options })) }));
jest.mock('@/store/sessionScopedState', () => ({
  clearSessionScopedState: jest.fn(async () => { mockEvents.push('clear session state'); }),
}));
jest.mock('@/services/configService', () => ({
  __esModule: true,
  default: { clearCache: jest.fn(async () => { mockEvents.push('clear config'); }) },
}));
jest.mock('@/lib/queryClient', () => ({ queryClient: { isMutating: jest.fn(() => 0) } }));

const dispatch = jest.fn((action: { type: string }) => ({ unwrap: async () => { mockEvents.push(action.type === 'test/logout' ? 'logout' : action.type); } }));
const facility = { origin: 'https://north-cold.example.test', instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };

beforeEach(async () => {
  jest.clearAllMocks();
  mockEvents.length = 0;
  mockActive = facility;
  await AsyncStorage.clear();
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: { id: 'asha', phoneNumber: '919000000001', name: null, createdAt: '' } });
  jest.mocked(beginOperatorSwitch).mockImplementation(() => { mockEvents.push('begin switch'); return true; });
  jest.mocked(queryClient.isMutating).mockReturnValue(0);
  jest.mocked(getPendingEnrollmentToken).mockResolvedValue(null);
});

describe('Switch facility', () => {
  it('runs the server-switch cleanup and ends with no selected server', async () => {
    expect(await leaveFacility(dispatch)).toBe('left');
    expect(mockEvents).toEqual(['begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch']);
    // The facility session is revoked at the facility, not only forgotten.
    expect(logout).toHaveBeenCalledWith(undefined);
  });

  it('spends the one chance to skip the list, so the person is not sent straight back in', async () => {
    setCentralState({ autoOpenSpent: false, facilitySmsOrigin: facility.origin });
    await leaveFacility(dispatch);
    expect(getCentralState()).toMatchObject({ autoOpenSpent: true, facilitySmsOrigin: null, status: 'signedIn' });
  });

  it('gives a waiting access request back to the facility', async () => {
    jest.mocked(getPendingEnrollmentToken).mockResolvedValue('enrollment-secret');
    await leaveFacility(dispatch);
    expect(signOutPendingEnrollment).toHaveBeenCalled();
    expect(clearPendingEnrollment).not.toHaveBeenCalled();
  });

  it('sends nothing to a facility that cannot be reached', async () => {
    jest.mocked(getPendingEnrollmentToken).mockResolvedValue('enrollment-secret');
    expect(await leaveFacility(dispatch, { localOnly: true })).toBe('left');
    expect(logout).toHaveBeenCalledWith({ localOnly: true });
    expect(signOutPendingEnrollment).not.toHaveBeenCalled();
    expect(clearPendingEnrollment).toHaveBeenCalled();
  });

  it.each([
    ['a write is in flight', () => jest.mocked(queryClient.isMutating).mockReturnValue(2)],
    ['another switch is running', () => jest.mocked(beginOperatorSwitch).mockReturnValue(false)],
  ])('is refused while %s and touches nothing', async (_name, arrange) => {
    arrange();
    expect(await leaveFacility(dispatch)).toBe('busy');
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockActive).toBe(facility);
  });

  it('reports a failure and releases the switch gate', async () => {
    dispatch.mockImplementationOnce(() => ({ unwrap: async () => { throw new Error('logout failed'); } }));
    expect(await leaveFacility(dispatch)).toBe('failed');
    expect(mockEvents).toEqual(['begin switch', 'end switch']);
  });
});

describe('Sign out on My facilities', () => {
  it('signs out of the current facility, then of the association, and keeps the list', async () => {
    await addMyFacility('asha', { origin: facility.origin, name: 'North Cold Store' });
    expect(await signOutEverywhere(dispatch)).toEqual({ ok: true });
    expect(mockEvents).toEqual(['begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch', 'central sign-out']);
    // No secret is in the list; the same person finds it again after the next sign-in.
    expect(await loadMyFacilities('asha')).toHaveLength(1);
  });

  it('needs no facility cleanup when none is selected', async () => {
    mockActive = null;
    expect(await signOutEverywhere(dispatch)).toEqual({ ok: true });
    expect(mockEvents).toEqual(['central sign-out']);
  });

  it('waits for a write in flight instead of signing out half-way', async () => {
    jest.mocked(queryClient.isMutating).mockReturnValue(1);
    expect(await signOutEverywhere(dispatch)).toEqual({ ok: false, reason: 'busy' });
    expect(signOutCentral).not.toHaveBeenCalled();
  });
});

describe('Delete my account', () => {
  it('deletes the person centrally, then removes that person\'s list and the facility session from the device', async () => {
    await addMyFacility('asha', { origin: facility.origin, name: 'North Cold Store' });
    await addMyFacility('bhavin', { origin: facility.origin, name: 'North Cold Store' });
    jest.mocked(deleteCentralAccount).mockImplementation(async () => { mockEvents.push('central delete'); return { ok: true, userId: 'asha' }; });
    expect(await deleteAccountEverywhere(dispatch)).toEqual({ ok: true });
    expect(mockEvents).toEqual(['central delete', 'begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch']);
    expect(await loadMyFacilities('asha')).toEqual([]);
    expect(await AsyncStorage.getItem('central_facilities_v1:asha')).toBeNull();
    expect(await loadMyFacilities('bhavin')).toHaveLength(1);
  });

  it('changes nothing on the device when the association could not delete the account', async () => {
    await addMyFacility('asha', { origin: facility.origin, name: 'North Cold Store' });
    const failure = { ok: false as const, code: 'network' as const, message: "Couldn't reach the association's sign-in service. Check your connection and try again." };
    jest.mocked(deleteCentralAccount).mockResolvedValue(failure);
    expect(await deleteAccountEverywhere(dispatch)).toEqual({ ok: false, reason: 'central', failure });
    expect(await loadMyFacilities('asha')).toHaveLength(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockActive).toBe(facility);
  });
});
