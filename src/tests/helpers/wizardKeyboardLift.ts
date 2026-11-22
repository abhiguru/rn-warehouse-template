/**
 * Shared by the three wizard keyboard tests (WH-228): the keyboard and the window are recorded stand-ins (the test
 * renderer has neither); the real WizardBottomBar and the real useKeyboardCoverLift run on top. Jest comes from
 * @jest/globals because this file is also read by the app's type check, which does not know the jest globals.
 */
import { Dimensions, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';

export interface KeyboardRecorder {
  listeners: Record<string, (event?: unknown) => void>;
  /** Every handler registered under a name: other code on the step listens too. */
  fire: (name: string, event?: unknown) => void;
  dimensionAdds: number;
  removes: jest.Mock[];
  dimensionRemove: jest.Mock;
}

/** Records Keyboard and Dimensions listeners. jest.restoreAllMocks() undoes it. */
export function recordKeyboard(): KeyboardRecorder {
  const all: Record<string, Array<(event?: unknown) => void>> = {};
  const recorder: KeyboardRecorder = { listeners: {}, fire: (name, event) => (all[name] ?? []).forEach(h => h(event)), dimensionAdds: 0, removes: [], dimensionRemove: jest.fn() };
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, handler: (event?: unknown) => void) => {
    recorder.listeners[name] = handler;
    (all[name] ??= []).push(handler);
    const remove = jest.fn();
    recorder.removes.push(remove);
    return { remove };
  }) as never);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Dimensions, 'addEventListener').mockImplementation((() => { recorder.dimensionAdds += 1; return { remove: recorder.dimensionRemove }; }) as never);
  return recorder;
}

export const keyboardEvent = (screenY: number) => ({ endCoordinates: { screenY, height: 800 } });

/** The wizard bar's own View: the nearest laid-out host View above its Next button (named `next`). */
export function findBar(next = 'Next') {
  for (let node = screen.getByRole('button', { name: next }).parent; node; node = node.parent) {
    if (typeof node.props.onLayout === 'function') return node;
  }
  throw new Error('the wizard bottom bar was not found above the Next button');
}

/** The bar's current lift: its marginBottom. */
export const liftOf = (next = 'Next'): number =>
  Number((StyleSheet.flatten(findBar(next).props.style) as { marginBottom?: number }).marginBottom ?? 0);

/**
 * Makes the views measure as the bar placed with its un-lifted bottom at `unliftedBottom`, as a margin-lifted bar does
 * (the test renderer's views share one `measureInWindow` mock; only the bar's is read). `next` names its Next button.
 * jest.restoreAllMocks() undoes it.
 */
export function placeBar(unliftedBottom: number, next = 'Next') {
  jest.spyOn(View.prototype, 'measureInWindow').mockImplementation(((cb: (x: number, y: number, w: number, h: number) => void) =>
    cb(0, unliftedBottom - Number((StyleSheet.flatten(findBar(next).props.style) as { marginBottom?: number }).marginBottom ?? 0) - 100, 1080, 100)) as never);
}

/**
 * The WH-228 cases, run on one wizard step: `mount` renders the real step (with the real WizardBottomBar).
 * Registers its own beforeEach/afterEach, so call it inside a describe.
 */
export function wizardKeyboardLiftCases(mount: () => Promise<void>) {
  let recorder: KeyboardRecorder;

  beforeEach(() => { recorder = recordKeyboard(); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('Android: the bar is lifted by the part the keyboard covers, and is back at 0 when the keyboard hides', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mount();
    placeBar(2183);
    expect(liftOf()).toBe(0);
    await act(async () => { recorder.fire('keyboardDidShow', keyboardEvent(1350)); });
    expect(liftOf()).toBe(833);
    await act(async () => { recorder.fire('keyboardDidHide'); });
    expect(liftOf()).toBe(0);
  });

  it('Android: a keyboard that covers none of the bar lifts nothing', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mount();
    placeBar(1300);
    await act(async () => { recorder.fire('keyboardDidShow', keyboardEvent(1350)); });
    expect(liftOf()).toBe(0);
  });

  it('iOS: a step has no KeyboardAvoidingView, and a window that already ends at the keyboard gets no second lift', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await mount();
    // Testing Library shows host views only and KeyboardAvoidingView is a component, so its fibers are counted.
    const avoiding: unknown[] = [];
    const visit = (fiber: { type?: { displayName?: string; name?: string } | string | null; child: unknown; sibling: unknown } | null) => {
      for (let node = fiber; node; node = node.sibling as typeof fiber) {
        const type = node.type;
        if (type && typeof type !== 'string' && (type.displayName === 'KeyboardAvoidingView' || type.name === 'KeyboardAvoidingView')) avoiding.push(node);
        visit(node.child as typeof fiber);
      }
    };
    let top = screen.root!.unstable_fiber;
    while (top?.return) top = top.return;
    top = (top as { stateNode?: { current?: typeof top } } | null)?.stateNode?.current ?? top;
    visit(top as never);
    expect(avoiding).toHaveLength(0);
    placeBar(1350);
    await act(async () => { recorder.fire('keyboardDidShow', keyboardEvent(1350)); });
    expect(liftOf()).toBe(0);
  });

  it('removes its keyboard and window listeners when the step unmounts', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await mount();
    expect(recorder.removes.length).toBeGreaterThan(0);
    recorder.removes.forEach(remove => expect(remove).not.toHaveBeenCalled());
    await screen.unmount();
    recorder.removes.forEach(remove => expect(remove).toHaveBeenCalledTimes(1));
    expect(recorder.dimensionAdds).toBeGreaterThan(0);
    expect(recorder.dimensionRemove).toHaveBeenCalledTimes(recorder.dimensionAdds);
  });
}
