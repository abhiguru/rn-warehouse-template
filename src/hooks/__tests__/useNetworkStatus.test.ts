import React from 'react';
import { act, create } from 'react-test-renderer';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { NetworkStatus, useNetworkStatus } from '../useNetworkStatus';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const online = { type: 'wifi', isConnected: true, isInternetReachable: true, details: null } as NetInfoState;
const offline = { type: 'none', isConnected: false, isInternetReachable: false, details: null } as NetInfoState;
let initial: ReturnType<typeof deferred<NetInfoState>>;
let listener: (state: NetInfoState) => void;
let status: NetworkStatus;
let tree: ReturnType<typeof create> | undefined;
const unsubscribe = jest.fn();
const Harness = () => { status = useNetworkStatus(); return null; };

beforeEach(() => {
  jest.resetAllMocks();
  initial = deferred<NetInfoState>();
  jest.mocked(NetInfo.fetch).mockReturnValue(initial.promise);
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

it.each([online, offline])('uses the initial $type check when no event has arrived', async state => {
  await mount();
  expect(status.isLoading).toBe(true);
  await act(async () => { initial.resolve(state); });
  expect(status).toEqual({ isConnected: state.isConnected, isInternetReachable: state.isInternetReachable, type: state.type, isLoading: false });
});

it.each([
  { old: online, latest: offline },
  { old: offline, latest: online },
])('keeps a newer $latest.type event when the old $old.type startup check finishes', async ({ old, latest }) => {
  await mount();
  await act(async () => { listener(latest); });
  await act(async () => { initial.resolve(old); });
  expect(status).toEqual({ isConnected: latest.isConnected, isInternetReachable: latest.isInternetReachable, type: latest.type, isLoading: false });
});

it('keeps a synchronous subscription event ahead of a delayed startup check', async () => {
  jest.mocked(NetInfo.addEventListener).mockImplementation(callback => {
    listener = callback;
    callback(offline);
    return unsubscribe;
  });
  await mount();
  await act(async () => { initial.resolve(online); });
  expect(status.isConnected).toBe(false);
});

it('handles a failed initial check and still follows later connection events', async () => {
  await mount();
  await act(async () => { initial.reject(new Error('Fictional native status failure')); });
  expect(status.isLoading).toBe(false);
  expect(status.isInternetReachable).toBeNull();
  await act(async () => { listener(offline); });
  expect(status.isConnected).toBe(false);
  await act(async () => { listener(online); });
  expect(status.isConnected).toBe(true);
});

it('keeps a newer event even if the initial check subsequently fails', async () => {
  await mount();
  await act(async () => { listener(offline); });
  await act(async () => { initial.reject(new Error('Fictional delayed check failure')); });
  expect(status).toEqual({ isConnected: false, isInternetReachable: false, type: 'none', isLoading: false });
});

it('unsubscribes and ignores late native results after unmount', async () => {
  await mount();
  await act(async () => { tree!.unmount(); });
  tree = undefined;
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  // Reading the late state would itself prove a stale callback was processed.
  const readType = jest.fn(() => 'wifi');
  const late = { ...online };
  Object.defineProperty(late, 'type', { get: readType });
  await act(async () => { initial.resolve(late); listener(late); });
  expect(readType).not.toHaveBeenCalled();
});
