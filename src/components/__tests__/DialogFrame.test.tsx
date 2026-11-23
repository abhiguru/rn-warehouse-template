/**
 * The one dialog frame (WH-219, STYLE_GUIDE §13.9): heading with tone icon, buttons by role, two side by side in
 * the order given (cancel first) or stacked (action first), busy and disabled buttons. Real components.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { getTokens } from '@/theme/tokens';
import { DialogActions, DialogBody, DialogButton, DialogCard, DialogHeading, DialogOverlay } from '../DialogFrame';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const tokens = getTokens('orange', 'light');
const user = userEvent.setup({ delay: 0 });

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
/** Every host node of the rendered tree (the tone icon is a bare mocked host element with no role or text). */
function allNodes(): Json[] {
  const out: Json[] = [];
  const walk = (node: Json | string | null | (Json | string)[]) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    out.push(node);
    node.children?.forEach(walk);
  };
  walk(screen.toJSON() as unknown as Json | Json[] | null);
  return out;
}
const icons = () => allNodes().filter(node => node.type === 'Icon');
/** The outermost drawn box. */
const outer = () => StyleSheet.flatten((screen.toJSON() as unknown as Json).props.style as never) as Record<string, unknown>;
const buttons = () => screen.getAllByRole('button');
const style = (node: { props: { style?: unknown } }) => (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

describe('DialogFrame', () => {
  it('draws the title and message, and a tone icon (none for the default tone)', async () => {
    const first = await render(<DialogHeading title="Delete item?" message="It cannot be undone." tone="danger" />);
    const shown = screen.getAllByText(/.+/);
    expect(shown).toHaveLength(2);
    expect(shown[0]).toHaveTextContent('Delete item?');
    expect(shown[1]).toHaveTextContent('It cannot be undone.');
    expect(icons().filter(icon => icon.props.name === 'alert-circle-outline')).toHaveLength(1);
    await first.unmount();
    await render(<DialogHeading title="Rename" />);
    expect(screen.getByText('Rename')).toBeOnTheScreen();
    expect(icons()).toHaveLength(0);
  });

  it('keeps two buttons side by side in the order given: cancel first, then the action', async () => {
    const cancel = jest.fn(); const go = jest.fn();
    await render(
      <DialogActions>
        <DialogButton label="Cancel" onPress={cancel} />
        <DialogButton label="Delete" role="negative" onPress={go} />
      </DialogActions>
    );
    expect(buttons()).toHaveLength(2);
    expect(buttons()[0]).toHaveAccessibleName('Cancel');
    expect(buttons()[1]).toHaveAccessibleName('Delete');
    await user.press(buttons()[1]);
    expect(go).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    // Side by side: a row, not a stack.
    expect(outer().flexDirection).toBe('row');
  });

  it('stacks three buttons in a column, full width, action first and cancel last', async () => {
    await render(
      <DialogActions stacked>
        <DialogButton stacked role="primary" label="Change the rate" onPress={jest.fn()} />
        <DialogButton stacked label="Only this GRN" onPress={jest.fn()} />
        <DialogButton stacked label="Back" onPress={jest.fn()} />
      </DialogActions>
    );
    expect(buttons()).toHaveLength(3);
    expect(buttons()[0]).toHaveAccessibleName('Change the rate');
    expect(buttons()[1]).toHaveAccessibleName('Only this GRN');
    expect(buttons()[2]).toHaveAccessibleName('Back');
    expect(outer().flexDirection).toBeUndefined();
    expect(style(buttons()[0]).flexGrow).toBeUndefined();
  });

  it('colours the roles: primary brand fill, negative destructive fill, secondary outlined only', async () => {
    await render(
      <DialogActions>
        <DialogButton label="Cancel" onPress={jest.fn()} />
        <DialogButton label="Save" role="primary" onPress={jest.fn()} />
        <DialogButton label="Delete" role="negative" onPress={jest.fn()} />
      </DialogActions>
    );
    const [secondary, primary, negative] = buttons().map(style);
    expect(secondary.backgroundColor).toBeUndefined();
    expect(secondary.borderColor).toBe(tokens.border.button);
    expect(primary.backgroundColor).toBe(tokens.brand.fill);
    expect(negative.backgroundColor).toBe(tokens.destructive.fill);
  });

  it('a busy button is switched off, shows its busy label and a spinner instead of its label', async () => {
    await render(<DialogButton label="Print" busy busyLabel="Printing…" role="primary" onPress={jest.fn()} />);
    const [button] = buttons();
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    const shown = screen.getAllByText(/.+/);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent('Printing…');
  });

  it('a disabled button is switched off but not busy, and keeps its label', async () => {
    await render(<DialogButton label="Cancel" disabled onPress={jest.fn()} />);
    const [button] = buttons();
    expect(button).toBeDisabled();
    // Exactly false: `not.toBeBusy` would also pass for an absent state.
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false });
    const shown = screen.getAllByText(/.+/);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent('Cancel');
  });

  it('the scrim closes only when it is given an action, and is hidden from the screen reader unless labelled', async () => {
    const onScrimPress = jest.fn();
    const first = await render(
      <DialogOverlay onScrimPress={onScrimPress}>
        <DialogCard><DialogBody><Text>Body</Text></DialogBody></DialogCard>
      </DialogOverlay>
    );
    // The unlabelled scrim is hidden from the screen reader, so it has no role or name to be found by.
    expect(screen.queryByRole('button', { includeHiddenElements: true })).not.toBeOnTheScreen();
    const scrim = screen.root!.children.find(child => typeof child !== 'string' && child.props.importantForAccessibility === 'no');
    expect(scrim).toBeDefined();
    await user.press(scrim as never);
    expect(onScrimPress).toHaveBeenCalledTimes(1);
    await first.unmount();
    await render(
      <DialogOverlay onScrimPress={onScrimPress} scrimLabel="Close dialog">
        <DialogCard><DialogBody><Text>Body</Text></DialogBody></DialogCard>
      </DialogOverlay>
    );
    expect(screen.getByRole('button', { name: 'Close dialog', includeHiddenElements: true })).toBeOnTheScreen();
  });

  describe('the title and the message are one screen-reader stop (WH-292)', () => {
    const groupOf = (title: string) => screen.getByText(title).parent!;
    const hiddenNodes = () => allNodes().filter(node => node.props.importantForAccessibility === 'no-hide-descendants' || node.props.accessibilityElementsHidden === true);

    it('share one accessible View with no role: the title is not a header, both Texts are inside the group', async () => {
      await render(<DialogHeading title="Delete item?" message="It cannot be undone." />);
      const group = groupOf('Delete item?');
      expect(group).toHaveProp('accessible', true);
      expect(group.props.accessibilityRole).toBeUndefined();
      expect(within(group).getByText('Delete item?')).toBeOnTheScreen();
      expect(within(group).getByText('It cannot be undone.')).toBeOnTheScreen();
      expect(groupOf('It cannot be undone.')).toBe(group);
      expect(screen.queryByRole('header', { includeHiddenElements: true })).not.toBeOnTheScreen();
    });

    it('with no message the stop is the title alone', async () => {
      await render(<DialogHeading title="Rename" />);
      const group = groupOf('Rename');
      expect(group).toHaveProp('accessible', true);
      expect(within(group).getAllByText(/.+/)).toHaveLength(1);
      expect(within(group).getByText('Rename')).toBeOnTheScreen();
    });

    it('the buttons are never hidden from screen readers; only the tone icon is', async () => {
      await render(
        <DialogCard>
          <DialogHeading title="Delete item?" message="It cannot be undone." tone="danger" />
          <DialogActions>
            <DialogButton label="Cancel" onPress={jest.fn()} />
            <DialogButton label="Delete" role="negative" onPress={jest.fn()} />
          </DialogActions>
        </DialogCard>
      );
      // Found by role at once, with no timer run: nothing waits for a focus event.
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeOnTheScreen();
      // The only node hidden from the screen reader is the tone icon's circle, and it holds the icon.
      const hidden = hiddenNodes();
      expect(hidden).toHaveLength(1);
      expect(hidden[0].children?.some(child => typeof child !== 'string' && child.type === 'Icon')).toBe(true);
    });
  });

  describe('screen-reader focus on the title (WH-292)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.useRealTimers();
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });
    const spyFocus = () => jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => undefined);
    // The title and the message are one accessible View with no role; its layout starts the timer and it gets the event.
    const group = () => screen.getByText('Delete item?').parent!;
    const layoutTitle = async () => fireEvent(group(), 'layout');
    const advance = async (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

    it('sends the focus event to the title once, 400 ms after its layout, not at layout or before', async () => {
      const send = spyFocus();
      await render(<DialogHeading title="Delete item?" message="It cannot be undone." />);
      await layoutTitle();
      expect(send).not.toHaveBeenCalled();
      await advance(399);
      expect(send).not.toHaveBeenCalled();
      await advance(1);
      expect(send).toHaveBeenCalledTimes(1);
      // The node sent is the group View (not the title Text): the view that holds both texts.
      const [node, kind] = send.mock.calls[0] as unknown as [{ props: { accessible?: boolean; children: { props: { children: string } }[] } }, string];
      expect(node.props.accessible).toBe(true);
      expect(node.props.children.map(child => child.props.children)).toEqual(['Delete item?', 'It cannot be undone.']);
      expect(kind).toBe('focus');
      await advance(2000);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('a second layout of the same heading does not send a second event', async () => {
      const send = spyFocus();
      await render(<DialogHeading title="Delete item?" />);
      await layoutTitle();
      await advance(400);
      expect(send).toHaveBeenCalledTimes(1);
      await layoutTitle();
      await advance(1000);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('unmounting before the 400 ms are over sends no event', async () => {
      const send = spyFocus();
      const scheduled = jest.spyOn(global, 'setTimeout');
      const cancelled = jest.spyOn(global, 'clearTimeout');
      const view = await render(<DialogHeading title="Delete item?" />);
      await layoutTitle();
      await advance(200);
      const index = scheduled.mock.calls.findIndex(call => call[1] === 400);
      expect(index).toBeGreaterThanOrEqual(0);
      const focusTimer = scheduled.mock.results[index].value;
      await view.unmount();
      // The pending timer is cancelled, not left to fire on a dead title (the ref guard alone would hide a leak).
      expect(cancelled).toHaveBeenCalledWith(focusTimer);
      await advance(1000);
      expect(send).not.toHaveBeenCalled();
    });
  });
});
