import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * "Show X after Y has closed", for a dialog Y (a Modal) that a flag shows and hides.
 *
 * On iOS a Modal cannot be presented while another is still closing: the second one is dropped and
 * never appears. So the next dialog (or alert) must wait for the first one's `onDismiss`. On Android
 * it can open as soon as the first is hidden.
 *
 *   const { later, onDismissed } = useAfterClosed(visible);
 *   <ThatModal visible={visible} onDismissed={onDismissed} />
 *   later(() => setNextVisible(true)); setVisible(false);
 *
 * `later(fn)` runs `fn` once the dialog has closed (iOS: on `onDismissed`; Android: when `visible` is
 * false). When the dialog is not open nor closing, `fn` runs at once. Call `later` in the same handler
 * that hides the dialog, or earlier; only the latest call is kept.
 */
export function useAfterClosed(visible: boolean) {
  const pending = useRef<(() => void) | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // iOS: the dialog was hidden and its `onDismiss` has not come yet.
  const closing = useRef(false);
  const wasVisible = useRef(visible);

  const run = useCallback(() => {
    closing.current = false;
    const next = pending.current;
    pending.current = null;
    next?.();
  }, []);

  const later = useCallback((fn: () => void) => {
    if (!visibleRef.current && !closing.current) {
      fn();
      return;
    }
    pending.current = fn;
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      if (wasVisible.current && !visible) closing.current = true;
    } else if (!visible) {
      run();
    }
    wasVisible.current = visible;
  }, [visible, run]);

  return { later, onDismissed: run };
}
