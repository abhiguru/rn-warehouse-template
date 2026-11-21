import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
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
async function renderInRoute(route: ReturnType<typeof makeRoute>, enabled = true) {
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
  await render(
    <NavigationContext.Provider value={route.navigation as never}>
      <Wrapper />
      <After done={done} />
    </NavigationContext.Provider>
  );
  return { calledInRender };
}
function After({ done }: { done: () => void }) {
  done();
  return null;
}

beforeEach(() => { seen = []; });

describe('useRouteFocus', () => {
  it('is focused outside a navigator', async () => {
    await render(<Probe />);
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('reads the route focus in an effect, never while rendering', async () => {
    const { calledInRender } = await renderInRoute(makeRoute(true));
    expect(calledInRender.length).toBeGreaterThan(0);
    expect(calledInRender.every(inRender => !inRender)).toBe(true);
  });

  it('follows the route through blur and focus', async () => {
    const route = makeRoute(true);
    await renderInRoute(route);
    expect(seen[seen.length - 1]).toBe(true);
    await act(() => route.blur());
    expect(seen[seen.length - 1]).toBe(false);
    await act(() => route.focus());
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('settles on not focused for a route mounted behind another', async () => {
    await renderInRoute(makeRoute(false));
    expect(seen[seen.length - 1]).toBe(false);
  });

  it('does not look at the route when disabled', async () => {
    const { calledInRender } = await renderInRoute(makeRoute(false), false);
    expect(calledInRender).toEqual([]);
    expect(seen[seen.length - 1]).toBe(true);
  });
});
