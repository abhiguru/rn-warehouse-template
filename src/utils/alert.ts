/**
 * showAlert: a drop-in replacement for React Native's Alert.alert that draws a
 * themed dialog (style guide §13.9), so every popup follows the brand and the
 * light/dark choice. Same arguments as Alert.alert.
 *
 * <AlertHost /> (mounted once in app/_layout.tsx) renders the dialogs. When no
 * host is mounted, for example in unit tests, it falls back to Alert.alert.
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

/** Called by AlertHost; returns an unsubscribe function. */
export function registerAlertHost(fn: Listener): () => void {
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
  if (!listener) {
    // Pass only the arguments given, exactly as the original Alert.alert call would.
    const args: Parameters<typeof Alert.alert> = [title, message, buttons, options];
    while (args.length > 1 && args[args.length - 1] === undefined) args.pop();
    (Alert.alert as (...a: unknown[]) => void)(...args);
    return;
  }
  listener({
    id: nextId++,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: t('common.ok') }],
    options,
  });
}
