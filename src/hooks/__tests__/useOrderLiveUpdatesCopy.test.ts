/**
 * WH-328, Product PQ2 and contract section 7 (C1): with the phone copy on, an order screen that is open and online does not
 * read the server every 15 s; it asks the sync engine for a changes run every 15 s (any trigger name), so a customer's change
 * still shows within about 15 s. A customer account keeps today's polling; with the feature off nothing changes.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - The hook reads the role from the store profile (`role`) and the feature from `getSyncSnapshot().feature === 'on'`.
 *  - The screens re-read after the sync through the copy's own change notice, so the hook itself does not call `refresh` then.
 * ==================================
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useOrderLiveUpdates } from '../useOrderLiveUpdates';

let mockProfile: object | null = { id: 'p1', role: 'supervisor' };
let mockFeature: 'on' | 'off' = 'on';
const mockSyncNow = jest.fn(async () => 'done');
jest.mock('@/store/hooks', () => ({ useAppSelector: (select: (s: unknown) => unknown) => select({ auth: { userProfile: mockProfile } }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: true }), useIsOffline: () => false }));
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
  mockProfile = { id: 'p1', role: 'supervisor' };
  (AppState as unknown as { currentState: string }).currentState = 'active';
});
afterEach(() => { jest.useRealTimers(); });

it.each(['admin', 'supervisor', 'staff'])('%s: a changes run every 15 s, and no read of the server', async role => {
  mockProfile = { id: 'p1', role };
  const { refresh, view } = await openScreen();
  await advance(14_999);
  expect(mockSyncNow).not.toHaveBeenCalled();
  await advance(1);
  expect(mockSyncNow).toHaveBeenCalledTimes(1);
  await advance(15_000);
  expect(mockSyncNow).toHaveBeenCalledTimes(2);
  expect(refresh).not.toHaveBeenCalled();
  await view.unmount();
  await advance(60_000);
  expect(mockSyncNow).toHaveBeenCalledTimes(2);
});

it('a customer account keeps today\'s polling of the server', async () => {
  mockProfile = { id: 'c1', role: 'customer' };
  const { refresh } = await openScreen();
  await advance(15_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(mockSyncNow).not.toHaveBeenCalled();
});

it('with the feature off it reads the server as today', async () => {
  mockFeature = 'off';
  const { refresh } = await openScreen();
  await advance(15_000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(mockSyncNow).not.toHaveBeenCalled();
});
