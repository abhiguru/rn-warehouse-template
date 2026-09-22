import React from 'react';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import { subscribeToOrderChanges } from '@/services/order-live-updates';
import { useOrderLiveUpdates } from '../useOrderLiveUpdates';

let mockProfile: object | null = { id: 'customer' };
let mockConnected = true;
jest.mock('@/store/hooks', () => ({ useAppSelector: () => mockProfile }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: mockConnected }) }));
jest.mock('@/services/order-live-updates', () => ({ subscribeToOrderChanges: jest.fn() }));

test('background/offline stop subscriptions; foreground/reconnect and account changes create new ones', async () => {
  const stop = jest.fn();
  (subscribeToOrderChanges as jest.Mock).mockReturnValue(stop);
  let change!: (state: string) => void;
  const remove = jest.fn();
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    change = callback;
    return { remove };
  });
  const originalState = AppState.currentState;
  AppState.currentState = 'active';
  const Harness = () => { useOrderLiveUpdates(jest.fn()); return null; };
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(React.createElement(Harness)); });
    expect(subscribeToOrderChanges).toHaveBeenCalledTimes(1);
    await act(async () => { change('background'); });
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => { change('active'); });
    expect(subscribeToOrderChanges).toHaveBeenCalledTimes(2);
    mockConnected = false;
    await act(async () => { tree.update(React.createElement(Harness)); });
    expect(stop).toHaveBeenCalledTimes(2);
    mockConnected = true;
    await act(async () => { tree.update(React.createElement(Harness)); });
    expect(subscribeToOrderChanges).toHaveBeenCalledTimes(3);
    mockProfile = null;
    await act(async () => { tree.update(React.createElement(Harness)); });
    expect(stop).toHaveBeenCalledTimes(3);
    mockProfile = { id: 'another-customer' };
    await act(async () => { tree.update(React.createElement(Harness)); });
    expect(subscribeToOrderChanges).toHaveBeenCalledTimes(4);
  } finally {
    await act(async () => { tree?.unmount(); });
    AppState.currentState = originalState;
    spy.mockRestore();
  }
  expect(stop).toHaveBeenCalledTimes(4);
  expect(remove).toHaveBeenCalled();
});
