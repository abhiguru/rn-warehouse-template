import React from 'react';
import { BackHandler } from 'react-native';
import { act, create } from 'react-test-renderer';
import { NavigationContext } from 'expo-router/react-navigation';
import { useMarkLeavingOnBack } from '../useMarkLeavingOnBack';

function Probe({ onLeaving }: { onLeaving: () => void }) {
  useMarkLeavingOnBack(onLeaving);
  return null;
}

/** A route whose focus and back stack the test controls. */
function makeRoute({ focused = true, canGoBack = true } = {}) {
  let isFocused = focused;
  const listeners: Record<string, Set<() => void>> = { focus: new Set(), blur: new Set() };
  return {
    navigation: {
      isFocused: () => isFocused,
      canGoBack: () => canGoBack,
      addListener: (event: 'focus' | 'blur', callback: () => void) => {
        listeners[event].add(callback);
        return () => listeners[event].delete(callback);
      },
    },
    blur: () => { isFocused = false; listeners.blur.forEach((cb) => cb()); },
    focus: () => { isFocused = true; listeners.focus.forEach((cb) => cb()); },
  };
}

describe('useMarkLeavingOnBack', () => {
  let handlers: (() => boolean | null | undefined)[] = [];
  const press = () => handlers[handlers.length - 1]?.();

  beforeEach(() => {
    handlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_event: string, handler: () => boolean) => {
      handlers.push(handler);
      return { remove: () => { handlers = handlers.filter((h) => h !== handler); } };
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const mount = (route: ReturnType<typeof makeRoute>, onLeaving: () => void) => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <NavigationContext.Provider value={route.navigation as never}>
          <Probe onLeaving={onLeaving} />
        </NavigationContext.Provider>
      );
    });
    return tree;
  };

  it('reports the hardware Back key when it leaves the screen, and lets Back go on', () => {
    const onLeaving = jest.fn();
    const tree = mount(makeRoute(), onLeaving);

    expect(onLeaving).not.toHaveBeenCalled();
    expect(press()).toBe(false);
    expect(onLeaving).toHaveBeenCalledTimes(1);

    act(() => tree.unmount());
    expect(handlers).toHaveLength(0);
  });

  it('does not mark the screen when it is the only route and Back leaves the app instead', () => {
    const onLeaving = jest.fn();
    mount(makeRoute({ canGoBack: false }), onLeaving);

    expect(press()).toBe(false);
    expect(onLeaving).not.toHaveBeenCalled();
  });

  it('listens only while the screen is focused', () => {
    const onLeaving = jest.fn();
    const route = makeRoute({ focused: false });
    mount(route, onLeaving);
    expect(handlers).toHaveLength(0);

    act(() => route.focus());
    expect(handlers).toHaveLength(1);
    press();
    expect(onLeaving).toHaveBeenCalledTimes(1);

    act(() => route.blur());
    expect(handlers).toHaveLength(0);
  });

  it('a handler added later that takes the press keeps this one from marking the screen', () => {
    const onLeaving = jest.fn();
    mount(makeRoute(), onLeaving);
    // A dialog or sheet opened over the screen listens after it and takes the press.
    const takes = () => true;
    handlers.push(takes);

    expect(press()).toBe(true);
    expect(onLeaving).not.toHaveBeenCalled();
  });
});
