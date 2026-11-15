/**
 * Brings the focused text field, and the helper or error lines under it, above a bottom bar that the keyboard lifts
 * (WizardBottomBar with useKeyboardCoverLift, WH-228).
 *
 * The wizard steps scroll with react-native-keyboard-aware-scroll-view with its automatic scroll off: the library
 * aims at the keyboard's top edge and adds the keyboard's height as empty room at the end of the content, but the
 * bar now sits on the keyboard and the scroll view ends at the bar's top, so both would be wrong. Instead the
 * focused field's block and the bar's top are measured in the window and the content is scrolled by exactly the
 * part that is missing: block bottom + space.sm ≤ bar top. The block is declared by the screen, not guessed: the
 * focused input's nearest ancestor View with `nativeID={FIELD_BLOCK_ID}`, which holds the field's box and the
 * messages under it (a helper, an error or a character count) and ends at the last of them, so a message that wraps
 * to two lines counts in full. An input with no such ancestor is its own block (a fallback: its box may then end
 * behind the bar). No room is kept for a message that is not showing: when one appears it is revealed then (below).
 * Where the view tree cannot be read, one footnote line at the current font scale stands in for the box and its
 * messages. Measuring the bar's top makes the rule hold whatever moved the bar there: the lift on Android when the
 * window does not shrink, the shrunken window (lift 0) and iOS. A block taller than the room keeps its bottom in
 * view; the field's top may scroll out.
 *
 * Marking a field: every text input of a wizard step has a block. Put `nativeID={FIELD_BLOCK_ID}` on the smallest
 * View that holds the field's box and every message that can show under it and ends at the last of them (no bottom
 * padding inside it, no other field, not the next row); a field with nothing under it marks its box.
 *
 * When it runs: when the keyboard shows, when another field takes the focus, when the focused block changes height
 * (a multiline field grows, a message appears, wraps or goes) and when it moves within the scroll content without
 * growing (text above the field appears or wraps; measured within the content, so scrolling never counts as a move);
 * while the keyboard is up these are checked every FOCUS_CHECK_MS, since none of them sends a keyboard event. When the
 * bar's top moves (the lift changed) it runs again. After each of these the same check measures the block again once the content is at rest and scrolls by what
 * is still missing, until it finds the block in place, so the result is the same however the keyboard came up (a new
 * focus, or a keyboard that opens again on a field that kept the focus, where the reveals run while the scroll view
 * is still being resized and scrolled). Once in place it does nothing more, so a scroll by the step itself (to a
 * field with an error) is not undone. After a drag by the person only a focus change or a block that changed height
 * scrolls again. A tap of the person's on the page away from the focused field (opening a group) holds the same way,
 * until the person types in that field or taps it, another field takes the focus or the keyboard shows again: what
 * the person changed on the page is not undone (WH-243). A re-layout that moves nothing does not scroll. A scroll asked for is judged only from two later
 * measurings that find the content at rest; found at rest still at the place it was asked from, the check asks again,
 * at most MAX_REASKS_IN_PLACE times, then takes it that the content cannot go further. A field outside the scroll view
 * (a sheet over the step) is left alone.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { space, typography } from '@/theme/tokens';
import type { ViewRef } from '@/types/nativeRefs';

/** A KeyboardAwareScrollView, or a list made with the same library's HOC (KeyboardAwareFlashList). */
export interface KeyboardRevealTarget {
  /** Scrolls the content down by this much from where it is now (on both platforms, despite the name). */
  scrollForExtraHeightOnAndroid: (extraHeight: number) => void;
  getScrollResponder?: () => unknown;
}

/**
 * What the person does on the step's scroll view, as the reveal needs it: a drag (`onScrollBeginDrag`), a touch
 * (`onTouchStartCapture`) and typing (`onChangeCapture`: a TextInput's change event bubbles up to the scroll view, so
 * no field needs a handler of its own). Spread them on the scroll view: `{...scrollRef.revealHandlers}`.
 */
export interface RevealScrollHandlers {
  onScrollBeginDrag: () => void;
  onTouchStartCapture: (event: { nativeEvent: { pageX: number; pageY: number } }) => void;
  onChangeCapture: (event: { nativeEvent?: { text?: unknown } }) => void;
}

/**
 * The scroll ref a step gives both its scroll view and WizardBottomBar (useRevealScrollRef). The person's own changes
 * to the page are not undone by the reveal: after a drag (`userScrolled`) or a tap on the page away from the focused
 * field (`userTapped`), a moved bar, a field the page moved and the at-rest check scroll nothing. Typing in the focused
 * field or a tap on it asks for a reveal again (`revealAsked`) and ends a tap's hold, never a drag's; a focus change or
 * the keyboard showing again ends both.
 */
export interface RevealScrollRef<T extends KeyboardRevealTarget = KeyboardRevealTarget> extends RefObject<T | null> {
  userScrolled?: boolean;
  userTapped?: boolean;
  revealAsked?: boolean;
  onScrollBeginDrag?: () => void;
  revealHandlers?: RevealScrollHandlers;
}

/** A ref for the step's scroll view that also notes what the person does on it (see RevealScrollRef). */
export function useRevealScrollRef<T extends KeyboardRevealTarget>(): RevealScrollRef<T> & {
  onScrollBeginDrag: () => void;
  revealHandlers: RevealScrollHandlers;
} {
  const [ref] = useState(() => {
    const onScrollBeginDrag = () => { created.userScrolled = true; };
    const created: RevealScrollRef<T> & { onScrollBeginDrag: () => void; revealHandlers: RevealScrollHandlers } = {
      current: null,
      userScrolled: false,
      userTapped: false,
      revealAsked: false,
      onScrollBeginDrag,
      revealHandlers: {
        onScrollBeginDrag,
        // A touch with a field focused: on that field's block it asks for the field again; anywhere else on the page
        // (a group head, a picker) it is the person's change, which the reveal leaves as it is. A touch on another
        // field focuses it, and the focus change ends the hold.
        onTouchStartCapture: (event) => {
          const input = currentlyFocused() as TreeNode | null;
          if (!input) return;
          const rect = fieldBlock(input).getBoundingClientRect?.();
          const { pageX, pageY } = event.nativeEvent;
          const onField = !rect || (pageY >= rect.top && pageY <= rect.bottom && pageX >= rect.left && pageX <= rect.right);
          if (onField) {
            created.userTapped = false;
            created.revealAsked = true;
          } else {
            created.userTapped = true;
          }
        },
        // Typing: only a text field's change event carries `text` (a switch's carries `value`).
        onChangeCapture: (event) => {
          if (typeof event?.nativeEvent?.text !== 'string') return;
          created.userTapped = false;
          created.revealAsked = true;
        },
      },
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
/**
 * The DOM-like reading of the view tree that React Native's new architecture gives host views (ReactNativeElement):
 * `id` is the view's `id` or `nativeID` prop.
 */
interface TreeNode {
  id?: string;
  parentElement?: TreeNode | null;
  getBoundingClientRect?: () => { top: number; bottom: number; height: number; left: number; right: number };
}

/** The `nativeID` of the View that holds a field's box and the messages under it (see the top of this file). */
export const FIELD_BLOCK_ID = 'field-block';

/** Room kept under the focused field where the view tree cannot be read: one helper or error line and a small gap. */
export function roomUnderFocusedField(): number {
  return space.xs + typography.footnote.lineHeight * PixelRatio.getFontScale() + space.sm;
}

/** How often the focus and the focused block are checked while the keyboard is up. */
const FOCUS_CHECK_MS = 150;
/** How many levels above the input its declared block is looked for (the wizard steps' marks are 1 to 3 levels up). */
const MAX_BLOCK_DEPTH = 12;

/** The focused input's block: its nearest ancestor marked FIELD_BLOCK_ID, at most MAX_BLOCK_DEPTH levels up, else the input. */
function fieldBlock(input: TreeNode): TreeNode {
  let node = input.parentElement;
  for (let depth = 0; node && depth < MAX_BLOCK_DEPTH; depth++) {
    if (node.id === FIELD_BLOCK_ID) return node;
    node = node.parentElement;
  }
  return input;
}

/** How far the focused input's block reaches below the input; null when the view tree cannot be read. */
function blockBelowField(input: TreeNode): number | null {
  if (typeof input.getBoundingClientRect !== 'function') return null;
  const fieldBottom = input.getBoundingClientRect().bottom;
  const blockBottom = fieldBlock(input).getBoundingClientRect?.().bottom ?? fieldBottom;
  return Math.max(0, blockBottom - fieldBottom);
}

/**
 * The focused block's height, from the input's top to the block's bottom (the block the reveal measures), for
 * noticing a field that grows or a message that appears, wraps or goes; null when the view tree cannot be read.
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

/**
 * The focused field's top within the scroll view's content, not the window: scrolling, the person's or a reveal's,
 * leaves it as it is, so a change means the page moved the field (text above it that appeared or wrapped). Null where
 * it cannot be measured (no content view, a field outside the scroll view).
 */
function measureTopInContent(input: unknown, target: KeyboardRevealTarget | null | undefined, done: (top: number | null) => void) {
  const measurable = input as MeasurableInput | null;
  const responder = target?.getScrollResponder?.() as { getInnerViewRef?: () => unknown } | null | undefined;
  const content = responder?.getInnerViewRef?.();
  if (!content || typeof measurable?.measureLayout !== 'function') {
    done(null);
    return;
  }
  measurable.measureLayout(content, (_x, y) => done(y), () => done(null));
}

/**
 * How many times the 150 ms check asks again for a scroll from the same place, with the content at rest there, before
 * it takes it that the content cannot go further and stops. Asking again is safe: the library scrolls to an absolute
 * offset (the offset its onScroll last reported + what is missing, and Fabric's measured layout follows every scroll
 * change just before that event), so a scroll that has not shown yet still lands on the same target. More than one,
 * because a busy UI thread (a list drawing its rows) can hold a scroll back for longer than a check.
 */
const MAX_REASKS_IN_PLACE = 3;

interface LastSeen {
  input: unknown;
  barTop: number | null;
  height: number | null;
  contentTop: number | null;
  top: number | null;
  tried: number | null;
  asks: number;
  settling: boolean;
}
const emptyLastSeen = (input: unknown): LastSeen => ({
  input,
  barTop: null,
  height: null,
  contentTop: null,
  top: null,
  tried: null,
  asks: 0,
  settling: false,
});

export function useRevealFocusedField(
  barRef: RefObject<ViewRef | null>,
  scrollRef: RevealScrollRef | undefined,
  keyboardShown: boolean,
  revision: number
) {
  /**
   * What the reveals saw: the focused field, the bar's top, the block's height that growth is checked against, the
   * field's top in the window at the last measuring (to tell content at rest; cleared when a scroll is asked for, so
   * only two measurings after it can say the content is at rest), the field's top when a scroll was last asked for and
   * how many times it was asked from there (`tried`, `asks`: see MAX_REASKS_IN_PLACE; every reveal but a check starts
   * them afresh), and whether a reveal has yet to be seen in place at rest (`settling`; only then does the 150 ms check
   * measure).
   */
  const last = useRef<LastSeen>(emptyLastSeen(null));
  /** Each reveal takes a number; the answers of an older one are dropped. */
  const runs = useRef(0);
  const wasShown = useRef(false);

  /**
   * `force`: the keyboard showed, the focus moved or the block changed height: always measured. `bar`: the bar was
   * measured again: only a moved bar top counts. `move`: the page moved the field within the content (text above it
   * appeared or wrapped), or the person typed in the field or tapped it. These leave the block settling, with a fresh
   * count of asks. `check`: the 150 ms check while it settles: content at rest (the field where the last two
   * measurings saw it) that ends too low is scrolled again; found in place, or still at the same place after
   * MAX_REASKS_IN_PLACE asks more, it stops. `bar`, `move` and `check` wait while the person's drag or tap on the page
   * holds.
   */
  const reveal = useCallback((kind: 'force' | 'bar' | 'move' | 'check') => {
    // Settled: a scroll by the step itself (to a field with an error) is not undone.
    if (kind === 'check' && !last.current.settling) return;
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
        if (barMoved) {
          last.current.tried = null;
          last.current.asks = 0;
        }
        // The person's own drag or tap on the page holds everything but a forced reveal (WH-243).
        if (kind !== 'force' && (scrollRef.userScrolled || scrollRef.userTapped)) return;
        if (kind === 'bar' && !barMoved) return;
        input.measureInWindow?.((_x, inputTop, _width, inputHeight) => {
          if (!current()) return;
          const atRest = last.current.top !== null && Math.abs(inputTop - last.current.top) < 1;
          last.current.top = inputTop;
          if (kind === 'check' && !atRest) return;
          if (kind !== 'check') {
            // Every reveal gets the same chance to settle, whatever the checks after an earlier one did (WH-242).
            last.current.settling = true;
            last.current.tried = null;
            last.current.asks = 0;
          }
          const below = blockBelowField(input as TreeNode);
          const room = below === null ? roomUnderFocusedField() : below + space.sm;
          last.current.height = blockHeight(input);
          scrollRef.userScrolled = false;
          scrollRef.userTapped = false;
          const missing = Math.ceil(inputTop + inputHeight + room - barTop);
          if (missing <= 0) {
            last.current.tried = null;
            last.current.asks = 0;
            if (kind === 'check') last.current.settling = false;
            return;
          }
          // Asked before from this very place, the content at rest there since: ask again, a few times at most.
          const samePlace = last.current.tried !== null && Math.abs(inputTop - last.current.tried) < 1;
          if (kind === 'check' && samePlace && last.current.asks > MAX_REASKS_IN_PLACE) {
            last.current.settling = false;
            return;
          }
          last.current.asks = samePlace ? last.current.asks + 1 : 1;
          last.current.tried = inputTop;
          // Whether this scroll moved the content is told only by two later measurings, not by this one.
          last.current.top = null;
          target.scrollForExtraHeightOnAndroid(missing);
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
      last.current = emptyLastSeen(null);
      return;
    }
    if (justShown) {
      last.current = emptyLastSeen(currentlyFocused());
      if (scrollRef) {
        scrollRef.userScrolled = false;
        scrollRef.userTapped = false;
        scrollRef.revealAsked = false;
      }
    }
    reveal(justShown ? 'force' : 'bar');
  }, [keyboardShown, revision, reveal, scrollRef]);

  // Every 150 ms while the keyboard is up: a focus change, a block that grew or shrank, a block that the page moved and
  // the person typing in the field send no keyboard event (a move waits while the person's drag or tap holds, as a
  // moved bar does), and
  // the reveals above can run before the content has settled (a keyboard that opens again on a field that kept the
  // focus: the bar's lift shrinks the scroll view, which scrolls the focused field to its own new bottom edge, while
  // the reveal's own scroll may not have shown yet). So after a reveal the check measures the field again once it is
  // at rest and scrolls by what is still missing, until it finds the block in place, a drag holds, or the content
  // stays where it was through MAX_REASKS_IN_PLACE more asks.
  useEffect(() => {
    if (!keyboardShown || !scrollRef) return;
    const timer = setInterval(() => {
      const now = currentlyFocused();
      if (now !== last.current.input) {
        last.current = { ...emptyLastSeen(now), barTop: last.current.barTop };
        // The new field's baselines are taken here, not left to its reveal, which may return early or never answer.
        last.current.height = blockHeight(now);
        measureTopInContent(now, scrollRef.current, (top) => { last.current.contentTop = top; });
        // A drag or a tap before the focus moved holds no longer; the focus change itself is the reveal asked for.
        scrollRef.userScrolled = false;
        scrollRef.userTapped = false;
        scrollRef.revealAsked = false;
        if (now) reveal('force');
        return;
      }
      if (!now) return;
      const height = blockHeight(now);
      if (height !== null && last.current.height !== null && Math.abs(height - last.current.height) >= 1) {
        last.current.height = height;
        // A block that grew can have moved too: its place is taken again at the next check, not counted as a move.
        last.current.contentTop = null;
        scrollRef.userScrolled = false;
        scrollRef.userTapped = false;
        reveal('force');
        return;
      }
      // No baseline yet (the keyboard just showed and its reveal returned early or has not answered): this is it.
      if (height !== null && last.current.height === null) last.current.height = height;
      // The person typed in the focused field or tapped it (WH-243): reveal it again, unless a drag holds.
      const asked = scrollRef.revealAsked === true;
      scrollRef.revealAsked = false;
      // The block moved within the content without growing (WH-240): its bottom moved as far as the field did. After
      // the person's tap on the page the move is theirs: the baseline follows it, and the reveal waits (above).
      measureTopInContent(now, scrollRef.current, (contentTop) => {
        if (last.current.input !== now) return;
        let moved = false;
        if (contentTop !== null) {
          if (last.current.contentTop === null) {
            last.current.contentTop = contentTop;
          } else if (Math.abs(contentTop - last.current.contentTop) >= 1) {
            last.current.contentTop = contentTop;
            moved = true;
          }
        }
        reveal(moved || asked ? 'move' : 'check');
      });
    }, FOCUS_CHECK_MS);
    return () => clearInterval(timer);
  }, [keyboardShown, scrollRef, reveal]);

  // Unmounted: answers still on their way are dropped.
  useEffect(() => () => { runs.current++; }, []);
}

export default useRevealFocusedField;
