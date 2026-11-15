/**
 * The one dialog frame (WH-219, STYLE_GUIDE §13.9): heading with tone icon, buttons by role, two side by side in
 * the order given (cancel first) or stacked (action first), busy and disabled buttons. Real components.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
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
let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

const renderUi = async (ui: React.ReactElement) => { await act(async () => { tree = create(ui); }); };
const buttons = () => tree!.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.props.accessibilityState !== undefined);
const labels = () => buttons().map(b => b.props.accessibilityLabel);
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
const bg = (node: ReactTestInstance) => (StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style) ?? {}) as Record<string, unknown>;

describe('DialogFrame', () => {
  it('draws the title and message, and a tone icon (none for the default tone)', async () => {
    await renderUi(<DialogHeading title="Delete item?" message="It cannot be undone." tone="danger" />);
    expect(texts()).toEqual(['Delete item?', 'It cannot be undone.']);
    expect(tree!.root.findAll(n => (n.type as unknown) === 'Icon' && n.props.name === 'alert-circle-outline')).toHaveLength(1);
    await act(async () => { tree!.unmount(); });
    await renderUi(<DialogHeading title="Rename" />);
    expect(tree!.root.findAll(n => (n.type as unknown) === 'Icon')).toHaveLength(0);
  });

  it('keeps two buttons side by side in the order given: cancel first, then the action', async () => {
    const cancel = jest.fn(); const go = jest.fn();
    await renderUi(
      <DialogActions>
        <DialogButton label="Cancel" onPress={cancel} />
        <DialogButton label="Delete" role="negative" onPress={go} />
      </DialogActions>
    );
    expect(labels()).toEqual(['Cancel', 'Delete']);
    await act(async () => buttons()[1].props.onPress());
    expect(go).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    // Side by side: a row, not a stack.
    expect(StyleSheet.flatten(tree!.root.findAll(n => (n.type as unknown) === 'View')[0].props.style).flexDirection).toBe('row');
  });

  it('stacks three buttons in a column, full width, action first and cancel last', async () => {
    await renderUi(
      <DialogActions stacked>
        <DialogButton stacked role="primary" label="Change the rate" onPress={jest.fn()} />
        <DialogButton stacked label="Only this GRN" onPress={jest.fn()} />
        <DialogButton stacked label="Back" onPress={jest.fn()} />
      </DialogActions>
    );
    expect(labels()).toEqual(['Change the rate', 'Only this GRN', 'Back']);
    expect(StyleSheet.flatten(tree!.root.findAll(n => (n.type as unknown) === 'View')[0].props.style).flexDirection).toBeUndefined();
    expect(bg(buttons()[0]).flexGrow).toBeUndefined();
  });

  it('colours the roles: primary brand fill, negative destructive fill, secondary outlined only', async () => {
    await renderUi(
      <DialogActions>
        <DialogButton label="Cancel" onPress={jest.fn()} />
        <DialogButton label="Save" role="primary" onPress={jest.fn()} />
        <DialogButton label="Delete" role="negative" onPress={jest.fn()} />
      </DialogActions>
    );
    const [secondary, primary, negative] = buttons().map(bg);
    expect(secondary.backgroundColor).toBeUndefined();
    expect(secondary.borderColor).toBe(tokens.border.button);
    expect(primary.backgroundColor).toBe(tokens.brand.fill);
    expect(negative.backgroundColor).toBe(tokens.destructive.fill);
  });

  it('a busy button is switched off, shows its busy label and a spinner instead of its label', async () => {
    await renderUi(<DialogButton label="Print" busy busyLabel="Printing…" role="primary" onPress={jest.fn()} />);
    expect(buttons()[0].props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(texts()).toEqual(['Printing…']);
  });

  it('a disabled button is switched off but not busy, and keeps its label', async () => {
    await renderUi(<DialogButton label="Cancel" disabled onPress={jest.fn()} />);
    expect(buttons()[0].props.accessibilityState).toEqual({ disabled: true, busy: false });
    expect(texts()).toEqual(['Cancel']);
  });

  it('the scrim closes only when it is given an action, and is hidden from the screen reader unless labelled', async () => {
    const onScrimPress = jest.fn();
    await renderUi(
      <DialogOverlay onScrimPress={onScrimPress}>
        <DialogCard><DialogBody><Text>Body</Text></DialogBody></DialogCard>
      </DialogOverlay>
    );
    const scrim = tree!.root.find(n => n.props.importantForAccessibility === 'no' && typeof n.props.onPress === 'function');
    await act(async () => scrim.props.onPress());
    expect(onScrimPress).toHaveBeenCalledTimes(1);
    await act(async () => { tree!.unmount(); });
    await renderUi(
      <DialogOverlay onScrimPress={onScrimPress} scrimLabel="Close dialog">
        <DialogCard><DialogBody><Text>Body</Text></DialogBody></DialogCard>
      </DialogOverlay>
    );
    expect(tree!.root.findAll(n => n.props.accessibilityLabel === 'Close dialog' && n.props.accessibilityRole === 'button')).not.toHaveLength(0);
  });
});
