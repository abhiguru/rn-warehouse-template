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
import { discoverOperator, getActiveOperatorServer } from '../operatorServer';
import { beginOperatorSwitch, exchangeCentralIdentity, signInWithPhone } from '../supabaseConfig';
import { queryClient } from '@/lib/queryClient';
import { store } from '@/store';
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
}));
jest.mock('../supabaseConfig', () => ({
  beginOperatorSwitch: jest.fn(() => { mockEvents.push('begin switch'); return true; }),
  endOperatorSwitch: jest.fn(() => { mockEvents.push('end switch'); }),
  getPendingEnrollmentToken: jest.fn(async () => null),
  clearPendingEnrollment: jest.fn(),
  signOutPendingEnrollment: jest.fn(),
  initializeSupabase: jest.fn(() => { mockEvents.push('initialize'); }),
  exchangeCentralIdentity: jest.fn(),
  signInWithPhone: jest.fn(),
}));
jest.mock('@/store', () => ({
  store: {
    dispatch: jest.fn((action: { type: string }) => {
      if (action.type === 'test/logout') return { unwrap: async () => { mockEvents.push('logout'); } };
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
    expect(tokenMock).toHaveBeenCalledWith(ORIGIN);
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

  it('publishes the answer for whichever screen is mounted, until that screen has handled it', async () => {
    const opening = openFacility(ORIGIN, NAME);
    expect(getCentralState().opening).toBe(ORIGIN);
    // A second open while one is running is refused and changes nothing.
    expect(await openFacility('https://other.example.test', 'Other')).toMatchObject({ kind: 'failed', reason: 'busy' });
    await opening;
    const published = getCentralState().outcome;
    expect(getCentralState().opening).toBeNull();
    expect(published).toMatchObject({ origin: ORIGIN, name: NAME, outcome: { kind: 'login' } });
    consumeOpenOutcome(published!.id);
    expect(getCentralState().outcome).toBeNull();
  });

  it('skips the cleanup when the facility is already the selected server', async () => {
    mockActive = server;
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'login' });
    expect(mockEvents).toEqual(['discover', 'begin switch', 'end switch', 'initialize', 'token', 'exchange', 'auth/setUserProfile']);
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
    ['network', 'network', 'The connection to North Cold Store was lost. Check your connection and try again.', 'unavailable'],
    ['unavailable', 'failed', "North Cold Store couldn't sign you in. Try again later.", 'unavailable'],
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
  it('a facility that cannot be reached is marked unavailable and nothing is switched', async () => {
    await updateMyFacility('asha', ORIGIN, { status: 'approved' });
    jest.mocked(discoverOperator).mockRejectedValue(new Error('Server discovery timed out'));
    expect(await openFacility(ORIGIN, NAME)).toEqual({
      kind: 'failed',
      reason: 'facility_unreachable',
      message: "North Cold Store can't be reached right now. Check your connection and try again.",
    });
    expect(await status()).toBe('unavailable');
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
    ['session_ended', 'central', 'Your association sign-in has ended. Sign in again.'],
    ['unknown_facility', 'unknown_facility', "This cold storage is not on the association's list, so association sign-in can't be used there."],
  ])('%s: the message is the association\'s and the facility is not asked', async (code, reason, message) => {
    tokenMock.mockResolvedValue({ ok: false, code, message } as never);
    expect(await openFacility(ORIGIN, NAME)).toEqual({ kind: 'failed', reason, message });
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(await status()).toBe('approved');
  });
});

it('never throws: an unexpected error is a plain message too', async () => {
  exchangeMock.mockRejectedValue(new Error('unexpected'));
  expect(await openFacility(ORIGIN, NAME)).toEqual({
    kind: 'failed',
    reason: 'failed',
    message: "North Cold Store couldn't sign you in. Try again later.",
  });
  expect(getCentralState().opening).toBeNull();
});
