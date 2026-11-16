/**
 * useRevealScrollRef.revealHandlers + useRevealFocusedField (WH-243): the reveal leaves alone what the person's own
 * tap changed on the page (opening a group above the focused field), until the person types in the field, taps it,
 * another field takes the focus or the keyboard shows again; a drag's hold is never lifted by typing. The real
 * scroll ref hook is used; the view tree is faked (id, parentElement, getBoundingClientRect, measureInWindow,
 * measureLayout). Timers are fake.
 */
import React from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { space } from '@/theme/tokens';
import {
  FIELD_BLOCK_ID,
  useRevealFocusedField,
  useRevealScrollRef,
  type KeyboardRevealTarget,
} from '../useRevealFocusedField';

const BOX_HEIGHT = 56;
const BAR_TOP = 1200;
const MOVE = 26;

interface FakeNode {
  id?: string;
  top: number; // in the scroll content
  height: number;
  parentElement: FakeNode | null;
  getBoundingClientRect: () => { top: number; bottom: number; height: number; left: number; right: number };
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
  measureLayout?: (relativeTo: unknown, ok: (x: number, y: number, w: number, h: number) => void, fail: () => void) => void;
}

let scrolled: number;
const scroll = jest.fn((by: number) => { scrolled += by; });
const target = {
  scrollForExtraHeightOnAndroid: scroll,
  getScrollResponder: () => ({ getInnerViewRef: () => ({}) }),
} as KeyboardRevealTarget;
const barRef = { current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, BAR_TOP, 1080, 100) } };
let tree: ReactTestRenderer | undefined;
let scrollRef: ReturnType<typeof useRevealScrollRef>;

function Harness({ keyboardShown, revision }: { keyboardShown: boolean; revision: number }) {
  scrollRef = useRevealScrollRef();
  (scrollRef as { current: KeyboardRevealTarget | null }).current = target;
  useRevealFocusedField(barRef as never, scrollRef, keyboardShown, revision);
  return null;
}
const mount = async () => { await act(async () => { tree = create(<Harness keyboardShown revision={1} />); }); };
const rerender = async (keyboardShown: boolean) => {
  await act(async () => { tree!.update(<Harness keyboardShown={keyboardShown} revision={1} />); });
};
const tick = (ms = 150) => act(async () => { jest.advanceTimersByTime(ms); });

function node(top: number, height: number, id?: string): FakeNode {
  const n: FakeNode = {
    id, top, height, parentElement: null,
    getBoundingClientRect: () => ({ top: n.top - scrolled, bottom: n.top + n.height - scrolled, height: n.height, left: 0, right: 900 }),
  };
  return n;
}
function fieldWithBlock(top: number, below = 30) {
  const input = node(top, BOX_HEIGHT);
  input.measureInWindow = (cb) => cb(0, input.top - scrolled, 900, input.height);
  input.measureLayout = (_to, ok) => ok(0, input.top, 900, input.height);
  const block = node(top, BOX_HEIGHT + below, FIELD_BLOCK_ID);
  input.parentElement = block;
  return { input, block };
}
const movePage = (nodes: FakeNode[], by: number) => nodes.forEach((n) => { n.top += by; });
const touch = (pageX: number, pageY: number) => scrollRef.revealHandlers.onTouchStartCapture({ nativeEvent: { pageX, pageY } });
const typeText = (text: unknown) => scrollRef.revealHandlers.onChangeCapture({ nativeEvent: { text } });

let focused: FakeNode | null;
/** A focused field whose block ends just above the bar: in place. */
const inPlaceField = () => fieldWithBlock(BAR_TOP - BOX_HEIGHT - 40 - space.sm);

beforeEach(() => {
  jest.useFakeTimers();
  scroll.mockClear();
  scrolled = 0;
  jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockImplementation((() => focused) as never);
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('revealHandlers (the flags the person\'s touches set)', () => {
  it('the ref carries one handler set, whose drag handler is the ref\'s own', async () => {
    focused = null;
    await mount();
    expect(scrollRef.revealHandlers.onScrollBeginDrag).toBe(scrollRef.onScrollBeginDrag);
    scrollRef.revealHandlers.onScrollBeginDrag();
    expect(scrollRef.userScrolled).toBe(true);
  });

  it('a touch outside the focused field\'s block is the person\'s tap on the page', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    touch(10, block.top - 300);
    expect(scrollRef.userTapped).toBe(true);
    expect(scrollRef.revealAsked).toBe(false);
  });

  it('a touch to the side of the block (inside its rows, outside its columns) is outside it too', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    touch(950, block.top + 10);
    expect(scrollRef.userTapped).toBe(true);
  });

  it('a touch on the focused field\'s block asks for a reveal and lifts a tap\'s hold', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    touch(10, block.top - 300);
    touch(10, block.top + 10);
    expect(scrollRef.userTapped).toBe(false);
    expect(scrollRef.revealAsked).toBe(true);
  });

  it('a touch with no field focused changes nothing', async () => {
    focused = null;
    await mount();
    touch(10, 10);
    expect(scrollRef.userTapped).toBe(false);
    expect(scrollRef.revealAsked).toBe(false);
  });

  it('typing (a change event that carries text) asks for a reveal and lifts a tap\'s hold', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    touch(10, block.top - 300);
    typeText('12');
    expect(scrollRef.userTapped).toBe(false);
    expect(scrollRef.revealAsked).toBe(true);
  });

  it('a change event without text (a switch) is not typing', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    touch(10, block.top - 300);
    scrollRef.revealHandlers.onChangeCapture({ nativeEvent: { value: true } as never });
    scrollRef.revealHandlers.onChangeCapture({} as never);
    expect(scrollRef.userTapped).toBe(true);
    expect(scrollRef.revealAsked).toBe(false);
  });
});

describe('WH-243: the reveal leaves alone what the person\'s own tap changed', () => {
  it('control: the page moves the field with no tap (WH-240): it is revealed again', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    await tick(450);
    expect(scroll).not.toHaveBeenCalled();
    movePage([input, block], MOVE);
    await tick(3000);
    expect(scroll).toHaveBeenCalled();
  });

  it('Invoice step 2: a tap on a group above, which pushes the focused cell down, is not scrolled back', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    await tick(450);
    touch(20, 300); // the head of a group above the focused Charge cell
    movePage([input, block], MOVE); // the opened lines push the focused row down
    await tick(3000);
    expect(scroll).not.toHaveBeenCalled();
    expect(scrolled).toBe(0);
  });

  it('then typing in the focused field brings it above the bar again', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    await tick(450);
    touch(20, 300);
    movePage([input, block], MOVE);
    await tick(3000);
    expect(scroll).not.toHaveBeenCalled();
    typeText('5');
    await tick(3000);
    expect(scroll).toHaveBeenCalled();
    expect(block.top + block.height - scrolled + space.sm).toBeLessThanOrEqual(BAR_TOP);
  });

  it('a tap on the focused field itself brings it above the bar again', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    await tick(450);
    touch(20, 300);
    movePage([input, block], MOVE);
    await tick(450);
    expect(scroll).not.toHaveBeenCalled();
    touch(10, block.top - scrolled + 5); // on the block
    await tick(3000);
    expect(scroll).toHaveBeenCalled();
  });

  it('typing never lifts a drag\'s hold', async () => {
    const { input, block } = inPlaceField();
    focused = input;
    await mount();
    await tick(450);
    scrollRef.onScrollBeginDrag();
    typeText('5');
    movePage([input, block], MOVE);
    await tick(3000);
    expect(scroll).not.toHaveBeenCalled();
    expect(scrollRef.userScrolled).toBe(true);
  });

  it('the focus moving to another field lifts the tap\'s hold', async () => {
    const first = inPlaceField();
    focused = first.input;
    await mount();
    await tick(450);
    touch(20, 300);
    expect(scrollRef.userTapped).toBe(true);
    const second = fieldWithBlock(BAR_TOP - BOX_HEIGHT + 50, 30); // behind the bar
    focused = second.input;
    await tick(450);
    expect(scrollRef.userTapped).toBe(false);
    expect(scroll).toHaveBeenCalled(); // the new field is revealed
  });

  it('the keyboard showing again lifts the tap\'s hold', async () => {
    const { input } = inPlaceField();
    focused = input;
    await mount();
    await tick(450);
    touch(20, 300);
    expect(scrollRef.userTapped).toBe(true);
    await rerender(false);
    await rerender(true);
    expect(scrollRef.userTapped).toBe(false);
    expect(scrollRef.revealAsked).toBe(false);
  });
});
