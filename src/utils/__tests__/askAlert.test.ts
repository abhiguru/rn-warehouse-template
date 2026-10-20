/**
 * askAlert: the themed dialog as a question to wait for. It answers with the
 * value of the button pressed, or with the `dismissed` value when the dialog is
 * closed without one, and it answers once.
 */
import { Alert } from 'react-native';
import {
  askAlert,
  closeAlert,
  dropAlertsWithHandlers,
  getAlertQueue,
  registerAlertHost,
  resetAlertQueueForTests,
  showAlert,
  type AlertRequest,
} from '../alert';

// Dialogs waiting in the queue are kept for a host that is mounted again, so each test starts empty.
beforeEach(() => resetAlertQueueForTests());
afterEach(() => resetAlertQueueForTests());

const CHOICES = [
  { text: 'Cancel', style: 'cancel' as const, value: 'no' },
  { text: 'Share full report', value: 'yes' },
];

describe('askAlert with the dialog host', () => {
  let shown: AlertRequest[];
  let unregister: () => void;
  beforeEach(() => {
    shown = [];
    unregister = registerAlertHost(request => shown.push(request));
  });
  afterEach(() => unregister());

  it('shows the title, the message and one button per choice, and answers with the pressed one', async () => {
    const answer = askAlert('Share the full report?', 'Fictional message', CHOICES, 'closed');
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ title: 'Share the full report?', message: 'Fictional message', options: { cancelable: true } });
    expect(shown[0].buttons.map(button => [button.text, button.style])).toEqual([['Cancel', 'cancel'], ['Share full report', undefined]]);
    shown[0].buttons[1].onPress?.();
    await expect(answer).resolves.toBe('yes');
  });

  it('answers with the dismissed value when closed without a button, and only once', async () => {
    const answer = askAlert('Title', undefined, CHOICES, 'closed');
    shown[0].options?.onDismiss?.();
    shown[0].buttons[1].onPress?.();
    await expect(answer).resolves.toBe('closed');
  });

  it('keeps the first answer when a button is pressed and the dialog then reports it closed', async () => {
    const answer = askAlert('Title', undefined, CHOICES, 'closed');
    shown[0].buttons[0].onPress?.();
    shown[0].options?.onDismiss?.();
    await expect(answer).resolves.toBe('no');
  });
});

describe('askAlert without a host', () => {
  it("falls back to React Native's alert with the buttons and a dismiss that answers", async () => {
    const native = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    try {
      const answer = askAlert('Title', 'Message', CHOICES, 'closed');
      expect(native).toHaveBeenCalledTimes(1);
      const [title, message, buttons, options] = native.mock.calls[0];
      expect([title, message]).toEqual(['Title', 'Message']);
      expect(buttons?.map(button => button.text)).toEqual(['Cancel', 'Share full report']);
      expect(options?.cancelable).toBe(true);
      options?.onDismiss?.();
      await expect(answer).resolves.toBe('closed');
    } finally {
      native.mockRestore();
    }
  });
});

describe('dropAlertsWithHandlers and askAlert', () => {
  it('settles a dropped question as dismissed, and keeps a plain message', async () => {
    const shown: AlertRequest[] = [];
    const unregister = registerAlertHost(request => shown.push(request));
    try {
      const answer = askAlert('Title', undefined, CHOICES, 'closed');
      showAlert('Plain', 'No buttons');
      const withHandler = jest.fn();
      showAlert('Handler', undefined, [{ text: 'Go', onPress: withHandler }]);
      expect(getAlertQueue()).toHaveLength(3);
      dropAlertsWithHandlers();
      await expect(answer).resolves.toBe('closed');
      expect(getAlertQueue().map(request => request.title)).toEqual(['Plain']);
      expect(withHandler).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});

// Review 2026-10-20 (contract item 10): a double tap must not queue the same question twice.
describe('a dialog identical to one already waiting', () => {
  let shown: AlertRequest[];
  let unregister: () => void;
  beforeEach(() => {
    shown = [];
    unregister = registerAlertHost(request => shown.push(request));
  });
  afterEach(() => unregister());

  const DELETE = [{ text: 'Cancel', style: 'cancel' as const }, { text: 'Delete', style: 'destructive' as const }];

  it('is dropped: a double tap queues the question once', () => {
    showAlert('Delete invoice 7?', 'It will be removed.', DELETE);
    // The same words on the title, the message and the buttons; the handler is not compared.
    showAlert('Delete invoice 7?', 'It will be removed.', [DELETE[0], { ...DELETE[1], onPress: jest.fn() }]);
    expect(getAlertQueue()).toHaveLength(1);
    expect(shown).toHaveLength(1);
  });

  it('is dropped also behind a different dialog that waits first', () => {
    showAlert('Saved');
    showAlert('Delete invoice 7?', undefined, DELETE);
    showAlert('Delete invoice 7?', undefined, DELETE);
    expect(getAlertQueue().map(request => request.title)).toEqual(['Saved', 'Delete invoice 7?']);
  });

  it('is kept when the title, the message or a button text differs', () => {
    showAlert('Delete invoice 7?', 'It will be removed.', DELETE);
    showAlert('Delete invoice 8?', 'It will be removed.', DELETE);
    showAlert('Delete invoice 7?', 'It will be kept.', DELETE);
    showAlert('Delete invoice 7?', 'It will be removed.', [DELETE[0], { text: 'Delete it' }]);
    showAlert('Delete invoice 7?', 'It will be removed.', [DELETE[1]]);
    expect(getAlertQueue()).toHaveLength(5);
  });

  it('is shown again once the first one has been closed', () => {
    showAlert('Delete invoice 7?', undefined, DELETE);
    expect(closeAlert(getAlertQueue()[0].id)).toBe(true);
    showAlert('Delete invoice 7?', undefined, DELETE);
    expect(getAlertQueue()).toHaveLength(1);
    expect(shown).toHaveLength(2);
  });

  it('a dropped question is answered as dismissed, and the first one keeps its answer', async () => {
    const first = askAlert('Remove Potato?', undefined, CHOICES, 'closed');
    const second = askAlert('Remove Potato?', undefined, CHOICES, 'closed');
    await expect(second).resolves.toBe('closed');
    expect(getAlertQueue()).toHaveLength(1);
    shown[0].buttons[1].onPress?.();
    await expect(first).resolves.toBe('yes');
  });
});

describe('closeAlert', () => {
  let unregister: () => void;
  beforeEach(() => { unregister = registerAlertHost(); });
  afterEach(() => unregister());

  it('says whether this call closed the dialog: the second call for the same dialog does nothing', () => {
    showAlert('Title');
    const { id } = getAlertQueue()[0];
    expect(closeAlert(id)).toBe(true);
    expect(closeAlert(id)).toBe(false);
    expect(getAlertQueue()).toHaveLength(0);
  });

  it('closes only the dialog on screen', () => {
    showAlert('First');
    showAlert('Second');
    const [, second] = getAlertQueue();
    expect(closeAlert(second.id)).toBe(false);
    expect(getAlertQueue()).toHaveLength(2);
  });
});
