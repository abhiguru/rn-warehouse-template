/**
 * showAlert: a drop-in replacement for React Native's Alert.alert that draws a
 * themed dialog (style guide §13.9), so every popup follows the brand and the
 * light/dark choice. Same arguments as Alert.alert.
 *
 * <AlertHost /> (mounted once in RootLayout, app/_layout.tsx, above the bootstrap so it is never unmounted) renders the dialogs. When no
 * host is mounted, for example in unit tests, it falls back to Alert.alert.
 *
 * askAlert: the same dialog as a question to wait for. It resolves with the
 * value of the button pressed, or with `dismissed` when the dialog is closed
 * without one (Android back, a tap on the scrim).
 */
import { Alert, type AlertButton, type AlertOptions } from 'react-native';
import { t } from '@/i18n';

export interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
  /** True for an `askAlert` question: its promise settles as dismissed when the request is dropped. */
  asked?: boolean;
}

type Listener = (request: AlertRequest) => void;

let listener: Listener | null = null;
let nextId = 1;
// The dialogs waiting to be shown, the first being on screen. They live here and not in
// <AlertHost />, so a host that is mounted again (the bootstrap remounts the tree) shows
// what was queued instead of losing it.
let queue: AlertRequest[] = [];
const queueListeners = new Set<() => void>();

const notifyQueue = () => queueListeners.forEach(fn => fn());

/** The waiting dialogs, first on screen. A new array on every change (for useSyncExternalStore). */
export function getAlertQueue(): AlertRequest[] {
  return queue;
}

export function subscribeAlertQueue(fn: () => void): () => void {
  queueListeners.add(fn);
  return () => {
    queueListeners.delete(fn);
  };
}

/**
 * Called by AlertHost when a dialog is closed; only the one on screen, and only once (a double press is ignored).
 * Returns true when this call closed it, false when it did nothing: the caller runs the pressed button's handler
 * only on true, so a second press of the same dialog never runs it again.
 */
export function closeAlert(id: number): boolean {
  if (queue[0]?.id !== id) return false;
  queue = queue.slice(1);
  notifyQueue();
  wakeClosedWaiters();
  return true;
}

// iOS cannot present a Modal over one that is still closing (the second is dropped), and the host's dialog is a Modal that
// takes a moment to close after the last dialog is answered. The host says so (`markAlertHostClosing`), and a screen that
// is about to open a Modal of its own waits for `whenAlertsClosed` (docs/STYLE_GUIDE.md §14.3: the next dialog opens only
// after the one before has finished closing). On Android, and with no host, a Modal that is hidden is gone at once.
let hostClosing = false;
let closedWaiters: Array<() => void> = [];

function wakeClosedWaiters(): void {
  if (queue.length > 0 || hostClosing) return;
  const waiting = closedWaiters;
  closedWaiters = [];
  waiting.forEach(resolve => resolve());
}

/** Called by AlertHost (iOS): true as the last dialog is answered, false when its Modal has finished closing. */
export function markAlertHostClosing(closing: boolean): void {
  hostClosing = closing;
  wakeClosedWaiters();
}

/** Resolves when no dialog of the host is on screen, or closing: at once if there is none. Never rejects. */
export function whenAlertsClosed(): Promise<void> {
  if (queue.length === 0 && !hostClosing) return Promise.resolve();
  return new Promise<void>(resolve => {
    closedWaiters.push(resolve);
  });
}

/**
 * Drop the waiting dialogs that have a button with a handler. Called when the facility
 * session ends: such a handler would act for a session that is gone. Plain messages stay.
 * A dropped `askAlert` question is answered as dismissed (its `onDismiss` runs), so the caller
 * waiting for it carries on as if the person had cancelled.
 */
export function dropAlertsWithHandlers(): void {
  const dropped = queue.filter(request => request.buttons.some(b => b.onPress));
  if (dropped.length === 0) return;
  queue = queue.filter(request => !dropped.includes(request));
  notifyQueue();
  wakeClosedWaiters();
  dropped.forEach(request => {
    if (request.asked) request.options?.onDismiss?.();
  });
}

/** Test-only: forget every waiting dialog and host, so one test does not leak into the next. */
export function resetAlertQueueForTests(): void {
  queue = [];
  listener = null;
  hostClosing = false;
  notifyQueue();
  wakeClosedWaiters();
}

/**
 * Called by AlertHost; returns an unsubscribe function. `fn`, when given, is also told of
 * every new request (the host itself reads the queue).
 */
export function registerAlertHost(fn: Listener = () => undefined): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** True when a queued dialog has the same title, message and button texts (in the same order). */
function sameDialog(request: AlertRequest, title: string, message: string | undefined, buttons: AlertButton[]): boolean {
  return (
    request.title === title &&
    request.message === message &&
    request.buttons.length === buttons.length &&
    request.buttons.every((button, index) => button.text === buttons[index].text)
  );
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
  asked = false
): void {
  // No host, and nothing waiting for one that is being mounted again: the native dialog.
  if (!listener && queue.length === 0) {
    // Pass only the arguments given, exactly as the original Alert.alert call would.
    const args: Parameters<typeof Alert.alert> = [title, message, buttons, options];
    while (args.length > 1 && args[args.length - 1] === undefined) args.pop();
    (Alert.alert as (...a: unknown[]) => void)(...args);
    return;
  }
  const shownButtons = buttons && buttons.length > 0 ? buttons : [{ text: t('common.ok') }];
  // The same dialog, with the same words on its buttons, is already waiting or on screen (a double tap queues
  // the question twice): the second one is dropped. A dropped question is answered as dismissed, so the
  // caller that waits for it carries on as if the person had said no.
  if (queue.some(waiting => sameDialog(waiting, title, message, shownButtons))) {
    if (asked) options?.onDismiss?.();
    return;
  }
  const request: AlertRequest = {
    id: nextId++,
    title,
    message,
    buttons: shownButtons,
    options,
    asked: asked || undefined,
  };
  queue = [...queue, request];
  notifyQueue();
  listener?.(request);
}

/** One button of an `askAlert` dialog and the answer it gives. */
export interface AlertChoice<T> {
  text: string;
  /** As Alert.alert's: 'cancel' is also what closing the dialog does, 'destructive' is drawn as such. */
  style?: AlertButton['style'];
  value: T;
}

/**
 * Show a dialog and wait for the answer: the `value` of the button pressed, or
 * `dismissed` when it is closed without one. Settles once.
 */
export function askAlert<T>(title: string, message: string | undefined, choices: AlertChoice<T>[], dismissed: T): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false;
    const settle = (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    showAlert(
      title,
      message,
      choices.map(choice => ({ text: choice.text, style: choice.style, onPress: () => settle(choice.value) })),
      { cancelable: true, onDismiss: () => settle(dismissed) },
      true
    );
  });
}
