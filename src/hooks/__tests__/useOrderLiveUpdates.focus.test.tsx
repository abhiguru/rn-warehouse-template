/**
 * R4 (performance review 2026-10-13), now on a timer: an order screen that is not shown
 * re-reads nothing, catches up once when it is shown again, and keeps its timer when the
 * signed-in profile object is replaced for the same account. Fix round 1 (M1): coming
 * back to the foreground or online while shown refreshes once, lists included; the same
 * while not shown refreshes nothing. The interval is 15 s.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useOrderLiveUpdates, ORDER_REFRESH_INTERVAL_MS } from '../useOrderLiveUpdates';

let mockFocused = true;
let mockProfile: { id: string; name: string } | null = { id: 'profile-fictional-1', name: 'Fictional Customer' };
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockProfile } }),
}));
let mockConnected = true;
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: mockConnected }) }));

const INTERVAL = ORDER_REFRESH_INTERVAL_MS;
let originalState: typeof AppState.currentState;
// The app's AppState listeners; appState() is the app moving to that state.
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const appState = (state: AppStateStatus) => act(() => { appStateListeners.forEach(listener => listener(state)); });
const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  mockFocused = true;
  mockConnected = true;
  appStateListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => { appStateListeners.delete(listener); } };
  });
  mockProfile = { id: 'profile-fictional-1', name: 'Fictional Customer' };
  originalState = AppState.currentState;
  AppState.currentState = 'active';
});
afterEach(() => {
  AppState.currentState = originalState;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

type Options = Parameters<typeof useOrderLiveUpdates>[2];
async function mount(refresh: () => void, enabled = true, options?: Options) {
  const Harness = () => { useOrderLiveUpdates(refresh, enabled, options); return null; };
  const view = await render(<Harness />);
  return { rerender: () => view.rerender(<Harness />), unmount: () => view.unmount() };
}

it('reads only while the screen is shown and catches up once on its return', async () => {
  const refresh = jest.fn();
  const view = await mount(refresh);
  expect(refresh).not.toHaveBeenCalled();
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);

  mockFocused = false;
  await view.rerender();
  await advance(4 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);

  mockFocused = true;
  await view.rerender();
  expect(refresh).toHaveBeenCalledTimes(2);
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(3);
  await view.unmount();
  await advance(4 * INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(3);
});

it('keeps the timer when the profile object is replaced for the same account', async () => {
  const refresh = jest.fn();
  const view = await mount(refresh);
  await advance(INTERVAL / 2);
  mockProfile = { id: 'profile-fictional-1', name: 'Fictional Customer (renamed)' };
  await view.rerender();
  await advance(INTERVAL / 2);
  expect(refresh).toHaveBeenCalledTimes(1);
  // The timer keeps going across an account switch.
  mockProfile = { id: 'profile-fictional-2', name: 'Another Fictional Customer' };
  await view.rerender();
  await advance(INTERVAL - 1);
  expect(refresh).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(refresh).toHaveBeenCalledTimes(2);
  await view.unmount();
});

it('leaves the catch-up to a list that refreshes on its own return, and to nobody when disabled', async () => {
  const listRefresh = jest.fn();
  const list = await mount(listRefresh, true, { refreshOnFocus: false });
  mockFocused = false;
  await list.rerender();
  mockFocused = true;
  await list.rerender();
  expect(listRefresh).not.toHaveBeenCalled();
  await advance(INTERVAL);
  expect(listRefresh).toHaveBeenCalledTimes(1);
  await list.unmount();

  mockFocused = true;
  const disabledRefresh = jest.fn();
  const disabled = await mount(disabledRefresh, false);
  mockFocused = false;
  await disabled.rerender();
  mockFocused = true;
  await disabled.rerender();
  await advance(4 * INTERVAL);
  expect(disabledRefresh).not.toHaveBeenCalled();
  await disabled.unmount();
});

describe.each([
  ['a screen that catches up on its return', undefined],
  ['a list that loads on its own return', { refreshOnFocus: false }],
])('back to the foreground or online while shown: %s', (_name, options) => {
  it('refreshes once after the app was in the background, reading nothing meanwhile', async () => {
    const refresh = jest.fn();
    const view = await mount(refresh, true, options);
    await appState('background');
    await advance(4 * INTERVAL);
    expect(refresh).not.toHaveBeenCalled();
    await appState('active');
    expect(refresh).toHaveBeenCalledTimes(1);
    await advance(INTERVAL);
    expect(refresh).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it('refreshes once after the device was offline, reading nothing meanwhile', async () => {
    const refresh = jest.fn();
    const view = await mount(refresh, true, options);
    mockConnected = false;
    await view.rerender();
    await advance(4 * INTERVAL);
    expect(refresh).not.toHaveBeenCalled();
    mockConnected = true;
    await view.rerender();
    expect(refresh).toHaveBeenCalledTimes(1);
    // Rendering again while still online is no new return.
    await view.rerender();
    expect(refresh).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('neither refreshes nor reads for a background trip while another screen is shown', async () => {
    const refresh = jest.fn();
    const view = await mount(refresh, true, options);
    mockFocused = false;
    await view.rerender();
    await appState('background');
    await appState('active');
    mockConnected = false;
    await view.rerender();
    mockConnected = true;
    await view.rerender();
    await advance(4 * INTERVAL);
    expect(refresh).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('does nothing when disabled', async () => {
    const refresh = jest.fn();
    const view = await mount(refresh, false, options);
    await appState('background');
    await appState('active');
    await advance(4 * INTERVAL);
    expect(refresh).not.toHaveBeenCalled();
    await view.unmount();
  });
});

it('treats the first move to the foreground of an app started in the background as no return', async () => {
  AppState.currentState = 'background';
  const refresh = jest.fn();
  const view = await mount(refresh);
  await advance(4 * INTERVAL);
  expect(refresh).not.toHaveBeenCalled();
  await appState('active');
  expect(refresh).not.toHaveBeenCalled();
  await advance(INTERVAL);
  expect(refresh).toHaveBeenCalledTimes(1);
  await view.unmount();
});
