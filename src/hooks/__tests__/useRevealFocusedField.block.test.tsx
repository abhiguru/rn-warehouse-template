/**
 * useRevealFocusedField (WH-228, bfe05856): the block the reveal keeps above the bar is read from the view tree:
 * the input's bordered box (at most 3 containers ending within fieldBoxInset() below the input), then the messages
 * directly under the box (each starting within space.xs + 1 of the one above). The rule is block bottom + space.sm
 * <= the bar's top. Nodes here are fakes with parentElement, nextElementSibling and getBoundingClientRect; the
 * scroll mock moves them, so a second reveal sees where the first left the content. Timers are fake.
 */
import React from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { space, touchTarget, typography } from '@/theme/tokens';
import { useRevealFocusedField, type KeyboardRevealTarget } from '../useRevealFocusedField';

const BAR_TOP = 1200;
const INPUT_HEIGHT = 40;
const MESSAGE_GAP: number = space.xs;
/** The hook's own limit, from the same tokens: how far below the input a box may end. */
const inset = () => (touchTarget - typography.body.lineHeight) / 2 + space.xxs;
/** A box that ends a few dp below the input, as the phone's "Bags to dispatch" / "Invoice number" boxes do. */
const boxGap = () => Math.floor(inset()) - 1;

interface FakeNode {
  top: number;
  height: number;
  parentElement: FakeNode | null;
  nextElementSibling: FakeNode | null;
  getBoundingClientRect?: () => { top: number; bottom: number; height: number };
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
}
/** How far the content has been scrolled up by the hook so far. */
let scrolled: number;
const scroll = jest.fn((by: number) => { scrolled += by; });
const target: KeyboardRevealTarget = { scrollForExtraHeightOnAndroid: scroll };
const scrollRef: { current: KeyboardRevealTarget; userScrolled: boolean; onScrollBeginDrag: () => void } = {
  current: target,
  userScrolled: false,
  onScrollBeginDrag: () => { scrollRef.userScrolled = true; },
};
const barRef = { current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, BAR_TOP, 1080, 100) } };
let tree: ReactTestRenderer | undefined;

function Harness({ keyboardShown }: { keyboardShown: boolean }) {
  useRevealFocusedField(barRef as never, scrollRef, keyboardShown, 1);
  return null;
}
const render = async (keyboardShown = true) => {
  await act(async () => {
    if (tree) tree.update(<Harness keyboardShown={keyboardShown} />);
    else tree = create(<Harness keyboardShown={keyboardShown} />);
  });
};
const tick = (ms = 150) => act(async () => { jest.advanceTimersByTime(ms); });

function node(top: number, height: number): FakeNode {
  const n: FakeNode = { top, height, parentElement: null, nextElementSibling: null };
  n.getBoundingClientRect = () => ({ top: n.top - scrolled, bottom: n.top + n.height - scrolled, height: n.height });
  return n;
}
const bottomOf = (n: FakeNode) => n.top + n.height;
/** The input: a node that also answers measureInWindow, with its place in the window. */
function makeInput(top: number): FakeNode {
  const n = node(top, INPUT_HEIGHT);
  n.measureInWindow = (cb) => cb(0, n.top - scrolled, 900, n.height);
  return n;
}
/** A box `gap` below the input (the input is its child). */
function boxAround(input: FakeNode, gap: number): FakeNode {
  const box = node(input.top, INPUT_HEIGHT + gap);
  input.parentElement = box;
  return box;
}
/** A message directly under `above` (`gap` below it), put next to it in the tree. */
function messageUnder(above: FakeNode, height: number, gap = MESSAGE_GAP): FakeNode {
  const m = node(bottomOf(above) + gap, height);
  m.parentElement = above.parentElement;
  above.nextElementSibling = m;
  return m;
}
/** The input's top so that a block `blockHeight` tall (from the input's top) ends `behind` dp behind the bar's top. */
const topFor = (blockHeight: number, behind: number) => BAR_TOP + behind - blockHeight;

let focused: FakeNode | null;
beforeEach(() => {
  jest.useFakeTimers();
  scroll.mockClear();
  scrolled = 0;
  scrollRef.userScrolled = false;
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

describe('useRevealFocusedField, the box and the message under it', () => {
  it('1: box ends a few dp below the input, one message under the box: scrolls by message bottom + space.sm - bar top', async () => {
    const msgHeight = 32; // a helper line that wraps to two
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap() + MESSAGE_GAP + msgHeight, 10));
    focused = input;
    const box = boxAround(input, boxGap());
    const msg = messageUnder(box, msgHeight);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(msg) + space.sm - BAR_TOP));
    expect(bottomOf(msg) + space.sm - BAR_TOP).toBe(10 + space.sm);
  });

  it('2: no message showing, box bottom + space.sm already above the bar: no scroll (no room kept for a message)', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap(), -space.sm));
    focused = input;
    boxAround(input, boxGap());
    await render();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('3: no message, box bottom behind the bar: scrolls by box bottom + space.sm - bar top, not input bottom', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap(), 3));
    focused = input;
    const box = boxAround(input, boxGap());
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(box) + space.sm - BAR_TOP));
    expect(bottomOf(box) + space.sm - BAR_TOP).toBe(3 + space.sm);
  });
});

describe('useRevealFocusedField, a message that appears or grows while the keyboard stays up', () => {
  it('4a: a message appears after the first reveal: the 150 ms check scrolls by the added height', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap(), -space.sm - 5)); // 5 dp spare
    focused = input;
    const box = boxAround(input, boxGap());
    await render();
    expect(scroll).not.toHaveBeenCalled();
    const msg = messageUnder(box, 20);
    await tick();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(msg) + space.sm - BAR_TOP));
    expect(scroll.mock.calls[0][0]).toBe(MESSAGE_GAP + 20 - 5);
  });

  it('4b: a message that grows from one line to two: a second scroll by the added line', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap() + MESSAGE_GAP + 16, 4));
    focused = input;
    const box = boxAround(input, boxGap());
    const msg = messageUnder(box, 16);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenLastCalledWith(4 + space.sm);
    msg.height = 32;
    await tick();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith(16);
  });

  it('4c: a message that goes away does not scroll', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap(), 0));
    focused = input;
    const box = boxAround(input, boxGap());
    messageUnder(box, 16);
    await render();
    const calls = scroll.mock.calls.length;
    box.nextElementSibling = null;
    await tick(600);
    expect(scroll).toHaveBeenCalledTimes(calls);
  });

  it('7: first reveal returns early (nothing to scroll), later the block grows behind the bar: the check reveals it', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap(), -space.sm - 2));
    focused = input;
    const box = boxAround(input, boxGap());
    await render();
    expect(scroll).not.toHaveBeenCalled();
    await tick(900); // several checks with nothing changed
    expect(scroll).not.toHaveBeenCalled();
    const msg = messageUnder(box, 18);
    await tick();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(msg) + space.sm - BAR_TOP));
  });
});

describe('useRevealFocusedField, where the climb stops', () => {
  it('5a: a parent that ends far below the input (the form group) is not the box', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT, 6));
    focused = input;
    input.parentElement = node(input.top, INPUT_HEIGHT + Math.ceil(inset()) + 30);
    await render();
    expect(scroll).toHaveBeenCalledWith(6 + space.sm);
  });

  it('5b: a parent ending just beyond fieldBoxInset() is not the box; one ending exactly at it is', async () => {
    const far = makeInput(topFor(INPUT_HEIGHT, 6));
    focused = far;
    far.parentElement = node(far.top, INPUT_HEIGHT + inset() + 1);
    await render();
    expect(scroll).toHaveBeenLastCalledWith(6 + space.sm);
    await act(async () => { tree?.unmount(); });
    tree = undefined;
    scroll.mockClear();
    scrolled = 0;
    const near = makeInput(topFor(INPUT_HEIGHT, 6));
    focused = near;
    near.parentElement = node(near.top, INPUT_HEIGHT + inset());
    await render();
    expect(scroll).toHaveBeenLastCalledWith(Math.ceil(inset() + 6 + space.sm));
  });

  it('5c: with 4 nested containers the climb takes only 3 (what the code does): the 4th is not part of the box', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT, 6));
    focused = input;
    const c1 = node(input.top, INPUT_HEIGHT);
    const c2 = node(input.top, INPUT_HEIGHT);
    const c3 = node(input.top, INPUT_HEIGHT);
    const c4 = node(input.top, INPUT_HEIGHT + MESSAGE_GAP + 3); // would add 7 dp if taken as box
    input.parentElement = c1;
    c1.parentElement = c2;
    c2.parentElement = c3;
    c3.parentElement = c4;
    await render();
    expect(scroll).toHaveBeenCalledWith(6 + space.sm);
  });
});

describe('useRevealFocusedField, which views count as messages', () => {
  it('6a: a view beside the box (same row, starting at the box top) is skipped, the message under the box counts', async () => {
    const msgHeight = 16;
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap() + MESSAGE_GAP + msgHeight, 5));
    focused = input;
    const box = boxAround(input, boxGap());
    const beside = node(box.top, 300); // a tall button beside the box
    const msg = node(bottomOf(box) + MESSAGE_GAP, msgHeight);
    [beside, msg].forEach((n) => { n.parentElement = box.parentElement; });
    box.nextElementSibling = beside;
    beside.nextElementSibling = msg;
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(msg) + space.sm - BAR_TOP));
    expect(scroll).toHaveBeenCalledWith(5 + space.sm);
  });

  it('6b: a view under the box but further than the message gap is not counted', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap(), 5));
    focused = input;
    const box = boxAround(input, boxGap());
    messageUnder(box, 40, MESSAGE_GAP + 2); // 2 dp beyond the gap
    await render();
    expect(scroll).toHaveBeenCalledWith(5 + space.sm);
  });

  it('6c: a second message directly under the first counts too', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + boxGap(), 0));
    focused = input;
    const box = boxAround(input, boxGap());
    const first = messageUnder(box, 16);
    const second = messageUnder(first, 16);
    await render();
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(second) + space.sm - BAR_TOP));
  });
});
