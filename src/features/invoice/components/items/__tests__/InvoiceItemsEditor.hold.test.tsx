/**
 * Phone run E2: the layout moved under the finger while a charge was typed (1, 10, 100, 1000 in a
 * four-line group at 411 dp, font scale 1.0). The layout follows the items only while no cell is
 * pressed or focused; a tap scrolls the tapped row up.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, inputOf, track, unmountAll } from '@/tests/helpers/invoiceItemsHarness';
import { EditableNumberCell } from '@/components/table/EditableNumberCell';
import { SCROLL_VIEW_POSITION } from '../InvoiceItemsEditor';
import type { InvoiceItemData } from '@/types/invoice.types';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: 1 }),
}));
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => unmountAll());
  jest.useRealTimers();
});

const CHARGE_1 = 'cell|edit_0_0|charge';
const CHARGE_2 = 'cell|edit_1_0|charge';
/** The fictional Rai group of the phone run: four lines of one item and mark. */
const raiLines = (): InvoiceItemData[] => groupLines(4, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'BULK-4', qty: 12, weight: 25 });

async function render(lines: InvoiceItemData[] = raiLines()) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = track(create(<ConnectedEditor />)); });
  return tree;
}
const widthsOf = (tree: ReactTestRenderer) => tree.root.findAll((node) => node.props.widths !== undefined && typeof node.type !== 'string')[0].props.widths;
const tapOf = (tree: ReactTestRenderer, key: string) =>
  tree.root.find((node) => node.props.testID === `${key}-tap` && typeof node.props.onPress === 'function');
const cardsNow = (tree: ReactTestRenderer) => tree.root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('line-')).length === 0;
const settle = async () => { await act(async () => { jest.advanceTimersByTime(400); }); };

describe('the layout while a cell is focused', () => {
  it('does not move for 1, 10, 100, 1000, 10000, 100000, 1000000, and follows the figures after the blur settles', async () => {
    const tree = await render();
    const before = widthsOf(tree);
    await act(async () => { inputOf(tree, CHARGE_1).props.onFocus({}); });
    for (const text of ['1', '10', '100', '1000', '10000', '100000', '1000000']) {
      await act(async () => { inputOf(tree, CHARGE_1).props.onChangeText(text); });
      expect(widthsOf(tree)).toEqual(before);
      expect(cardsNow(tree)).toBe(false);
    }
    // a refused or partial entry does not change it either, and the other cells keep their lines' figures
    await act(async () => { inputOf(tree, CHARGE_1).props.onChangeText('999999'); });
    expect(widthsOf(tree)).toEqual(before);
    await act(async () => { inputOf(tree, CHARGE_1).props.onBlur({}); });
    // not at once: a move to the next field would take the focus within the settle time
    expect(widthsOf(tree)).toEqual(before);
    await settle();
    // the charge ₹999,999.00 does not fit a table at 411 dp: the lines are cards now
    expect(cardsNow(tree)).toBe(true);
  });

  it('keeps the table while 99999 is typed (it would be cards), and turns into cards once the blur settles', async () => {
    const tree = await render();
    const before = widthsOf(tree);
    await act(async () => { inputOf(tree, CHARGE_1).props.onFocus({}); });
    await act(async () => { inputOf(tree, CHARGE_1).props.onChangeText('99999'); });
    expect(widthsOf(tree)).toEqual(before);
    expect(cardsNow(tree)).toBe(false);
    await act(async () => { inputOf(tree, CHARGE_1).props.onBlur({}); });
    await settle();
    expect(cardsNow(tree)).toBe(true);
  });

  it('is held from the touch down, before the focus arrives, and a swipe that never focuses lets it go', async () => {
    const tree = await render();
    const before = widthsOf(tree);
    await act(async () => { tapOf(tree, CHARGE_2).props.onPressIn(); });
    // the figures change (another cell, the form) while the finger is down
    await act(async () => { mockStore.dispatch({ type: 'invoiceForm/updateEditedItem', payload: { temp_id: 'edit_0_0', values: { charge: 123456 } } }); });
    expect(widthsOf(tree)).toEqual(before);
    await act(async () => { tapOf(tree, CHARGE_2).props.onPressOut(); });
    await settle();
    expect(cardsNow(tree)).toBe(true);
  });
});

describe('a press on a cell', () => {
  it('scrolls its row up with the walk\'s view position, before the input is focused', async () => {
    const tree = await render(groupLines(2));
    const scrollToIndex = jest.fn();
    act(() => { tree.root.findByType('FlashList' as never).props.innerRef({ scrollToIndex }); });
    const rows: { key: string }[] = tree.root.findByType('FlashList' as never).props.data;
    const focus = jest.fn();
    Object.assign(inputOf(tree, CHARGE_2).instance as object, { focus, isFocused: () => false });
    expect(scrollToIndex).not.toHaveBeenCalled();
    await act(async () => { tapOf(tree, CHARGE_2).props.onPress(); });
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    const call = scrollToIndex.mock.calls[0][0];
    expect(call).toMatchObject({ viewPosition: SCROLL_VIEW_POSITION, animated: false });
    expect(rows[call.index].key).toContain('edit_1_0');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(scrollToIndex.mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
  });

  it('selects all on a second press of the focused cell', async () => {
    const tree = await render(groupLines(2));
    const setSelection = jest.fn();
    Object.assign(inputOf(tree, CHARGE_1).instance as object, { focus: jest.fn(), isFocused: () => true, setSelection });
    await act(async () => { inputOf(tree, CHARGE_1).props.onFocus({}); });
    await act(async () => { tapOf(tree, CHARGE_1).props.onPress(); });
    expect(setSelection).toHaveBeenCalledWith(0, '5.00'.length);
  });

  it('keeps the wrapper around every cell untouchable, focused or not', async () => {
    const tree = await render(groupLines(2));
    const wrapper = () => tree.root.find((node) => node.props.testID === `${CHARGE_1}-touch` && node.props.pointerEvents !== undefined);
    expect(wrapper().props.pointerEvents).toBe('none');
    await act(async () => { inputOf(tree, CHARGE_1).props.onFocus({}); });
    expect(wrapper().props.pointerEvents).toBe('none');
    expect(tree.root.findAllByType(EditableNumberCell).length).toBeGreaterThan(0);
  });
});
