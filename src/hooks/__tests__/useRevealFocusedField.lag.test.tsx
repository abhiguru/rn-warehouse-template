/**
 * useRevealFocusedField (WH-228 rework 4, WH-240): a scroll that the platform shows LATER than asked, or only part of
 * the way, and a block that the page moves without growing.
 *
 * The scroll mock models the library (KeyboardAwareHOC.js:302-303): a scroll goes to an ABSOLUTE target, the offset
 * the library last heard of (`heard`, updated when a scroll lands) + what is asked, so an ask repeated before the
 * first has landed asks for the same place. The content moves after `delay` ms, by a fraction of the way to the
 * target (`fractions`, one per ask; the last one repeats), and not at all when `canScroll` is false. The input answers
 * measureInWindow (its place in the window: content place - scrolled) and measureLayout (its place within the scroll
 * content, which scrolling never changes), as the hook reads them. Timers are fake.
 */
import React from 'react';
import { Keyboard, PixelRatio, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { space } from '@/theme/tokens';
import { useKeyboardCoverLift } from '../useKeyboardCoverLift';
import { FIELD_BLOCK_ID, useRevealFocusedField, type KeyboardRevealTarget } from '../useRevealFocusedField';

const BOX_HEIGHT = 56;
const FREE_BAR_TOP = 1500;
const BAR_TOP = 1200;

interface FakeNode {
  id?: string;
  top: number; // in the scroll content
  height: number;
  parentElement: FakeNode | null;
  getBoundingClientRect: () => { top: number; bottom: number; height: number };
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
  measureLayout?: (relativeTo: unknown, ok: (x: number, y: number, w: number, h: number) => void, fail: () => void) => void;
}

let scrolled: number;
let canScroll: boolean;
let delay: number;
let fractions: number[];
let asks: number;
let heard: number;
const scroll = jest.fn((by: number) => {
  const fraction = fractions[Math.min(asks, fractions.length - 1)];
  asks++;
  if (!canScroll) return;
  const to = heard + by;
  setTimeout(() => { scrolled += (to - scrolled) * fraction; heard = scrolled; }, delay);
});
const target = {
  scrollForExtraHeightOnAndroid: scroll,
  getScrollResponder: () => ({ getInnerViewRef: () => ({}) }),
} as KeyboardRevealTarget;
const scrollRef: { current: KeyboardRevealTarget; userScrolled: boolean; onScrollBeginDrag: () => void } = {
  current: target,
  userScrolled: false,
  onScrollBeginDrag: () => { scrollRef.userScrolled = true; },
};
let barTop: number;
const barRef = { current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, barTop, 1080, 100) } };
let tree: ReactTestRenderer | undefined;

function Harness({ revision }: { revision: number }) {
  useRevealFocusedField(barRef as never, scrollRef, true, revision);
  return null;
}
const mount = async (revision = 1) => { await act(async () => { tree = create(<Harness revision={revision} />); }); };
const bump = async (revision: number) => { await act(async () => { tree!.update(<Harness revision={revision} />); }); };
const tick = (ms = 150) => act(async () => { jest.advanceTimersByTime(ms); });

function node(top: number, height: number, id?: string): FakeNode {
  const n: FakeNode = {
    id, top, height, parentElement: null,
    getBoundingClientRect: () => ({ top: n.top - scrolled, bottom: n.top + n.height - scrolled, height: n.height }),
  };
  return n;
}
const bottomOf = (n: FakeNode) => n.top + n.height;
function makeInput(top: number): FakeNode {
  const n = node(top, BOX_HEIGHT);
  n.measureInWindow = (cb) => cb(0, n.top - scrolled, 900, n.height);
  n.measureLayout = (_to, ok) => ok(0, n.top, 900, n.height);
  return n;
}
/** The input with its declared block (as tall as the box + `below`). */
function fieldWithBlock(top: number, below = 0) {
  const input = makeInput(top);
  const block = node(top, BOX_HEIGHT + below, FIELD_BLOCK_ID);
  input.parentElement = block;
  return { input, block };
}
/** Where the block's bottom + space.sm sits relative to the bar's top now (<= 0: above it). */
const overBar = (block: FakeNode, bar = barTop) => bottomOf(block) - scrolled + space.sm - bar;
/** In place: the block ends at the bar minus space.sm, to within a pixel (never past it, never more than 1 px above): an over-scroll fails too. */
const expectInPlace = (block: FakeNode, bar = barTop) => {
  expect(overBar(block, bar)).toBeLessThanOrEqual(0);
  expect(overBar(block, bar)).toBeGreaterThanOrEqual(-1);
};

let focused: FakeNode | null;
beforeEach(() => {
  jest.useFakeTimers();
  scroll.mockClear();
  scrolled = 0;
  canScroll = true;
  delay = 200; // after the first check (150 ms), before the second (300 ms)
  fractions = [1];
  asks = 0;
  heard = 0;
  barTop = BAR_TOP;
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

describe('a scroll that shows later than asked, or only part of the way', () => {
  it('a bar reveal, then a check before the content has moved: the check goes on, and the block ends above the bar', async () => {
    fractions = [0.5, 1];
    const { input, block } = fieldWithBlock(BAR_TOP - BOX_HEIGHT + 30); // fits while the bar is high (1500), behind it once lifted
    focused = input;
    barTop = FREE_BAR_TOP;
    await mount(1);
    expect(scroll).not.toHaveBeenCalled();
    barTop = BAR_TOP; // the bar lifts: its revision bumps
    await bump(2);
    expect(scroll).toHaveBeenCalledTimes(1);
    await tick(150); // the check lands before the scroll has moved anything
    await tick(3000);
    expectInPlace(block);
    expect(scroll.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(scroll.mock.calls.length).toBeLessThanOrEqual(4);
  });
  it('a force reveal (the keyboard shows) whose scroll lands one tick late and half way: the check goes on, and the block ends in place', async () => {
    fractions = [0.5, 1];
    const { input, block } = fieldWithBlock(BAR_TOP - BOX_HEIGHT + 30);
    focused = input;
    await mount(1);
    expect(scroll).toHaveBeenCalledTimes(1);
    await tick(3000);
    expectInPlace(block);
    expect(scroll.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(scroll.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('the busy UI: a scroll that lands only after a re-ask (450 ms): the re-ask is for the same place, so the block ends in place, not past it', async () => {
    delay = 450;
    const { input, block } = fieldWithBlock(BAR_TOP - BOX_HEIGHT + 30);
    focused = input;
    await mount(1);
    await tick(3000);
    expect(scroll.mock.calls.length).toBeGreaterThanOrEqual(2); // asked again before the first landed
    expect(scroll.mock.calls.length).toBeLessThanOrEqual(4);
    expectInPlace(block);
  });

  it('content that truly cannot scroll: asked once and re-asked 3 times, then no more over many ticks', async () => {
    canScroll = false;
    const { input } = fieldWithBlock(BAR_TOP - BOX_HEIGHT + 30);
    focused = input;
    await mount(1);
    await tick(6000);
    expect(scroll).toHaveBeenCalledTimes(4);
    await tick(6000);
    expect(scroll).toHaveBeenCalledTimes(4);
  });

  it('a drag wins: after the person drags, the check asks for nothing more, however far the block is behind', async () => {
    fractions = [0.5, 1];
    const { input, block } = fieldWithBlock(BAR_TOP - BOX_HEIGHT + 30);
    focused = input;
    barTop = FREE_BAR_TOP;
    await mount(1);
    barTop = BAR_TOP;
    await bump(2);
    expect(scroll).toHaveBeenCalledTimes(1);
    scrollRef.onScrollBeginDrag();
    await tick(3000);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(overBar(block)).toBeGreaterThan(0); // left where the person put it
  });
});

describe('the keyboard opens again on a field that kept the focus (rule 7), the real useKeyboardCoverLift', () => {
  const UNLIFTED_TOP = 1100; // the bar is 100 dp tall; its un-lifted bottom is 1200
  let listeners: Record<string, (event?: unknown) => void>;
  let appliedLift: number;
  let layout: (() => void) | undefined;
  let lifted: number;

  function BarHarness() {
    const { ref, lift, keyboardShown, revision, onLayout } = useKeyboardCoverLift();
    lifted = lift;
    layout = () => onLayout({} as never);
    // The bar's margin reaches the screen only later (appliedLift), as on a device.
    (ref as { current: unknown }).current = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, UNLIFTED_TOP - appliedLift, 1080, 100),
    };
    useRevealFocusedField(ref, scrollRef, keyboardShown, revision);
    return null;
  }

  beforeEach(() => {
    listeners = {};
    appliedLift = 0;
    lifted = 0;
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (event?: unknown) => void) => {
      listeners[name] = fn;
      return { remove: jest.fn() };
    }) as never);
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  });

  it('hide, show again on the same field (no focus change), the lift drawn later, the platform moving the content late and by half: the block ends above the lifted bar', async () => {
    fractions = [0.5, 1];
    const { input, block } = fieldWithBlock(1000 - BOX_HEIGHT - 20); // block bottom 1000 + space.sm: fits with no lift
    focused = input;
    await act(async () => { tree = create(<BarHarness />); });
    await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1300 } }); });
    await tick(450);
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => { listeners.keyboardDidHide(); });
    // Opens again on the same field, higher: the bar is to be lifted by 100.
    await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1000 } }); });
    expect(lifted).toBe(200);
    expect(scroll).not.toHaveBeenCalled(); // the first reveal ran before the bar was drawn lifted
    await tick(100);
    appliedLift = lifted; // the margin is on screen now; the bar lays out again and the hook measures it
    await act(async () => { layout!(); });
    await tick(5000);
    const liftedBarTop = UNLIFTED_TOP - appliedLift;
    expect(scroll.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(scroll.mock.calls.length).toBeLessThanOrEqual(4);
    expectInPlace(block, liftedBarTop);
  });
});

describe('WH-240: a block that the page moves without growing', () => {
  const MOVE = 26; // the "Left after dispatch N" line wrapping in the stock card above
  /** The page moves the field and its block down within the content. */
  const movePage = (nodes: FakeNode[], by: number) => nodes.forEach((n) => { n.top += by; });

  it('moved down by 26 dp with the same height: revealed again once at rest', async () => {
    const { input, block } = fieldWithBlock(BAR_TOP - BOX_HEIGHT - 40 - space.sm, 30);
    focused = input;
    await mount(1);
    await tick(450); // the baselines are taken, the block is in place
    expect(scroll).not.toHaveBeenCalled();
    movePage([input, block], MOVE);
    await tick(3000);
    expect(scroll).toHaveBeenCalled();
    expectInPlace(block);
    expect(scroll.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('scrolled by the person (a drag): the block moves in the window, not in the content, and is not pulled back', async () => {
    const { input, block } = fieldWithBlock(BAR_TOP - BOX_HEIGHT - 40 - space.sm, 30);
    focused = input;
    await mount(1);
    await tick(450);
    scrollRef.onScrollBeginDrag();
    scrolled -= 80; // dragged: the block goes lower in the window, and behind the bar
    await tick(3000);
    expect(scroll).not.toHaveBeenCalled();
    expect(overBar(block)).toBeGreaterThan(0);
  });

  it('a drag, THEN the page moves the block (Design check 3): the person\'s place is not undone', async () => {
    const { input, block } = fieldWithBlock(BAR_TOP - BOX_HEIGHT - 40 - space.sm, 30);
    focused = input;
    await mount(1);
    await tick(450);
    scrollRef.onScrollBeginDrag();
    scrolled -= 30; // the person drags the page
    movePage([input, block], MOVE); // then the "Left after dispatch N" line wraps: the block moves within the content
    await tick(3000);
    expect(scroll).not.toHaveBeenCalled();
    expect(overBar(block)).toBeGreaterThan(0);
  });

  it('scrolled with no drag flag (momentum, or the library) so that the block goes behind the bar: its place in the content did not change, so nothing is asked', async () => {
    const { input, block } = fieldWithBlock(BAR_TOP - BOX_HEIGHT - 40 - space.sm, 30);
    focused = input;
    await mount(1);
    await tick(450);
    scrolled -= 50; // the block goes lower in the window, behind the bar
    expect(overBar(block)).toBeGreaterThan(0);
    await tick(3000);
    expect(scroll).not.toHaveBeenCalled();
  });
});
