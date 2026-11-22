/**
 * Phone run E2: the layout moved under the finger while a charge was typed (1, 10, 100, 1000 in a
 * four-line group at 411 dp, font scale 1.0). The layout follows the items only while no cell is
 * pressed or focused; a tap scrolls the tapped row up.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { makeInvoiceStore, fillNewInvoice, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, flashListOf, inputObjectOf, inputOf, openAllGroups, columnWidthsOf, HIDDEN } from '@/tests/helpers/invoiceItemsHarness';
import { SCROLL_VIEW_POSITION } from '../InvoiceItemsEditor';
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
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
});

const CHARGE_1 = 'cell|edit_0_0|charge';
const CHARGE_2 = 'cell|edit_1_0|charge';
/** The fictional Rai group of the phone run: four lines of one item and mark. */
const raiLines = (): InvoiceItemData[] => groupLines(4, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'BULK-4', qty: 12, weight: 25 });

async function mount(lines: InvoiceItemData[] = raiLines()) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await render(<ConnectedEditor />);
  await openAllGroups();
}
const widthsOf = columnWidthsOf;
const tapOf = (key: string) => screen.getByTestId(`${key}-tap`);
const cardsNow = () => screen.queryAllByTestId(/^line-/).length === 0;
const settle = async () => { await act(async () => { jest.advanceTimersByTime(400); }); };

describe('the layout while a cell is focused', () => {
  it('does not move for 1, 10, 100, 1000, 10000, 100000, 1000000, and follows the figures after the blur settles', async () => {
    await mount();
    const before = widthsOf();
    await fireEvent(inputOf(CHARGE_1), 'focus', {});
    for (const text of ['1', '10', '100', '1000', '10000', '100000', '1000000']) {
      await fireEvent.changeText(inputOf(CHARGE_1), text);
      expect(widthsOf()).toEqual(before);
      expect(cardsNow()).toBe(false);
    }
    // a charge is limited to 9999.99 on entry: 9999.99 is the largest that is accepted
    await fireEvent.changeText(inputOf(CHARGE_1), '9999.99');
    expect(widthsOf()).toEqual(before);
    await fireEvent(inputOf(CHARGE_1), 'blur', {});
    // not at once: a move to the next field would take the focus within the settle time
    expect(widthsOf()).toEqual(before);
    await settle();
    // the charge ₹9999.99 is wider than the Charge and Amount columns were: they widen, and the lines stay a table
    expect(widthsOf()).not.toEqual(before);
    expect(cardsNow()).toBe(false);
  });

  it('keeps the widths for a refused entry (99999), also once the blur has settled', async () => {
    await mount();
    const before = widthsOf();
    await fireEvent(inputOf(CHARGE_1), 'focus', {});
    await fireEvent.changeText(inputOf(CHARGE_1), '99999');
    expect(widthsOf()).toEqual(before);
    expect(cardsNow()).toBe(false);
    await fireEvent(inputOf(CHARGE_1), 'blur', {});
    await settle();
    // refused: the form holds the charge the cell had on focus, so nothing is wider
    expect(widthsOf()).toEqual(before);
    expect(cardsNow()).toBe(false);
  });

  it('is held from the touch down, before the focus arrives, and a swipe that never focuses lets it go', async () => {
    await mount();
    const before = widthsOf();
    await fireEvent(tapOf(CHARGE_2), 'pressIn');
    // the figures change (another cell, the form) while the finger is down
    await act(async () => { mockStore.dispatch({ type: 'invoiceForm/updateEditedItem', payload: { temp_id: 'edit_0_0', values: { charge: 9999.99 } } }); });
    expect(widthsOf()).toEqual(before);
    await fireEvent(tapOf(CHARGE_2), 'pressOut');
    await settle();
    expect(widthsOf()).not.toEqual(before);
    expect(cardsNow()).toBe(false);
  });
});

describe('a press on a cell', () => {
  it('scrolls its row up with the walk\'s view position, before the input is focused', async () => {
    await mount(groupLines(2));
    const scrollToIndex = jest.fn();
    await act(async () => { flashListOf().props.innerRef({ scrollToIndex }); });
    const rows: { key: string }[] = flashListOf().props.data;
    const focus = jest.fn();
    Object.assign(inputObjectOf(CHARGE_2) as object, { focus, isFocused: () => false });
    expect(scrollToIndex).not.toHaveBeenCalled();
    await fireEvent.press(tapOf(CHARGE_2));
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    const call = scrollToIndex.mock.calls[0][0];
    expect(call).toMatchObject({ viewPosition: SCROLL_VIEW_POSITION, animated: false });
    expect(rows[call.index].key).toContain('edit_1_0');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(scrollToIndex.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
  });

  it('selects all on a second press of the focused cell', async () => {
    await mount(groupLines(2));
    const setSelection = jest.fn();
    Object.assign(inputObjectOf(CHARGE_1) as object, { focus: jest.fn(), isFocused: () => true, setSelection });
    await fireEvent(inputOf(CHARGE_1), 'focus', {});
    await fireEvent.press(tapOf(CHARGE_1));
    expect(setSelection).toHaveBeenCalledWith(0, '5.00'.length);
  });

  it('keeps the wrapper around every cell untouchable, focused or not', async () => {
    await mount(groupLines(2));
    const wrapper = () => screen.getByTestId(`${CHARGE_1}-touch`);
    expect(wrapper().props.pointerEvents).toBe('none');
    await fireEvent(inputOf(CHARGE_1), 'focus', {});
    expect(wrapper().props.pointerEvents).toBe('none');
    expect(screen.getAllByTestId(/^cell\|.*\|charge$/).length).toBeGreaterThan(0);
  });
});
