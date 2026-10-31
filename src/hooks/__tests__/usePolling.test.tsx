/**
 * usePolling: single flight, completion-driven timers, focus and foreground gating,
 * one run on a genuine return, runNow joins a run in flight, late results are stale.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { usePolling, type IsCurrent, type UsePollingResult } from '../usePolling';

/** A route whose focus the test controls, as a native stack would report it. */
function makeRoute(initiallyFocused = true) {
  let focused = initiallyFocused;
  const listeners: Record<string, Set<() => void>> = { focus: new Set(), blur: new Set() };
  const navigation = {
    isFocused: () => focused,
    addListener: (event: 'focus' | 'blur', callback: () => void) => {
      listeners[event].add(callback);
      return () => listeners[event].delete(callback);
    },
  };
  return {
    navigation,
    blur: () => { focused = false; listeners.blur.forEach(cb => cb()); },
    focus: () => { focused = true; listeners.focus.forEach(cb => cb()); },
  };
}

let appStateListeners: ((status: AppStateStatus) => void)[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: AppStateStatus) => void) => {
    appStateListeners.push(cb);
    return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== cb); } };
  }) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const setAppState = (status: AppStateStatus) => act(() => { appStateListeners.forEach(l => l(status)); });

/** A run that never settles until the test resolves it. */
function deferredRun() {
  const pending: (() => void)[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const currents: IsCurrent[] = [];
  const run = jest.fn((isCurrent: IsCurrent) => {
    currents.push(isCurrent);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise<void>(resolve => {
      pending.push(() => { inFlight -= 1; resolve(); });
    });
  });
  return {
    run,
    currents,
    get maxInFlight() { return maxInFlight; },
    finishAll: async () => {
      await act(async () => {
        pending.splice(0).forEach(done => done());
        await Promise.resolve();
      });
    },
  };
}

let result: UsePollingResult;
function Poller({ run, enabled = true }: { run: (c: IsCurrent) => Promise<void>; enabled?: boolean }) {
  result = usePolling(run, { intervalMs: 10_000, enabled });
  return null;
}

function mount(run: (c: IsCurrent) => Promise<void>, route = makeRoute()) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <NavigationContext.Provider value={route.navigation as never}>
        <Poller run={run} />
      </NavigationContext.Provider>
    );
  });
  return { tree, route };
}

const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

test('an unresolved run spans many intervals and stays the only one in flight', async () => {
  const d = deferredRun();
  const { tree } = mount(d.run);
  expect(d.run).toHaveBeenCalledTimes(1);
  await advance(60_000);
  expect(d.run).toHaveBeenCalledTimes(1);
  expect(d.maxInFlight).toBe(1);
  // The next timer starts only when the run settles.
  await d.finishAll();
  await advance(9_999);
  expect(d.run).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(d.run).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
});

test('a route mounted behind another one does not run, and runs once when it comes to the front', async () => {
  const d = deferredRun();
  const { tree, route } = mount(d.run, makeRoute(false));
  await advance(60_000);
  expect(d.run).not.toHaveBeenCalled();

  act(() => route.focus());
  expect(d.run).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('blur stops polling, a refocus runs exactly once, then the cadence resumes', async () => {
  const d = deferredRun();
  const { tree, route } = mount(d.run);
  await d.finishAll();
  act(() => route.blur());
  await advance(60_000);
  expect(d.run).toHaveBeenCalledTimes(1);

  act(() => route.focus());
  expect(d.run).toHaveBeenCalledTimes(2);
  await d.finishAll();
  await advance(9_000);
  expect(d.run).toHaveBeenCalledTimes(2);
  await advance(1_000);
  expect(d.run).toHaveBeenCalledTimes(3);
  act(() => tree.unmount());
});

test('a run in flight at blur is stale; the refocus run waits for it instead of overlapping', async () => {
  const d = deferredRun();
  const { tree, route } = mount(d.run);
  act(() => route.blur());
  expect(d.currents[0]()).toBe(false);
  act(() => route.focus());
  // still the first run on the wire: no overlap
  expect(d.run).toHaveBeenCalledTimes(1);
  await d.finishAll();
  expect(d.run).toHaveBeenCalledTimes(2);
  expect(d.currents[1]()).toBe(true);
  expect(d.maxInFlight).toBe(1);
  act(() => tree.unmount());
});

test('background stops polling; returning to the foreground runs exactly once', async () => {
  const d = deferredRun();
  const { tree } = mount(d.run);
  await d.finishAll();
  setAppState('background');
  await advance(60_000);
  expect(d.run).toHaveBeenCalledTimes(1);
  setAppState('active');
  expect(d.run).toHaveBeenCalledTimes(2);
  // re-renders do not run again
  act(() => tree.update(
    <NavigationContext.Provider value={makeRoute().navigation as never}>
      <Poller run={d.run} />
    </NavigationContext.Provider>
  ));
  expect(d.run).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
});

test('runNow during a run joins it instead of starting a second call', async () => {
  const d = deferredRun();
  const { tree } = mount(d.run);
  let joined = false;
  act(() => { void result.runNow().then(() => { joined = true; }); });
  expect(d.run).toHaveBeenCalledTimes(1);
  await d.finishAll();
  expect(joined).toBe(true);
  // runNow when idle starts one run and restarts the cadence from its end
  await advance(5_000);
  act(() => { void result.runNow(); });
  expect(d.run).toHaveBeenCalledTimes(2);
  await d.finishAll();
  await advance(9_999);
  expect(d.run).toHaveBeenCalledTimes(2);
  await advance(1);
  expect(d.run).toHaveBeenCalledTimes(3);
  act(() => tree.unmount());
});

test('unmount clears the timer and marks the run in flight stale', async () => {
  const d = deferredRun();
  const { tree } = mount(d.run);
  act(() => tree.unmount());
  expect(d.currents[0]()).toBe(false);
  await d.finishAll();
  await advance(60_000);
  expect(d.run).toHaveBeenCalledTimes(1);
});

test('outside a navigator the screen counts as focused', async () => {
  const d = deferredRun();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<Poller run={d.run} />); });
  expect(d.run).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

test('disabled polling makes no calls until enabled', async () => {
  const d = deferredRun();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<Poller run={d.run} enabled={false} />); });
  await advance(60_000);
  expect(d.run).not.toHaveBeenCalled();
  act(() => tree.update(<Poller run={d.run} enabled />));
  expect(d.run).toHaveBeenCalledTimes(1);
  act(() => tree.update(<Poller run={d.run} enabled={false} />));
  expect(d.currents[0]()).toBe(false);
  act(() => tree.unmount());
});

test('refreshNow drops the run in flight and starts a fresh one that begins after the call', async () => {
  const d = deferredRun();
  const { tree } = mount(d.run);
  expect(d.run).toHaveBeenCalledTimes(1);

  let refreshed = false;
  act(() => { void result.refreshNow().then(() => { refreshed = true; }); });
  // The run sent earlier is stale; the fresh one only starts when it has ended.
  expect(d.currents[0]()).toBe(false);
  expect(d.run).toHaveBeenCalledTimes(1);
  await d.finishAll();
  expect(d.run).toHaveBeenCalledTimes(2);
  expect(d.currents[1]()).toBe(true);
  expect(refreshed).toBe(false);
  await d.finishAll();
  expect(refreshed).toBe(true);
  expect(d.maxInFlight).toBe(1);
  act(() => tree.unmount());
});

test('refreshNow with nothing in flight starts one run', async () => {
  const d = deferredRun();
  const { tree } = mount(d.run);
  await d.finishAll();
  expect(d.run).toHaveBeenCalledTimes(1);
  act(() => { void result.refreshNow(); });
  expect(d.run).toHaveBeenCalledTimes(2);
  await d.finishAll();
  act(() => tree.unmount());
});
