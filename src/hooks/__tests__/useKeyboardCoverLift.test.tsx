/**
 * useKeyboardCoverLift (WH-228): the lift of a bottom bar is the part the keyboard covers now. The real hook on a
 * small bar; the keyboard and the window are recorded stand-ins (the test renderer has neither).
 */
import React from 'react';
import { Dimensions, Keyboard, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useKeyboardCoverLift } from '../useKeyboardCoverLift';

let lastLift = 0;
let lastShown = false;
let bottomOf: () => number;
let tree: ReactTestRenderer | undefined;
let listeners: Record<string, (event?: unknown) => void>;
let keyboardRemoves: jest.Mock[];
let dimensionHandlers: Array<() => void>;
let dimensionRemove: jest.Mock;

function Bar() {
  const { ref, lift, keyboardShown, onLayout } = useKeyboardCoverLift();
  lastLift = lift;
  lastShown = keyboardShown;
  return <View ref={ref} testID="bar" onLayout={onLayout} />;
}

// The jest View keeps its methods on a shared prototype: give this bar its own measureInWindow. The bar sits at
// bottom `bottomOf() - lift`, as a margin-lifted bar does.
const attachMeasure = () => {
  const node = tree!.root.find(n => n.props.testID === 'bar' && n.instance != null) as unknown as { instance: { measureInWindow: unknown } };
  node.instance.measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, bottomOf() - lastLift - 100, 1080, 100);
};
const mount = async () => {
  await act(async () => { tree = create(<Bar />); });
  attachMeasure();
};
const show = (screenY = 1350) => ({ endCoordinates: { screenY, height: 800 } });
const layout = () => act(async () => { tree!.root.find(n => n.props.testID === 'bar' && n.instance != null).props.onLayout({ nativeEvent: {} }); });

beforeEach(() => {
  lastLift = 0;
  lastShown = false;
  bottomOf = () => 1500;
  listeners = {};
  keyboardRemoves = [];
  dimensionHandlers = [];
  dimensionRemove = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
    listeners[name] = handler;
    const remove = jest.fn();
    keyboardRemoves.push(remove);
    return { remove };
  }) as never);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Dimensions, 'addEventListener').mockImplementation(((_name: string, handler: () => void) => {
    dimensionHandlers.push(handler);
    return { remove: dimensionRemove };
  }) as never);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('useKeyboardCoverLift', () => {
  it('lifts by the part the keyboard covers, and is 0 again when it hides', async () => {
    await mount();
    expect(lastLift).toBe(0);
    await act(async () => { listeners.keyboardDidShow(show(1350)); });
    expect(lastLift).toBe(150);
    expect(lastShown).toBe(true);
    await act(async () => { listeners.keyboardDidHide(); });
    expect(lastLift).toBe(0);
    expect(lastShown).toBe(false);
  });

  it('measures from the un-lifted place on layout: the lift does not grow or shrink by itself', async () => {
    await mount();
    await act(async () => { listeners.keyboardDidShow(show(1350)); });
    await layout();
    await layout();
    expect(lastLift).toBe(150);
  });

  it('on layout takes a changed bar position into account', async () => {
    await mount();
    await act(async () => { listeners.keyboardDidShow(show(1350)); });
    bottomOf = () => 1450; // the screen grew taller/shorter under the bar
    await layout();
    expect(lastLift).toBe(100);
  });

  it('on a window size change re-measures; a window that shrinks after the keyboard opened ends with lift 0', async () => {
    await mount();
    await act(async () => { listeners.keyboardDidShow(show(1350)); });
    expect(lastLift).toBe(150);
    bottomOf = () => 1350; // the window now ends at the keyboard's top
    await act(async () => { dimensionHandlers.forEach(h => h()); });
    expect(lastLift).toBe(0);
  });

  it('keyboardDidChangeFrame updates the lift while the keyboard is up', async () => {
    await mount();
    await act(async () => { listeners.keyboardDidShow(show(1350)); });
    await act(async () => { listeners.keyboardDidChangeFrame(show(1300)); });
    expect(lastLift).toBe(200);
  });

  it('keyboardDidChangeFrame with the keyboard down changes nothing', async () => {
    await mount();
    await act(async () => { listeners.keyboardDidChangeFrame(show(1300)); });
    expect(lastLift).toBe(0);
  });

  it('lifts a bar that mounts while the keyboard is already open', async () => {
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({ screenX: 0, screenY: 1350, width: 1080, height: 800 });
    await act(async () => { tree = create(<Bar />); });
    attachMeasure();
    expect(lastShown).toBe(true);
    await layout(); // the first layout measures it
    expect(lastLift).toBe(150);
  });

  it('ignores a keyboard event without coordinates (no lift, no crash)', async () => {
    await mount();
    await act(async () => { listeners.keyboardDidShow({}); });
    expect(lastLift).toBe(0);
    await act(async () => { listeners.keyboardDidShow(undefined); });
    expect(lastLift).toBe(0);
    await act(async () => { listeners.keyboardDidShow(show(1350)); });
    await act(async () => { listeners.keyboardDidChangeFrame({}); });
    expect(lastLift).toBe(150);
  });

  it('removes its keyboard and window listeners when it unmounts', async () => {
    await mount();
    expect(keyboardRemoves).toHaveLength(3);
    await act(async () => { tree!.unmount(); });
    tree = undefined;
    keyboardRemoves.forEach(remove => expect(remove).toHaveBeenCalledTimes(1));
    expect(dimensionRemove).toHaveBeenCalledTimes(1);
  });
});
