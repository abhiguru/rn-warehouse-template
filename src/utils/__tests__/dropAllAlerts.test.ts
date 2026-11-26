/**
 * `dropAllAlerts` (WH-350): when the app closes its screens over the session, no dialog stays or appears later, whether
 * it is on screen, queued behind another, or still waiting for the keyboard to hide. No button handler runs; a question
 * that is waited for is answered as dismissed.
 *
 * Real: src/utils/alert.ts. Faked: the keyboard (native) and the clock.
 */
import { Keyboard } from 'react-native';
import {
  askAlert, dropAllAlerts, getAlertQueue, registerAlertHost, resetAlertQueueForTests, showAlert, whenAlertsClosed,
} from '../alert';

let hidden: (() => void) | undefined;
let removed = 0;

beforeEach(() => {
  jest.useFakeTimers();
  removed = 0;
  hidden = undefined;
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((_event: string, listener: () => void) => {
    hidden = listener;
    return { remove: () => { removed += 1; hidden = undefined; } };
  }) as never);
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  resetAlertQueueForTests();
  registerAlertHost();
});
afterEach(() => {
  resetAlertQueueForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const titles = () => getAlertQueue().map(request => request.title);

it('removes plain messages, dialogs with handlers and questions, running no handler', async () => {
  const onPress = jest.fn();
  const onPlainDismiss = jest.fn();
  showAlert('Saved earlier', 'Receipt 16', undefined, { onDismiss: onPlainDismiss });
  showAlert('Receipt 17', 'Discard it?', [{ text: 'Discard', onPress }]);
  const answer = askAlert('Replace the item?', undefined, [{ text: 'Replace', value: 'replace' }], 'dismissed');
  expect(titles()).toEqual(['Saved earlier', 'Receipt 17', 'Replace the item?']);

  dropAllAlerts();

  expect(titles()).toEqual([]);
  await expect(answer).resolves.toBe('dismissed');
  expect(onPress).not.toHaveBeenCalled();
  expect(onPlainDismiss).not.toHaveBeenCalled();
});

it('removes dialogs still waiting for the keyboard: none appears when it hides or the wait ends', async () => {
  jest.mocked(Keyboard.isVisible).mockReturnValue(true);
  showAlert('Saved earlier', 'Receipt 16');
  const answer = askAlert('Replace the item?', undefined, [{ text: 'Replace', value: 'replace' }], 'dismissed');
  const hideEvent = hidden!;
  expect(titles()).toEqual([]);

  dropAllAlerts();
  hideEvent();
  jest.advanceTimersByTime(1_000);

  expect(titles()).toEqual([]);
  await expect(answer).resolves.toBe('dismissed');
  expect(removed).toBe(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('lets whoever waits for the dialogs to close carry on', async () => {
  showAlert('Saved earlier', 'Receipt 16');
  let closed = false;
  void whenAlertsClosed().then(() => { closed = true; });

  dropAllAlerts();
  await Promise.resolve();

  expect(closed).toBe(true);
});

it('a dialog raised afterwards opens as usual', () => {
  jest.mocked(Keyboard.isVisible).mockReturnValue(true);
  showAlert('Saved earlier', 'Receipt 16');
  dropAllAlerts();
  jest.mocked(Keyboard.isVisible).mockReturnValue(false);

  showAlert('Connect first', 'No connection');

  expect(titles()).toEqual(['Connect first']);
});
