/**
 * The dispatch table of a card is behind a toggle (owner decision, 2026-10-19): closed at first, except for a card of one
 * line; a figure typed in a card survives closing it; a closed card with refused text says so under its toggle; Next opens
 * the card of the first wrong figure.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, hasInputMounted, inputOf, textsOf, HIDDEN } from '@/tests/helpers/invoiceItemsHarness';
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

const GROUP = 'i1:::M1';
const CHARGE_1 = 'cell|edit_0_0|charge';
const toggleId = (group = GROUP) => `group-toggle-${group}`;
const hasText = (part: string) => textsOf().some((text) => text.includes(part));

async function mount(lines: InvoiceItemData[], ref?: React.Ref<InvoiceItemsEditorHandle>) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await render(<ConnectedEditor editorRef={ref} />);
}
const toggle = (group = GROUP) => within(screen.getByTestId(toggleId(group))).getByRole('button');
const press = async (group = GROUP) => { await userEvent.press(toggle(group)); };
const isOpen = (group = GROUP) => toggle(group).props.accessibilityState.expanded === true;

describe('a card with several dispatch lines', () => {
  it('starts closed: its lines and their cells are not drawn, the toggle says how many lines it hides', async () => {
    await mount(groupLines(2));

    expect(isOpen()).toBe(false);
    expect(textsOf()).toContain('Show dispatch details (2)');
    expect(hasInputMounted(CHARGE_1)).toBe(false);
    expect(screen.queryByTestId('line-edit_0_0', HIDDEN)).not.toBeOnTheScreen();
    // The shared fields are there without opening it.
    expect(hasInput(`group|${GROUP}|charge`)).toBe(true);
  });

  it('opens and closes with the toggle', async () => {
    await mount(groupLines(2));

    await press();
    expect(isOpen()).toBe(true);
    expect(textsOf()).toContain('Hide dispatch details');
    expect(hasInput(CHARGE_1)).toBe(true);
    expect(textsOf()).toContain('Swipe the table sideways to see more');

    await press();
    expect(isOpen()).toBe(false);
    expect(hasInputMounted(CHARGE_1)).toBe(false);
  });

  it('keeps what was typed in a line while the card is closed, and shows it again when it is opened', async () => {
    await mount(groupLines(2));
    await press();
    await fireEvent(inputOf(CHARGE_1), 'focus', {});
    await fireEvent.changeText(inputOf(CHARGE_1), '8');
    await fireEvent(inputOf(CHARGE_1), 'blur', {});

    await press();
    expect(mockStore.getState().invoiceForm.items[0].charge).toBe(8);
    await press();
    expect(inputOf(CHARGE_1).props.value).toBe('8.00');
  });

  it('opens each card on its own', async () => {
    await mount([...groupLines(2), ...groupLines(2, { item_id: 'i2', item_name: 'Example Onions', package_mark: 'M2' }).map((line, n) => ({ ...line, temp_id: `edit_${n + 2}_0` }))]);

    await press('i2:::M2');
    expect(isOpen('i2:::M2')).toBe(true);
    expect(isOpen()).toBe(false);
  });
});

describe('a card with one dispatch line', () => {
  it('starts open, since its charge could not be changed otherwise', async () => {
    await mount([invoiceLine({}, 0)]);

    expect(isOpen()).toBe(true);
    expect(hasInput(CHARGE_1)).toBe(true);
  });
});

describe('a refused figure in a closed card', () => {
  const refuse = async () => {
    await fireEvent(inputOf(CHARGE_1), 'focus', {});
    await fireEvent.changeText(inputOf(CHARGE_1), '10000');
    await fireEvent(inputOf(CHARGE_1), 'blur', {});
  };

  it('says "1 figure to fix" under the closed toggle, and not under an open one', async () => {
    await mount(groupLines(2));
    await press();
    await refuse();
    expect(hasText('figure to fix')).toBe(false);

    await press();
    expect(textsOf()).toContain('1 figure to fix');
    expect(toggle().props.accessibilityLabel).toContain('1 figure to fix');

    await press();
    expect(hasText('figure to fix')).toBe(false);
  });

  it('is counted by Next, which opens the card and announces it', async () => {
    const ref = React.createRef<InvoiceItemsEditorHandle>();
    await mount(groupLines(2), ref);
    await press();
    await refuse();
    await press();
    expect(isOpen()).toBe(false);

    let count = -1;
    await act(async () => { count = ref.current!.checkAll(); });

    expect(count).toBe(1);
    expect(announce).toHaveBeenCalledWith('Fix the highlighted figure, then continue.');
    expect(isOpen()).toBe(true);
    expect(inputOf(CHARGE_1).props.value).toBe('10000');
    expect(inputOf(CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
  });
});
