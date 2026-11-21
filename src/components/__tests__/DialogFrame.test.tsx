/**
 * The one dialog frame (WH-219, STYLE_GUIDE §13.9): heading with tone icon, buttons by role, two side by side in
 * the order given (cancel first) or stacked (action first), busy and disabled buttons. Real components.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
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
});
