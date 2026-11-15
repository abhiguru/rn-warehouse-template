/**
 * Shared by the three wizard keyboard tests (WH-228): the keyboard and the window are recorded stand-ins (the test
 * renderer has neither); the real WizardBottomBar and the real useKeyboardCoverLift run on top. Jest comes from
 * @jest/globals because this file is also read by the app's type check, which does not know the jest globals.
 */
import { Dimensions, Keyboard, Platform, StyleSheet } from 'react-native';
import { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
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

/** The wizard bar's own View: the nearest laid-out host View above its Next button. */
export function findBar(tree: ReactTestRenderer): ReactTestInstance {
  const next = tree.root.find(n => n.props.accessibilityLabel === 'Next' && typeof n.props.onPress === 'function');
  let node: ReactTestInstance | null = next.parent;
  while (node) {
    if (typeof node.props.onLayout === 'function' && node.instance != null) return node;
    node = node.parent;
  }
  throw new Error('the wizard bottom bar was not found above the Next button');
}

/** The bar's current lift: its marginBottom. */
export const liftOf = (tree: ReactTestRenderer): number =>
  Number((StyleSheet.flatten(findBar(tree).props.style) as { marginBottom?: number }).marginBottom ?? 0);

/** Gives the bar a measureInWindow that places it with its un-lifted bottom at `unliftedBottom`, as a margin-lifted bar does. */
export function placeBar(tree: ReactTestRenderer, unliftedBottom: number) {
  (findBar(tree).instance as { measureInWindow: unknown }).measureInWindow = (cb: (x: number, y: number, w: number, h: number) => void) =>
    cb(0, unliftedBottom - liftOf(tree) - 100, 1080, 100);
}

/**
 * The WH-228 cases, run on one wizard step: `mount` renders the real step (with the real WizardBottomBar) and
 * returns the tree. Registers its own beforeEach/afterEach, so call it inside a describe.
 */
export function wizardKeyboardLiftCases(mount: () => Promise<ReactTestRenderer>) {
  let tree: ReactTestRenderer | undefined;
  let recorder: KeyboardRecorder;

  beforeEach(() => { recorder = recordKeyboard(); });
  afterEach(async () => {
    if (tree) await act(async () => { tree!.unmount(); });
    tree = undefined;
    jest.restoreAllMocks();
  });

  it('Android: the bar is lifted by the part the keyboard covers, and is back at 0 when the keyboard hides', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    tree = await mount();
    placeBar(tree, 2183);
    expect(liftOf(tree)).toBe(0);
    await act(async () => { recorder.fire('keyboardDidShow', keyboardEvent(1350)); });
    expect(liftOf(tree)).toBe(833);
    await act(async () => { recorder.fire('keyboardDidHide'); });
    expect(liftOf(tree)).toBe(0);
  });

  it('Android: a keyboard that covers none of the bar lifts nothing', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    tree = await mount();
    placeBar(tree, 1300);
    await act(async () => { recorder.fire('keyboardDidShow', keyboardEvent(1350)); });
    expect(liftOf(tree)).toBe(0);
  });

  it('iOS: a step has no KeyboardAvoidingView, and a window that already ends at the keyboard gets no second lift', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    tree = await mount();
    expect(tree.root.findAll(n => (n.type as { displayName?: string })?.displayName === 'KeyboardAvoidingView' || (n.type as unknown) === 'KeyboardAvoidingView')).toHaveLength(0);
    placeBar(tree, 1350);
    await act(async () => { recorder.fire('keyboardDidShow', keyboardEvent(1350)); });
    expect(liftOf(tree)).toBe(0);
  });

  it('removes its keyboard and window listeners when the step unmounts', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    tree = await mount();
    expect(recorder.removes.length).toBeGreaterThan(0);
    recorder.removes.forEach(remove => expect(remove).not.toHaveBeenCalled());
    await act(async () => { tree!.unmount(); });
    tree = undefined;
    recorder.removes.forEach(remove => expect(remove).toHaveBeenCalledTimes(1));
    expect(recorder.dimensionAdds).toBeGreaterThan(0);
    expect(recorder.dimensionRemove).toHaveBeenCalledTimes(recorder.dimensionAdds);
  });
}
