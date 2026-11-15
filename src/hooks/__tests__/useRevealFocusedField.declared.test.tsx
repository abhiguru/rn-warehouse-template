/**
 * useRevealFocusedField (WH-228, rework 3): the block is declared (FIELD_BLOCK_ID on the field group), and after
 * every reveal the 150 ms check looks again once the content is at rest. Fake nodes with id, parentElement,
 * nextElementSibling (only so that a reading of siblings would show) and getBoundingClientRect; the scroll mock
 * moves them. The real FIELD_BLOCK_ID and theme tokens; timers are fake.
 */
import React from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { space } from '@/theme/tokens';
import { FIELD_BLOCK_ID, useRevealFocusedField, type KeyboardRevealTarget } from '../useRevealFocusedField';

const INPUT_HEIGHT = 40;
const LIFTED_BAR_TOP = 1200;

interface FakeNode {
  id?: string;
  top: number;
  height: number;
  parentElement: FakeNode | null;
  nextElementSibling: FakeNode | null;
  getBoundingClientRect: () => { top: number; bottom: number; height: number };
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
}

let scrolled: number;
let canScroll: boolean;
let barTop: number;
const scroll = jest.fn((by: number) => { if (canScroll) scrolled += by; });
const target: KeyboardRevealTarget = { scrollForExtraHeightOnAndroid: scroll };
const scrollRef: { current: KeyboardRevealTarget; userScrolled: boolean; onScrollBeginDrag: () => void } = {
  current: target,
  userScrolled: false,
  onScrollBeginDrag: () => { scrollRef.userScrolled = true; },
};
const barRef = { current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, barTop, 1080, 100) } };
let tree: ReactTestRenderer | undefined;

function Harness({ keyboardShown, revision }: { keyboardShown: boolean; revision: number }) {
  useRevealFocusedField(barRef as never, scrollRef, keyboardShown, revision);
  return null;
}
const render = async (keyboardShown = true, revision = 1) => {
  await act(async () => {
    if (tree) tree.update(<Harness keyboardShown={keyboardShown} revision={revision} />);
    else tree = create(<Harness keyboardShown={keyboardShown} revision={revision} />);
  });
};
const tick = (ms = 150) => act(async () => { jest.advanceTimersByTime(ms); });

function node(top: number, height: number, id?: string): FakeNode {
  const n: FakeNode = {
    id,
    top,
    height,
    parentElement: null,
    nextElementSibling: null,
    getBoundingClientRect: () => ({ top: n.top - scrolled, bottom: n.top + n.height - scrolled, height: n.height }),
  };
  return n;
}
const bottomOf = (n: FakeNode) => n.top + n.height;
function makeInput(top: number): FakeNode {
  const n = node(top, INPUT_HEIGHT);
  n.measureInWindow = (cb) => cb(0, n.top - scrolled, 900, n.height);
  return n;
}
/** A parent of `child` starting at the child's top and `below` dp taller than it; `id` marks it. */
function wrap(child: FakeNode, below: number, id?: string): FakeNode {
  const w = node(child.top, child.height + below, id);
  child.parentElement = w;
  return w;
}
/** `levels` further containers around `from`, each as tall as it (none marked); returns the outermost. */
function chain(from: FakeNode, levels: number): FakeNode {
  let n = from;
  for (let i = 0; i < levels; i++) n = wrap(n, 0);
  return n;
}
/** What the scroll must be so that `bottom` + space.sm ends at the bar's top. */
const needed = (bottom: number, bar = LIFTED_BAR_TOP) => Math.ceil(bottom + space.sm - bar);
/** An input top so that its bottom (or a block's bottom, with `blockBelow`) is `behind` dp behind the bar. */
const topFor = (behind: number, blockBelow = 0) => LIFTED_BAR_TOP + behind - INPUT_HEIGHT - blockBelow;

let focused: FakeNode | null;
beforeEach(() => {
  jest.useFakeTimers();
  scroll.mockClear();
  scrolled = 0;
  canScroll = true;
  barTop = LIFTED_BAR_TOP;
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

describe('the nearest marked ancestor is the block (2a)', () => {
  it('scrolls by exactly block bottom + space.sm - bar top', async () => {
    const input = makeInput(topFor(7, 25));
    focused = input;
    const group = wrap(input, 25, FIELD_BLOCK_ID);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(group)));
    expect(bottomOf(group) + space.sm - LIFTED_BAR_TOP).toBe(7 + space.sm);
  });

  it('a marked ancestor further up is not used when a nearer one exists', async () => {
    const input = makeInput(topFor(0, 10));
    focused = input;
    const near = wrap(input, 10, FIELD_BLOCK_ID);
    const mid = wrap(near, 0);
    const far = wrap(mid, 200, FIELD_BLOCK_ID);
    await render();
    expect(bottomOf(far)).toBeGreaterThan(bottomOf(near));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(near)));
  });

  it('a marked ancestor at level 12 is used', async () => {
    const input = makeInput(topFor(0, 30));
    focused = input;
    const outer = chain(wrap(input, 30), 10); // levels 1..11 unmarked-so-far; the 11th is the outermost here
    const marked = wrap(outer, 0, FIELD_BLOCK_ID); // level 12
    await render();
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(marked)));
  });
});

describe('no marked ancestor in reach: the input is its own block (2b)', () => {
  it('an unmarked tree: scrolls by input bottom + space.sm - bar top', async () => {
    const input = makeInput(topFor(9));
    focused = input;
    chain(wrap(input, 40), 3);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(input)));
  });

  it('a marked ancestor at level 13 is not used', async () => {
    const input = makeInput(topFor(9));
    focused = input;
    const level12 = chain(wrap(input, 0), 11); // levels 1..12, none marked
    wrap(level12, 80, FIELD_BLOCK_ID); // level 13, much taller
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(input)));
  });
});

describe('a list row: the following rows are never counted (2c, the High)', () => {
  /** Rows edge to edge in one list container; the input sits in the first row, `depth` levels below it. */
  function listWithInputInFirstRow(depth: number, markRow: boolean) {
    const input = makeInput(topFor(6));
    const inner = chain(input, depth - 1); // depth - 1 wrappers; the row is the next one up
    const row = wrap(inner, 0, markRow ? FIELD_BLOCK_ID : undefined);
    const row2 = node(bottomOf(row), 60);
    const row3 = node(bottomOf(row2), 60);
    row.nextElementSibling = row2;
    row2.nextElementSibling = row3;
    const list = node(row.top, row.height + 120);
    [row, row2, row3].forEach((r) => { r.parentElement = list; });
    return { input, row };
  }

  it('row directly around the input, marked: block is the row, not the rows after it', async () => {
    const { input, row } = listWithInputInFirstRow(1, true);
    focused = input;
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(row)));
  });

  it('row directly around the input, nothing marked: the input is the block, no following row counts', async () => {
    const { input } = listWithInputInFirstRow(1, false);
    focused = input;
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(input)));
  });

  it('input 9 levels below the row, marked: block is the row; the following rows do not count', async () => {
    const { input, row } = listWithInputInFirstRow(9, true);
    focused = input;
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(row)));
  });

  it('input 9 levels below the row, nothing marked: the input is the block', async () => {
    const { input } = listWithInputInFirstRow(9, false);
    focused = input;
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(input)));
  });
});

describe('a padded wrapper is not taken into the block (2d, the old Low)', () => {
  it('unmarked input in a wrapper with bottom padding: the padding is not counted', async () => {
    const input = makeInput(topFor(5));
    focused = input;
    wrap(input, space.md); // paddingBottom, unmarked
    await render();
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(input)));
  });

  it('a marked block inside the padded wrapper: the block ends before the padding', async () => {
    const input = makeInput(topFor(5, 12));
    focused = input;
    const block = wrap(input, 12, FIELD_BLOCK_ID);
    wrap(block, space.md); // the container's padding, outside the block
    await render();
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(block)));
  });
});

describe('the keyboard opens again on a field that kept the focus (2e)', () => {
  it('the first reveal finds nothing to scroll (bar not lifted), then the bar lifts: the at-rest check scrolls the block into place', async () => {
    const input = makeInput(LIFTED_BAR_TOP + 20 - INPUT_HEIGHT - 10); // block bottom 20 dp behind the lifted bar
    focused = input;
    const block = wrap(input, 10, FIELD_BLOCK_ID);
    barTop = 1500; // not lifted yet: everything fits
    await render(); // keyboard shows, no focus change
    expect(scroll).not.toHaveBeenCalled();
    barTop = LIFTED_BAR_TOP; // the lift, no keyboard event and no revision change
    await tick();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(block)));
    await tick(900);
    expect(scroll).toHaveBeenCalledTimes(1); // in place now
  });

  it('while the content is still moving the check waits, then scrolls by what is still missing', async () => {
    const input = makeInput(LIFTED_BAR_TOP + 20 - INPUT_HEIGHT - 10);
    focused = input;
    const block = wrap(input, 10, FIELD_BLOCK_ID);
    barTop = 1500;
    await render();
    barTop = LIFTED_BAR_TOP;
    input.top -= 15;
    block.top -= 15; // the scroll view is still being scrolled by the platform
    await tick();
    expect(scroll).not.toHaveBeenCalled();
    await tick(); // at rest now
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(block)));
  });
});

describe('the at-rest check stops (2f)', () => {
  it('when the block is in place: no scroll over several ticks', async () => {
    const input = makeInput(topFor(-30, 10));
    focused = input;
    wrap(input, 10, FIELD_BLOCK_ID);
    await render();
    await tick(1500);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('after a scroll put the block in place: no further scroll calls', async () => {
    const input = makeInput(topFor(20, 10));
    focused = input;
    wrap(input, 10, FIELD_BLOCK_ID);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    await tick(1500);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('while a drag holds: the lifted bar is not followed', async () => {
    const input = makeInput(LIFTED_BAR_TOP + 20 - INPUT_HEIGHT - 10);
    focused = input;
    wrap(input, 10, FIELD_BLOCK_ID);
    barTop = 1500;
    await render();
    barTop = LIFTED_BAR_TOP;
    scrollRef.onScrollBeginDrag();
    await tick(1500);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('when the content cannot scroll further: asked once, not endlessly; a message that appears later is revealed', async () => {
    canScroll = false;
    const input = makeInput(topFor(30, 10));
    focused = input;
    const block = wrap(input, 10, FIELD_BLOCK_ID);
    await render();
    expect(scroll).toHaveBeenCalledTimes(1);
    await tick(1500);
    expect(scroll).toHaveBeenCalledTimes(1);
    block.height += 24; // a message appears
    await tick();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith(needed(bottomOf(block)));
    await tick(1500);
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('a message that appears after the block was found in place is revealed', async () => {
    const input = makeInput(topFor(-30, 10));
    focused = input;
    const block = wrap(input, 10, FIELD_BLOCK_ID);
    await render();
    await tick(600);
    expect(scroll).not.toHaveBeenCalled();
    block.height += 50;
    await tick();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(block)));
  });
});
