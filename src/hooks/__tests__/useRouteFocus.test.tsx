import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { NavigationContext } from 'expo-router/react-navigation';
import { useRouteFocus } from '../useRouteFocus';
import { makeRoute } from '@/tests/helpers/fakeRoute';

let seen: boolean[] = [];
function Probe({ enabled = true }: { enabled?: boolean }) {
  const focused = useRouteFocus(enabled);
  seen.push(focused);
  return <Text>{String(focused)}</Text>;
}

/** Records whether isFocused() was called while a component was rendering. */
function renderInRoute(route: ReturnType<typeof makeRoute>, enabled = true) {
  let rendering = false;
  const calledInRender: boolean[] = [];
  const original = route.navigation.isFocused;
  route.navigation.isFocused = () => {
    calledInRender.push(rendering);
    return original();
  };
  function Wrapper() {
    rendering = true;
    const element = <Probe enabled={enabled} />;
    return element;
  }
  const done = () => { rendering = false; };
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <NavigationContext.Provider value={route.navigation as never}>
        <Wrapper />
        <After done={done} />
      </NavigationContext.Provider>
    );
  });
  return { tree, calledInRender };
}
function After({ done }: { done: () => void }) {
  done();
  return null;
}

beforeEach(() => { seen = []; });

describe('useRouteFocus', () => {
  it('is focused outside a navigator', () => {
    act(() => { create(<Probe />); });
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('reads the route focus in an effect, never while rendering', () => {
    const { calledInRender } = renderInRoute(makeRoute(true));
    expect(calledInRender.length).toBeGreaterThan(0);
    expect(calledInRender.every(inRender => !inRender)).toBe(true);
  });

  it('follows the route through blur and focus', () => {
    const route = makeRoute(true);
    renderInRoute(route);
    expect(seen[seen.length - 1]).toBe(true);
    act(() => route.blur());
    expect(seen[seen.length - 1]).toBe(false);
    act(() => route.focus());
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('settles on not focused for a route mounted behind another', () => {
    renderInRoute(makeRoute(false));
    expect(seen[seen.length - 1]).toBe(false);
  });

  it('does not look at the route when disabled', () => {
    const { calledInRender } = renderInRoute(makeRoute(false), false);
    expect(calledInRender).toEqual([]);
    expect(seen[seen.length - 1]).toBe(true);
  });
});
