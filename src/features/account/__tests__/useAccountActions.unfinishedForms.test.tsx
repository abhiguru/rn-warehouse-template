/**
 * WH-301 (contract section 2.1b; Product PQ1; Design 4.6): "Delete my account" and the person's unfinished forms. The warning
 * step ends with `offline.unfinishedWillGo` (the count of OWN forms) only when there are some, and `deleteOwnForms()` runs
 * only after the server confirms the deletion: a refusal, a wrong number, offline or no answer leave the forms.
 *
 * Real: `useAccountActions`, `formDrafts`, the unsent store and its file, i18n. Faked at the edge: expo-sqlite (Node's
 * SQLite), files, secure-store, NetInfo, the signed-in person; and, as in useAccountActions.test.tsx, the redux hooks,
 * the router, the alert, the central sign-out and the auth thunk (the server's answer to the deletion).
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - A form is a row of `forms` (section 1 gives its columns); `initUnsent()` loads it. Without central login the deletion goes
 *    through `dispatch(deleteAccount()).unwrap()`, which the test makes resolve (server confirmed) or reject (refused).
 * ==================================
 */
import React from 'react';
import { act, render as renderScreen } from '@testing-library/react-native';
import { env } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { rawRows, rawRun, unsentFileNames } from '@/tests/unsent/unsentPhone';
import { useAccountActions } from '@/features/account/useAccountActions';
const { initUnsent } = require('@/features/unsent/unsentStore') as { initUnsent(): Promise<void> }; // not built yet
import { setLanguage, t } from '@/i18n';

let mockOffline = false;
const mockProfile = { id: 'profile-1', name: 'Asha Fictional', role: 'staff', mobile: '919000000001' };
const mockDispatch = jest.fn((action: unknown) => ({ unwrap: async () => action }));
jest.mock('expo-sqlite', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.sqlite(), { virtual: true });
jest.mock('expo-secure-store', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.secureStore());
jest.mock('expo-file-system', () => require('@/tests/phoneCopy/fakeFiles').fileSystemModule());
jest.mock('@/config/supabaseConfig', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.supabase());
jest.mock('@react-native-community/netinfo', () => require('@/tests/phoneCopy/phoneEnv').mockFactories.netinfo());
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockProfile } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }, useIsFocused: () => true }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/envConfig', () => ({ isCentralLoginConfigured: () => false }));
jest.mock('@/store/operatorSwitch', () => ({ leaveFacility: jest.fn(async () => 'left') }));
jest.mock('@/store/centralSignOut', () => ({ deleteFacilityAccount: jest.fn(), signOutEverywhere: jest.fn(), whileLeaving: async (w: () => Promise<unknown>) => w() }));
jest.mock('@/store/slices/authSlice', () => ({
  logout: jest.fn(() => ({ type: 'test/logout' })),
  deleteAccount: jest.fn(() => ({ type: 'test/deleteAccount' })),
  isDeleteAccountRejection: (value: unknown) => typeof value === 'object' && value !== null && 'serverDeleted' in value,
}));

type Hook = ReturnType<typeof useAccountActions>;
let hook: Hook;
function Probe() { hook = useAccountActions(); return null; }

const SCOPE = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-1']);
const OTHER = JSON.stringify(['https://warehouse.example.test', 'instance-a', 'user-2']);
const formRow = (id: string, scope: string) =>
  `INSERT INTO forms (id, scope, kind, grn_id, state, photos, customer, started_at, updated_at) VALUES ('${id}', '${scope}', 'grn', NULL, '{}', '[]', 'Asha Fictional Traders', 1, 1)`;
const ownForms = async () => (await rawRows<{ id: string }>('forms')).filter(r => (r as { scope?: string }).scope === SCOPE).map(r => r.id);
const WARNING = t('settings.deleteAccount.warningMessage');

async function openWith(forms: { id: string; scope: string }[]) {
  await initUnsent();
  for (const form of forms) await rawRun(formRow(form.id, form.scope));
  await initUnsent();
  await renderScreen(<Probe />);
  await act(async () => { hook.deletion.open(); });
  await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
}
async function deleteWith(number: string) {
  await act(() => hook.deletion.dialog.onConfirm()); // warning → number
  await act(() => hook.deletion.dialog.field!.onChangeText(number));
  await act(async () => hook.deletion.dialog.onConfirm());
}

// The unsent store keeps its file open for the whole run (as in the app), so the file is emptied between tests, not wiped.
beforeEach(async () => {
  jest.clearAllMocks(); files.reset(); mockOffline = false; env.subject = 'user-1';
  if (unsentFileNames().length > 0) { await rawRun('DELETE FROM forms'); await rawRun('DELETE FROM items'); }
});
afterEach(() => { setLanguage('en'); });

describe('the warning step', () => {
  it('with unfinished forms of this person it ends with the count, joined by a space', async () => {
    await openWith([{ id: 'f1', scope: SCOPE }, { id: 'f2', scope: SCOPE }]);
    const will = t('offline.unfinishedWillGo' as never, { count: 2 } as never) as string;
    expect(will).not.toBe('offline.unfinishedWillGo');
    expect(will).toContain('2');
    expect(hook.deletion.dialog.message).toBe(`${WARNING} ${will}`);
  });

  it("does not count another person's forms, and without forms the message is unchanged", async () => {
    await openWith([{ id: 'f9', scope: OTHER }]);
    expect(hook.deletion.dialog.message).toBe(WARNING);
  });
});

describe('what happens to the forms', () => {
  it('after the server confirms the deletion, this person\'s forms are deleted and another person\'s stay', async () => {
    await openWith([{ id: 'f1', scope: SCOPE }, { id: 'f9', scope: OTHER }]);
    await deleteWith('9000000001');
    expect(await ownForms()).toEqual([]);
    expect((await rawRows<{ id: string }>('forms')).map(r => r.id)).toEqual(['f9']);
  });

  it('a refusal by the server leaves them', async () => {
    await openWith([{ id: 'f1', scope: SCOPE }]);
    mockDispatch.mockImplementationOnce(() => ({ unwrap: async () => { throw { serverDeleted: false, message: 'Not allowed' }; } }));
    await deleteWith('9000000001');
    expect(await ownForms()).toEqual(['f1']);
  });

  it('a number that does not match leaves them, and nothing is sent', async () => {
    await openWith([{ id: 'f1', scope: SCOPE }]);
    await deleteWith('9000000002');
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(await ownForms()).toEqual(['f1']);
  });

  it('offline leaves them', async () => {
    mockOffline = true;
    await openWith([{ id: 'f1', scope: SCOPE }]);
    await deleteWith('9000000001');
    expect(await ownForms()).toEqual(['f1']);
  });
});
