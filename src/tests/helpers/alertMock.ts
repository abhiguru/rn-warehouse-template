/**
 * A stand-in for '@/utils/alert' whose `askAlert` draws its dialog through the
 * stand-in `showAlert`, as the real one does: a test sees every dialog in
 * `showAlert`'s calls (title, message, buttons, options) and answers a question
 * by pressing one of its buttons. An answer nobody gives keeps the caller
 * waiting, as on the phone.
 *
 *   jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
 *
 * The test's `jest.fn()` is passed in: this file is not a test file, so it is
 * also read by the app's type check, which does not know jest.
 */
import type { AlertButton, AlertOptions } from 'react-native';
import type { AlertChoice } from '@/utils/alert';

type AlertCall = [string, string?, AlertButton[]?, AlertOptions?];
/** A recording function, as jest.fn() gives. */
interface Recorder {
  (...args: AlertCall): void;
  mock: { calls: unknown[][] };
}

export function alertModuleMock(showAlert: Recorder) {
  const askAlert = <T>(title: string, message: string | undefined, choices: AlertChoice<T>[], dismissed: T): Promise<T> =>
    new Promise<T>(resolve => {
      showAlert(
        title,
        message,
        choices.map(choice => ({ text: choice.text, style: choice.style, onPress: () => resolve(choice.value) })),
        { cancelable: true, onDismiss: () => resolve(dismissed) }
      );
    });
  // No Modal is drawn here, so there is nothing left closing.
  return { showAlert, askAlert, registerAlertHost: () => () => undefined, whenAlertsClosed: async () => undefined };
}

const callsOf = (showAlert: { mock: { calls: unknown[][] } }) => showAlert.mock.calls as AlertCall[];

/** Presses the button labelled `text` of the latest dialog that has one. */
export function pressAlertButton(showAlert: { mock: { calls: unknown[][] } }, text: string): void {
  const calls = callsOf(showAlert);
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const button = calls[index][2]?.find(candidate => candidate.text === text);
    if (button) {
      button.onPress?.();
      return;
    }
  }
  throw new Error(`No dialog has a button labelled "${text}"`);
}

/** Closes the latest dialog without pressing a button (Android back, a tap on the scrim). */
export function dismissLatestAlert(showAlert: { mock: { calls: unknown[][] } }): void {
  const calls = callsOf(showAlert);
  const onDismiss = calls[calls.length - 1]?.[3]?.onDismiss;
  if (!onDismiss) throw new Error('The latest dialog cannot be dismissed');
  onDismiss();
}

/** Title and message of every dialog shown, in order. */
export const alertTexts = (showAlert: { mock: { calls: unknown[][] } }): [string, string | undefined][] =>
  callsOf(showAlert).map(([title, message]) => [title, message]);
