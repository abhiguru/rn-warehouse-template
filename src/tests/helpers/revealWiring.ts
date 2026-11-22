/**
 * WH-243 wiring check, shared by the tests of the wizard steps and the invoice items editor: the scroll view (or
 * list) of a step must carry the handlers of the step's own useRevealScrollRef, the very same functions
 * (identity), so a step that drops `{...scrollRef.revealHandlers}` fails.
 *
 * A test file records the refs a step creates by wrapping the hook:
 *
 *   jest.mock('@/hooks/useRevealFocusedField', () => require('@/tests/helpers/revealWiring').recordRevealRefs());
 */
import { expect, jest } from '@jest/globals';
import type { Host } from '@/tests/helpers/fieldBlock';
import type { useRevealScrollRef } from '@/hooks/useRevealFocusedField';

export type RecordedRevealRef = ReturnType<typeof useRevealScrollRef>;

/** The refs a step made, in order; a test empties it before it renders. */
export const recordedRevealRefs: RecordedRevealRef[] = [];

/** The hook module with useRevealScrollRef wrapped so that every ref it makes is pushed on recordedRevealRefs. */
export function recordRevealRefs() {
  const actual = jest.requireActual<typeof import('@/hooks/useRevealFocusedField')>('@/hooks/useRevealFocusedField');
  return {
    ...actual,
    useRevealScrollRef: (...args: unknown[]) => {
      const ref = (actual.useRevealScrollRef as (...a: unknown[]) => RecordedRevealRef)(...args);
      if (!recordedRevealRefs.includes(ref)) recordedRevealRefs.push(ref);
      return ref;
    },
  };
}

export const REVEAL_HANDLER_NAMES = ['onScrollBeginDrag', 'onTouchStartCapture', 'onTouchEndCapture', 'onTouchCancelCapture', 'onChangeCapture'] as const;

/** `node` (a scroll view or list) carries the five handlers (WH-249 added touch end and touch cancel) of `ref.revealHandlers`, by identity. */
export function expectRevealWired(node: Host, ref: RecordedRevealRef) {
  for (const name of REVEAL_HANDLER_NAMES) {
    expect(typeof ref.revealHandlers[name]).toBe('function');
    expect(node.props[name]).toBe(ref.revealHandlers[name]);
  }
}
