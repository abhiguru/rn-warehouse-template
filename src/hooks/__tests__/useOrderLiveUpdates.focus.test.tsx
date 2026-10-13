/**
 * R4 (performance review 2026-10-13): an order screen that is not shown holds no
 * realtime subscription, catches up once when it is shown again, and keeps its
 * subscription when the signed-in profile object is replaced for the same account.
 * Fix round 1 (M1): coming back to the foreground or online while shown refreshes once,
 * lists included; the same while not shown refreshes nothing.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create } from 'react-test-renderer';
import { subscribeToOrderChanges } from '@/services/order-live-updates';
import { useOrderLiveUpdates } from '../useOrderLiveUpdates';

let mockFocused = true;
let mockProfile: { id: string; name: string } | null = { id: 'profile-fictional-1', name: 'Fictional Customer' };
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: { userProfile: mockProfile } }),
}));
let mockConnected = true;
jest.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isConnected: mockConnected }) }));
// Each subscription listens until it is stopped; emit() is a change on the orders table.
const mockListeners = new Set<() => void>();
jest.mock('@/services/order-live-updates', () => ({ subscribeToOrderChanges: jest.fn() }));
const emit = () => mockListeners.forEach(listener => listener());

const subscribe = jest.mocked(subscribeToOrderChanges);
const stop = jest.fn();
let originalState: typeof AppState.currentState;
// The app's AppState listeners; appState() is the app moving to that state.
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const appState = (state: AppStateStatus) => act(() => { appStateListeners.forEach(listener => listener(state)); });

beforeEach(() => {
  mockFocused = true;
  mockConnected = true;
  appStateListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListeners.add(listener);
    return { remove: () => { appStateListeners.delete(listener); } };
  });
  mockProfile = { id: 'profile-fictional-1', name: 'Fictional Customer' };
  mockListeners.clear();
  stop.mockReset();
  subscribe.mockReset().mockImplementation(refresh => {
    const listener = () => { void refresh(); };
    mockListeners.add(listener);
    return () => { stop(); mockListeners.delete(listener); };
  });
  originalState = AppState.currentState;
  AppState.currentState = 'active';
});
afterEach(() => {
  AppState.currentState = originalState;
  jest.restoreAllMocks();
});

type Options = Parameters<typeof useOrderLiveUpdates>[2];
function render(refresh: () => void, enabled = true, options?: Options) {
  const Harness = () => { useOrderLiveUpdates(refresh, enabled, options); return null; };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Harness />); });
  return { rerender: () => act(() => { tree.update(<Harness />); }), unmount: () => act(() => { tree.unmount(); }) };
}

it('subscribes only while the screen is shown and catches up once on its return', () => {
  const refresh = jest.fn();
  const view = render(refresh);
  expect(subscribe).toHaveBeenCalledTimes(1);
  emit();
  expect(refresh).toHaveBeenCalledTimes(1);

  mockFocused = false;
  view.rerender();
  expect(stop).toHaveBeenCalledTimes(1);
  emit();
  expect(refresh).toHaveBeenCalledTimes(1);

  mockFocused = true;
  view.rerender();
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(subscribe).toHaveBeenCalledTimes(2);
  emit();
  expect(refresh).toHaveBeenCalledTimes(3);
  view.unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

it('keeps the subscription when the profile object is replaced for the same account', () => {
  const view = render(jest.fn());
  expect(subscribe).toHaveBeenCalledTimes(1);
  mockProfile = { id: 'profile-fictional-1', name: 'Fictional Customer (renamed)' };
  view.rerender();
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
  mockProfile = { id: 'profile-fictional-2', name: 'Another Fictional Customer' };
  view.rerender();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(subscribe).toHaveBeenCalledTimes(2);
  view.unmount();
});

it('leaves the catch-up to a list that refreshes on its own return, and to nobody when disabled', () => {
  const listRefresh = jest.fn();
  const list = render(listRefresh, true, { refreshOnFocus: false });
  mockFocused = false;
  list.rerender();
  mockFocused = true;
  list.rerender();
  expect(subscribe).toHaveBeenCalledTimes(2);
  expect(listRefresh).not.toHaveBeenCalled();
  list.unmount();

  mockFocused = true;
  const disabledRefresh = jest.fn();
  const disabled = render(disabledRefresh, false);
  mockFocused = false;
  disabled.rerender();
  mockFocused = true;
  disabled.rerender();
  expect(subscribe).toHaveBeenCalledTimes(2);
  expect(disabledRefresh).not.toHaveBeenCalled();
  disabled.unmount();
});

describe.each([
  ['a screen that catches up on its return', undefined],
  ['a list that loads on its own return', { refreshOnFocus: false }],
])('back to the foreground or online while shown: %s', (_name, options) => {
  it('refreshes once and subscribes again after the app was in the background', () => {
    const refresh = jest.fn();
    const view = render(refresh, true, options);
    expect(subscribe).toHaveBeenCalledTimes(1);
    appState('background');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    appState('active');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('refreshes once and subscribes again after the device was offline', () => {
    const refresh = jest.fn();
    const view = render(refresh, true, options);
    mockConnected = false;
    view.rerender();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    mockConnected = true;
    view.rerender();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(2);
    // Rendering again while still online is no new return.
    view.rerender();
    expect(refresh).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('neither refreshes nor subscribes for a background trip while another screen is shown', () => {
    const refresh = jest.fn();
    const view = render(refresh, true, options);
    mockFocused = false;
    view.rerender();
    expect(stop).toHaveBeenCalledTimes(1);
    appState('background');
    appState('active');
    mockConnected = false;
    view.rerender();
    mockConnected = true;
    view.rerender();
    expect(refresh).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('does nothing when disabled', () => {
    const refresh = jest.fn();
    const view = render(refresh, false, options);
    appState('background');
    appState('active');
    expect(refresh).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    view.unmount();
  });
});

it('treats the first move to the foreground of an app started in the background as no return', () => {
  AppState.currentState = 'background';
  const refresh = jest.fn();
  const view = render(refresh);
  expect(subscribe).not.toHaveBeenCalled();
  appState('active');
  expect(subscribe).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalled();
  view.unmount();
});
