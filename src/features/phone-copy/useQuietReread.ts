/**
 * The quiet re-read of a list on screen after a sync that changed what it shows (WH-299,
 * product/tech/app-offline-read-from-copy.md section 11.1; Product's PR9 and PR9a): no spinner and no jump, and nothing
 * is read or replaced while a finger is on the list, while it scrolls, for a second after it comes to rest, while it is
 * not in view, or while it is loading something else.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { subscribeCopyChanges } from './copyChanges';
import type { EntityName } from './copySchema';

/** How long the list rests after a touch or a scroll before it may change. */
export const REREAD_REST_MS = 1000;

export interface QuietRereadOptions {
  /** The records the list shows. */
  kinds: ReadonlySet<EntityName>;
  /** The list shows rows of the phone copy; otherwise nothing is read again. */
  active: () => boolean;
  /** No load of the list is in flight. */
  idle: () => boolean;
  /** Reads the list again, then replaces its rows (unless it is no longer at rest: then it calls `markDue`). */
  read: () => Promise<void>;
}

export interface QuietReread {
  /** Read again as soon as the list may. */
  markDue: () => void;
  /** A load of the whole list has begun: it brings what changed. */
  clear: () => void;
  /** A load has ended: a re-read that waited for it may go. */
  settle: () => void;
  setFocused: (focused: boolean) => void;
  /** In view, untouched, still and idle: the rows may be replaced. */
  atRest: () => boolean;
  /** For the list. */
  scrollHandlers: {
    onScrollBeginDrag: () => void;
    onScrollEndDrag: () => void;
    onMomentumScrollBegin: () => void;
    onMomentumScrollEnd: () => void;
  };
  /** For the view around the list: a press on a row holds the re-read too. */
  touchHandlers: { onTouchStart: () => void; onTouchEnd: () => void; onTouchCancel: () => void };
}

function createController() {
  const state = {
    options: null as QuietRereadOptions | null,
    due: false,
    reading: false,
    focused: true,
    touching: false,
    scrolling: false,
    rest: null as ReturnType<typeof setTimeout> | null,
    live: true,
  };
  const atRest = () =>
    state.live && state.focused && !state.touching && !state.scrolling && state.rest === null && state.options?.idle() === true;
  const run = () => {
    const options = state.options;
    if (!options || !state.due || state.reading || !atRest()) return;
    state.due = false;
    if (!options.active()) return;
    state.reading = true;
    void options
      .read()
      // A re-read that fails leaves the rows as they are; the next change or return reads again.
      .catch(() => undefined)
      .finally(() => {
        state.reading = false;
        run();
      });
  };
  const hold = () => {
    if (state.rest !== null) clearTimeout(state.rest);
    state.rest = null;
  };
  const release = () => {
    hold();
    if (state.touching || state.scrolling) return;
    state.rest = setTimeout(() => {
      state.rest = null;
      run();
    }, REREAD_REST_MS);
  };
  const scrollStarts = () => {
    state.scrolling = true;
    hold();
  };
  const scrollEnds = () => {
    state.scrolling = false;
    release();
  };
  const touchEnds = () => {
    state.touching = false;
    release();
  };
  const markDue = () => {
    state.due = true;
    run();
  };
  const api: QuietReread = {
    markDue,
    clear: () => {
      state.due = false;
    },
    settle: run,
    setFocused: focused => {
      state.focused = focused;
      if (focused) run();
    },
    atRest,
    scrollHandlers: {
      onScrollBeginDrag: scrollStarts,
      // A drag with no fling ends here; a fling begins right after and holds again.
      onScrollEndDrag: scrollEnds,
      onMomentumScrollBegin: scrollStarts,
      onMomentumScrollEnd: scrollEnds,
    },
    touchHandlers: {
      onTouchStart: () => {
        state.touching = true;
        hold();
      },
      onTouchEnd: touchEnds,
      onTouchCancel: touchEnds,
    },
  };
  return {
    api,
    use: (options: QuietRereadOptions) => {
      state.options = options;
    },
    /** Follows the copy's changes while the list is mounted. */
    attach: () => {
      state.live = true;
      const stop = subscribeCopyChanges(({ kinds }) => {
        if ([...(state.options?.kinds ?? [])].some(kind => kinds.has(kind))) markDue();
      });
      return () => {
        state.live = false;
        hold();
        stop();
      };
    },
  };
}

export function useQuietReread(options: QuietRereadOptions): QuietReread {
  const [controller] = useState(createController);
  // Before any effect of this render can ask for a re-read.
  useLayoutEffect(() => controller.use(options));
  useEffect(() => controller.attach(), [controller]);
  return controller.api;
}
