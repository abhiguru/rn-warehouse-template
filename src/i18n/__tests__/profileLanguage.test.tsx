/**
 * The language choice on the phone and on the profile: which one wins at
 * sign-in, and what is saved when.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useProfileLanguage } from '../useProfileLanguage';
import { fetchProfileLanguage, saveProfileLanguage } from '../profileLanguage';

const mockDispatch = jest.fn();
let mockState: { theme: { language?: string }; auth: { session: unknown; userProfile: { id: string } | null } };
const mockRpc = jest.fn();

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(() => Promise.resolve({ rpc: mockRpc })),
}));

function Probe() {
  useProfileLanguage();
  return null;
}

async function render(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Probe />);
  });
  return renderer;
}
async function update(renderer: TestRenderer.ReactTestRenderer): Promise<void> {
  await act(async () => {
    renderer.update(<Probe />);
  });
}
const calls = (name: string) => mockRpc.mock.calls.filter(([rpc]) => rpc === name);

beforeEach(() => {
  mockDispatch.mockClear();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: { success: true, language: null }, error: null });
  mockState = { theme: { language: 'system' }, auth: { session: null, userProfile: null } };
});

describe('language on the profile', () => {
  it('does nothing while signed out', async () => {
    mockState.theme.language = 'gu';
    await render();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('takes the profile language at sign-in when the phone has no choice', async () => {
    mockRpc.mockResolvedValue({ data: { success: true, language: 'gu' }, error: null });
    const renderer = await render();
    mockState.auth = { session: {}, userProfile: { id: 'p1' } };
    await update(renderer);
    expect(calls('get_my_language')).toHaveLength(1);
    expect(calls('set_my_language')).toHaveLength(0);
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'theme/setLanguagePreference', payload: 'gu' });
  });

  it('keeps following the phone when the profile has no language', async () => {
    mockState.auth = { session: {}, userProfile: { id: 'p1' } };
    await render();
    expect(calls('get_my_language')).toHaveLength(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('saves the choice of this phone at sign-in and does not read the profile', async () => {
    mockState.theme.language = 'gu';
    mockState.auth = { session: {}, userProfile: { id: 'p1' } };
    await render();
    expect(calls('get_my_language')).toHaveLength(0);
    expect(calls('set_my_language')).toEqual([['set_my_language', { p_language: 'gu' }]]);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('saves a change made in Settings, and clears it for "Phone language"', async () => {
    mockState.theme.language = 'gu';
    mockState.auth = { session: {}, userProfile: { id: 'p1' } };
    const renderer = await render();
    mockState.theme.language = 'en';
    await update(renderer);
    mockState.theme.language = 'system';
    await update(renderer);
    expect(calls('set_my_language').map(([, body]) => body.p_language)).toEqual(['gu', 'en', null]);
    expect(calls('get_my_language')).toHaveLength(0);
  });

  it('saves nothing more when the screen redraws without a change', async () => {
    mockState.theme.language = 'gu';
    mockState.auth = { session: {}, userProfile: { id: 'p1' } };
    const renderer = await render();
    await update(renderer);
    await update(renderer);
    expect(calls('set_my_language')).toHaveLength(1);
  });

  it('counts a session restored from saved tokens, which has no session object, as signed in', async () => {
    mockState.theme.language = 'gu';
    mockState.auth = { session: null, userProfile: { id: 'p1' } };
    await render();
    expect(calls('set_my_language')).toEqual([['set_my_language', { p_language: 'gu' }]]);
  });

  it('reads the profile again for another account', async () => {
    mockState.auth = { session: {}, userProfile: { id: 'p1' } };
    const renderer = await render();
    mockState.auth = { session: {}, userProfile: { id: 'p2' } };
    await update(renderer);
    expect(calls('get_my_language')).toHaveLength(2);
  });
});

describe('profile language calls', () => {
  it('reads only a known language', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: true, language: 'gu' }, error: null });
    expect(await fetchProfileLanguage()).toBe('gu');
    mockRpc.mockResolvedValueOnce({ data: { success: true, language: 'fr' }, error: null });
    expect(await fetchProfileLanguage()).toBeUndefined();
  });

  it('treats a server without the function, or a failed call, as no language', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await fetchProfileLanguage()).toBeUndefined();
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchProfileLanguage()).toBeUndefined();
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    expect(await saveProfileLanguage('gu')).toBe(false);
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    expect(await saveProfileLanguage('gu')).toBe(false);
  });

  it('reports whether the server kept the choice', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: true, language: 'gu' }, error: null });
    expect(await saveProfileLanguage('gu')).toBe(true);
    mockRpc.mockResolvedValueOnce({ data: { success: false, code: 'UNKNOWN_LANGUAGE' }, error: null });
    expect(await saveProfileLanguage('gu')).toBe(false);
  });
});
