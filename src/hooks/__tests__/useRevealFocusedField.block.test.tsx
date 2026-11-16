/**
 * useRevealFocusedField (WH-228): the block the reveal keeps above the bar is declared by the screen, not guessed:
 * the focused input's nearest ancestor marked FIELD_BLOCK_ID. The rule is block bottom + space.sm <= the bar's top.
 * Nodes here are fakes with id, parentElement and getBoundingClientRect; the scroll mock moves them, so a second
 * reveal sees where the first left the content. Timers are fake.
 *
 * Rewritten for the declared block: the cases about the old position-based reading (the box inset, the message gap,
 * views beside the box, the climb limits) are gone with that reading. The nearest marked ancestor, the 12 level
 * limit, list rows and the at-rest check are in useRevealFocusedField.declared.test.tsx.
 */
import React from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { space } from '@/theme/tokens';
import { FIELD_BLOCK_ID, useRevealFocusedField, type KeyboardRevealTarget } from '../useRevealFocusedField';

const BAR_TOP = 1200;
const INPUT_HEIGHT = 40;
/** A box that ends a few dp below the input (the field's own border and padding). */
const BOX_GAP = 6;
/** A gap between the box and a message under it, inside the block. */
const MESSAGE_GAP: number = space.xs;

interface FakeNode {
  id?: string;
  top: number;
  height: number;
  parentElement: FakeNode | null;
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
  const n: FakeNode = { top, height, parentElement: null };
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
/** The declared block around the input: `below` dp under the input's bottom (box, messages, all of it). */
function blockAround(input: FakeNode, below: number): FakeNode {
  const block = node(input.top, INPUT_HEIGHT + below);
  block.id = FIELD_BLOCK_ID;
  input.parentElement = block;
  return block;
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

describe('useRevealFocusedField, the declared block', () => {
  it('1: a message inside the block, wrapped to two lines: scrolls by block bottom + space.sm - bar top, in full', async () => {
    const msgHeight = 32;
    const below = BOX_GAP + MESSAGE_GAP + msgHeight;
    const input = makeInput(topFor(INPUT_HEIGHT + below, 10));
    focused = input;
    const block = blockAround(input, below);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(block) + space.sm - BAR_TOP));
    expect(bottomOf(block) + space.sm - BAR_TOP).toBe(10 + space.sm);
  });

  it('1b: two messages inside the block count in full', async () => {
    const below = BOX_GAP + MESSAGE_GAP + 16 + MESSAGE_GAP + 16;
    const input = makeInput(topFor(INPUT_HEIGHT + below, 0));
    focused = input;
    const block = blockAround(input, below);
    await render();
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(block) + space.sm - BAR_TOP));
  });

  it('2: block bottom + space.sm already above the bar: no scroll (no room kept for a message that is not showing)', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + BOX_GAP, -space.sm));
    focused = input;
    blockAround(input, BOX_GAP);
    await render();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('3: no message, block bottom behind the bar: scrolls by block bottom + space.sm - bar top, not input bottom', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + BOX_GAP, 3));
    focused = input;
    const block = blockAround(input, BOX_GAP);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(block) + space.sm - BAR_TOP));
    expect(bottomOf(block) + space.sm - BAR_TOP).toBe(3 + space.sm);
  });
});

describe('useRevealFocusedField, a block that grows while the keyboard stays up', () => {
  it('4a: a message appears inside the block after the first reveal: the 150 ms check scrolls by the added height', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + BOX_GAP, -space.sm - 5)); // 5 dp spare
    focused = input;
    const block = blockAround(input, BOX_GAP);
    await render();
    expect(scroll).not.toHaveBeenCalled();
    block.height += MESSAGE_GAP + 20;
    await tick();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(block) + space.sm - BAR_TOP));
    expect(scroll.mock.calls[0][0]).toBe(MESSAGE_GAP + 20 - 5);
  });

  it('4b: a message that grows from one line to two: a second scroll by the added line', async () => {
    const below = BOX_GAP + MESSAGE_GAP + 16;
    const input = makeInput(topFor(INPUT_HEIGHT + below, 4));
    focused = input;
    const block = blockAround(input, below);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenLastCalledWith(4 + space.sm);
    block.height += 16;
    await tick();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith(16);
  });

  it('4c: a message that goes away does not scroll', async () => {
    const below = BOX_GAP + MESSAGE_GAP + 16;
    const input = makeInput(topFor(INPUT_HEIGHT + below, 0));
    focused = input;
    const block = blockAround(input, below);
    await render();
    const calls = scroll.mock.calls.length;
    block.height -= MESSAGE_GAP + 16;
    await tick(600);
    expect(scroll).toHaveBeenCalledTimes(calls);
  });

  it('7: first reveal returns early (nothing to scroll), later the block grows behind the bar: the check reveals it', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT + BOX_GAP, -space.sm - 2));
    focused = input;
    const block = blockAround(input, BOX_GAP);
    await render();
    expect(scroll).not.toHaveBeenCalled();
    await tick(900); // several checks with nothing changed
    expect(scroll).not.toHaveBeenCalled();
    block.height += MESSAGE_GAP + 18;
    await tick();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(bottomOf(block) + space.sm - BAR_TOP));
  });
});

describe('useRevealFocusedField, an unmarked parent is not the block', () => {
  it('5a: a parent that ends far below the input (the form group, unmarked) is not the block', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT, 6));
    focused = input;
    input.parentElement = node(input.top, INPUT_HEIGHT + 60);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(6 + space.sm);
  });

  it('5c: nested unmarked containers, the last one taller: none of them is the block', async () => {
    const input = makeInput(topFor(INPUT_HEIGHT, 6));
    focused = input;
    const c1 = node(input.top, INPUT_HEIGHT);
    const c2 = node(input.top, INPUT_HEIGHT);
    const c3 = node(input.top, INPUT_HEIGHT);
    const c4 = node(input.top, INPUT_HEIGHT + MESSAGE_GAP + 3);
    input.parentElement = c1;
    c1.parentElement = c2;
    c2.parentElement = c3;
    c3.parentElement = c4;
    await render();
    expect(scroll).toHaveBeenCalledWith(6 + space.sm);
  });
});
