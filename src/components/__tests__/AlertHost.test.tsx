import React from 'react';
import { Alert, Platform } from 'react-native';
import * as RN from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { AlertHost } from '../AlertHost';
import { resetAlertQueueForTests, showAlert, whenAlertsClosed } from '@/utils/alert';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';

let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: mockTheme }),
}));

const everything = { includeHiddenElements: true } as const;

function setup() {
  return userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
}
// A dialog takes no press in its first 250 ms (a double tap on the dialog before it): the clock is moved past that.
function settle() {
  jest.advanceTimersByTime(300);
}
// Neither the scrim nor the card has a role a query can reach (a View with a role is not an accessible element, and
// the scrim is hidden from the screen reader on purpose, WH-259), so they are found by walking the rendered tree.
type Node = NonNullable<typeof screen.root>;
function findHost(match: (props: Record<string, unknown>) => boolean): Node {
  const walk = (node: Node): Node | undefined => {
    if (typeof node.type === 'string' && match(node.props as Record<string, unknown>)) return node;
    for (const child of node.children) {
      if (typeof child === 'string') continue;
      const found = walk(child as Node);
      if (found) return found;
    }
    return undefined;
  };
  const found = walk(screen.root as Node);
  if (!found) throw new Error('not on the screen');
  return found;
}
const findScrim = () => findHost(p => p.importantForAccessibility === 'no');
const findCard = () => findHost(p => p.accessibilityRole === 'alert');
const findModal = () => findHost(p => typeof p.onDismiss === 'function');
// A dialog is on the screen once showAlert has been called and the host has drawn it.
async function show(...args: Parameters<typeof showAlert>) {
  await act(() => { showAlert(...args); });
  await screen.findByText(args[0], everything);
}
// Two presses reach the element in one go, before React has drawn the closed dialog (a double tap): a Pressable answers
// its host's click with its onPress. userEvent and fireEvent each wait for a draw between presses, so neither can do it.
async function doublePress(node: Node) {
  const click = node.props.onClick as (event: unknown) => void;
  await act(() => { click({}); click({}); });
}
// A dialog that waits behind another one is not drawn yet.
async function queue(...args: Parameters<typeof showAlert>) {
  await act(() => { showAlert(...args); });
}
async function press(user: ReturnType<typeof setup>, label: string) {
  settle();
  await user.press(screen.getByRole('button', { name: label, ...everything }));
}
// The Modal tells the host it has finished closing (iOS). Its host is gone from the tree by then (a closed Modal draws
// nothing), so the event goes to the Modal element taken while it was open.
async function modalDismissed(modal: Node) {
  await act(() => { (modal.props as { onDismiss: () => void }).onDismiss(); });
}

describe('showAlert with AlertHost', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('falls back to Alert.alert when no host is mounted', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showAlert('Title', 'Message');
    expect(spy).toHaveBeenLastCalledWith('Title', 'Message');
    spy.mockRestore();
  });

  describe.each(BRANDS.flatMap(b => (['light', 'dark'] as Mode[]).map(m => [b, m] as const)))('%s %s', (brand, mode) => {
    it('renders the dialog with token colours and runs the pressed handler', async () => {
      mockTheme = { preference: mode, brand };
      const t = getTokens(brand, mode);
      const onDelete = jest.fn();
      const user = setup();
      await render(<AlertHost />);
      await show('Delete GRN 311?', 'Its items will be removed from stock.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete GRN', style: 'destructive', onPress: onDelete },
      ]);
      expect(await screen.findByText('Delete GRN 311?')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Delete GRN' })).toBeOnTheScreen();
      expect(findCard()).toHaveStyle({ backgroundColor: t.surface.sheet });
      await press(user, 'Delete GRN');
      await act(async () => { await jest.runAllTimersAsync(); });
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Delete GRN 311?', everything)).not.toBeOnTheScreen();
    });
  });

  it('cancels with the cancel button handler on scrim press', async () => {
    const onCancel = jest.fn();
    const user = setup();
    await render(<AlertHost />);
    await show('Discard this GRN?', undefined, [
      { text: 'Keep editing', style: 'cancel', onPress: onCancel },
      { text: 'Discard GRN', style: 'destructive' },
    ]);
    settle();
    expect(screen.queryByLabelText('Close dialog', everything)).not.toBeOnTheScreen();
    await user.press(findScrim());
    await act(async () => { await jest.runAllTimersAsync(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// Review 2026-10-20 (contract item 10, and I7): a second press of a dialog that is closing runs nothing.
describe('a double press', () => {
  beforeEach(() => { jest.useFakeTimers(); resetAlertQueueForTests(); });
  afterEach(async () => {
    jest.useRealTimers();
    await act(() => { resetAlertQueueForTests(); }); });

  it('runs the pressed button handler once when the same dialog is pressed twice before it is gone', async () => {
    const onDelete = jest.fn();
    const user = setup();
    await render(<AlertHost />);
    await show('Delete invoice 7?', 'It will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
    settle();
    const button = screen.getByRole('button', { name: 'Delete' });
    // both presses reach the button before React draws the closed dialog (a double tap)
    await doublePress(button);
    await act(async () => { await jest.runAllTimersAsync(); });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('runs the cancel handler and onDismiss once when the scrim is pressed twice', async () => {
    const onCancel = jest.fn();
    const onDismiss = jest.fn();
    const user = setup();
    await render(<AlertHost />);
    await show('Discard this GRN?', undefined, [
      { text: 'Keep editing', style: 'cancel', onPress: onCancel },
      { text: 'Discard GRN', style: 'destructive' },
    ], { cancelable: true, onDismiss });
    settle();
    const scrim = findScrim();
    await doublePress(scrim);
    await act(async () => { await jest.runAllTimersAsync(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows a question that was tapped twice once: the dialog is gone after one press and the handler ran once', async () => {
    const onDelete = jest.fn();
    const user = setup();
    await render(<AlertHost />);
    const args: Parameters<typeof showAlert> = [
      'Delete invoice 7?', 'It will be removed.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onDelete }],
    ];
    // both calls happen in one go, before the host has drawn the first dialog
    await act(() => { showAlert(...args); showAlert(...args); });
    await screen.findByText(args[0], everything);
    await press(user, 'Delete');
    await act(async () => { await jest.runAllTimersAsync(); });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Delete invoice 7?', everything)).not.toBeOnTheScreen();
  });
});


// iOS cannot present a Modal over one that is still closing. The host tells a screen that is about to open a Modal of its
// own (whenAlertsClosed) when its last dialog has finished closing: Modal.onDismiss on iOS, at once on Android.
describe('whenAlertsClosed', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    jest.useRealTimers();
    await act(() => { resetAlertQueueForTests(); });
  });
  const settled = async (promise: Promise<void>) => {
    let done = false;
    void promise.then(() => { done = true; });
    await jest.advanceTimersByTimeAsync(0);
    return done;
  };

  it('is ready at once when no dialog was ever shown', async () => {
    expect(await settled(whenAlertsClosed())).toBe(true);
  });

  it('iOS: waits for the Modal of the last dialog to finish closing', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const user = setup();
    await render(<AlertHost />);
    await show('Possible duplicate', 'Save this anyway?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Save anyway' }]);
    expect(await settled(whenAlertsClosed())).toBe(false);

    const modal = findModal();
    await press(user, 'Save anyway');
    const waiting = whenAlertsClosed();
    // The dialog was answered and left the queue, but its Modal has not said it finished closing.
    expect(await settled(waiting)).toBe(false);

    await modalDismissed(modal);
    expect(await settled(waiting)).toBe(true);
    expect(await settled(whenAlertsClosed())).toBe(true);
  });

  it('iOS: goes on after a while if the Modal never says so', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const user = setup();
    await render(<AlertHost />);
    await show('Title', 'Message', [{ text: 'OK' }]);
    await press(user, 'OK');
    const waiting = whenAlertsClosed();
    expect(await settled(waiting)).toBe(false);

    await act(async () => { await jest.advanceTimersByTimeAsync(1600); });

    expect(await settled(waiting)).toBe(true);
  });

  it('iOS: a dialog that follows another in the queue keeps the host open: only the last one closes it', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const user = setup();
    await render(<AlertHost />);
    await show('First', 'One', [{ text: 'OK' }]);
    await queue('Second', 'Two', [{ text: 'Done' }]);
    await press(user, 'OK');
    // The second dialog is shown in the same Modal: still waiting, and not "closing" yet.
    expect(screen.getByText('Second', everything)).toBeOnTheScreen();
    expect(await settled(whenAlertsClosed())).toBe(false);

    const lastModal = findModal();
    await press(user, 'Done');
    const waiting = whenAlertsClosed();
    expect(await settled(waiting)).toBe(false);
    await modalDismissed(lastModal);
    expect(await settled(waiting)).toBe(true);
  });

  it('Android: ready as soon as the last dialog is answered', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const user = setup();
    await render(<AlertHost />);
    await show('Title', 'Message', [{ text: 'OK' }]);
    const waiting = whenAlertsClosed();
    expect(await settled(waiting)).toBe(false);

    await press(user, 'OK');

    expect(await settled(waiting)).toBe(true);
  });
});

describe('AlertHost screen-reader focus (WH-219)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('moves focus to the title of each queued alert, not only the first', async () => {
    const setFocus = jest.spyOn(RN.AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => undefined);
    const user = setup();
    await render(<AlertHost />);
    await show('First', 'One', [{ text: 'OK' }]);
    await queue('Second', 'Two', [{ text: 'Done' }]);
    const layoutTitle = async (title: string) => {
      // The title and the message are one accessible View (WH-292); its layout starts the timer.
      await fireEvent((await screen.findByText(title)).parent!, 'layout');
    };
    // Each event goes to the group of the alert on the screen: its title and its message.
    const sentTo = (call: number) => {
      const node = setFocus.mock.calls[call][0] as unknown as { props: { children: { props: { children: string } }[] } };
      return node.props.children.map(child => child.props.children);
    };
    // The event goes 400 ms after the layout (FOCUS_SETTLE_MS, WH-292), not at the layout.
    const settle = async (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

    await layoutTitle('First');
    expect(setFocus).not.toHaveBeenCalled();
    await settle(399);
    expect(setFocus).not.toHaveBeenCalled();
    await settle(1);
    expect(setFocus).toHaveBeenCalledTimes(1);
    expect(setFocus).toHaveBeenLastCalledWith(expect.anything(), 'focus');
    // A layout of the same title again moves nothing.
    await layoutTitle('First');
    await settle(400);
    expect(setFocus).toHaveBeenCalledTimes(1);

    await press(user, 'OK');
    await layoutTitle('Second');
    await settle(400);
    expect(setFocus).toHaveBeenCalledTimes(2);
    expect(sentTo(0)).toEqual(['First', 'One']);
    expect(sentTo(1)).toEqual(['Second', 'Two']);
  });
});
