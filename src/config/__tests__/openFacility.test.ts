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
let mockAuth: Record<string, unknown> = {};
jest.mock('@/store', () => ({
  store: {
    getState: () => ({ auth: mockAuth }),
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
  mockAuth = {};
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

  it('publishes the answer for whichever screen is mounted, until that screen has handled it', async () => {
    const opening = openFacility(ORIGIN, NAME);
    expect(getCentralState().opening).toBe(ORIGIN);
    // A second open while one is running is refused (and said so) without touching the first.
    expect(await openFacility('https://other.example.test', 'Other')).toMatchObject({ kind: 'failed', reason: 'busy' });
    expect(getCentralState().opening).toBe(ORIGIN);
    expect(getCentralState().outcome).toMatchObject({ origin: 'https://other.example.test', outcome: { reason: 'busy' } });
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
    const busy = { kind: 'failed', reason: 'busy', message: 'Finish the current operation before switching facilities.' };
    expect(await openFacility(ORIGIN, NAME)).toEqual(busy);
    expect(mockEvents).toEqual([]);
    expect(tokenMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(getCentralState().opening).toBeNull();
    // Not silent: the list shows the busy message like any other refusal.
    expect(getCentralState().outcome).toMatchObject({ origin: ORIGIN, name: NAME, outcome: busy });
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
    ['session_ended', 'central', 'Your association sign-in has ended. Sign in again.'],
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
      return { ok: false, code: 'session_ended', message: 'Your association sign-in has ended. Sign in again.' };
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
