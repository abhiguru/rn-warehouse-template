/**
 * Brings the focused text field, and the helper or error line under it, above a bottom bar that the keyboard lifts
 * (WizardBottomBar with useKeyboardCoverLift, WH-228).
 *
 * The wizard steps scroll with react-native-keyboard-aware-scroll-view with its automatic scroll off: the library
 * aims at the keyboard's top edge and adds the keyboard's height as empty room at the end of the content, but the
 * bar now sits on the keyboard and the scroll view ends at the bar's top, so both would be wrong. Instead, each time
 * the bar has been measured while the keyboard is up (the lift is drawn by then), the focused field and the bar's
 * top are measured in the window and the content is scrolled by exactly the part that is missing:
 * field bottom + one message line (space.xs + a footnote line at the current font scale) + space.sm ≤ bar top.
 * Measuring the bar's top makes the rule hold whatever moved the bar there: the lift on Android when the window does
 * not shrink, the shrunken window (lift 0) and iOS. A field outside the scroll view (a sheet over the step) is left
 * alone.
 */
import { useEffect, type RefObject } from 'react';
import { PixelRatio, TextInput } from 'react-native';
import { space, typography } from '@/theme/tokens';
import type { ViewRef } from '@/types/nativeRefs';

/** A KeyboardAwareScrollView, or a list made with the same library's HOC (KeyboardAwareFlashList). */
export interface KeyboardRevealTarget {
  /** Scrolls the content down by this much from where it is now (on both platforms, despite the name). */
  scrollForExtraHeightOnAndroid: (extraHeight: number) => void;
  getScrollResponder?: () => unknown;
}

type MeasureCallback = (x: number, y: number, width: number, height: number) => void;
interface MeasurableInput {
  measureInWindow?: (callback: MeasureCallback) => void;
  measureLayout?: (relativeTo: unknown, onSuccess: MeasureCallback, onFail: () => void) => void;
}

/** Room kept between the focused field's bottom and the bar's top: one helper or error line and a small gap. */
export function roomUnderFocusedField(): number {
  return space.xs + typography.footnote.lineHeight * PixelRatio.getFontScale() + space.sm;
}

export function useRevealFocusedField(
  barRef: RefObject<ViewRef | null>,
  scrollRef: RefObject<KeyboardRevealTarget | null> | undefined,
  keyboardShown: boolean,
  revision: number
) {
  useEffect(() => {
    if (!keyboardShown || !scrollRef) return;
    const target = scrollRef.current;
    const bar = barRef.current;
    const input = (TextInput.State.currentlyFocusedInput?.() ?? null) as MeasurableInput | null;
    if (!target || !bar || typeof input?.measureInWindow !== 'function') return;
    let cancelled = false;

    const reveal = () => {
      bar.measureInWindow((_barX, barTop) => {
        input.measureInWindow?.((_x, inputTop, _width, inputHeight) => {
          if (cancelled) return;
          const missing = Math.ceil(inputTop + inputHeight + roomUnderFocusedField() - barTop);
          if (missing > 0) target.scrollForExtraHeightOnAndroid(missing);
        });
      });
    };

    // Only a field inside this scroll view: measureLayout against its content fails for any other view.
    const responder = target.getScrollResponder?.() as { getInnerViewRef?: () => unknown } | null | undefined;
    const content = responder?.getInnerViewRef?.();
    if (content && typeof input.measureLayout === 'function') {
      input.measureLayout(content, () => { if (!cancelled) reveal(); }, () => {});
    } else {
      reveal();
    }
    return () => { cancelled = true; };
  }, [barRef, scrollRef, keyboardShown, revision]);
}

export default useRevealFocusedField;
