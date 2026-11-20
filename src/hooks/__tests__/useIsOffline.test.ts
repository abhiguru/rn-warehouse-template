import { act, renderHook } from '@testing-library/react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { ensureNetworkConnection, useIsOffline } from '../useNetworkStatus';
import { bumpNetInfoGeneration } from '@/config/netInfoGeneration';

let mockPath: 'public' | 'lan' = 'public';
let mockFailure: 'old-configuration' | null = null;
jest.mock('@/hooks/useLanStatus', () => ({ useLanStatus: () => ({ path: mockPath, failure: mockFailure, lan: null }) }));
jest.mock('@/config/lanTransport', () => ({ getLanStatus: () => ({ path: mockPath, failure: mockFailure, lan: null }) }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));

const state = (isConnected: boolean | null, isInternetReachable: boolean | null) =>
  ({ type: 'wifi', isConnected, isInternetReachable, details: null }) as unknown as NetInfoState;
let listener: (state: NetInfoState) => void;
const unsubscribe = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = 'public';
  mockFailure = null;
  jest.mocked(NetInfo.fetch).mockResolvedValue(state(true, true));
  jest.mocked(NetInfo.addEventListener).mockImplementation(callback => {
    listener = callback;
    return unsubscribe;
  });
});

async function mount() {
  const { result } = await renderHook(() => useIsOffline());
  return result;
}

describe('useIsOffline', () => {
  it('is false while the facility answers its hello', async () => {
    const offline = await mount();
    await act(async () => { listener(state(true, true)); });
    expect(offline.current).toBe(false);
  });

  it('is true when the facility does not answer over the internet and no other path reaches it', async () => {
    const offline = await mount();
    await act(async () => { listener(state(true, false)); });
    expect(offline.current).toBe(true);
  });

  it('is false when the public probe fails but the warehouse network reaches the server', async () => {
    mockPath = 'lan';
    const offline = await mount();
    await act(async () => { listener(state(true, false)); });
    expect(offline.current).toBe(false);
  });

  it('is true when the warehouse network answers with the old keys of a key change: the server is not usable over it', async () => {
    mockPath = 'lan';
    mockFailure = 'old-configuration';
    const offline = await mount();
    await act(async () => { listener(state(true, false)); });
    expect(offline.current).toBe(true);
  });

  it('is true with no network at all, whatever path was in use', async () => {
    mockPath = 'lan';
    const offline = await mount();
    await act(async () => { listener(state(false, false)); });
    expect(offline.current).toBe(true);
  });

  it('is false while the first answer is awaited', async () => {
    jest.mocked(NetInfo.fetch).mockReturnValue(new Promise(() => {}));
    const offline = await mount();
    expect(offline.current).toBe(false);
  });
});

describe('ensureNetworkConnection', () => {
  it('refuses when the facility is not reachable over the internet and the warehouse network is not in use', async () => {
    jest.mocked(NetInfo.fetch).mockResolvedValue(state(true, false));
    await expect(ensureNetworkConnection()).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('lets a request through on the warehouse network path', async () => {
    mockPath = 'lan';
    jest.mocked(NetInfo.fetch).mockResolvedValue(state(true, false));
    await expect(ensureNetworkConnection()).resolves.toBeUndefined();
  });

  it('refuses on the warehouse network path while it answers with old keys', async () => {
    mockPath = 'lan';
    mockFailure = 'old-configuration';
    jest.mocked(NetInfo.fetch).mockResolvedValue(state(true, false));
    await expect(ensureNetworkConnection()).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('still refuses with no network at all', async () => {
    mockPath = 'lan';
    jest.mocked(NetInfo.fetch).mockResolvedValue(state(false, false));
    await expect(ensureNetworkConnection()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('after NetInfo is configured again', () => {
  it('the hook listens again and lets go of the listener that configure stopped', async () => {
    const offline = await mount();
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    await act(async () => { bumpNetInfoGeneration(); });
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await act(async () => { listener(state(true, false)); });
    expect(offline.current).toBe(true);
  });
});
