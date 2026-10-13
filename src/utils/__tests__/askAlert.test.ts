/**
 * askAlert: the themed dialog as a question to wait for. It answers with the
 * value of the button pressed, or with the `dismissed` value when the dialog is
 * closed without one, and it answers once.
 */
import { Alert } from 'react-native';
import { askAlert, registerAlertHost, type AlertRequest } from '../alert';

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
