/**
 * useRevealFocusedField (WH-228): the focused field, the message line under it and a small gap end above the bar's
 * top; the content is scrolled by exactly the missing part and not at all when it is already visible. The real hook
 * on a small component; the bar, the focused input and the scroll view are recorded stand-ins (the test renderer
 * has none of them), and timers are fake.
 */
import React from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { space, typography } from '@/theme/tokens';
import { roomUnderFocusedField, useRevealFocusedField, type KeyboardRevealTarget } from '../useRevealFocusedField';

type Props = { keyboardShown: boolean; revision: number };
let barTop: number;
let focus: { top: number; height: number } | null;
const scroll = jest.fn();
const target: KeyboardRevealTarget = { scrollForExtraHeightOnAndroid: scroll };
const scrollRef = { current: target };
const barRef = { current: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, barTop, 1080, 100) } };
let tree: ReactTestRenderer | undefined;

function Harness({ keyboardShown, revision }: Props) {
  useRevealFocusedField(barRef as never, scrollRef, keyboardShown, revision);
  return null;
}
const render = async (props: Props) => {
  await act(async () => {
    if (tree) tree.update(<Harness {...props} />);
    else tree = create(<Harness {...props} />);
  });
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
  barTop = 1200;
  focus = { top: 1000, height: 60 };
  focused = makeInput();
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

describe('useRevealFocusedField, how far it scrolls', () => {
  it('scrolls by exactly field bottom + one message line + space.sm minus the bar top', async () => {
    focus = { top: 1150, height: 60 }; // bottom 1210, needs 1210 + room
    await render({ keyboardShown: true, revision: 1 });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(1210 + room() - 1200));
    expect(room()).toBe(roomUnderFocusedField());
  });

  it('counts the message line at the current font scale', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.5);
    focus = { top: 1150, height: 60 };
    await render({ keyboardShown: true, revision: 1 });
    expect(scroll).toHaveBeenCalledWith(Math.ceil(1210 + space.xs + typography.footnote.lineHeight * 1.5 + space.sm - 1200));
  });

  it('does not scroll when the field and its line already end above the bar', async () => {
    focus = { top: 1000, height: 60 };
    await render({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does not scroll when the field ends exactly at the limit', async () => {
    focus = { top: 1200 - room() - 60, height: 60 };
    await render({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
  });

  it('does nothing while the keyboard is down, or with no focused field', async () => {
    focus = { top: 1190, height: 60 };
    await render({ keyboardShown: false, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
    focused = null;
    await render({ keyboardShown: true, revision: 2 });
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('useRevealFocusedField, a focus change while the keyboard stays up', () => {
  it('reveals the newly focused field within one check', async () => {
    focus = { top: 1000, height: 60 };
    await render({ keyboardShown: true, revision: 1 });
    expect(scroll).not.toHaveBeenCalled();
    // Another field takes the focus without any keyboard event.
    focus = { top: 1170, height: 60 };
    focused = makeInput();
    await act(async () => { jest.advanceTimersByTime(150); });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(Math.ceil(1230 + room() - 1200));
  });

  it('does not scroll again while the same field keeps the focus', async () => {
    await render({ keyboardShown: true, revision: 1 });
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
    await render({ keyboardShown: true, revision: 1 });
    expect(started).toHaveLength(1);
    expect(cleared).not.toContain(started[0]);
    await render({ keyboardShown: false, revision: 1 });
    expect(cleared).toContain(started[0]);
    expect(started).toHaveLength(1);
    focused = makeInput();
    focus = { top: 1180, height: 60 };
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(scroll).not.toHaveBeenCalled();
  });

  it('stops when the component unmounts', async () => {
    await render({ keyboardShown: true, revision: 1 });
    expect(started).toHaveLength(1);
    await act(async () => { tree!.unmount(); });
    tree = undefined;
    expect(cleared).toContain(started[0]);
  });

  it('never starts without a scroll view', async () => {
    await act(async () => { tree = create(<NoScroll />); });
    expect(started).toHaveLength(0);
  });
});

function NoScroll() {
  useRevealFocusedField(barRef as never, undefined, true, 1);
  return null;
}
