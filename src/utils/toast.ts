/**
 * showToast: the success snackbar (style guide §13.9). A short line such as
 * "Garlic saved." shows near the bottom of the screen for 4 seconds and goes
 * by itself; nothing has to be pressed. A newer toast replaces the one shown.
 *
 * <ToastHost /> (mounted once in app/_layout.tsx, after <AlertHost />) draws
 * it above every screen, so a form can show its toast and go back at once and
 * the toast stays on the screen it returns to. With no host mounted (unit
 * tests) nothing is shown.
 *
 * Success only. An error the person must act on stays a dialog (showAlert)
 * or a message strip. Pass a whole translated sentence: showToast(t('…')).
 */

/** How long a toast stays, in milliseconds (style guide §13.9). */
export const TOAST_DURATION_MS = 4000;

export interface ToastOptions {
  /** How long the toast stays; default 4000 ms. */
  durationMs?: number;
}

export interface ToastRequest {
  id: number;
  message: string;
  durationMs: number;
}

type Listener = (request: ToastRequest) => void;

let listener: Listener | null = null;
let nextId = 1;

/** Called by ToastHost; returns an unsubscribe function. */
export function registerToastHost(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Show a success message for 4 seconds (or `options.durationMs`). */
export function showToast(message: string, options?: ToastOptions): void {
  if (!listener) return;
  listener({ id: nextId++, message, durationMs: options?.durationMs ?? TOAST_DURATION_MS });
}
