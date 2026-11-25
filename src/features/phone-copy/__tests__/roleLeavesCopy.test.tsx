/**
 * WH-298 review finding 1 (Medium; contract section 1, "Feature on"): when the signed-in role becomes one the copy is not
 * for (a customer account), the copy is ERASED: the encrypted file and the key in secure storage, not only the sync stopped.
 *
 * Real: `useCopySession` / `useCopyFeatureOn` (src/hooks/usePhoneCopyStatus.ts), `PhoneCopyLifecycle`, the engine, copyDb,
 * copyKey, the auth reducer (`setUserProfile`). Faked at the edge: expo-sqlite, secure-store, file-system, NetInfo, the
 * server's answers (src/tests/phoneCopy).
 *
 * ===== AGREE WITH DEVELOPMENT (WH-298 review) =====
 *  - The observable is the phone's storage: no database file (`fakeDatabaseNames()`), no `secure_phone_copy_key`, and the
 *    snapshot phase 'empty'. Where Development puts the erase (lifecycle, layout, hook) is open: this harness mounts the
 *    two pieces app/_layout.tsx mounts (`useCopySession() ? <PhoneCopyLifecycle /> : null`), so a fix in either is seen.
 *    If the fix moves the mount logic into another component, mount that one here instead.
 * ===================================================
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { configureStore } from '@reduxjs/toolkit';
import { env, resetEnv, controlAppState } from '@/tests/phoneCopy/phoneEnv';
import { fakeDatabaseNames } from '@/tests/phoneCopy/fakeExpoSqlite';
import { grnRow } from '@/tests/phoneCopy/fakeFeed';
import { setFacilityCapabilities, resetFacilityCapabilities } from '@/config/facilityCapabilities';
import * as engine from '@/features/phone-copy/syncEngine';
import * as syncStore from '@/features/phone-copy/syncStore';
import * as copyDb from '@/features/phone-copy/copyDb';
import { PhoneCopyLifecycle } from '@/features/phone-copy/components/PhoneCopyLifecycle';
import { useCopySession } from '@/hooks/usePhoneCopyStatus';
import authReducer, { setUserProfile } from '@/store/slices/authSlice';

jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.fileSystem());
jest.mock('@/config/supabaseConfig', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/config/lanTransport', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.lan());
// react-redux is not transformed by this repo's Jest config: the hook reads the real store (real auth reducer) directly.
let mockStore: { getState: () => unknown; subscribe: (l: () => void) => () => void };
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppSelector: (select: (state: unknown) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => select(mockStore.getState())),
    useAppDispatch: () => jest.fn(),
  };
});
jest.mock('@/config/sentryConfig', () => ({ setSentryUser: jest.fn(), clearSentryUser: jest.fn() }));

const KEY_NAME = 'secure_phone_copy_key';
const server = { origin: 'https://warehouse.example.test', instanceId: 'instance-a' };
const settle = (ms = 0) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const profile = (role: 'staff' | 'customer') => ({ id: 'profile-1', role, name: 'Asha Fictional' }) as never;

/** What app/_layout.tsx does with the role: the lifecycle is mounted for the roles the copy is for. */
function Root() {
  const copySession = useCopySession();
  return copySession ? <PhoneCopyLifecycle /> : null;
}

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-11-25T07:00:00Z') });
  resetEnv();
  controlAppState();
  resetFacilityCapabilities();
  setFacilityCapabilities(server as never, { sync: true });
  env.feed.rows.goodsreceived.push(grnRow('g1'));
});
afterEach(async () => {
  await engine.stopPhoneCopy();
  await copyDb.eraseCopy();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function signedInPhoneWithCopy(role: 'staff' | 'customer' = 'staff') {
  const store = configureStore({ reducer: { auth: authReducer } });
  mockStore = store;
  store.dispatch(setUserProfile(profile(role)));
  await render(<Root />);
  await settle(50);
  return store;
}

describe('a role the copy is not for', () => {
  it('baseline: a staff session has the copy: a file and a key on the phone', async () => {
    await signedInPhoneWithCopy();
    expect(syncStore.getSyncSnapshot().phase).toBe('ready');
    expect(fakeDatabaseNames().length).toBeGreaterThan(0);
    expect(env.secure.has(KEY_NAME)).toBe(true);
  });

  it('a role change to customer erases the copy: the file and the key are gone, not only the sync stopped', async () => {
    const store = await signedInPhoneWithCopy();
    expect(env.secure.has(KEY_NAME)).toBe(true);
    await act(async () => { store.dispatch(setUserProfile(profile('customer'))); });
    await settle(50);
    expect(fakeDatabaseNames()).toEqual([]);
    expect(env.secure.has(KEY_NAME)).toBe(false);
    expect(syncStore.getSyncSnapshot().phase).toBe('empty');
  });
});
