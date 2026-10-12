/**
 * Leaving a facility with central login on (src/store/operatorSwitch.ts), and
 * ending the central sign-in (src/store/centralSignOut.ts): what is cleaned up,
 * in which order, and what is kept.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { leaveFacility } from '../operatorSwitch';
import { deleteAccountEverywhere, deleteFacilityAccount, LEAVE_RETRY_WAIT_MS, signOutEverywhere } from '../centralSignOut';
import { addMyFacility, loadMyFacilities, soleApprovedFacility } from '@/config/centralFacilities';
import { getCentralState, resetCentralStateForTests, setCentralState } from '@/config/centralState';
import { deleteCentralAccount, signOutCentral } from '@/config/centralSession';
import { beginOperatorSwitch, getPendingEnrollmentToken, signOutPendingEnrollment, clearPendingEnrollment } from '@/config/supabaseConfig';
import { deleteAccount, logout } from '@/store/slices/authSlice';
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
  isOperatorSwitchFree: jest.fn(() => true),
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
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn((options?: unknown) => ({ type: 'test/logout', options })),
  deleteAccount: jest.fn(() => ({ type: 'test/deleteAccount' })),
  isDeleteAccountRejection: (value: unknown) => typeof value === 'object' && value !== null && 'serverDeleted' in value,
}));
jest.mock('@/store/sessionScopedState', () => ({
  clearSessionScopedState: jest.fn(async () => { mockEvents.push('clear session state'); }),
}));
jest.mock('@/services/configService', () => ({
  __esModule: true,
  default: { clearCache: jest.fn(async () => { mockEvents.push('clear config'); }) },
}));
jest.mock('@/lib/queryClient', () => ({ queryClient: { isMutating: jest.fn(() => 0) } }));
let mockAuth: { userProfile: unknown } = { userProfile: null };
jest.mock('@/store', () => ({ store: { getState: () => ({ auth: mockAuth }) } }));

/** What My facilities would see the moment the real `deleteAccount` thunk empties the store. */
let mockSeenAtDeletion: { autoOpenSpent: boolean; soleApproved: string | null; leaving: boolean; statusOnDisk: string | undefined } | undefined;
/**
 * How the mocked thunk ends, with the payload the real one builds:
 *   ok              resolved
 *   refused         the server kept the account (REFUSED, serverDeleted false)
 *   refusedForced   an auth refusal forced a sign-out first (REFUSED, false; profile gone)
 *   unknown         no answer (UNKNOWN, serverDeleted null)
 *   sessionChanged  deleted, then the generation moved (SESSION_CHANGED, true)
 *   logoutRejected  deleted, then its own logout rejected (SESSION_CHANGED, true)
 */
let mockDeletion: 'ok' | 'refused' | 'refusedForced' | 'unknown' | 'sessionChanged' | 'logoutRejected' = 'ok';
const rejection = (code: string, serverDeleted: boolean | null, message: string) => ({ code, serverDeleted, message });
const dispatch = jest.fn((action: { type: string }) => ({
  unwrap: async () => {
    if (action.type === 'test/deleteAccount') {
      // The real thunk's `logout.pending` nulls the profile FIRST; the route guard then
      // shows My facilities while the cleanup and the revocation (up to 15 s) still run.
      if (mockDeletion !== 'refused' && mockDeletion !== 'unknown') mockAuth = { userProfile: null };
      mockSeenAtDeletion = {
        autoOpenSpent: getCentralState().autoOpenSpent,
        leaving: getCentralState().leaving,
        soleApproved: soleApprovedFacility(await loadMyFacilities('asha'))?.origin ?? null,
        statusOnDisk: (await loadMyFacilities('asha')).find(entry => entry.origin === facility.origin)?.status,
      };
      if (mockDeletion === 'refused') throw rejection('REFUSED', false, "Couldn't delete your account.");
      if (mockDeletion === 'refusedForced') throw rejection('REFUSED', false, 'Session changed');
      if (mockDeletion === 'unknown') throw rejection('UNKNOWN', null, 'An unexpected error occurred while deleting account');
      // The server has deleted the account; the thunk then rejects anyway.
      if (mockDeletion === 'sessionChanged') { mockAuth = { userProfile: { id: 'stale' } }; throw rejection('SESSION_CHANGED', true, 'Session changed'); }
      if (mockDeletion === 'logoutRejected') throw rejection('SESSION_CHANGED', true, 'Session changed');
      mockEvents.push('delete facility account');
      return;
    }
    // The real logout empties the profile in the store the moment it starts.
    if (action.type === 'test/logout') mockAuth = { userProfile: null };
    mockEvents.push(action.type === 'test/logout' ? 'logout' : action.type);
  },
}));
let mockDeleteFails = false;
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
  mockDeleteFails = false;
  mockDeletion = 'ok';
  mockAuth = { userProfile: { id: 'profile-1' } };
  mockSeenAtDeletion = undefined;
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

  it('holds the leaving count for the whole sign-out, so no facility can be opened meanwhile', async () => {
    let leavingDuring: number | undefined;
    jest.mocked(signOutCentral).mockImplementation(async () => { leavingDuring = getCentralState().leaving; mockEvents.push('central sign-out'); });
    await signOutEverywhere(dispatch);
    expect(leavingDuring).toBe(1);
    expect(getCentralState().leaving).toBe(0);
  });

  it('one leave finishing does not release another still running', async () => {
    let releaseSignOut!: () => void;
    jest.mocked(signOutCentral).mockImplementation(() => new Promise<void>(resolve => { releaseSignOut = resolve; }));
    mockActive = null;
    const signingOut = signOutEverywhere(dispatch);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getCentralState().leaving).toBe(1);
    mockActive = facility;
    await deleteFacilityAccount(dispatch);
    // The deletion is over, the sign-out is not: still leaving.
    expect(getCentralState().leaving).toBe(1);
    releaseSignOut();
    await signingOut;
    expect(getCentralState().leaving).toBe(0);
  });

  it('waits for a write in flight instead of signing out half-way', async () => {
    jest.mocked(queryClient.isMutating).mockReturnValue(1);
    expect(await signOutEverywhere(dispatch)).toEqual({ ok: false, reason: 'busy' });
    expect(signOutCentral).not.toHaveBeenCalled();
  });
});

describe('Delete my account', () => {
  it('leaves the facility, deletes the person centrally, then removes that person\'s list from the device', async () => {
    await addMyFacility('asha', { origin: facility.origin, name: 'North Cold Store' });
    await addMyFacility('bhavin', { origin: facility.origin, name: 'North Cold Store' });
    jest.mocked(deleteCentralAccount).mockImplementation(async () => { mockEvents.push('central delete'); return { ok: true, userId: 'asha' }; });
    expect(await deleteAccountEverywhere(dispatch)).toEqual({ ok: true });
    expect(mockEvents).toEqual(['begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch', 'central delete']);
    expect(await loadMyFacilities('asha')).toEqual([]);
    expect(await AsyncStorage.getItem('central_facilities_v1:asha')).toBeNull();
    expect(await loadMyFacilities('bhavin')).toHaveLength(1);
  });

  it('keeps the list and the central sign-in when the association could not delete the account', async () => {
    await addMyFacility('asha', { origin: facility.origin, name: 'North Cold Store' });
    const failure = { ok: false as const, code: 'network' as const, message: "Couldn't reach the association's sign-in service. Check your connection and try again." };
    jest.mocked(deleteCentralAccount).mockResolvedValue(failure);
    expect(await deleteAccountEverywhere(dispatch)).toEqual({ ok: false, reason: 'central', failure });
    expect(await loadMyFacilities('asha')).toHaveLength(1);
    expect(getCentralState().status).toBe('signedIn');
  });

  it('is refused while a write is in flight, and deletes nothing', async () => {
    jest.mocked(queryClient.isMutating).mockReturnValue(1);
    expect(await deleteAccountEverywhere(dispatch)).toEqual({ ok: false, reason: 'busy' });
    expect(deleteCentralAccount).not.toHaveBeenCalled();
    expect(mockActive).toBe(facility);
  });
});

describe('Delete account inside a facility (Settings, central login on)', () => {
  beforeEach(async () => {
    await addMyFacility('asha', { origin: facility.origin, name: 'North Cold Store' });
    await addMyFacility('asha', { origin: 'https://south-cold.example.test', name: 'South Cold Store' });
    // A cold start that skipped the list: the one chance to open a facility without a tap is unspent.
    setCentralState({ autoOpenSpent: false });
  });

  it('deletes the profile there, takes the facility off the list and leaves without revoking anything', async () => {
    expect(await deleteFacilityAccount(dispatch)).toBe('left');
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(mockEvents).toEqual(['delete facility account', 'begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch']);
    expect(logout).toHaveBeenCalledWith({ localOnly: true });
    expect((await loadMyFacilities('asha')).map(entry => entry.origin)).toEqual(['https://south-cold.example.test']);
    expect(getCentralState().status).toBe('signedIn');
  });

  it('cannot lead to a new access request: the start-up skip is spent BEFORE the deletion empties the store, and the entry is gone before the server is cleared', async () => {
    // Only this facility, approved: before the deletion My facilities would open it without a tap.
    await AsyncStorage.clear();
    await addMyFacility('asha', { origin: facility.origin, name: 'North Cold Store' });
    const { updateMyFacility } = jest.requireActual('@/config/centralFacilities');
    await updateMyFacility('asha', facility.origin, { status: 'approved' });
    expect(soleApprovedFacility(await loadMyFacilities('asha'))?.origin).toBe(facility.origin);

    let listWhenServerCleared: string[] | undefined;
    const { clearOperatorServer } = jest.requireMock('@/config/operatorServer');
    jest.mocked(clearOperatorServer as () => Promise<void>).mockImplementationOnce(async () => {
      listWhenServerCleared = (await loadMyFacilities('asha')).map(entry => entry.origin);
      mockActive = null;
      mockEvents.push('clear server');
    });
    await deleteFacilityAccount(dispatch);
    // At the moment the thunk's logout showed My facilities: the skip is spent, the
    // leaving flag is held, and the entry is already marked on disk, so neither a tap
    // nor a cold start can open it.
    expect(mockSeenAtDeletion).toEqual({ autoOpenSpent: true, leaving: 1, soleApproved: null, statusOnDisk: 'unavailable' });
    expect(listWhenServerCleared).toEqual([]);
    expect(soleApprovedFacility(await loadMyFacilities('asha'))).toBeNull();
    expect(getCentralState().leaving).toBe(0);
  });

  it.each([
    ['the session generation moved during the call', 'sessionChanged'],
    ['its own logout rejected after emptying the store', 'logoutRejected'],
  ])('the server deleted the account but the thunk rejected (%s): the entry is removed, the facility left, nothing thrown', async (_name, kind) => {
    mockDeletion = kind as typeof mockDeletion;
    expect(await deleteFacilityAccount(dispatch)).toBe('left');
    expect((await loadMyFacilities('asha')).map(entry => entry.origin)).toEqual(['https://south-cold.example.test']);
    expect(mockActive).toBeNull();
    expect(mockEvents).toEqual(['begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch']);
    expect(getCentralState()).toMatchObject({ autoOpenSpent: true, leaving: 0, status: 'signedIn', outcome: null });
  });

  it('the server kept the account and an auth refusal forced a sign-out first: the entry stays as it was and My facilities is told', async () => {
    const { updateMyFacility } = jest.requireActual('@/config/centralFacilities');
    await updateMyFacility('asha', facility.origin, { status: 'approved' });
    mockDeletion = 'refusedForced';
    // Settings is gone with the profile, so nothing is thrown: the message is an answer on the list.
    expect(await deleteFacilityAccount(dispatch)).toBe('reported');
    expect((await loadMyFacilities('asha')).find(entry => entry.origin === facility.origin)?.status).toBe('approved');
    expect(mockActive).toBe(facility);
    expect(mockEvents).toEqual([]);
    expect(getCentralState().outcome).toMatchObject({
      origin: facility.origin,
      name: 'North Cold Store',
      outcome: { kind: 'failed', reason: 'account_deletion', message: 'Session changed' },
    });
    expect(getCentralState().leaving).toBe(0);
  });

  it('no answer from the server: the entry stays Unavailable, the facility is left locally and the person is told', async () => {
    const { updateMyFacility } = jest.requireActual('@/config/centralFacilities');
    await updateMyFacility('asha', facility.origin, { status: 'approved' });
    mockDeletion = 'unknown';
    expect(await deleteFacilityAccount(dispatch)).toBe('reported');
    const entry = (await loadMyFacilities('asha')).find(item => item.origin === facility.origin);
    expect(entry?.status).toBe('unavailable');
    expect(soleApprovedFacility(await loadMyFacilities('asha'))).toBeNull();
    expect(mockActive).toBeNull();
    expect(logout).toHaveBeenCalledWith({ localOnly: true });
    expect(getCentralState().outcome).toMatchObject({
      outcome: { kind: 'failed', reason: 'account_deletion', message: 'An unexpected error occurred while deleting account' },
    });
  });

  it('waits for a write in flight to settle before the second try of the final cleanup', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      // The write settles 1.2 s after the first try found it; the second try comes after that.
      let busyUntil = 0;
      jest.mocked(queryClient.isMutating).mockImplementation(() => {
        if (busyUntil === 0) busyUntil = Date.now() + 1200;
        const busy = Date.now() < busyUntil;
        if (!busy && !mockEvents.includes('write settled')) mockEvents.push('write settled');
        return busy ? 1 : 0;
      });
      const result = deleteFacilityAccount(dispatch);
      await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS);
      expect(await result).toBe('left');
      const settled = mockEvents.indexOf('write settled');
      const began = mockEvents.indexOf('begin switch');
      expect(settled).toBeGreaterThan(-1);
      expect(began).toBeGreaterThan(settled);
      expect(mockEvents.filter(event => event === 'begin switch')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up the wait after 5 seconds and reports busy', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      jest.mocked(queryClient.isMutating).mockReturnValue(1);
      const result = deleteFacilityAccount(dispatch);
      await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS + 200);
      expect(await result).toBe('busy');
      expect(mockEvents).not.toContain('begin switch');
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves everything in place when the facility refused the deletion, and restores the entry\'s status', async () => {
    const { updateMyFacility } = jest.requireActual('@/config/centralFacilities');
    await updateMyFacility('asha', facility.origin, { status: 'approved' });
    mockDeletion = 'refused';
    await expect(deleteFacilityAccount(dispatch)).rejects.toBe("Couldn't delete your account.");
    expect(mockSeenAtDeletion?.statusOnDisk).toBe('unavailable');
    expect((await loadMyFacilities('asha')).find(entry => entry.origin === facility.origin)?.status).toBe('approved');
    expect((await loadMyFacilities('asha'))).toHaveLength(2);
    expect(mockActive).toBe(facility);
    expect(mockEvents).toEqual([]);
    expect(getCentralState().leaving).toBe(0);
    expect(getCentralState().outcome).toBeNull();
  });

  it('waits for the switch gate as well as for writes before the second try', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    try {
      const { isOperatorSwitchFree } = jest.requireMock('@/config/supabaseConfig');
      let freeAt = 0;
      jest.mocked(beginOperatorSwitch).mockImplementationOnce(() => false);
      jest.mocked(isOperatorSwitchFree as () => boolean).mockImplementation(() => {
        if (freeAt === 0) freeAt = Date.now() + 800;
        const free = Date.now() >= freeAt;
        if (free && !mockEvents.includes('gate free')) mockEvents.push('gate free');
        return free;
      });
      const result = deleteFacilityAccount(dispatch);
      await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS);
      expect(await result).toBe('left');
      expect(mockEvents.indexOf('begin switch')).toBeGreaterThan(mockEvents.indexOf('gate free'));
    } finally {
      jest.useRealTimers();
    }
  });
});
