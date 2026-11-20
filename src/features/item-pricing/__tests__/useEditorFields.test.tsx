/**
 * useEditorFields: a focused field is scrolled clear of the keypad (it ends 24 above it), and a field that is
 * already clear does not scroll. The numbers are the window's: the keypad's top edge comes from keyboardDidShow.
 */
import { Keyboard, type ScrollView } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { ABOVE_KEYBOARD, useEditorFields } from '../useEditorFields';

const listeners: Record<string, (event: unknown) => void> = {};
const scrollTo = jest.fn();

/** A field at `top` with height `height`, as the window measures it. */
const field = (top: number, height = 50) => ({
  focus: jest.fn(),
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, top, 300, height),
});

/** The hook, with a scroll view that records its scrollTo calls. */
async function mount(order = ['a', 'b']) {
  const { result } = await renderHook(() => useEditorFields(order));
  (result.current.scrollRef as { current: unknown }).current = { scrollTo } as unknown as ScrollView;
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (event: unknown) => void) => {
    listeners[name] = fn;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('is 24 above the keypad: the constant the form and the boxes use', () => {
  expect(ABOVE_KEYBOARD).toBe(24);
});

it('a focused field ends 24 above the keypad: the view scrolls by what was hidden', async () => {
  const latest = await mount();
  // The keypad's top edge is at 400; the field sits at 380 to 430. 430 + 24 - 400 = 54 hidden.
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  latest.current.fields.register('a', field(380));
  await act(async () => { latest.current.fields.onFocus('a'); });
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenCalledWith({ y: 54, animated: true });
});

it('adds the scroll offset already travelled to what was hidden', async () => {
  const latest = await mount();
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  await act(async () => { latest.current.onScroll({ nativeEvent: { contentOffset: { y: 100 } } } as never); });
  latest.current.fields.register('a', field(380));
  await act(async () => { latest.current.fields.onFocus('a'); });
  expect(scrollTo).toHaveBeenCalledWith({ y: 154, animated: true });
});

it('a field already clear of the keypad does not scroll', async () => {
  const latest = await mount();
  // The keypad's top edge is at 700; the field ends at 350, far above 700 - 24.
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 700 } }); });
  latest.current.fields.register('a', field(300));
  await act(async () => { latest.current.fields.onFocus('a'); });
  expect(scrollTo).not.toHaveBeenCalled();
});

it('a field that ends exactly 24 above the keypad does not scroll either', async () => {
  const latest = await mount();
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  latest.current.fields.register('a', field(326)); // ends at 376 = 400 - 24
  await act(async () => { latest.current.fields.onFocus('a'); });
  expect(scrollTo).not.toHaveBeenCalled();
});

it('a field focused before the keypad shows is scrolled when the keypad arrives', async () => {
  const latest = await mount();
  latest.current.fields.register('a', field(380));
  await act(async () => { latest.current.fields.onFocus('a'); });
  expect(scrollTo).not.toHaveBeenCalled();
  await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 400 } }); });
  expect(scrollTo).toHaveBeenCalledWith({ y: 54, animated: true });
});

it('Next skips a field that is not on the screen (a closed band) and goes on to the next one that is', async () => {
  const fields = await mount(['a', 'b', 'c']);
  const a = field(100);
  const c = field(200);
  fields.current.fields.register('a', a as never);
  fields.current.fields.register('b', null as never);
  fields.current.fields.register('c', c as never);
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  fields.current.fields.next('a');
  expect(c.focus).toHaveBeenCalledTimes(1);
  expect(dismiss).not.toHaveBeenCalled();
  // After the last mounted field the keyboard closes.
  fields.current.fields.next('c');
  expect(dismiss).toHaveBeenCalledTimes(1);
});
