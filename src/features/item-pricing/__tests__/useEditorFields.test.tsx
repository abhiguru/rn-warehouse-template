/**
 * useEditorFields: a focused field is scrolled clear of the keypad (it ends 24 above it), and a field that is
 * already clear does not scroll. The numbers are the window's: the keypad's top edge comes from keyboardDidShow.
 */
import React from 'react';
import { Keyboard, type ScrollView } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ABOVE_KEYBOARD, useEditorFields, type UseEditorFields } from '../useEditorFields';

let latest!: UseEditorFields;
let tree: ReactTestRenderer | undefined;
const listeners: Record<string, (event: unknown) => void> = {};
const scrollTo = jest.fn();

function Harness() {
  latest = useEditorFields(['a', 'b']);
  return null;
}
/** A field at `top` with height `height`, as the window measures it. */
const field = (top: number, height = 50) => ({
  focus: jest.fn(),
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, top, 300, height),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (event: unknown) => void) => {
    listeners[name] = fn;
    return { remove: jest.fn() };
  }) as never);
  act(() => { tree = create(<Harness />); });
  (latest.scrollRef as { current: unknown }).current = { scrollTo } as unknown as ScrollView;
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

it('is 24 above the keypad: the constant the form and the boxes use', () => {
  expect(ABOVE_KEYBOARD).toBe(24);
});

it('a focused field ends 24 above the keypad: the view scrolls by what was hidden', () => {
  // The keypad's top edge is at 400; the field sits at 380 to 430. 430 + 24 - 400 = 54 hidden.
  act(() => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  latest.fields.register('a', field(380));
  act(() => { latest.fields.onFocus('a'); });
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenCalledWith({ y: 54, animated: true });
});

it('adds the scroll offset already travelled to what was hidden', () => {
  act(() => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  act(() => { latest.onScroll({ nativeEvent: { contentOffset: { y: 100 } } } as never); });
  latest.fields.register('a', field(380));
  act(() => { latest.fields.onFocus('a'); });
  expect(scrollTo).toHaveBeenCalledWith({ y: 154, animated: true });
});

it('a field already clear of the keypad does not scroll', () => {
  // The keypad's top edge is at 700; the field ends at 350, far above 700 - 24.
  act(() => { listeners.keyboardDidShow({ endCoordinates: { screenY: 700 } }); });
  latest.fields.register('a', field(300));
  act(() => { latest.fields.onFocus('a'); });
  expect(scrollTo).not.toHaveBeenCalled();
});

it('a field that ends exactly 24 above the keypad does not scroll either', () => {
  act(() => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  latest.fields.register('a', field(326)); // ends at 376 = 400 - 24
  act(() => { latest.fields.onFocus('a'); });
  expect(scrollTo).not.toHaveBeenCalled();
});

it('a field focused before the keypad shows is scrolled when the keypad arrives', () => {
  latest.fields.register('a', field(380));
  act(() => { latest.fields.onFocus('a'); });
  expect(scrollTo).not.toHaveBeenCalled();
  act(() => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  expect(scrollTo).toHaveBeenCalledWith({ y: 54, animated: true });
});

it('Next skips a field that is not on the screen (a closed band) and goes on to the next one that is', () => {
  let fields!: UseEditorFields;
  function Three() {
    fields = useEditorFields(['a', 'b', 'c']);
    return null;
  }
  act(() => { tree?.unmount(); tree = create(<Three />); });
  const a = field(100);
  const c = field(200);
  fields.fields.register('a', a as never);
  fields.fields.register('b', null as never);
  fields.fields.register('c', c as never);
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  fields.fields.next('a');
  expect(c.focus).toHaveBeenCalledTimes(1);
  expect(dismiss).not.toHaveBeenCalled();
  // After the last mounted field the keyboard closes.
  fields.fields.next('c');
  expect(dismiss).toHaveBeenCalledTimes(1);
});
