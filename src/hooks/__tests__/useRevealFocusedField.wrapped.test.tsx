/**
 * useRevealFocusedField, cases of the cards that WH-228's declared blocks answer:
 * - WH-234: Dispatch step 2, the -10/-5/+5/+10 buttons wrapped under the box: the declared block (box, buttons,
 *   error line) is kept above the bar whole; deleting the number removes the error and the block shrinks with no
 *   further scroll.
 * - WH-235: the measured block's size is never guessed from the font scale (only the fallback for a view tree that
 *   cannot be read scales with it), so the same measured block geometry gives the same scroll at 0.8, 1.0 and 1.3.
 * - A bar that lifts after the 150 ms check already found the block in place, with the real useKeyboardCoverLift as
 *   WizardBottomBar uses it: the lift bumps `revision`, which reveals again. (The keyboard that hides and shows again
 *   on a field that kept the focus, rule 7, is in useRevealFocusedField.lag.test.tsx.)
 * Fake nodes with id, parentElement and getBoundingClientRect; the scroll mock moves them; timers are fake.
 */
import React from 'react';
import { Keyboard, PixelRatio, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { space } from '@/theme/tokens';
import { useKeyboardCoverLift } from '../useKeyboardCoverLift';
import { FIELD_BLOCK_ID, useRevealFocusedField, type KeyboardRevealTarget } from '../useRevealFocusedField';

const BAR_TOP = 1200;
const BOX_HEIGHT = 56;

interface FakeNode {
  id?: string;
  top: number;
  height: number;
  parentElement: FakeNode | null;
  getBoundingClientRect: () => { top: number; bottom: number; height: number };
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
}
let scrolled: number;
const scroll = jest.fn((by: number) => { scrolled += by; });
const target: KeyboardRevealTarget = { scrollForExtraHeightOnAndroid: scroll };
const scrollRef: { current: KeyboardRevealTarget; userScrolled: boolean; onScrollBeginDrag: () => void } = {
  current: target,
  userScrolled: false,
  onScrollBeginDrag: () => { scrollRef.userScrolled = true; },
};
let barTop: number;
const barRef = { current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, barTop, 1080, 100) } };
let tree: ReactTestRenderer | undefined;

function Harness() {
  useRevealFocusedField(barRef as never, scrollRef, true, 1);
  return null;
}
const mount = async () => { await act(async () => { tree = create(<Harness />); }); };
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
  return n;
}
const needed = (bottom: number, bar = BAR_TOP) => Math.ceil(bottom + space.sm - bar);

let focused: FakeNode | null;
beforeEach(() => {
  jest.useFakeTimers();
  scroll.mockClear();
  scrolled = 0;
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

describe('WH-234: Dispatch step 2, the quantity buttons wrapped under the box', () => {
  const BUTTONS_GAP = space.sm;
  const BUTTONS_HEIGHT = 44;
  const ERROR_GAP = space.xs;
  const ERROR_HEIGHT = 20;
  /** The group's block: the box (the focused input), the buttons wrapped under it, and the error line under them. */
  function wrappedGroup(inputTop: number) {
    const input = makeInput(inputTop);
    const block = node(inputTop, BOX_HEIGHT + BUTTONS_GAP + BUTTONS_HEIGHT + ERROR_GAP + ERROR_HEIGHT, FIELD_BLOCK_ID);
    input.parentElement = block;
    return { input, block };
  }

  it('keeps the whole block, the error line included, above the bar (not just the box)', async () => {
    const { input, block } = wrappedGroup(BAR_TOP - BOX_HEIGHT - 10);
    focused = input;
    await mount();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(block)));
    expect(needed(bottomOf(block))).toBeGreaterThan(needed(bottomOf(input))); // the box alone would have scrolled less
    expect(bottomOf(block) - scrolled + space.sm).toBeLessThanOrEqual(BAR_TOP);
    await tick(900);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('deleting the number removes the error: the block shrinks and nothing scrolls again (no jump)', async () => {
    const { input, block } = wrappedGroup(BAR_TOP - BOX_HEIGHT - 10);
    focused = input;
    await mount();
    expect(scroll).toHaveBeenCalledTimes(1);
    block.height -= ERROR_GAP + ERROR_HEIGHT;
    await tick(900);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('typing a number that is too high shows the error again: the block grows and is revealed by the added height', async () => {
    const { input, block } = wrappedGroup(BAR_TOP - BOX_HEIGHT - 10);
    block.height -= ERROR_GAP + ERROR_HEIGHT; // no error showing yet
    focused = input;
    await mount();
    scroll.mockClear();
    block.height += ERROR_GAP + ERROR_HEIGHT;
    await tick();
    expect(scroll).toHaveBeenCalledTimes(1);
    // The first reveal already scrolled the block's old bottom into place: only the added error line is missing.
    expect(scroll).toHaveBeenCalledWith(ERROR_GAP + ERROR_HEIGHT);
    expect(bottomOf(block) - scrolled + space.sm).toBeLessThanOrEqual(BAR_TOP);
  });
});

describe('WH-235: the measured block does not read the font scale (only the unmeasured fallback does)', () => {
  it.each([0.8, 1.0, 1.3])('measured block, same geometry: the same scroll at font scale %s', async (fontScale) => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(fontScale);
    const input = makeInput(BAR_TOP - BOX_HEIGHT - 6);
    // The Invoice number block: the box, its error line and its helper line.
    const block = node(input.top, BOX_HEIGHT + space.xs + 16 + space.xs + 16, FIELD_BLOCK_ID);
    input.parentElement = block;
    focused = input;
    await mount();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(block)));
  });

  it.each([0.8, 1.0, 1.3])('measured block with nothing under the box: box bottom + space.sm at font scale %s, no room guessed', async (fontScale) => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(fontScale);
    const input = makeInput(BAR_TOP - BOX_HEIGHT + 3);
    const block = node(input.top, BOX_HEIGHT, FIELD_BLOCK_ID);
    input.parentElement = block;
    focused = input;
    await mount();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(3 + space.sm);
  });
});

describe('a bar that lifts after the check found the block in place (the real useKeyboardCoverLift)', () => {
  const UNLIFTED_TOP = 1100; // the bar is 100 dp tall; its un-lifted bottom is 1200
  let listeners: Record<string, (event?: unknown) => void>;
  let currentLift: number;

  function BarHarness() {
    const { ref, lift, keyboardShown, revision } = useKeyboardCoverLift();
    currentLift = lift;
    (ref as { current: unknown }).current = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, UNLIFTED_TOP - currentLift, 1080, 100),
    };
    useRevealFocusedField(ref, scrollRef, keyboardShown, revision);
    return null;
  }

  beforeEach(() => {
    listeners = {};
    currentLift = 0;
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (event?: unknown) => void) => {
      listeners[name] = fn;
      return { remove: jest.fn() };
    }) as never);
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  });

  it('the lift bumps the revision, and the block is scrolled into place by what the lift took', async () => {
    const input = makeInput(1000 - BOX_HEIGHT - 20);
    const block = node(input.top, BOX_HEIGHT + 30, FIELD_BLOCK_ID);
    input.parentElement = block;
    focused = input;
    await act(async () => { tree = create(<BarHarness />); });
    // The keyboard shows, its top edge below the bar: no lift, and the block (bottom 1010 + space.sm) fits.
    await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 1300 } }); });
    expect(currentLift).toBe(0);
    expect(scroll).not.toHaveBeenCalled();
    await tick(900); // the check finds the block in place and stops
    expect(scroll).not.toHaveBeenCalled();
    // The keyboard reopens higher (no focus change): the bar is lifted by 100, its top is now 1000.
    await act(async () => { listeners.keyboardDidChangeFrame({ endCoordinates: { screenY: 1100 } }); });
    expect(currentLift).toBe(100);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(needed(bottomOf(block), UNLIFTED_TOP - 100));
    expect(bottomOf(block) - scrolled + space.sm).toBeLessThanOrEqual(UNLIFTED_TOP - 100);
  });
});
