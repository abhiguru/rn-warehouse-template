import { act, renderHook } from '@testing-library/react-native';
import { useSessionGenerationGuard } from '../useSessionGenerationGuard';
import { advanceSessionGeneration } from '@/config/sessionLifecycle';
import { getStoredToken } from '@/config/supabaseConfig';

jest.mock('@/config/supabaseConfig', () => ({ getStoredToken: jest.fn() }));

type Stored = Awaited<ReturnType<typeof getStoredToken>>;
type Props = { hasProfile: boolean; onGone: () => void };

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve!: (value: Stored) => void;
  const promise = new Promise<Stored>(settle => { resolve = settle; });
  return { promise, resolve };
};

const mount = (hasProfile: boolean, onGone: () => void) =>
  renderHook(({ hasProfile: profile, onGone: gone }: Props) => useSessionGenerationGuard(profile, gone), {
    initialProps: { hasProfile, onGone },
  });
const sessionChanged = async () => {
  await act(async () => { advanceSessionGeneration(); await flush(); });
};

beforeEach(() => { jest.clearAllMocks(); });

it('ends the session once when a change leaves no credentials behind a mounted profile', async () => {
  jest.mocked(getStoredToken).mockResolvedValue({ isValid: false });
  const onGone = jest.fn();
  await mount(true, onGone);
  expect(onGone).not.toHaveBeenCalled();
  await sessionChanged();
  expect(onGone).toHaveBeenCalledTimes(1);
  await sessionChanged();
  expect(onGone).toHaveBeenCalledTimes(1);
});

it.each([
  ['a valid session', { authToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 3600000, isValid: true, type: 'jwt' as const }],
  ['an expired access token with a refresh token', { authToken: 'access', refreshToken: 'refresh', expiresAt: 1, isValid: false, type: 'jwt' as const }],
  ['a refresh token alone', { refreshToken: 'refresh', isValid: false }],
])('keeps the session while %s remains', async (_, stored) => {
  jest.mocked(getStoredToken).mockResolvedValue(stored as Stored);
  const onGone = jest.fn();
  await mount(true, onGone);
  await sessionChanged();
  expect(getStoredToken).toHaveBeenCalledTimes(1);
  expect(onGone).not.toHaveBeenCalled();
});

it('is inert without a profile', async () => {
  jest.mocked(getStoredToken).mockResolvedValue({ isValid: false });
  const onGone = jest.fn();
  await mount(false, onGone);
  await sessionChanged();
  expect(getStoredToken).not.toHaveBeenCalled();
  expect(onGone).not.toHaveBeenCalled();
});

it('ignores a credential read superseded by a newer session change', async () => {
  const first = deferred();
  const second = deferred();
  jest.mocked(getStoredToken).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const onGone = jest.fn();
  await mount(true, onGone);
  await sessionChanged();
  await sessionChanged();
  await act(async () => { first.resolve({ isValid: false }); await flush(); });
  expect(onGone).not.toHaveBeenCalled();
  await act(async () => { second.resolve({ isValid: false }); await flush(); });
  expect(onGone).toHaveBeenCalledTimes(1);
});

it('does not fire after the guarded screen unmounts', async () => {
  const read = deferred();
  jest.mocked(getStoredToken).mockReturnValue(read.promise);
  const onGone = jest.fn();
  const { unmount } = await mount(true, onGone);
  await sessionChanged();
  await unmount();
  await act(async () => { read.resolve({ isValid: false }); await flush(); });
  expect(onGone).not.toHaveBeenCalled();
});

it('re-arms when a new profile mounts after the previous teardown', async () => {
  jest.mocked(getStoredToken).mockResolvedValue({ isValid: false });
  const onGone = jest.fn();
  const { rerender } = await mount(true, onGone);
  await sessionChanged();
  expect(onGone).toHaveBeenCalledTimes(1);
  await rerender({ hasProfile: false, onGone });
  await sessionChanged();
  expect(onGone).toHaveBeenCalledTimes(1);
  await rerender({ hasProfile: true, onGone });
  await sessionChanged();
  expect(onGone).toHaveBeenCalledTimes(2);
});
