/**
 * Brings the focused text field, and the helper or error lines under it, above a bottom bar that the keyboard lifts
 * (WizardBottomBar with useKeyboardCoverLift, WH-228).
 *
 * The wizard steps scroll with react-native-keyboard-aware-scroll-view with its automatic scroll off: the library
 * aims at the keyboard's top edge and adds the keyboard's height as empty room at the end of the content, but the
 * bar now sits on the keyboard and the scroll view ends at the bar's top, so both would be wrong. Instead the
 * focused field's block and the bar's top are measured in the window and the content is scrolled by exactly the
 * part that is missing: block bottom + space.sm ≤ bar top. The block is read from the view tree: the field's box
 * (the bordered container the input sits in), then the messages directly under it (a helper, an error or a
 * character count, each starting within space.xs of the one above), so a message that wraps to two lines counts in
 * full. No room is kept for a message that is not showing: when one appears it is revealed then (below). Where the
 * view tree cannot be read, one footnote line at the current font scale stands in for the box and its messages.
 * Measuring the bar's top makes the rule hold whatever moved the bar there: the lift on Android when the window does
 * not shrink, the shrunken window (lift 0) and iOS. A block taller than the room keeps its bottom in view; the
 * field's top may scroll out.
 *
 * When it runs: when the keyboard shows, when another field takes the focus, and when the focused block changes
 * height (a multiline field grows, a message appears, wraps or goes); while the keyboard is up these are checked
 * every FOCUS_CHECK_MS, since none of them sends a keyboard event. When the bar's top moves (the lift changed) it runs
 * again, unless the person has dragged the content since the last reveal. A re-layout that moves nothing does not
 * scroll. A field outside the scroll view (a sheet over the step) is left alone.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { space, touchTarget, typography } from '@/theme/tokens';
import type { ViewRef } from '@/types/nativeRefs';

/** A KeyboardAwareScrollView, or a list made with the same library's HOC (KeyboardAwareFlashList). */
export interface KeyboardRevealTarget {
  /** Scrolls the content down by this much from where it is now (on both platforms, despite the name). */
  scrollForExtraHeightOnAndroid: (extraHeight: number) => void;
  getScrollResponder?: () => unknown;
}

/**
 * The scroll ref a step gives both its scroll view and WizardBottomBar (useRevealScrollRef). Put
 * `onScrollBeginDrag` on the scroll view: a drag stops the bar from scrolling back when only the bar moved.
 */
export interface RevealScrollRef<T extends KeyboardRevealTarget = KeyboardRevealTarget> extends RefObject<T | null> {
  userScrolled?: boolean;
  onScrollBeginDrag?: () => void;
}

/** A ref for the step's scroll view that also notes a drag by the person (see RevealScrollRef). */
export function useRevealScrollRef<T extends KeyboardRevealTarget>(): RevealScrollRef<T> & { onScrollBeginDrag: () => void } {
  const [ref] = useState(() => {
    const created: RevealScrollRef<T> & { onScrollBeginDrag: () => void } = {
      current: null,
      userScrolled: false,
      onScrollBeginDrag: () => { created.userScrolled = true; },
    };
    return created;
  });
  return ref;
}

type MeasureCallback = (x: number, y: number, width: number, height: number) => void;
interface MeasurableInput {
  measureInWindow?: (callback: MeasureCallback) => void;
  measureLayout?: (relativeTo: unknown, onSuccess: MeasureCallback, onFail: () => void) => void;
}
/** The DOM-like reading of the view tree that React Native's new architecture gives host views. */
interface TreeNode {
  parentElement?: TreeNode | null;
  nextElementSibling?: TreeNode | null;
  getBoundingClientRect?: () => { top: number; bottom: number; height: number };
}

/** Room kept under the focused field where the view tree cannot be read: one helper or error line and a small gap. */
export function roomUnderFocusedField(): number {
  return space.xs + typography.footnote.lineHeight * PixelRatio.getFontScale() + space.sm;
}

/** How often the focus and the focused block are checked while the keyboard is up. */
const FOCUS_CHECK_MS = 150;
/** A message starts at most this far under the field's box (or the message above it); a 1 pt allowance for rounding. */
const MESSAGE_GAP = space.xs + 1;
/** How many of the input's containers can make up its box (a wrapper, the bordered box, a row of the box and buttons). */
const MAX_BOX_DEPTH = 3;
/** How many levels up from the field's box the messages are looked for. */
const MAX_BLOCK_DEPTH = 6;

/**
 * How far below the input its box may end. Every text input uses the body style: centred in a box at least
 * touchTarget high, the input leaves at most (touchTarget − body line) / 2 under it (an input that fills a taller box
 * leaves only the box's border and padding). space.xxs, the 2 dp of an error or focus border, is added as a margin;
 * it also covers the shorter input of a font scale down to about 0.82. Read when used: the body line follows the
 * language.
 */
function fieldBoxInset(): number {
  return (touchTarget - typography.body.lineHeight) / 2 + space.xxs;
}

/**
 * How far the field's block reaches below the input. First the box: the input's containers, at most MAX_BOX_DEPTH
 * levels up, that end no more than fieldBoxInset() below the input (each measured from the input, so the box never
 * reaches further than that); the first container that ends further down holds more than the box, and the climb
 * stops there. Then the messages: the views directly under the block so far (a sibling of the box or of one of its
 * containers that starts within MESSAGE_GAP of the bottom so far), climbing while the container holds nothing
 * further down. Views beside the box (same row) are skipped. Null when the view tree cannot be read.
 */
function blockBelowField(input: TreeNode): number | null {
  if (typeof input.getBoundingClientRect !== 'function') return null;
  const fieldBottom = input.getBoundingClientRect().bottom;
  const boxLimit = fieldBottom + fieldBoxInset();
  let bottom = fieldBottom;
  let node: TreeNode = input;
  for (let depth = 0; depth < MAX_BOX_DEPTH; depth++) {
    const parent = node.parentElement;
    const parentRect = parent?.getBoundingClientRect?.();
    if (!parent || !parentRect || parentRect.bottom > boxLimit) break;
    node = parent;
    bottom = Math.max(bottom, parentRect.bottom);
  }
  for (let depth = 0; depth < MAX_BLOCK_DEPTH; depth++) {
    for (let sibling = node.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      const rect = sibling.getBoundingClientRect?.();
      if (!rect || rect.height <= 0 || rect.top < bottom - 1) continue;
      if (rect.top > bottom + MESSAGE_GAP) break;
      bottom = Math.max(bottom, rect.bottom);
    }
    const parent = node.parentElement;
    const parentRect = parent?.getBoundingClientRect?.();
    if (!parent || !parentRect || parentRect.bottom > bottom + MESSAGE_GAP) break;
    node = parent;
  }
  return bottom - fieldBottom;
}

/**
 * The focused block's height, from the input's top to the bottom of its box and messages (the block the reveal
 * measures), for noticing a field that grows or a message that appears, wraps or goes; null when the view tree
 * cannot be read.
 */
function blockHeight(input: unknown): number | null {
  const node = input as TreeNode | null;
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const below = blockBelowField(node);
  return below === null ? null : node.getBoundingClientRect().height + below;
}

function currentlyFocused(): unknown {
  return TextInput.State.currentlyFocusedInput?.() ?? null;
}

export function useRevealFocusedField(
  barRef: RefObject<ViewRef | null>,
  scrollRef: RevealScrollRef | undefined,
  keyboardShown: boolean,
  revision: number
) {
  /** The focused field, the bar's top the last reveal saw, and the block's height that growth is checked against. */
  const last = useRef<{ input: unknown; barTop: number | null; height: number | null }>({ input: null, barTop: null, height: null });
  /** Each reveal takes a number; the answers of an older one are dropped. */
  const runs = useRef(0);
  const wasShown = useRef(false);

  /** `force`: the keyboard showed, the focus moved or the block changed height. Otherwise only a moved bar top counts. */
  const reveal = useCallback((force: boolean) => {
    const target = scrollRef?.current;
    const bar = barRef.current;
    const input = currentlyFocused() as MeasurableInput | null;
    if (!scrollRef || !target || !bar || typeof input?.measureInWindow !== 'function') return;
    const run = ++runs.current;
    const current = () => run === runs.current;

    const measure = () => {
      bar.measureInWindow((_barX, barTop) => {
        if (!current()) return;
        const barMoved = last.current.barTop === null || Math.abs(barTop - last.current.barTop) >= 1;
        last.current.barTop = barTop;
        if (!force && (!barMoved || scrollRef.userScrolled)) return;
        input.measureInWindow?.((_x, inputTop, _width, inputHeight) => {
          if (!current()) return;
          const below = blockBelowField(input as TreeNode);
          const room = below === null ? roomUnderFocusedField() : below + space.sm;
          last.current.height = blockHeight(input);
          scrollRef.userScrolled = false;
          const missing = Math.ceil(inputTop + inputHeight + room - barTop);
          if (missing > 0) target.scrollForExtraHeightOnAndroid(missing);
        });
      });
    };

    // Only a field inside this scroll view: measureLayout against its content fails for any other view.
    const responder = target.getScrollResponder?.() as { getInnerViewRef?: () => unknown } | null | undefined;
    const content = responder?.getInnerViewRef?.();
    if (content && typeof input.measureLayout === 'function') {
      input.measureLayout(content, () => { if (current()) measure(); }, () => {});
    } else {
      measure();
    }
  }, [barRef, scrollRef]);

  // The keyboard showed (force), or the bar was measured again (only a moved bar top scrolls).
  useEffect(() => {
    const justShown = keyboardShown && !wasShown.current;
    wasShown.current = keyboardShown;
    if (!keyboardShown) {
      runs.current++;
      last.current = { input: null, barTop: null, height: null };
      return;
    }
    if (justShown) {
      last.current = { input: currentlyFocused(), barTop: null, height: null };
      if (scrollRef) scrollRef.userScrolled = false;
    }
    reveal(justShown);
  }, [keyboardShown, revision, reveal, scrollRef]);

  // A focus change or a block that grew or shrank sends no keyboard event: check while the keyboard is up.
  useEffect(() => {
    if (!keyboardShown || !scrollRef) return;
    const timer = setInterval(() => {
      const now = currentlyFocused();
      if (now !== last.current.input) {
        last.current.input = now;
        // The new field's baseline is taken here, not left to its reveal, which may return early or never answer.
        last.current.height = blockHeight(now);
        if (now) reveal(true);
        return;
      }
      const height = blockHeight(now);
      if (height === null) return;
      // No baseline yet (the keyboard just showed and its reveal returned early or has not answered): this is it.
      if (last.current.height === null) {
        last.current.height = height;
        return;
      }
      if (Math.abs(height - last.current.height) >= 1) {
        last.current.height = height;
        reveal(true);
      }
    }, FOCUS_CHECK_MS);
    return () => clearInterval(timer);
  }, [keyboardShown, scrollRef, reveal]);

  // Unmounted: answers still on their way are dropped.
  useEffect(() => () => { runs.current++; }, []);
}

export default useRevealFocusedField;
