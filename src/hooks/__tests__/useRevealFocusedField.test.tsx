/**
 * useRevealFocusedField (WH-228): the focused field, the message line under it and a small gap end above the bar's
 * top; the content is scrolled by exactly the missing part and not at all when it is already visible. The real hook
 * on a small component; the bar, the focused input and the scroll view are recorded stand-ins (the test renderer
 * has none of them), and timers are fake.
 */
import React from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { act, render, type RenderResult } from '@testing-library/react-native';
import { space, typography } from '@/theme/tokens';
import { FIELD_BLOCK_ID, roomUnderFocusedField, useRevealFocusedField, type KeyboardRevealTarget } from '../useRevealFocusedField';

type Props = { keyboardShown: boolean; revision: number };
let barTop: number;
let focus: { top: number; height: number } | null;
const scroll = jest.fn();
const target: KeyboardRevealTarget = { scrollForExtraHeightOnAndroid: scroll };
const scrollRef: { current: KeyboardRevealTarget; userScrolled: boolean; onScrollBeginDrag: () => void } = {
  current: target,
  userScrolled: false,
  onScrollBeginDrag: () => { scrollRef.userScrolled = true; },
};
const barRef = { current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, barTop, 1080, 100) } };
let tree: RenderResult | undefined;

function Harness({ keyboardShown, revision }: Props) {
  useRevealFocusedField(barRef as never, scrollRef, keyboardShown, revision);
  return null;
}
const mount = async (props: Props) => {
  if (tree) await tree.rerender(<Harness {...props} />);
  else tree = await render(<Harness {...props} />);
};
/** What a field's own measureInWindow answers: the current `focus` place (read when asked, so it can move). */
const makeInput = () => ({
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, focus!.top, 900, focus!.height),
});
let focused: ReturnType<typeof makeInput> | null;
const room = () => space.xs + typography.footnote.lineHeight + space.sm;

beforeEach(() => {
  jest.useFakeTimers();
  scroll.mockClear();
  scrollRef.userScrolled = false;
  barTop = 1200;
  focus = { top: 1000, height: 60 };
  focused = makeInput();
  jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockImplementation((() => focused) as never);
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
});
afterEach(async () => {
  tree = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useRevealFocusedField, how far it scrolls', () => {
  it('scrolls by exactly field bottom + one message line + space.sm minus the bar top', async () => {
    focus = { top: 1150, height: 60 }; // bottom 1210, needs 1210 + room
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(1210 + room() - 1200));
    expect(room()).toBe(roomUnderFocusedField());
  });

  it('counts the message line at the current font scale', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.5);
    focus = { top: 1150, height: 60 };
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).toHaveBeenCalledWith(Math.ceil(1210 + space.xs + typography.footnote.lineHeight * 1.5 + space.sm - 1200));
  });

  it('does not scroll when the field and its line already end above the bar', async () => {
    focus = { top: 1000, height: 60 };
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not scroll when the field ends exactly at the limit', async () => {
    focus = { top: 1200 - room() - 60, height: 60 };
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does nothing while the keyboard is down, or with no focused field', async () => {
    focus = { top: 1190, height: 60 };
    await mount({ keyboardShown: false, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
    focused = null;
    await mount({ keyboardShown: true, revision: 2 });
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('useRevealFocusedField, a focus change while the keyboard stays up', () => {
  it('reveals the newly focused field within one check', async () => {
    focus = { top: 1000, height: 60 };
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
    // Another field takes the focus without any keyboard event.
    focus = { top: 1170, height: 60 };
    focused = makeInput();
    await act(async () => { jest.advanceTimersByTime(150); });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(1230 + room() - 1200));
  });

  it('does not scroll again while the same field keeps the focus', async () => {
    await mount({ keyboardShown: true, revision: 1 });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('useRevealFocusedField, its 150 ms check leaves no timer behind', () => {
  /** The check's own interval: every one started, and whether it is still running (the fake clock's setInterval). */
  let started: number[];
  let cleared: unknown[];
  beforeEach(() => {
    started = [];
    cleared = [];
    const realSet = global.setInterval;
    const realClear = global.clearInterval;
    jest.spyOn(global, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
      const id = realSet(fn, ms);
      if (ms === 150) started.push(id as unknown as number);
      return id;
    }) as never);
    jest.spyOn(global, 'clearInterval').mockImplementation(((id: never) => { cleared.push(id); realClear(id); }) as never);
  });

  it('runs every 150 ms while the keyboard is up, stops when it closes', async () => {
    await mount({ keyboardShown: true, revision: 1 });
    expect(started).toHaveLength(1);
    expect(cleared).not.toContain(started[0]);
    await mount({ keyboardShown: false, revision: 1 });
    expect(cleared).toContain(started[0]);
    expect(started).toHaveLength(1);
    focused = makeInput();
    focus = { top: 1180, height: 60 };
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(scroll).not.toHaveBeenCalled();
  });

  it('stops when the component unmounts', async () => {
    await mount({ keyboardShown: true, revision: 1 });
    expect(started).toHaveLength(1);
    await tree!.unmount();
    tree = undefined;
    expect(cleared).toContain(started[0]);
  });

  it('never starts without a scroll view', async () => {
    tree = await render(<NoScroll />);
    expect(started).toHaveLength(0);
  });
});

function NoScroll() {
  useRevealFocusedField(barRef as never, undefined, true, 1);
  return null;
}

/** A field that reads the view tree the way the new architecture does: its own rect, and its declared block (a parent marked FIELD_BLOCK_ID). */
type Rect = { top: number; bottom: number; height: number };
type TreeNodeStub = { id?: string; rect: Rect; parentElement: TreeNodeStub | null; getBoundingClientRect: () => Rect };
const treeNode = (rect: Rect, id?: string): TreeNodeStub => {
  const created: TreeNodeStub = { id, rect, parentElement: null, getBoundingClientRect: () => created.rect };
  return created;
};
let field: TreeNodeStub;
let block: TreeNodeStub;
/** Places the field from `focus` (so measureInWindow and the tree agree) and its block, which holds a message of that height under it (space.xs gap). */
const placeTree = (messageHeight: number | null) => {
  field.rect = { top: focus!.top, bottom: focus!.top + focus!.height, height: focus!.height };
  const blockBottom = messageHeight === null ? field.rect.bottom : field.rect.bottom + space.xs + messageHeight;
  block.rect = { top: field.rect.top, bottom: blockBottom, height: blockBottom - field.rect.top };
};
const useTreeInput = () => {
  field = treeNode({ top: 0, bottom: 0, height: 0 });
  block = treeNode({ top: 0, bottom: 0, height: 0 }, FIELD_BLOCK_ID);
  field.parentElement = block;
  const input = { ...makeInput(), getBoundingClientRect: () => field.rect, parentElement: block };
  focused = input as never;
};

describe('useRevealFocusedField, a re-layout and a drag', () => {
  it('a re-layout that moves nothing does not scroll again', async () => {
    focus = { top: 1150, height: 60 };
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).toHaveBeenCalledTimes(1);
    await mount({ keyboardShown: true, revision: 2 });
    await mount({ keyboardShown: true, revision: 3 });
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('a bar that really moved scrolls again', async () => {
    focus = { top: 1150, height: 60 };
    await mount({ keyboardShown: true, revision: 1 });
    barTop = 1100;
    await mount({ keyboardShown: true, revision: 2 });
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith(Math.ceil(1210 + room() - 1100));
  });

  it('a drag, then a bar move, does not scroll back', async () => {
    focus = { top: 1150, height: 60 };
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).toHaveBeenCalledTimes(1);
    scrollRef.onScrollBeginDrag();
    barTop = 1100;
    await mount({ keyboardShown: true, revision: 2 });
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});

describe('useRevealFocusedField, a block that grows while the keyboard is up', () => {
  it('a multiline field that grows is revealed again', async () => {
    focus = { top: 1000, height: 60 };
    useTreeInput();
    placeTree(null);
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
    focus = { top: 1000, height: 200 }; // typed until it wrapped: bottom 1200
    placeTree(null);
    await act(async () => { jest.advanceTimersByTime(150); });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(space.sm);
  });

  it('a message that appears under the field is revealed, counted in full', async () => {
    focus = { top: 1100, height: 60 }; // bottom 1160, fits with no message
    useTreeInput();
    placeTree(null);
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
    placeTree(30); // bottom 1194, + space.sm passes the bar
    await act(async () => { jest.advanceTimersByTime(150); });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(1160 + space.xs + 30 + space.sm - 1200));
  });

  it('a message that wraps to two lines is revealed by the second line too', async () => {
    focus = { top: 1100, height: 60 };
    useTreeInput();
    placeTree(20);
    await mount({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
    placeTree(40);
    await act(async () => { jest.advanceTimersByTime(150); });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(1160 + space.xs + 40 + space.sm - 1200));
  });

  it('a block that did not change height is not scrolled again', async () => {
    focus = { top: 1100, height: 60 };
    useTreeInput();
    placeTree(20);
    await mount({ keyboardShown: true, revision: 1 });
    await act(async () => { jest.advanceTimersByTime(1500); });
    expect(scroll).not.toHaveBeenCalled();
  });
});
