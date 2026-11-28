/**
 * WH-361 item 1: the session guard ends a mounted session only when the secure store was read and holds no sign-in. A
 * read that fails is tried again; a store that stays unreadable ends nothing and erases nothing.
 *
 * Real: `useSessionGenerationGuard`, `getStoredToken` and the token store of src/config/supabaseConfig.ts. Faked: the
 * native secure store (a map that fails on request), the clock, and the modules around the token store that need a
 * device (supabase client, store, recent-items services), as in credentialReads.test.ts.
 */
import '@/tests/helpers/fakeTimersFirst';
import { act, renderHook } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSessionGenerationGuard } from '../useSessionGenerationGuard';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { clearStoredTokens, initializeSupabase, invalidateStoredTokenCache, storeTokens } from '@/config/supabaseConfig';

jest.mock('@/services/recent-customers-service', () => ({ RecentCustomersService: { clearRecentCustomers: jest.fn(async () => {}) } }));
jest.mock('@/services/session-recent-items-service', () => ({ SessionRecentItemsService: { clearAllSessionRecentItems: jest.fn(async () => {}) } }));
jest.mock('@/services/recent-items-service', () => ({ RecentItemsService: { clearCache: jest.fn(async () => {}) } }));
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/sessionScopedState', () => ({ clearSessionScopedState: jest.fn(async () => {}) }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ rpc: jest.fn(), from: jest.fn() })) }));
jest.mock('@/utils/secureSessionMarker', () => ({ clearSecureSessionMarker: jest.fn() }));
jest.mock('@/utils/otpRateLimiter', () => ({
  checkOTPRateLimit: jest.fn(), recordOTPRequest: jest.fn(), clearAllRateLimits: jest.fn(async () => {}),
}));

const secure = new Map<string, string>();
const jwt = () => {
  const part = (value: unknown) => btoa(JSON.stringify(value));
  return `${part({ alg: 'HS256' })}.${part({ sub: 'user-asha', session_id: 's1', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.sig`;
};
let failing = 0;
const settle = async (ms: number) => {
  await act(async () => {
    for (let spent = 0; spent < ms; spent += 250) await jest.advanceTimersByTimeAsync(250);
  });
};
const sessionChanged = async () => {
  await act(async () => { advanceSessionGeneration(); await jest.advanceTimersByTimeAsync(0); });
};

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  secure.clear();
  failing = 0;
  await AsyncStorage.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => {
    if (failing > 0) {
      failing -= 1;
      throw new Error('Keystore not available');
    }
    return secure.get(key) ?? null;
  });
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { secure.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { secure.delete(key); });
  initializeSupabase('http://localhost:18000', 'local-test-anon');
  await storeTokens(jwt(), 'r'.repeat(64), Date.now() + 3600_000);
  invalidateStoredTokenCache();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const mount = async (onGone: () => void) => {
  const view = await renderHook(() => useSessionGenerationGuard(true, onGone));
  await settle(0);
  return view;
};

describe('the session guard and an unreadable secure store (WH-361)', () => {
  it.each([1, 3])('a read that fails %i time(s) and then finds the session ends nothing', async times => {
    const onGone = jest.fn();
    await mount(onGone);
    failing = times;
    const before = new Map(secure);

    await sessionChanged();
    await settle(4_000);

    expect(onGone).not.toHaveBeenCalled();
    expect(new Map(secure)).toEqual(before);
  });

  it('a store that stays unreadable ends nothing and erases nothing', async () => {
    const onGone = jest.fn();
    await mount(onGone);
    const before = new Map(secure);
    failing = Number.POSITIVE_INFINITY;

    await sessionChanged();
    await settle(10_000);

    expect(onGone).not.toHaveBeenCalled();
    expect(new Map(secure)).toEqual(before);
  });

  it('a store that was read and holds no session ends it once', async () => {
    const onGone = jest.fn();
    await mount(onGone);
    await clearStoredTokens();
    invalidateStoredTokenCache();

    await sessionChanged();
    await settle(1_000);

    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('after failed reads, a store that is then read and holds no session ends it', async () => {
    const onGone = jest.fn();
    await mount(onGone);
    await clearStoredTokens();
    invalidateStoredTokenCache();
    failing = 2;

    await sessionChanged();
    await settle(4_000);

    expect(onGone).toHaveBeenCalledTimes(1);
  });
});
