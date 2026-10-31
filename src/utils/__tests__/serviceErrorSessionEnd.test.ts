/** A refusal (42501) after the end of a session started with a code from the facility signs the person out. */
import * as SecureStore from 'expo-secure-store';
import { SESSION_ENDS_AT_KEY } from '@/config/sessionEnd';
import { handleGlobalAuthError } from '../serviceErrorHandler';

const mockDispatch = jest.fn();
jest.mock('@/store', () => ({ store: { dispatch: (...args: unknown[]) => mockDispatch(...args) } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: (reason: string) => ({ type: 'forceLogout', reason }) }));

const secure = new Map<string, string>();
const settle = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  mockDispatch.mockClear();
  secure.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => secure.get(key) ?? null);
});

it('signs out with the session-ended reason on a 42501 after the stored end', async () => {
  secure.set(SESSION_ENDS_AT_KEY, String(Date.now() - 60_000));
  handleGlobalAuthError({ code: '42501', message: 'permission denied' });
  await settle();
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'forceLogout', reason: 'Your facility code session has ended. Sign in again.' });
});

it('does so a little before the end too (the phone clock may be behind)', async () => {
  secure.set(SESSION_ENDS_AT_KEY, String(Date.now() + 2 * 60_000));
  handleGlobalAuthError({ code: '42501', message: 'permission denied' });
  await settle();
  expect(mockDispatch).toHaveBeenCalledTimes(1);
});

it('leaves an ordinary 42501 alone: no stored end, or the end is far away', async () => {
  handleGlobalAuthError({ code: '42501', message: 'permission denied' });
  secure.set(SESSION_ENDS_AT_KEY, String(Date.now() + 3 * 3600_000));
  handleGlobalAuthError({ code: '42501', message: 'permission denied' });
  await settle();
  expect(mockDispatch).not.toHaveBeenCalled();
});
