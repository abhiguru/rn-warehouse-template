/**
 * showAlert and the keyboard (WH-292): with the keyboard up a dialog waits for keyboardDidHide (at most 300 ms) and then
 * opens exactly once; with no keyboard it opens at once. The keyboard, its events and the native Alert are faked at the
 * edge; the alert module is the real one.
 */
import { Alert, Keyboard } from 'react-native';
import { askAlert, dropAlertsWithHandlers, getAlertQueue, registerAlertHost, resetAlertQueueForTests, showAlert } from '../alert';

beforeEach(() => {
  jest.useFakeTimers();
  resetAlertQueueForTests();
});
afterEach(() => {
  resetAlertQueueForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

type Handler = () => void;
/** A keyboard that is visible or not, and a host that records what reaches it, in order with the keyboard calls. */
function fakeKeyboard(visible: boolean) {
  const order: string[] = [];
  const handlers: Handler[] = [];
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'isVisible').mockImplementation(() => visible);
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => { order.push('dismiss'); });
  const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: Handler) => {
    expect(event).toBe('keyboardDidHide');
    handlers.push(handler);
    return { remove };
  }) as never);
  const queued: string[] = [];
  const unregister = registerAlertHost(request => { queued.push(request.title); order.push('queued'); });
  const hide = () => handlers.forEach(handler => handler());
  return { order, queued, dismiss, addListener, remove, hide, unregister };
}
const BUTTONS = [{ text: 'Keep editing' }, { text: 'Discard' }];

describe('no keyboard on the screen', () => {
  it('the alert is queued at once, after the keyboard is told to close, and nothing waits', () => {
    const kb = fakeKeyboard(false);
    showAlert('Discard this GRN?', 'Fictional message', BUTTONS);
    expect(kb.order).toEqual(['dismiss', 'queued']);
    expect(getAlertQueue()).toHaveLength(1);
    expect(kb.addListener).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('with no host the native Alert is used as before and the keyboard is left alone', () => {
    const kb = fakeKeyboard(false);
    kb.unregister();
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showAlert('Title', 'Message');
    expect(native).toHaveBeenCalledTimes(1);
    expect(kb.dismiss).not.toHaveBeenCalled();
  });
});

describe('the keyboard is up', () => {
  it('closes it, keeps the alert back, and queues it exactly once when keyboardDidHide fires', () => {
    const kb = fakeKeyboard(true);
    showAlert('Discard this GRN?', 'Fictional message', BUTTONS);
    expect(kb.dismiss).toHaveBeenCalledTimes(1);
    expect(kb.queued).toEqual([]);
    expect(getAlertQueue()).toHaveLength(0);
    kb.hide();
    expect(kb.queued).toEqual(['Discard this GRN?']);
    expect(getAlertQueue()).toHaveLength(1);
    expect(kb.order).toEqual(['dismiss', 'queued']);
    jest.advanceTimersByTime(1000);
    kb.hide(); // a late or repeated event
    expect(kb.queued).toEqual(['Discard this GRN?']);
    expect(kb.remove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('queues it at 300 ms when the event never fires, once, and removes the listener', () => {
    const kb = fakeKeyboard(true);
    showAlert('Discard this GRN?', undefined, BUTTONS);
    jest.advanceTimersByTime(299);
    expect(kb.queued).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(kb.queued).toEqual(['Discard this GRN?']);
    expect(kb.remove).toHaveBeenCalledTimes(1);
    kb.hide(); // the event arrives after the cap
    jest.advanceTimersByTime(1000);
    expect(kb.queued).toEqual(['Discard this GRN?']);
    expect(getAlertQueue()).toHaveLength(1);
  });

  it('never opens twice when the event and the 300 ms both happen', () => {
    const kb = fakeKeyboard(true);
    showAlert('Discard this GRN?', undefined, BUTTONS);
    jest.advanceTimersByTime(100);
    kb.hide();
    jest.advanceTimersByTime(1000);
    expect(kb.queued).toEqual(['Discard this GRN?']);
    expect(kb.remove).toHaveBeenCalledTimes(1);
  });

  it('keeps the order of alerts raised while one waits, with one wait for all', () => {
    const kb = fakeKeyboard(true);
    showAlert('First', undefined, BUTTONS);
    showAlert('Second', undefined, [{ text: 'OK' }]);
    showAlert('Third', 'With words', [{ text: 'Yes' }, { text: 'No' }]);
    expect(kb.addListener).toHaveBeenCalledTimes(1);
    expect(kb.queued).toEqual([]);
    kb.hide();
    expect(kb.queued).toEqual(['First', 'Second', 'Third']);
    expect(getAlertQueue().map(request => request.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('keeps the order once the keyboard has hidden too: a later alert goes behind, not ahead', () => {
    const kb = fakeKeyboard(true);
    showAlert('First', undefined, BUTTONS);
    jest.spyOn(Keyboard, 'isVisible').mockImplementation(() => false);
    showAlert('Second', undefined, [{ text: 'OK' }]); // raised while First still waits: must not jump ahead
    expect(kb.queued).toEqual([]);
    kb.hide();
    expect(kb.queued).toEqual(['First', 'Second']);
  });

  it('drops a duplicate of a waiting alert like a duplicate in the queue', () => {
    const kb = fakeKeyboard(true);
    showAlert('Delete invoice 7?', 'It will be removed.', [{ text: 'Cancel' }, { text: 'Delete' }]);
    showAlert('Delete invoice 7?', 'It will be removed.', [{ text: 'Cancel' }, { text: 'Delete' }]);
    kb.hide();
    expect(kb.queued).toEqual(['Delete invoice 7?']);
    showAlert('Delete invoice 7?', 'It will be removed.', [{ text: 'Cancel' }, { text: 'Delete' }]);
    expect(getAlertQueue()).toHaveLength(1); // and one in the queue itself
  });

  it('askAlert resolves once, with the pressed value, and a dropped duplicate resolves as dismissed', async () => {
    const kb = fakeKeyboard(true);
    const choices = [{ text: 'Cancel', value: 'no' }, { text: 'Share', value: 'yes' }];
    const first = askAlert('Share the full report?', undefined, choices, 'closed');
    const duplicate = askAlert('Share the full report?', undefined, choices, 'closed');
    await expect(duplicate).resolves.toBe('closed');
    kb.hide();
    jest.advanceTimersByTime(1000);
    expect(getAlertQueue()).toHaveLength(1);
    getAlertQueue()[0].buttons[1].onPress?.();
    getAlertQueue()[0].options?.onDismiss?.();
    await expect(first).resolves.toBe('yes');
  });

  it('removes the listener and the timer when the wait is torn down, and opens nothing', () => {
    const kb = fakeKeyboard(true);
    showAlert('Discard this GRN?', undefined, BUTTONS);
    expect(jest.getTimerCount()).toBe(1);
    resetAlertQueueForTests(); // what a host teardown or the next test does
    expect(kb.remove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(1000);
    kb.hide();
    expect(kb.queued).toEqual([]);
    expect(getAlertQueue()).toHaveLength(0);
  });

  it('dropping the alerts with handlers drops a waiting one too, and a dismissed question is answered', async () => {
    const kb = fakeKeyboard(true);
    const answer = askAlert('Share the full report?', undefined, [{ text: 'Cancel', value: 'no' }, { text: 'Share', value: 'yes' }], 'closed');
    dropAlertsWithHandlers();
    await expect(answer).resolves.toBe('closed');
    kb.hide();
    jest.advanceTimersByTime(1000);
    expect(kb.queued).toEqual([]);
  });
});

describe('a keyboard call that throws never keeps the alert from opening', () => {
  it('isVisible throws: treated as hidden, opens at once', () => {
    const kb = fakeKeyboard(false);
    jest.spyOn(Keyboard, 'isVisible').mockImplementation(() => { throw new Error('no keyboard'); });
    showAlert('Delete invoice 7?', undefined, BUTTONS);
    expect(kb.queued).toEqual(['Delete invoice 7?']);
  });

  it('addListener throws: opens at once, with no timer left', () => {
    const kb = fakeKeyboard(true);
    kb.addListener.mockImplementation(() => { throw new Error('no events'); });
    showAlert('Delete invoice 7?', undefined, BUTTONS);
    expect(kb.queued).toEqual(['Delete invoice 7?']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('dismiss throws with the keyboard up: opens at once and removes the listener', () => {
    const kb = fakeKeyboard(true);
    kb.dismiss.mockImplementation(() => { throw new Error('no keyboard'); });
    showAlert('Delete invoice 7?', undefined, BUTTONS);
    expect(kb.queued).toEqual(['Delete invoice 7?']);
    expect(kb.remove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('dismiss throws with no keyboard: opens all the same', () => {
    const kb = fakeKeyboard(false);
    kb.dismiss.mockImplementation(() => { throw new Error('no keyboard'); });
    expect(() => showAlert('Delete invoice 7?', undefined, BUTTONS)).not.toThrow();
    expect(kb.queued).toEqual(['Delete invoice 7?']);
  });
});

describe('no host mounted while an alert waits for the keyboard (WH-293)', () => {
  it('a second alert is not shown natively; both reach the host in the order raised once it is back', () => {
    const kb = fakeKeyboard(true);
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showAlert('Alert A', 'Fictional message', BUTTONS);
    kb.unregister(); // the host unmounts while A waits for the keyboard
    showAlert('Alert B', 'Fictional message', BUTTONS);
    expect(native).not.toHaveBeenCalled();
    const reached: string[] = [];
    registerAlertHost(request => { reached.push(request.title); });
    kb.hide();
    expect(native).not.toHaveBeenCalled();
    expect(reached).toEqual(['Alert A', 'Alert B']);
    expect(getAlertQueue().map(request => request.title)).toEqual(['Alert A', 'Alert B']);
  });

  it('control: no host, an empty queue and nothing pending still uses the native Alert', () => {
    const kb = fakeKeyboard(false);
    kb.unregister();
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showAlert('Alert C', 'Fictional message');
    expect(native).toHaveBeenCalledTimes(1);
    expect(native).toHaveBeenCalledWith('Alert C', 'Fictional message');
  });
});
