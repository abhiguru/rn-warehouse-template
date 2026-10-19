/**
 * The Next key of the items editor walks the fields in the order the screen shows them. Each step
 * scrolls the field's row up with `scrollToRow` (the keyboard covers the lower part of the screen);
 * a field the list has not drawn (it is virtualized) takes the focus as soon as it mounts.
 */
import { useCallback, useMemo, useRef } from 'react';
import type { TextInput } from 'react-native';

export interface FieldWalk {
  /** Called with the input when it mounts and with null when it unmounts. */
  register: (key: string, node: TextInput | null) => void;
  /** Focus a field, scrolling its row up first (also when it is drawn, so it clears the keyboard). */
  focusKey: (key: string) => void;
  /** Scroll a field's row up into the visible part (a tap on a cell, before it takes the focus). */
  scrollTo: (key: string) => void;
  /** Whether any registered input has the focus. */
  anyFocused: () => boolean;
  /** Takes the focus off a field (its error shows and the next tap selects its text again). */
  blurKey: (key: string) => void;
  /** The keyboard's Next key on a field: the next field, or the keyboard closes after the last. */
  next: (key: string) => void;
}

interface Options {
  order: readonly string[];
  rowOf: ReadonlyMap<string, number>;
  scrollToRow: (row: number) => void;
}

export function useFieldWalk({ order, rowOf, scrollToRow }: Options): FieldWalk {
  const nodes = useRef(new Map<string, TextInput>()).current;
  const pending = useRef<string | null>(null);
  const latest = useRef({ order, rowOf, scrollToRow });
  latest.current = { order, rowOf, scrollToRow };

  return useMemo<FieldWalk>(() => {
    const focusKey = (key: string) => {
      const row = latest.current.rowOf.get(key);
      // Every step asks for the row to be scrolled up into the visible part, also when it is drawn: the
      // keyboard covers the lower part of the screen, and a field the list did not move would stay under it.
      if (row !== undefined) latest.current.scrollToRow(row);
      // Looked up after the scroll: the list may have drawn the row in the meantime.
      const node = nodes.get(key);
      if (node) {
        pending.current = null;
        node.focus();
        return;
      }
      if (row === undefined) return;
      pending.current = key;
    };
    return {
      register: (key, node) => {
        if (!node) {
          nodes.delete(key);
          return;
        }
        nodes.set(key, node);
        if (pending.current === key) {
          pending.current = null;
          node.focus();
        }
      },
      focusKey,
      scrollTo: (key) => {
        const row = latest.current.rowOf.get(key);
        if (row !== undefined) latest.current.scrollToRow(row);
      },
      anyFocused: () => Array.from(nodes.values()).some((node) => node.isFocused?.()),
      blurKey: (key) => {
        nodes.get(key)?.blur();
      },
      next: (key) => {
        const keys = latest.current.order;
        const following = keys[keys.indexOf(key) + 1];
        if (following) focusKey(following);
        else nodes.get(key)?.blur();
      },
    };
  }, [nodes]);
}

/** A stable ref callback per field key. */
export function useRefFactory(register: FieldWalk['register'], onGone: (key: string) => void) {
  const cache = useRef(new Map<string, (node: TextInput | null) => void>()).current;
  const callbacks = useRef({ register, onGone });
  callbacks.current = { register, onGone };
  return useCallback(
    (key: string) => {
      let ref = cache.get(key);
      if (!ref) {
        ref = (node) => {
          callbacks.current.register(key, node);
          if (!node) callbacks.current.onGone(key);
        };
        cache.set(key, ref);
      }
      return ref;
    },
    [cache]
  );
}
