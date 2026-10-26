import React from 'react';
import { act, create } from 'react-test-renderer';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { ensureNetworkConnection, useIsOffline } from '../useNetworkStatus';
import { bumpNetInfoGeneration } from '@/config/netInfoGeneration';

let mockPath: 'public' | 'lan' = 'public';
jest.mock('@/hooks/useLanStatus', () => ({ useLanStatus: () => ({ path: mockPath, failure: null, lan: null }) }));
jest.mock('@/config/lanTransport', () => ({ getConnectionPath: () => mockPath }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));

const state = (isConnected: boolean | null, isInternetReachable: boolean | null) =>
  ({ type: 'wifi', isConnected, isInternetReachable, details: null }) as unknown as NetInfoState;
let listener: (state: NetInfoState) => void;
let offline: boolean;
let tree: ReturnType<typeof create> | undefined;
const unsubscribe = jest.fn();
const Harness = () => {
  offline = useIsOffline();
  return null;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = 'public';
  jest.mocked(NetInfo.fetch).mockResolvedValue(state(true, true));
  jest.mocked(NetInfo.addEventListener).mockImplementation(callback => {
    listener = callback;
    return unsubscribe;
  });
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
});

async function mount() {
  await act(async () => { tree = create(React.createElement(Harness)); });
}

describe('useIsOffline', () => {
  it('is false while the facility answers its hello', async () => {
    await mount();
    await act(async () => { listener(state(true, true)); });
    expect(offline).toBe(false);
  });

  it('is true when the facility does not answer over the internet and no other path reaches it', async () => {
    await mount();
    await act(async () => { listener(state(true, false)); });
    expect(offline).toBe(true);
  });

  it('is false when the public probe fails but the warehouse network reaches the server', async () => {
    mockPath = 'lan';
    await mount();
    await act(async () => { listener(state(true, false)); });
    expect(offline).toBe(false);
  });

  it('is true with no network at all, whatever path was in use', async () => {
    mockPath = 'lan';
    await mount();
    await act(async () => { listener(state(false, false)); });
    expect(offline).toBe(true);
  });

  it('is false while the first answer is awaited', async () => {
    jest.mocked(NetInfo.fetch).mockReturnValue(new Promise(() => {}));
    await mount();
    expect(offline).toBe(false);
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

  it('still refuses with no network at all', async () => {
    mockPath = 'lan';
    jest.mocked(NetInfo.fetch).mockResolvedValue(state(false, false));
    await expect(ensureNetworkConnection()).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('after NetInfo is configured again', () => {
  it('the hook listens again and lets go of the listener that configure stopped', async () => {
    await mount();
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    await act(async () => { bumpNetInfoGeneration(); });
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await act(async () => { listener(state(true, false)); });
    expect(offline).toBe(true);
  });
});
