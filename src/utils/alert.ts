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

/** Called by AlertHost when a dialog is closed; only the one on screen, and only once (a double press is ignored). */
export function closeAlert(id: number): void {
  if (queue[0]?.id !== id) return;
  queue = queue.slice(1);
  notifyQueue();
}

/**
 * Drop the waiting dialogs that have a button with a handler. Called when the facility
 * session ends: such a handler would act for a session that is gone. Plain messages stay.
 */
export function dropAlertsWithHandlers(): void {
  const kept = queue.filter(request => !request.buttons.some(b => b.onPress));
  if (kept.length === queue.length) return;
  queue = kept;
  notifyQueue();
}

/** Test-only: forget every waiting dialog and host, so one test does not leak into the next. */
export function resetAlertQueueForTests(): void {
  queue = [];
  listener = null;
  notifyQueue();
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

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
): void {
  // No host, and nothing waiting for one that is being mounted again: the native dialog.
  if (!listener && queue.length === 0) {
    // Pass only the arguments given, exactly as the original Alert.alert call would.
    const args: Parameters<typeof Alert.alert> = [title, message, buttons, options];
    while (args.length > 1 && args[args.length - 1] === undefined) args.pop();
    (Alert.alert as (...a: unknown[]) => void)(...args);
    return;
  }
  const request: AlertRequest = {
    id: nextId++,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: t('common.ok') }],
    options,
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
      { cancelable: true, onDismiss: () => settle(dismissed) }
    );
  });
}
