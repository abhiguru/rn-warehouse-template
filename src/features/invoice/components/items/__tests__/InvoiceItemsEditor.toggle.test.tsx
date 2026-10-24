/**
 * The dispatch table of a card is behind a toggle (owner decision, 2026-10-19): closed at first, except for a card of one
 * line; a figure typed in a card survives closing it; a closed card with refused text says so under its toggle; Next opens
 * the card of the first wrong figure.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf, textsOf, track, unmountAll } from '@/tests/helpers/invoiceItemsHarness';
import type { InvoiceItemsEditorHandle } from '../InvoiceItemsEditor';
import type { InvoiceItemData } from '@/types/invoice.types';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: 1 }),
}));
const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
beforeEach(() => announce.mockClear());
afterEach(() => { act(() => unmountAll()); });

const GROUP = 'i1:::M1';
const CHARGE_1 = 'cell|edit_0_0|charge';
const toggleId = (group = GROUP) => `group-toggle-${group}`;

async function render(lines: InvoiceItemData[], ref?: React.Ref<InvoiceItemsEditorHandle>) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = track(create(<ConnectedEditor editorRef={ref} />)); });
  return tree;
}
const toggle = (tree: ReactTestRenderer, group = GROUP) =>
  tree.root
    .find((node) => (node.type as unknown) === 'View' && node.props.testID === toggleId(group))
    .findAll((node) => typeof node.type !== 'string' && typeof node.props.onPress === 'function' && node.props.accessibilityState?.expanded !== undefined)[0];
const press = async (tree: ReactTestRenderer, group = GROUP) => { await act(async () => { toggle(tree, group).props.onPress(); }); };
const isOpen = (tree: ReactTestRenderer, group = GROUP) => toggle(tree, group).props.accessibilityState.expanded === true;
const hasText = (tree: ReactTestRenderer, part: string) => textsOf(tree).some((text) => text.includes(part));

describe('a card with several dispatch lines', () => {
  it('starts closed: its lines and their cells are not drawn, the toggle says how many lines it hides', async () => {
    const tree = await render(groupLines(2));

    expect(isOpen(tree)).toBe(false);
    expect(textsOf(tree)).toContain('Show dispatch details (2)');
    expect(hasInput(tree, CHARGE_1)).toBe(false);
    expect(tree.root.findAll((node) => node.props.testID === 'line-edit_0_0')).toHaveLength(0);
    // The shared fields are there without opening it.
    expect(hasInput(tree, `group|${GROUP}|charge`)).toBe(true);
  });

  it('opens and closes with the toggle', async () => {
    const tree = await render(groupLines(2));

    await press(tree);
    expect(isOpen(tree)).toBe(true);
    expect(textsOf(tree)).toContain('Hide dispatch details');
    expect(hasInput(tree, CHARGE_1)).toBe(true);
    expect(textsOf(tree)).toContain('Swipe the table sideways to see more');

    await press(tree);
    expect(isOpen(tree)).toBe(false);
    expect(hasInput(tree, CHARGE_1)).toBe(false);
  });

  it('keeps what was typed in a line while the card is closed, and shows it again when it is opened', async () => {
    const tree = await render(groupLines(2));
    await press(tree);
    await act(async () => { inputOf(tree, CHARGE_1).props.onFocus({}); });
    await act(async () => { inputOf(tree, CHARGE_1).props.onChangeText('8'); });
    await act(async () => { inputOf(tree, CHARGE_1).props.onBlur({}); });

    await press(tree);
    expect(mockStore.getState().invoiceForm.items[0].charge).toBe(8);
    await press(tree);
    expect(inputOf(tree, CHARGE_1).props.value).toBe('8.00');
  });

  it('opens each card on its own', async () => {
    const tree = await render([...groupLines(2), ...groupLines(2, { item_id: 'i2', item_name: 'Example Onions', package_mark: 'M2' }).map((line, n) => ({ ...line, temp_id: `edit_${n + 2}_0` }))]);

    await press(tree, 'i2:::M2');
    expect(isOpen(tree, 'i2:::M2')).toBe(true);
    expect(isOpen(tree)).toBe(false);
  });
});

describe('a card with one dispatch line', () => {
  it('starts open, since its charge could not be changed otherwise', async () => {
    const tree = await render([invoiceLine({}, 0)]);

    expect(isOpen(tree)).toBe(true);
    expect(hasInput(tree, CHARGE_1)).toBe(true);
  });
});

describe('a refused figure in a closed card', () => {
  const refuse = async (tree: ReactTestRenderer) => {
    await act(async () => { inputOf(tree, CHARGE_1).props.onFocus({}); });
    await act(async () => { inputOf(tree, CHARGE_1).props.onChangeText('10000'); });
    await act(async () => { inputOf(tree, CHARGE_1).props.onBlur({}); });
  };

  it('says "1 figure to fix" under the closed toggle, and not under an open one', async () => {
    const tree = await render(groupLines(2));
    await press(tree);
    await refuse(tree);
    expect(hasText(tree, 'figure to fix')).toBe(false);

    await press(tree);
    expect(textsOf(tree)).toContain('1 figure to fix');
    expect(toggle(tree).props.accessibilityLabel).toContain('1 figure to fix');

    await press(tree);
    expect(hasText(tree, 'figure to fix')).toBe(false);
  });

  it('is counted by Next, which opens the card and announces it', async () => {
    const ref = React.createRef<InvoiceItemsEditorHandle>();
    const tree = await render(groupLines(2), ref);
    await press(tree);
    await refuse(tree);
    await press(tree);
    expect(isOpen(tree)).toBe(false);

    let count = -1;
    await act(async () => { count = ref.current!.checkAll(); });

    expect(count).toBe(1);
    expect(announce).toHaveBeenCalledWith('Fix the highlighted figure, then continue.');
    expect(isOpen(tree)).toBe(true);
    expect(inputOf(tree, CHARGE_1).props.value).toBe('10000');
    expect(inputOf(tree, CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
  });
});
