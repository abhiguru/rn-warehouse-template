/**
 * WH-381: orders are server-only (no longer in the phone copy). `useOrderLiveUpdates` polls `refresh`
 * every 15 s while online for all roles (even when the phone copy feature is on), never triggers
 * `syncNow('orders')`, and stops while offline.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useOrderLiveUpdates } from '../useOrderLiveUpdates';

let mockProfile: object | null = { id: 'p1', role: 'supervisor' };
let mockFeature: 'on' | 'off' = 'on';
let mockOffline = false;
const mockSyncNow = jest.fn(async () => 'done');
jest.mock('@/store/hooks', () => ({ useAppSelector: (select: (s: unknown) => unknown) => select({ auth: { userProfile: mockProfile } }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isConnected: !mockOffline }),
  useIsOffline: () => mockOffline,
}));
jest.mock('@/features/phone-copy/syncEngine', () => ({ ...jest.requireActual('@/features/phone-copy/syncEngine'), syncNow: (...a: unknown[]) => (mockSyncNow as (...x: unknown[]) => unknown)(...a) }));
jest.mock('@/features/phone-copy/syncStore', () => {
  const actual = jest.requireActual('@/features/phone-copy/syncStore');
  return { ...actual, getSyncSnapshot: () => ({ ...actual.getSyncSnapshot(), feature: mockFeature }) };
});

const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

async function openScreen() {
  const refresh = jest.fn();
  const Harness = () => { useOrderLiveUpdates(refresh, true, { refreshOnFocus: false }); return null; };
  const view = await render(React.createElement(Harness));
  return { refresh, view };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSyncNow.mockClear();
  mockFeature = 'on';
  mockOffline = false;
  mockProfile = { id: 'p1', role: 'supervisor' };
  (AppState as unknown as { currentState: string }).currentState = 'active';
});
afterEach(() => { jest.useRealTimers(); });

it.each(['admin', 'supervisor', 'staff', 'customer'])('%s online with phone copy on: polls server refresh every 15 s and never calls syncNow', async role => {
  mockProfile = { id: 'p1', role };
  const { refresh, view } = await openScreen();
  await advance(14_999);
  expect(refresh).not.toHaveBeenCalled();
  await advance(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  await advance(15_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(mockSyncNow).not.toHaveBeenCalled();
  await view.unmount();
  await advance(60_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(mockSyncNow).not.toHaveBeenCalled();
});

it('offline: stops polling completely (calls neither refresh nor syncNow)', async () => {
  mockOffline = true;
  const { refresh } = await openScreen();
  await advance(45_000);
  expect(refresh).not.toHaveBeenCalled();
  expect(mockSyncNow).not.toHaveBeenCalled();
});

it('with the feature off online it polls refresh as today', async () => {
  mockFeature = 'off';
  const { refresh } = await openScreen();
  await advance(15_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(mockSyncNow).not.toHaveBeenCalled();
});
