/**
 * showAlert closes the keyboard before the dialog opens (WH-292): a field behind the dialog that keeps its input focus
 * pulls TalkBack to the dialog's first button. It holds for every alert, askAlert included, and never stops the dialog.
 */
import { Alert, Keyboard } from 'react-native';
import { askAlert, getAlertQueue, registerAlertHost, resetAlertQueueForTests, showAlert } from '../alert';

beforeEach(() => resetAlertQueueForTests());
afterEach(() => {
  resetAlertQueueForTests();
  jest.restoreAllMocks();
});

describe('showAlert and the keyboard', () => {
  it('dismisses the keyboard once, before the request exists and the host is told', () => {
    const order: string[] = [];
    let queueLengthAtDismiss = -1;
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
      order.push('dismiss');
      queueLengthAtDismiss = getAlertQueue().length;
    });
    const unregister = registerAlertHost(() => order.push('queued'));
    showAlert('Discard this GRN?', 'Fictional message', [{ text: 'Keep editing' }, { text: 'Discard' }]);
    expect(order).toEqual(['dismiss', 'queued']);
    expect(queueLengthAtDismiss).toBe(0);
    expect(getAlertQueue()).toHaveLength(1);
    unregister();
  });

  it('askAlert, the confirm path, dismisses it too before the dialog is queued', () => {
    const order: string[] = [];
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => { order.push('dismiss'); });
    const unregister = registerAlertHost(() => order.push('queued'));
    void askAlert('Share the full report?', undefined, [{ text: 'Cancel', value: 'no' }, { text: 'Share', value: 'yes' }], 'closed');
    expect(order).toEqual(['dismiss', 'queued']);
    unregister();
  });

  it('a Keyboard.dismiss that throws still opens the dialog', () => {
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => { throw new Error('no keyboard'); });
    const queued: string[] = [];
    const unregister = registerAlertHost(request => queued.push(request.title));
    expect(() => showAlert('Delete invoice 7?', 'It will be removed.', [{ text: 'Cancel' }, { text: 'Delete' }])).not.toThrow();
    expect(queued).toEqual(['Delete invoice 7?']);
    expect(getAlertQueue()).toHaveLength(1);
    unregister();
  });

  it('with no host the native Alert is used as before and the keyboard is left alone', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showAlert('Title', 'Message');
    expect(native).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
