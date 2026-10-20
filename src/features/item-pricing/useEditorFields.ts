/**
 * The number fields of a rate form and the scroll view that holds them: each field registers itself, the
 * keyboard's Next key moves to the next one in `order`, a focused field is scrolled clear of the keyboard and of
 * the sticky Save bar (P-09), and a field with an error can be scrolled to. Shared by the rate editor and the
 * item page's rate boxes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import { space } from '@/theme/tokens';
import type { FieldNode, FieldRegistry } from './components/fieldLink';

/** A focused field ends this far above the keyboard (P-09). */
export const ABOVE_KEYBOARD = space.xxl;

export interface UseEditorFieldsOptions {
  /** Keep `keyboardUp` current (a re-render when the keyboard shows or hides). Off by default. */
  trackKeyboard?: boolean;
}

export interface UseEditorFields {
  /** Pass to the ScrollView that holds the fields. */
  scrollRef: React.RefObject<ScrollView | null>;
  /** Pass to the ScrollView's `onScroll` (with `scrollEventThrottle`). */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Spread onto each field with `fieldLink(fields, key)`. */
  fields: FieldRegistry;
  /** The Save bar's measured height: the scroll content ends clear of it. */
  barHeight: number;
  /** Report the Save bar's measured height (RateSaveBar's `onHeight`). */
  setBarHeight: (height: number) => void;
  /** Scroll the field `key` into view, or to the top when it is not on the screen. */
  scrollToError: (key: string) => void;
  scrollToTop: () => void;
  /** True while the keyboard is up; only kept current with `trackKeyboard`. */
  keyboardUp: boolean;
}

export function useEditorFields(order: string[], options: UseEditorFieldsOptions = {}): UseEditorFields {
  const { trackKeyboard = false } = options;
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const focusedKey = useRef<string | null>(null);
  const nodes = useRef<Record<string, FieldNode | null>>({});
  const [barHeight, setBarHeightState] = useState(0);
  const barHeightRef = useRef(0);
  const windowHeight = useWindowDimensions().height;
  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;
  const [keyboardUp, setKeyboardUp] = useState(false);

  const setBarHeight = useCallback((height: number) => {
    barHeightRef.current = height;
    setBarHeightState(height);
  }, []);

  const ensureVisible = useCallback((key: string) => {
    const node = nodes.current[key];
    if (!node) return;
    node.measureInWindow((_x, y, _w, h) => {
      // The Save bar sits on the keyboard's top edge, or on the window's bottom edge with no keyboard.
      const barTop = (keyboardTop.current ?? windowHeightRef.current) - barHeightRef.current;
      const hidden = y + h + ABOVE_KEYBOARD - barTop;
      if (hidden > 0) scrollRef.current?.scrollTo({ y: scrollY.current + hidden, animated: true });
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      if (trackKeyboard) setKeyboardUp(true);
      if (focusedKey.current) ensureVisible(focusedKey.current);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      if (trackKeyboard) setKeyboardUp(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ensureVisible, trackKeyboard]);

  const fields: FieldRegistry = useMemo(
    () => ({
      register: (key, node) => {
        nodes.current[key] = node;
      },
      onFocus: key => {
        focusedKey.current = key;
        ensureVisible(key);
      },
      next: key => {
        // Fields of a collapsed band are not mounted: walk on to the next one that is.
        const start = order.indexOf(key);
        const following = start < 0 ? undefined : order.slice(start + 1).find(k => nodes.current[k]);
        const node = following ? nodes.current[following] : null;
        if (node) node.focus();
        else Keyboard.dismiss();
      },
    }),
    [order, ensureVisible]
  );

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const scrollToError = useCallback((key: string) => {
    const node = nodes.current[key];
    if (!node) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    node.measureInWindow((_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + y - 160), animated: true }));
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

  return { scrollRef: scrollRef as React.RefObject<ScrollView | null>, onScroll, fields, barHeight, setBarHeight, scrollToError, scrollToTop, keyboardUp };
}
