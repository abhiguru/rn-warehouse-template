import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useOrderLiveUpdates, ORDER_REFRESH_INTERVAL_MS } from '../useOrderLiveUpdates';

let mockProfile: object | null = { id: 'customer' };
let mockConnected = true;
jest.mock('@/store/hooks', () => ({ useAppSelector: () => mockProfile }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: mockConnected }) }));

test('orders are re-read every 15 s; background/offline/sign-out stop the timer and the way back restarts it', async () => {
  jest.useFakeTimers();
  mockProfile = { id: 'customer' };
  mockConnected = true;
  const refresh = jest.fn();
  let change!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    change = callback;
    return { remove };
  });
  const originalState = AppState.currentState;
  AppState.currentState = 'active';
  const Harness = () => { useOrderLiveUpdates(refresh); return null; };
  let tree!: ReturnType<typeof create>;
  const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
  try {
    expect(ORDER_REFRESH_INTERVAL_MS).toBe(15_000);
    await act(async () => { tree = create(React.createElement(Harness)); });
    await advance(14_999);
    expect(refresh).not.toHaveBeenCalled();
    await advance(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(15_000);
    expect(refresh).toHaveBeenCalledTimes(2);

    await act(async () => { change('background'); });
    await advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    await act(async () => { change('active'); });
    expect(refresh).toHaveBeenCalledTimes(3);

    mockConnected = false;
    await act(async () => { tree.update(React.createElement(Harness)); });
    await advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    mockConnected = true;
    await act(async () => { tree.update(React.createElement(Harness)); });
    expect(refresh).toHaveBeenCalledTimes(4);

    mockProfile = null;
    await act(async () => { tree.update(React.createElement(Harness)); });
    await advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(4);
    mockProfile = { id: 'another-customer' };
    await act(async () => { tree.update(React.createElement(Harness)); });
    await advance(15_000);
    expect(refresh).toHaveBeenCalledTimes(5);
  } finally {
    await act(async () => { tree?.unmount(); });
    AppState.currentState = originalState;
    spy.mockRestore();
    jest.useRealTimers();
  }
  expect(remove).toHaveBeenCalled();
});
