/**
 * Opening a facility with the central sign-in (src/config/openFacility.ts): every
 * answer of the facility, the status written to the person's list for each, and
 * that the server-switch cleanup has run before the facility is asked anything.
 *
 * The switch sequence itself (src/store/operatorSwitch.ts) is the real one; only
 * what it calls is mocked, so the order of its steps is part of what is checked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  beginFacilitySmsSignIn,
  cancelFacilityLink,
  completeFacilityLink,
  consumeOpenOutcome,
  openFacility,
  resendFacilityLinkCode,
} from '../openFacility';
import { addMyFacility, loadMyFacilities, updateMyFacility } from '../centralFacilities';
import { getCentralState, resetCentralStateForTests, setCentralState } from '../centralState';
import { requestFacilityToken } from '../centralSession';
import { clearOperatorServer, discoverOperator, getActiveOperatorServer } from '../operatorServer';
import { beginOperatorSwitch, exchangeCentralIdentity, signInWithPhone } from '../supabaseConfig';
import { markStaleFacility, STALE_FACILITY_KEY } from '../staleFacilitySession';
import { queryClient } from '@/lib/queryClient';
import { store } from '@/store';
import { logout } from '@/store/slices/authSlice';
import { LEAVE_RETRY_WAIT_MS, retryStaleFacilityCleanup } from '@/store/operatorSwitch';
import { advanceSessionGeneration, getSessionGeneration } from '../sessionLifecycle';
import { showAlert } from '@/utils/alert';
import { setLanguage } from '@/i18n';

const ISSUER = 'https://identity.example.test';
let mockConfig: { origin: string; issuer: string } | null = { origin: ISSUER, issuer: ISSUER };
jest.mock('../envConfig', () => ({
  getCentralLoginConfig: () => mockConfig,
  isCentralLoginConfigured: () => mockConfig !== null,
}));
jest.mock('../centralSession', () => ({ requestFacilityToken: jest.fn() }));
const mockEvents: string[] = [];
let mockActive: unknown = null;
jest.mock('../operatorServer', () => ({
  discoverOperator: jest.fn(),
  getActiveOperatorServer: jest.fn(() => mockActive),
  stageOperatorServer: jest.fn(async () => { mockEvents.push('stage'); }),
  commitStagedOperatorServer: jest.fn(async (server: unknown) => { mockActive = server; mockEvents.push('commit'); }),
  clearOperatorServer: jest.fn(async () => { mockActive = null; mockEvents.push('clear server'); }),
  // At a cold start the saved selection is read into memory; here memory is the saved one.
  loadOperatorServer: jest.fn(async () => mockActive),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('../supabaseConfig', () => ({
  beginOperatorSwitch: jest.fn(() => { mockEvents.push('begin switch'); return true; }),
  endOperatorSwitch: jest.fn(() => { mockEvents.push('end switch'); }),
  getPendingEnrollmentToken: jest.fn(async () => null),
  isOperatorSwitchFree: jest.fn(() => true),
  clearPendingEnrollment: jest.fn(),
  signOutPendingEnrollment: jest.fn(),
  initializeSupabase: jest.fn(() => { mockEvents.push('initialize'); }),
  exchangeCentralIdentity: jest.fn(),
  signInWithPhone: jest.fn(),
}));
let mockAuth: Record<string, unknown> = {};
/** What the logout thunk answers: `{ localCleared: false }` when the phone kept the stored session. */
let mockLogoutResult: unknown;
jest.mock('@/store', () => ({
  store: {
    getState: () => ({ auth: mockAuth }),
    dispatch: jest.fn((action: { type: string }) => {
      if (action.type === 'test/logout') return { unwrap: async () => { mockEvents.push('logout'); return mockLogoutResult; } };
      mockEvents.push(action.type);
      return action;
    }),
  },
}));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  setUserProfile: jest.fn((profile: unknown) => ({ type: 'auth/setUserProfile', payload: profile })),
}));
jest.mock('@/store/sessionScopedState', () => ({
  clearSessionScopedState: jest.fn(async () => { mockEvents.push('clear session state'); }),
}));
jest.mock('@/services/configService', () => ({
  __esModule: true,
  default: { clearCache: jest.fn(async () => { mockEvents.push('clear config'); }) },
}));
jest.mock('@/lib/queryClient', () => ({ queryClient: { isMutating: jest.fn(() => 0) } }));

const USER = { id: 'asha', phoneNumber: '919000000001', name: 'Asha Fictional', createdAt: '' };
const ORIGIN = 'https://north-cold.example.test';
const NAME = 'North Cold Store';
const server = { origin: ORIGIN, instanceId: 'instance-north', displayName: 'North', companyName: NAME };
const previous = { origin: 'https://south-cold.example.test', instanceId: 'instance-south', displayName: 'South', companyName: 'South Cold Store' };
/** `discovery()` trusts this build's issuer; `discovery(value)` carries that value, `undefined` included. */
const discovery = (...centralLogin: unknown[]) => ({
  server,
  config: { supabaseUrl: ORIGIN, anonKey: 'anon-key', centralLogin: centralLogin.length ? centralLogin[0] : { issuer: ISSUER } },
});
const profile = { id: 'profile-1', auth_user_id: 'profile-user-1', name: 'Asha Fictional', role: 'customer' };
const LOGIN = { success: true, data: { action: 'login', session: null, user: null, userProfile: profile, customAuth: true } };
const PENDING = { success: true, data: { action: 'pending', pendingEnrollment: true, userProfile: null } };
const refusal = (code: string, retryAfterSeconds?: number) => ({ success: false, code, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });

const exchangeMock = jest.mocked(exchangeCentralIdentity);
const tokenMock = jest.mocked(requestFacilityToken);
const status = async () => (await loadMyFacilities('asha')).find(entry => entry.origin === ORIGIN)?.status;
const lastOpened = async () => (await loadMyFacilities('asha')).find(entry => entry.origin === ORIGIN)?.lastOpenedAt ?? null;

beforeEach(async () => {
  jest.clearAllMocks();
  mockEvents.length = 0;
  mockActive = previous;
  mockConfig = { origin: ISSUER, issuer: ISSUER };
  await AsyncStorage.clear();
  resetCentralStateForTests();
  setCentralState({ status: 'signedIn', user: USER });
  await addMyFacility('asha', { origin: ORIGIN, name: NAME, city: 'Rajkot' });
  jest.mocked(discoverOperator).mockImplementation(async () => { mockEvents.push('discover'); return discovery() as never; });
  let issued = 0;
  tokenMock.mockImplementation(async () => { mockEvents.push('token'); return { ok: true, identityToken: `identity-token-${++issued}` }; });
  exchangeMock.mockImplementation(async () => { mockEvents.push('exchange'); return LOGIN as never; });
  jest.mocked(signInWithPhone).mockResolvedValue({ success: true, data: {} } as never);
  jest.mocked(beginOperatorSwitch).mockImplementation(() => { mockEvents.push('begin switch'); return true; });
  jest.mocked(queryClient.isMutating).mockReturnValue(0);
  mockAuth = {};
  mockLogoutResult = undefined;
});
afterEach(() => setLanguage('en'));

describe('a facility that approves', () => {
  it('ends the previous facility session and clears its state before it asks the new facility anything', async () => {
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'login' });
    expect(mockEvents).toEqual([
      'discover',
      'begin switch',
      'stage',
      'logout',
      'clear session state',
      'clear config',
      'commit',
      'end switch',
      'initialize',
      'token',
      'exchange',
      'auth/setUserProfile',
    ]);
    expect(tokenMock).toHaveBeenCalledWith(ORIGIN, 'asha');
    expect(exchangeMock).toHaveBeenCalledWith('identity-token-1', undefined);
  });

  it('puts the profile in the store, marks the facility approved and moves it to the top', async () => {
    expect(await lastOpened()).toBeNull();
    await openFacility(ORIGIN, NAME);
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'auth/setUserProfile', payload: profile });
    expect(await status()).toBe('approved');
    expect(await lastOpened()).not.toBeNull();
    expect((await loadMyFacilities('asha'))[0].instanceId).toBe('instance-north');
  });

  it('stays a successful open when the list write after the sign-in fails', async () => {
    const real = jest.requireActual('../centralFacilities').updateMyFacility;
    const spy = jest
      .spyOn(require('../centralFacilities'), 'updateMyFacility')
      .mockImplementation(async (...args: any[]) => {
        if (args[2]?.status === 'approved') throw new Error('SQLITE_FULL');
        return real(...args);
      });
    try {
      expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'login' });
      expect(getCentralState().outcome).toMatchObject({ outcome: { kind: 'login' } });
    } finally {
      spy.mockRestore();
    }
  });

  it('publishes the answer for whichever screen is mounted, until that screen has handled it', async () => {
    const opening = openFacility(ORIGIN, NAME);
    expect(getCentralState().opening).toBe(ORIGIN);
    // A second open while one is running is refused (and said so) without touching the first.
    expect(await openFacility('https://other.example.test', 'Other')).toMatchObject({ kind: 'failed', reason: 'busy' });
    expect(getCentralState().opening).toBe(ORIGIN);
    // Said in a dialog at once, not published as an answer.
    expect(getCentralState().outcome).toBeNull();
    expect(showAlert).toHaveBeenCalledWith('Operation in progress', `Still opening ${NAME}. Wait for it to finish.`);
    await opening;
    const published = getCentralState().outcome;
    expect(getCentralState().opening).toBeNull();
    expect(published).toMatchObject({ origin: ORIGIN, name: NAME, outcome: { kind: 'login' } });
    consumeOpenOutcome(published!.id);
    expect(getCentralState().outcome).toBeNull();
  });

  it('the facility is already the selected server (its session ended while it stayed selected): a valid open without the cleanup', async () => {
    mockActive = server;
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'login' });
    expect(mockEvents).toEqual(['discover', 'begin switch', 'end switch', 'initialize', 'token', 'exchange', 'auth/setUserProfile']);
  });

  it.each([
    ['a sign-out', { logoutRequest: 'r1' }, {}],
    ['a forced sign-out', { forceLogoutRequest: 'r2' }, {}],
    ['an account deletion', { deleteRequest: 'r3' }, {}],
    ['the sign-out helper holds the leaving count (between the store flags and the list changes)', {}, { leaving: 1 }],
  ])('refuses to start while %s, says so on the list, and files nothing for a session being ended', async (_name, auth, central) => {
    mockActive = server;
    mockAuth = auth;
    setCentralState(central);
    const busy = { kind: 'failed', reason: 'busy', message: 'This phone is still finishing the sign-out. Try again in a few seconds.' };
    expect(await openFacility(ORIGIN, NAME)).toEqual(busy);
    expect(mockEvents).toEqual([]);
    expect(tokenMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(getCentralState().opening).toBeNull();
    // Not silent: a dialog says so at once, and no answer is published.
    expect(showAlert).toHaveBeenCalledWith('Still signing out', busy.message);
    expect(getCentralState().outcome).toBeNull();
  });

  it('a busy refusal never overwrites an answer that is still waiting to be shown', async () => {
    mockAuth = { logoutRequest: 'r1' };
    const waiting = { id: 99, origin: 'https://other.example.test', name: 'Other', outcome: { kind: 'pending' as const } };
    setCentralState({ outcome: waiting });
    expect(await openFacility(ORIGIN, NAME)).toMatchObject({ kind: 'failed', reason: 'busy' });
    expect(getCentralState().outcome).toBe(waiting);
  });
});

it('a request that waits: the waiting screen, status requested, no profile', async () => {
  exchangeMock.mockResolvedValue(PENDING as never);
  expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'pending' });
  expect(await status()).toBe('requested');
  expect(await lastOpened()).not.toBeNull();
  expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/setUserProfile' }));
});

describe('linking an existing profile', () => {
  beforeEach(() => {
    exchangeMock.mockResolvedValueOnce(refusal('link_required') as never);
  });

  it('asks the facility for a code for the central phone number and starts the code step', async () => {
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'link_required', codeSent: true });
    expect(signInWithPhone).toHaveBeenCalledWith('919000000001');
    expect(getCentralState().pendingLink).toEqual({ origin: ORIGIN, name: NAME, phoneNumber: '919000000001' });
    expect(await status()).toBe('link_needed');
  });

  it('then succeeds with the code and a FRESH token', async () => {
    await openFacility(ORIGIN, NAME);
    exchangeMock.mockResolvedValueOnce(LOGIN as never);
    expect(await completeFacilityLink('482913')).toEqual({ kind: 'login' });
    expect(exchangeMock.mock.calls).toEqual([
      ['identity-token-1', undefined],
      ['identity-token-2', { otpCode: '482913' }],
    ]);
    expect(await status()).toBe('approved');
    expect(getCentralState().pendingLink).toBeNull();
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'auth/setUserProfile', payload: profile });
  });

  it('a profile whose request still waits is linked and shown as requested', async () => {
    await openFacility(ORIGIN, NAME);
    exchangeMock.mockResolvedValueOnce(PENDING as never);
    expect(await completeFacilityLink('482913')).toEqual({ kind: 'pending' });
    expect(await status()).toBe('requested');
  });

  it('a wrong code stays on the code step with a plain message, and each try uses a new token', async () => {
    await openFacility(ORIGIN, NAME);
    exchangeMock.mockResolvedValueOnce(refusal('invalid_otp') as never).mockResolvedValueOnce(refusal('invalid_otp') as never);
    const wrong = await completeFacilityLink('000000');
    expect(wrong).toEqual({ kind: 'failed', reason: 'invalid_otp', message: 'That code is wrong or has expired. Check it, or ask for a new code.' });
    await completeFacilityLink('111111');
    expect(exchangeMock.mock.calls.map(call => call[0])).toEqual(['identity-token-1', 'identity-token-2', 'identity-token-3']);
    expect(await status()).toBe('link_needed');
    expect(getCentralState().pendingLink).not.toBeNull();
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/setUserProfile' }));
  });

  it('still starts the code step when the facility could not send a code, and says why', async () => {
    jest.mocked(signInWithPhone).mockResolvedValue({
      success: false,
      error: 'Please wait 42 seconds before requesting another code.',
      rateLimited: true,
      retryAfterSeconds: 42,
    } as never);
    expect(await openFacility(ORIGIN, NAME)).toEqual({
      kind: 'link_required',
      codeSent: false,
      message: 'Please wait 42 seconds before requesting another code.',
      retryAfterSeconds: 42,
    });
    expect(getCentralState().pendingLink).not.toBeNull();
  });

  it('asks for another code for the same number, and can be given up', async () => {
    await openFacility(ORIGIN, NAME);
    jest.mocked(signInWithPhone).mockClear();
    await resendFacilityLinkCode();
    expect(signInWithPhone).toHaveBeenCalledWith('919000000001');
    cancelFacilityLink();
    expect(getCentralState().pendingLink).toBeNull();
    expect(await completeFacilityLink('482913')).toMatchObject({ kind: 'failed' });
  });
});

describe('refusals leave a plain message and a status', () => {
  beforeEach(async () => {
    await updateMyFacility('asha', ORIGIN, { status: 'approved' });
  });

  it.each([
    ['identity_conflict', 'identity_conflict', 'This mobile number is linked to another sign-in at North Cold Store. Ask the facility administrator.', 'unavailable'],
    ['account_unavailable', 'account_unavailable', "North Cold Store has withdrawn your access. Contact the facility's administrator if you think this is wrong.", 'revoked'],
    ['central_unavailable', 'central_unavailable', 'North Cold Store is not accepting association sign-in right now. Try again later.', 'unavailable'],
    ['central_keys_unavailable', 'central_keys_unavailable', "North Cold Store couldn't check your sign-in just now. Try again in a few minutes.", 'approved'],
    ['invalid_identity_token', 'invalid_identity_token', "North Cold Store couldn't verify your sign-in. Try again. If this keeps happening, tell the facility administrator.", 'unavailable'],
    ['enrollment_limited', 'enrollment_limited', 'Too many new access requests today. Try again tomorrow.', 'approved'],
    ['network', 'network', 'The connection to North Cold Store was lost. Check your connection and try again.', 'approved'],
    ['unavailable', 'failed', "North Cold Store couldn't sign you in. Try again later.", 'approved'],
    ['invalid_request', 'failed', "North Cold Store couldn't sign you in. Try again later.", 'approved'],
    ['failed', 'failed', "North Cold Store couldn't sign you in. Try again later.", 'approved'],
    ['session_changed', 'failed', "North Cold Store couldn't sign you in. Try again later.", 'approved'],
  ])('%s', async (code, reason, message, expectedStatus) => {
    exchangeMock.mockResolvedValue(refusal(code) as never);
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'failed', reason, message });
    expect(await status()).toBe(expectedStatus);
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/setUserProfile' }));
  });

  it.each([
    [undefined, 'Too many attempts at North Cold Store. Try again later.'],
    [45, 'Too many attempts at North Cold Store. Try again in 45 seconds.'],
    [900, 'Too many attempts at North Cold Store. Try again in 15 minutes.'],
  ])('a rate limit (wait %s) keeps the status', async (wait, message) => {
    exchangeMock.mockResolvedValue(refusal('rate_limited', wait) as never);
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'failed', reason: 'rate_limited', message, ...(wait ? { retryAfterSeconds: wait } : {}) });
    expect(await status()).toBe('approved');
  });

  it('gives the message in Gujarati with the facility name where the sentence needs it', async () => {
    setLanguage('gu');
    exchangeMock.mockResolvedValue(refusal('rate_limited', 900) as never);
    expect(await openFacility(ORIGIN, NAME)).toMatchObject({
      message: 'North Cold Storeમાં ઘણા વધારે પ્રયાસ થયા છે. ૧૫ મિનિટ પછી ફરી પ્રયાસ કરો.',
    });
  });
});

describe('a token the facility has already seen', () => {
  it('is replaced by a fresh one and tried once more', async () => {
    exchangeMock.mockResolvedValueOnce(refusal('identity_token_used') as never).mockResolvedValueOnce(LOGIN as never);
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'login' });
    expect(exchangeMock.mock.calls.map(call => call[0])).toEqual(['identity-token-1', 'identity-token-2']);
    expect(await status()).toBe('approved');
  });

  it('is not tried a third time', async () => {
    exchangeMock.mockResolvedValue(refusal('identity_token_used') as never);
    expect(await openFacility(ORIGIN, NAME)).toMatchObject({ kind: 'failed', reason: 'invalid_identity_token' });
    expect(exchangeMock).toHaveBeenCalledTimes(2);
    expect(tokenMock).toHaveBeenCalledTimes(2);
  });
});

describe('a facility that does not accept association sign-in', () => {
  it.each([
    ['names no issuer', null],
    ['has no centralLogin field', undefined],
    ['trusts another issuer', { issuer: 'https://other-association.example.test' }],
  ])('%s: its own SMS sign-in is offered and nothing is switched or sent', async (_name, centralLogin) => {
    await updateMyFacility('asha', ORIGIN, { status: 'approved' });
    jest.mocked(discoverOperator).mockResolvedValue(discovery(centralLogin) as never);
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'sms_offer' });
    expect(mockEvents).toEqual([]);
    expect(tokenMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(getActiveOperatorServer()).toBe(previous);
    expect(await status()).toBe('approved');
  });

  it('accepting the offer makes it the server, as the server address screen would, for the existing sign-in screen', async () => {
    jest.mocked(discoverOperator).mockResolvedValue(discovery(null) as never);
    expect(await beginFacilitySmsSignIn(ORIGIN, NAME)).toEqual({ kind: 'sms_offer' });
    expect(mockEvents).toEqual(['begin switch', 'stage', 'logout', 'clear session state', 'clear config', 'commit', 'end switch', 'initialize']);
    expect(getActiveOperatorServer()).toBe(server);
    expect(getCentralState().facilitySmsOrigin).toBe(ORIGIN);
    expect(tokenMock).not.toHaveBeenCalled();
  });
});

describe('before the facility is asked', () => {
  it('a facility that cannot be reached keeps its status (a blip must not stop the start-up skip) and nothing is switched', async () => {
    await updateMyFacility('asha', ORIGIN, { status: 'approved' });
    jest.mocked(discoverOperator).mockRejectedValue(new Error('Server discovery timed out'));
    expect(await openFacility(ORIGIN, NAME)).toEqual({
      kind: 'failed',
      reason: 'facility_unreachable',
      message: "North Cold Store can't be reached right now. Check your connection and try again.",
    });
    expect(await status()).toBe('approved');
    expect(mockEvents).toEqual([]);
    expect(getActiveOperatorServer()).toBe(previous);
  });

  it.each([
    ['a write is in flight', () => jest.mocked(queryClient.isMutating).mockReturnValue(1)],
    ['another switch is running', () => jest.mocked(beginOperatorSwitch).mockReturnValue(false)],
  ])('refuses while %s, without ending the current session', async (_name, arrange) => {
    arrange();
    expect(await openFacility(ORIGIN, NAME)).toEqual({
      kind: 'failed',
      reason: 'busy',
      message: 'Finish the current operation before switching facilities.',
    });
    expect(mockEvents).not.toContain('logout');
    expect(tokenMock).not.toHaveBeenCalled();
    expect(getActiveOperatorServer()).toBe(previous);
  });

  it('needs the central sign-in', async () => {
    setCentralState({ status: 'signedOut', user: null });
    expect(await openFacility(ORIGIN, NAME)).toMatchObject({ kind: 'failed', reason: 'not_signed_in' });
    expect(discoverOperator).not.toHaveBeenCalled();
  });
});

describe('when the association gives no token', () => {
  beforeEach(async () => {
    await updateMyFacility('asha', ORIGIN, { status: 'approved' });
  });

  it.each([
    ['network', 'central', "Couldn't reach the association's sign-in service. Check your connection and try again."],
    ['rate_limited', 'central', 'Too many attempts. Try again later.'],
    ['session_ended', 'central', 'Your association sign-in has ended. Sign in again. If you did not expect this, open your account after signing in and choose Sign out on all phones.'],
    ['unknown_facility', 'unknown_facility', "This cold storage is not on the association's list, so association sign-in can't be used there."],
  ])('%s: the message is the association\'s and the facility is not asked', async (code, reason, message) => {
    tokenMock.mockResolvedValue({ ok: false, code, message } as never);
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'failed', reason, message });
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(await status()).toBe('approved');
  });
});

describe('an answer for a central session that has ended meanwhile', () => {
  it.each([
    ['signed out centrally', () => setCentralState({ status: 'signedOut', user: null })],
    ['another person signed in', () => setCentralState({ status: 'signedIn', user: { ...USER, id: 'bhavin' } })],
  ])('is not shown to the next person: %s', async (_name, change) => {
    await updateMyFacility('asha', ORIGIN, { status: 'approved' });
    tokenMock.mockImplementation(async () => {
      // The service refuses the token and the app signs out while the open is in flight.
      change();
      return { ok: false, code: 'session_ended', message: 'Your association sign-in has ended. Sign in again. If you did not expect this, open your account after signing in and choose Sign out on all phones.' };
    });
    const result = await openFacility(ORIGIN, NAME);
    expect(result).toMatchObject({ kind: 'failed', reason: 'central' });
    expect(getCentralState().outcome).toBeNull();
    expect(getCentralState().opening).toBeNull();
  });

  it('is shown when the same person is still signed in', async () => {
    tokenMock.mockResolvedValue({ ok: false, code: 'session_ended', message: 'x' } as never);
    await openFacility(ORIGIN, NAME);
    expect(getCentralState().outcome).toMatchObject({ origin: ORIGIN, outcome: { kind: 'failed' } });
  });
});

it('writes neither the identity token nor the phone number to the log while opening and linking', async () => {
  const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => {}));
  exchangeMock.mockResolvedValueOnce(refusal('link_required') as never).mockResolvedValueOnce(LOGIN as never);
  await openFacility(ORIGIN, NAME);
  await completeFacilityLink('482913');
  const logged = loggedText(spies);
  expect(logged).not.toMatch(/identity-token|9000000001|482913/);
  spies.forEach(spy => spy.mockRestore());
});
/** Everything the spies were given: an Error by its message and stack, one level into objects as well. */
const loggedText = (spies: jest.SpyInstance[]): string => {
  const text = (value: unknown): string =>
    value instanceof Error ? `${String(value)} ${value.stack ?? ''}` : typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return spies
    .flatMap(spy => spy.mock.calls.flat())
    .map(arg =>
      arg && typeof arg === 'object' && !(arg instanceof Error)
        ? Object.values(arg as Record<string, unknown>).map(text).join(' ')
        : text(arg)
    )
    .join(' ');
};


it('never throws: an unexpected error is a plain message too', async () => {
  exchangeMock.mockRejectedValue(new Error('unexpected'));
  expect(await openFacility(ORIGIN, NAME)).toEqual({
    kind: 'failed',
    reason: 'failed',
    message: "North Cold Store couldn't sign you in. Try again later.",
  });
  expect(getCentralState().opening).toBeNull();
});

describe('taking the answer of an open', () => {
  it('only one screen gets it: the first to ask, and nobody after', async () => {
    await openFacility(ORIGIN, NAME);
    const published = getCentralState().outcome!;
    // Two My facilities mounted at once ask in the same render, with the same answer.
    expect(consumeOpenOutcome(published.id)).toBe(true);
    expect(getCentralState().outcome).toBeNull();
    expect(consumeOpenOutcome(published.id)).toBe(false);
  });

  it('an answer that has been replaced by a newer one is not taken, and the newer one stays', async () => {
    await openFacility(ORIGIN, NAME);
    const first = getCentralState().outcome!;
    await openFacility(ORIGIN, NAME);
    const second = getCentralState().outcome!;
    expect(second.id).not.toBe(first.id);
    expect(consumeOpenOutcome(first.id)).toBe(false);
    expect(getCentralState().outcome).toBe(second);
    expect(consumeOpenOutcome(second.id)).toBe(true);
  });
});

describe('the person changes while an open is in flight (external review R5)', () => {
  const BHAVIN = { id: 'bhavin', phoneNumber: '919000000002', name: 'Bhavin Fictional', createdAt: '' };
  const becomeBhavin = () => setCentralState({ status: 'signedIn', user: BHAVIN });
  type Held<T> = { promise: Promise<T>; resolve: (value: T) => void };
  function held<T>(): Held<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
  }
  const asha = async () => (await loadMyFacilities('asha')).find(entry => entry.origin === ORIGIN);
  const LEAVE = ['begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch'];

  it('O1. discovery answers after the person changed: nothing is switched, asked or written, and no answer is shown', async () => {
    const before = await asha();
    const answer = held<unknown>();
    jest.mocked(discoverOperator).mockImplementationOnce(async () => { mockEvents.push('discover'); return answer.promise as never; });
    const opening = openFacility(ORIGIN, NAME);
    await new Promise(resolve => setImmediate(resolve));
    becomeBhavin();
    answer.resolve(discovery());
    expect(await opening).toMatchObject({ kind: 'failed', reason: 'not_signed_in' });
    expect(mockEvents).toEqual(['discover']);
    expect(tokenMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/setUserProfile' }));
    expect(await asha()).toEqual(before);
    expect(getActiveOperatorServer()).toBe(previous);
    expect(getCentralState().outcome).toBeNull();
  });

  it('O2. the person changes during the exchange and the facility signs in: no profile, the list stays, and that facility session is left', async () => {
    const statusBefore = await status();
    exchangeMock.mockImplementationOnce(async () => { mockEvents.push('exchange'); becomeBhavin(); return LOGIN as never; });
    expect(await openFacility(ORIGIN, NAME)).toMatchObject({ kind: 'failed', reason: 'not_signed_in' });
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/setUserProfile' }));
    expect(await status()).toBe(statusBefore);
    expect(await lastOpened()).toBeNull();
    expect(mockEvents.slice(mockEvents.indexOf('exchange') + 1)).toEqual(LEAVE);
    expect(tokenMock).toHaveBeenCalledWith(ORIGIN, 'asha');
    expect(getCentralState().outcome).toBeNull();
  });

  it('O3. the person changes during the exchange and the facility asks for linking: no code is sent and no code step starts', async () => {
    exchangeMock.mockImplementationOnce(async () => { mockEvents.push('exchange'); becomeBhavin(); return refusal('link_required') as never; });
    expect(await openFacility(ORIGIN, NAME)).toMatchObject({ kind: 'failed', reason: 'not_signed_in' });
    expect(signInWithPhone).not.toHaveBeenCalled();
    expect(getCentralState().pendingLink).toBeNull();
  });

  it('O3b. the same person, whose number changes in memory meanwhile: the code goes to the number the open began with', async () => {
    exchangeMock.mockImplementationOnce(async () => {
      mockEvents.push('exchange');
      setCentralState({ user: { ...USER, phoneNumber: '919000000009' } });
      return refusal('link_required') as never;
    });
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'link_required', codeSent: true });
    expect(signInWithPhone).toHaveBeenCalledWith('919000000001');
    expect(getCentralState().pendingLink).toEqual({ origin: ORIGIN, name: NAME, phoneNumber: '919000000001' });
  });

  it('O4. a link begun for one person is not completed for another', async () => {
    exchangeMock.mockResolvedValueOnce(refusal('link_required') as never);
    await openFacility(ORIGIN, NAME);
    becomeBhavin();
    expect(await completeFacilityLink('482913')).toMatchObject({ kind: 'failed', reason: 'failed' });
    expect(tokenMock).toHaveBeenCalledTimes(1);
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/setUserProfile' }));
  });

  it('O5. the facility\'s own SMS sign-in, begun before the person changed: nothing is switched', async () => {
    const answer = held<unknown>();
    jest.mocked(discoverOperator).mockImplementationOnce(async () => { mockEvents.push('discover'); return answer.promise as never; });
    const beginning = beginFacilitySmsSignIn(ORIGIN, NAME);
    await new Promise(resolve => setImmediate(resolve));
    becomeBhavin();
    answer.resolve(discovery(null));
    expect(await beginning).toMatchObject({ kind: 'failed', reason: 'not_signed_in' });
    expect(mockEvents).toEqual(['discover']);
    expect(getActiveOperatorServer()).toBe(previous);
    expect(getCentralState().facilitySmsOrigin).toBeNull();
  });
});

// Ops review 2026-10-17, M08. The exchange finished for a person who has changed meanwhile, and
// leaving that facility session is refused while a write is in flight. The answer of the leave
// used to be ignored, so the previous person's facility session could stay on a shared phone.
describe('the facility session of an earlier sign-in, when leaving it is refused (M08)', () => {
  const BHAVIN = { id: 'bhavin', phoneNumber: '919000000002', name: 'Bhavin Fictional', createdAt: '' };
  const LEAVE = ['begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch'];
  // The forced path: the same steps, but no switch gate is taken (the write keeps it busy).
  const FORCED = ['logout', 'clear session state', 'clear config', 'clear server'];
  const NORTH = { origin: ORIGIN, instanceId: 'instance-north' };
  const after = (event: string) => mockEvents.slice(mockEvents.indexOf(event) + 1);
  const listed = async () => JSON.parse((await AsyncStorage.getItem(STALE_FACILITY_KEY)) ?? '[]');
  let writing = false;

  /** The exchange answers with a session after Bhavin has replaced Asha, and a write is then in flight. */
  const staleExchange = () =>
    exchangeMock.mockImplementationOnce(async () => {
      mockEvents.push('exchange');
      setCentralState({ status: 'signedIn', user: BHAVIN });
      writing = true;
      return LOGIN as never;
    });

  beforeEach(() => {
    writing = false;
    jest.mocked(queryClient.isMutating).mockImplementation(() => (writing ? 1 : 0));
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('(a) the first leave is refused; once the write settles within the wait, the second leave runs and the facility is no longer selected', async () => {
    staleExchange();
    const opening = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(1000);
    // Still waiting for the write: nothing has been left or forced yet...
    expect(after('exchange')).toEqual([]);
    expect(getActiveOperatorServer()).toBe(server);
    // ...but North is already listed, so an app closed now does not restore that session at
    // the next start (review 2026-10-18, finding 1a).
    expect(await listed()).toEqual([NORTH]);
    writing = false;
    await jest.advanceTimersByTimeAsync(200);
    expect(await opening).toMatchObject({ kind: 'failed', reason: 'not_signed_in' });
    expect(after('exchange')).toEqual(LEAVE);
    expect(getActiveOperatorServer()).toBeNull();
    // Left the normal way: the entry is removed again, and nothing is told to Bhavin.
    expect(await listed()).toEqual([]);
    expect(getCentralState().outcome).toBeNull();
  });

  it('(b) the write is still in flight after the wait: the session is ended without the gate, the facility is cleared and listed, and the person on the phone is told without its name', async () => {
    const statusBefore = await status();
    staleExchange();
    const opening = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS + 500);
    const outcome = await opening;
    expect(outcome).toEqual({
      kind: 'failed',
      reason: 'previous_session_closed',
      message: 'A facility was still opening for the earlier sign-in on this phone. It has been closed, and nothing from it stays on this phone.',
    });
    expect(after('exchange')).toEqual(FORCED);
    // The full logout (revocation tried), not a local-only one; its signOut moves the session generation.
    expect(jest.mocked(logout).mock.calls.at(-1)).toEqual([]);
    expect(beginOperatorSwitch).toHaveBeenCalledTimes(1); // the open's own switch only
    expect(getActiveOperatorServer()).toBeNull();
    expect(await listed()).toEqual([NORTH]);
    // Published although the ticket is Asha's: for whoever is on the phone now, naming no facility.
    expect(getCentralState().outcome).toEqual({ id: expect.any(Number), origin: '', name: '', outcome });
    expect(getCentralState().opening).toBeNull();
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/setUserProfile' }));
    expect(await status()).toBe(statusBefore);
  });

  it('(b) a forced sign-out whose stored session the phone kept says so, with the advice to restart', async () => {
    mockLogoutResult = { localCleared: false };
    staleExchange();
    const opening = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS + 500);
    expect(await opening).toEqual({
      kind: 'failed',
      reason: 'previous_session_not_cleared',
      message:
        "A facility was still opening for the earlier sign-in on this phone, and it couldn't be closed completely. Restart the app before anyone else uses this phone.",
    });
    expect(await listed()).toEqual([NORTH]);
  });

  it('(b) a waiting request instead of a session is ended the same way', async () => {
    exchangeMock.mockImplementationOnce(async () => {
      mockEvents.push('exchange');
      setCentralState({ status: 'signedIn', user: BHAVIN });
      writing = true;
      return PENDING as never;
    });
    const opening = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS + 500);
    expect(await opening).toMatchObject({ reason: 'previous_session_closed' });
    expect(after('exchange')).toEqual(FORCED);
  });

  it('(b) a server changed meanwhile is not touched: its own session is not ended in place of the stale one', async () => {
    const SOUTH = previous;
    exchangeMock.mockImplementationOnce(async () => {
      mockEvents.push('exchange');
      setCentralState({ status: 'signedIn', user: BHAVIN });
      writing = true;
      return LOGIN as never;
    });
    const opening = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(1000);
    // Another switch (it ended North's session) has selected South by the time the wait is over.
    mockActive = SOUTH;
    await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS);
    expect(await opening).toMatchObject({ reason: 'previous_session_closed' });
    expect(after('exchange')).toEqual([]);
    expect(getActiveOperatorServer()).toBe(SOUTH);
  });

  it('(c) the listed facility is not opened while it cannot be left, and opens once the cleanup has run', async () => {
    // The forced cleanup could not clear the selected server: North stays selected and listed.
    jest.mocked(clearOperatorServer).mockImplementationOnce(async () => { mockEvents.push('clear server failed'); throw new Error('disk full'); });
    staleExchange();
    const stale = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS + 500);
    expect(await stale).toMatchObject({ reason: 'previous_session_not_cleared' });
    expect(getActiveOperatorServer()).toBe(server);
    expect(await listed()).toEqual([NORTH]);

    // Bhavin opens North while the write is still in flight: refused, and North is not asked anything.
    await addMyFacility('bhavin', { origin: ORIGIN, name: NAME, city: 'Rajkot' });
    jest.mocked(discoverOperator).mockClear();
    tokenMock.mockClear();
    exchangeMock.mockClear();
    mockEvents.length = 0;
    const busy = {
      kind: 'failed',
      reason: 'busy',
      // The earlier sign-in's facility is not named (review 2026-10-18, finding 9).
      message: 'This phone is still closing an earlier sign-in. Try again in a minute.',
    };
    expect(await openFacility(ORIGIN, NAME)).toEqual(busy);
    expect(discoverOperator).not.toHaveBeenCalled();
    expect(tokenMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(mockEvents).toEqual([]);
    expect(getCentralState().outcome).toMatchObject({ origin: ORIGIN, name: NAME, outcome: busy });
    expect(await listed()).toEqual([NORTH]);

    // The write settles: the next open first runs the cleanup, then opens North for Bhavin.
    writing = false;
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'login' });
    expect(mockEvents.slice(0, LEAVE.length)).toEqual(LEAVE);
    expect(await listed()).toEqual([]);
    expect(tokenMock).toHaveBeenLastCalledWith(ORIGIN, 'bhavin');
  });

  it('(c) the refusal names no facility in Gujarati either', async () => {
    mockActive = server;
    writing = true;
    await markStaleFacility(NORTH);
    setLanguage('gu');
    expect(await openFacility(ORIGIN, NAME)).toEqual({
      kind: 'failed',
      reason: 'busy',
      message: 'આ ફોન હજુ અગાઉનું લૉગિન બંધ કરી રહ્યો છે. એક મિનિટ પછી ફરી પ્રયાસ કરો.',
    });
  });

  it("(c) the facility's own SMS sign-in is refused for a listed facility too", async () => {
    mockActive = server;
    writing = true;
    await markStaleFacility(NORTH);
    expect(await beginFacilitySmsSignIn(ORIGIN, NAME)).toMatchObject({ kind: 'failed', reason: 'busy' });
    expect(discoverOperator).not.toHaveBeenCalled();
    expect(getActiveOperatorServer()).toBe(server);
  });

  it('(review 3) a session that begins during the wait is not ended by the delayed retry', async () => {
    staleExchange();
    const opening = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(1000);
    // Bhavin's own sign-in at North replaces the stored session (startNewSession moves the
    // generation), and it is his exchange that kept the leave busy.
    advanceSessionGeneration();
    writing = false;
    await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS);
    expect(await opening).toMatchObject({ kind: 'failed', reason: 'not_signed_in' });
    // Nothing of his is touched: the gate is taken to look, and nothing is signed out or cleared.
    expect(after('exchange')).toEqual(['begin switch', 'end switch']);
    expect(getActiveOperatorServer()).toBe(server);
    // The earlier session is gone with the replacement, so the entry is removed and nobody is told.
    expect(await listed()).toEqual([]);
    expect(getCentralState().outcome).toBeNull();
  });

  it('(review 5) the late answer of the stale open keeps the open that the person now on the phone has begun', async () => {
    const SOUTH_ORIGIN = previous.origin;
    staleExchange();
    const stale = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(1000);
    // Bhavin is on My facilities (the sign-out cleared `opening`) and opens South; its discovery is slow.
    setCentralState({ opening: null, outcome: null });
    await addMyFacility('bhavin', { origin: SOUTH_ORIGIN, name: 'South Cold Store', city: 'Rajkot' });
    let answerSouth!: (value: unknown) => void;
    jest.mocked(discoverOperator).mockImplementationOnce(() => new Promise(resolve => { answerSouth = resolve; }) as never);
    const south = openFacility(SOUTH_ORIGIN, 'South Cold Store');
    expect(getCentralState().opening).toBe(SOUTH_ORIGIN);
    await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS + 500);
    expect(await stale).toMatchObject({ reason: 'previous_session_closed' });
    // His open is still shown as opening, and a second tap is still refused.
    expect(getCentralState().opening).toBe(SOUTH_ORIGIN);
    expect(await openFacility(SOUTH_ORIGIN, 'South Cold Store')).toMatchObject({ kind: 'failed', reason: 'busy' });
    expect(getCentralState().opening).toBe(SOUTH_ORIGIN);
    answerSouth({ server: previous, config: { supabaseUrl: SOUTH_ORIGIN, anonKey: 'anon-key', centralLogin: null } });
    expect(await south).toEqual({ kind: 'sms_offer' });
  });

  it('(review 5) an answer already waiting for the person now on the phone is not replaced: the earlier-session message is shown directly', async () => {
    staleExchange();
    const stale = openFacility(ORIGIN, NAME);
    await jest.advanceTimersByTimeAsync(1000);
    const waiting = { id: 77, origin: 'https://east-cold.example.test', name: 'East Cold Store', outcome: { kind: 'pending' as const } };
    setCentralState({ opening: null, outcome: waiting });
    await jest.advanceTimersByTimeAsync(LEAVE_RETRY_WAIT_MS + 500);
    const outcome = await stale;
    expect(outcome).toMatchObject({ reason: 'previous_session_closed' });
    expect(getCentralState().outcome).toBe(waiting);
    expect(showAlert).toHaveBeenCalledWith('Earlier sign-in closed', (outcome as { message: string }).message);
  });

  it('(c) another facility opens as usual while one is listed', async () => {
    const EAST = { origin: 'https://east-cold.example.test', instanceId: 'instance-east' };
    await markStaleFacility(EAST);
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'login' });
    // East's entry is for the start and foreground cleanup, not for this open.
    expect(await listed()).toEqual([EAST]);
  });
});

// The retry that the root runs at start and on every return to the foreground (app/_layout.tsx,
// src/tests/navigation/BootstrapCentral.test.tsx), and an open runs first.
describe('retryStaleFacilityCleanup (M08)', () => {
  const NORTH = { origin: ORIGIN, instanceId: 'instance-north' };
  const listed = async () => JSON.parse((await AsyncStorage.getItem(STALE_FACILITY_KEY)) ?? '[]');

  it('nothing listed: nothing is done', async () => {
    mockActive = server;
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(true);
    expect(mockEvents).toEqual([]);
    expect(getActiveOperatorServer()).toBe(server);
  });

  it('the listed facility is still selected and nothing is in flight: it is left with the full cleanup and the entry goes', async () => {
    mockActive = server;
    await markStaleFacility(NORTH);
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(true);
    expect(mockEvents).toEqual(['begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch']);
    expect(jest.mocked(logout).mock.calls.at(-1)).toEqual([undefined]);
    expect(getActiveOperatorServer()).toBeNull();
    expect(await listed()).toEqual([]);
  });

  it('a write is still in flight: nothing is touched and the entry stays for the next try', async () => {
    mockActive = server;
    jest.mocked(queryClient.isMutating).mockReturnValue(1);
    await markStaleFacility(NORTH);
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(false);
    expect(mockEvents).toEqual([]);
    expect(getActiveOperatorServer()).toBe(server);
    expect(await listed()).toEqual([NORTH]);
  });

  it('another facility is selected now: its session is left alone and the entry goes', async () => {
    mockActive = previous;
    await markStaleFacility(NORTH);
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(true);
    expect(mockEvents).toEqual([]);
    expect(getActiveOperatorServer()).toBe(previous);
    expect(await listed()).toEqual([]);
  });

  it('another instance now answers at the same address: the entry for the old instance goes and the new one is not left', async () => {
    mockActive = { ...server, instanceId: 'instance-north-new' };
    await markStaleFacility(NORTH);
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(true);
    expect(mockEvents).toEqual([]);
    expect(await listed()).toEqual([]);
  });

  it('(review 3) in the same run, a session that replaced the earlier one is not left: only the entry goes', async () => {
    mockActive = server;
    await markStaleFacility(NORTH, getSessionGeneration());
    // Someone signs in at North after the earlier session was listed.
    advanceSessionGeneration();
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(true);
    expect(mockEvents).toEqual([]);
    expect(getActiveOperatorServer()).toBe(server);
    expect(await listed()).toEqual([]);
  });

  it('(review 1b) the selection is not known in memory yet (a cold start): it is read before deciding, and the facility is left', async () => {
    mockActive = null;
    jest.mocked(require('../operatorServer').loadOperatorServer).mockImplementationOnce(async () => {
      mockActive = server;
      return server;
    });
    await markStaleFacility(NORTH);
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(true);
    expect(mockEvents).toEqual(['begin switch', 'logout', 'clear session state', 'clear config', 'clear server', 'end switch']);
    expect(await listed()).toEqual([]);
  });

  it('(review 1b) the saved selection cannot be read: nothing is left and the entry stays', async () => {
    mockActive = null;
    jest.mocked(require('../operatorServer').loadOperatorServer).mockRejectedValueOnce(new Error('storage unavailable'));
    await markStaleFacility(NORTH);
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(false);
    expect(mockEvents).toEqual([]);
    expect(await listed()).toEqual([NORTH]);
  });

  it('the cleanup fails part-way: the entry stays', async () => {
    mockActive = server;
    jest.mocked(clearOperatorServer).mockImplementationOnce(async () => { throw new Error('disk full'); });
    await markStaleFacility(NORTH);
    expect(await retryStaleFacilityCleanup(store.dispatch)).toBe(false);
    expect(await listed()).toEqual([NORTH]);
  });
});
