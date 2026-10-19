/**
 * The items editor with react-native's own `TextInput`, which releases the caller's ref and sets it
 * again on every key it reports (its jest mock does not). The phone failed on exactly that while the
 * other editor tests passed: the focused field lost its entry after the first key, the cell fell back to
 * "5.00" and the layout let go of a cell that was still being typed in. The input is driven with the
 * events the device sends (focus, change with a rising event count, blur) and the settle time passes
 * between the keys.
 */
import React from 'react';
import { AccessibilityInfo, Keyboard, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { resetScreenReaderKnown } from '@/hooks/useScreenReader';
import { makeInvoiceStore, fillNewInvoice, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, chargeEntryOf, emitKeyboard, hostBlur, hostFocus, hostInputOf, hostKey, textsOf, track, unmountAll } from '@/tests/helpers/invoiceItemsHarness';
import type { InvoiceItemData } from '@/types/invoice.types';

jest.unmock('react-native/Libraries/Components/TextInput/TextInput');
let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
let mockWidth = 411;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 3, fontScale: 1 }),
}));

let keyboardCalls: ReadonlyArray<readonly unknown[]> = [];
let events = 0;
beforeEach(() => {
  events = 0;
  mockWidth = 411;
  jest.useFakeTimers();
  const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation(() => ({ remove: jest.fn() }) as never);
  keyboardCalls = listen.mock.calls;
});
afterEach(() => {
  resetScreenReaderKnown();
  act(() => unmountAll());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const CHARGE_1 = 'cell|edit_0_0|charge';
const CHARGE_2 = 'cell|edit_1_0|charge';
/** The fictional Rai group of the phone run: four lines of one item and mark. */
const raiLines = (): InvoiceItemData[] => groupLines(4, { item_id: 'rai', item_name: 'Example Rai', package_mark: 'BULK-4', qty: 12, weight: 25 });

async function render(lines: InvoiceItemData[] = groupLines(2)) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = track(create(<ConnectedEditor />)); });
  return tree;
}
const widthsOf = (tree: ReactTestRenderer) => tree.root.findAll((node) => node.props.widths !== undefined && typeof node.type !== 'string')[0].props.widths;
const cardsNow = (tree: ReactTestRenderer) => tree.root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('line-')).length === 0;
const pause = async (ms = 400) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const lineTotals = (tree: ReactTestRenderer) => textsOf(tree).filter((text) => /^₹[\d,]+\.\d\d$/.test(text));

/** Types the texts one key at a time, as the device does: a rising event count (across calls) and a pause after each key. */
async function type(tree: ReactTestRenderer, key: string, texts: string[], seen?: (text: string) => void) {
  for (const text of texts) {
    // the count keeps rising across calls, as the native input's does
    events += 1;
    await act(async () => { hostKey(tree, key, text, events); });
    await pause();
    seen?.(text);
  }
}

describe('a cell typed in with the real TextInput', () => {
  it('holds the table for 1, 10, 100 ... 1000000 (four lines, 411 dp, font scale 1.0), and follows the figures after the blur settles', async () => {
    const tree = await render(raiLines());
    const before = widthsOf(tree);
    expect(cardsNow(tree)).toBe(false);
    await act(async () => { hostFocus(tree, CHARGE_1); });
    await type(tree, CHARGE_1, ['1', '10', '100', '1000', '10000', '100000', '1000000', '999999'], () => {
      expect(widthsOf(tree)).toEqual(before);
      expect(cardsNow(tree)).toBe(false);
    });
    await act(async () => { hostBlur(tree, CHARGE_1); });
    // not at once: a move to the next field would take the focus within the settle time
    expect(widthsOf(tree)).toEqual(before);
    await pause();
    // the charge of 999999 (1000000 was refused, 999999 is the largest) on 12 bags no longer fits a table at 411 dp: the lines are cards now
    expect(cardsNow(tree)).toBe(true);
  });

  it('keeps the focused cell\'s entry across the ref release on every key', async () => {
    const tree = await render(raiLines());
    await act(async () => { hostFocus(tree, CHARGE_1); });
    expect(chargeEntryOf(tree, 'edit_0_0')).toBeUndefined();
    await type(tree, CHARGE_1, ['1', '10', '100'], (text) => expect(chargeEntryOf(tree, 'edit_0_0')).toBe(text));
  });

  it('shows "5", "5.", "5.5" while the cell is focused and "5.50" after the blur (not "5.00")', async () => {
    const tree = await render();
    expect(hostInputOf(tree, CHARGE_1).props.value).toBe('5.00');
    await act(async () => { hostFocus(tree, CHARGE_1); });
    await type(tree, CHARGE_1, ['5', '5.', '5.5'], (text) => expect(hostInputOf(tree, CHARGE_1).props.value).toBe(text));
    expect(mockStore.getState().invoiceForm.items[0].charge).toBe(5.5);
    await act(async () => { hostBlur(tree, CHARGE_1); });
    expect(hostInputOf(tree, CHARGE_1).props.value).toBe('5.50');
  });

  it('shows the error after the blur for a refused value, and no total ever shows it', async () => {
    const tree = await render();
    expect(lineTotals(tree)).toContain('₹735.00');
    await act(async () => { hostFocus(tree, CHARGE_1); });
    await type(tree, CHARGE_1, ['8'], () => expect(lineTotals(tree)).toContain('₹1,050.00'));
    await type(tree, CHARGE_1, ['1000000']);
    // refused: the form holds the charge the cell had on focus, and the cell keeps the typed text
    expect(lineTotals(tree)).toContain('₹735.00');
    expect(lineTotals(tree)).not.toContain('₹1,050.00');
    expect(hostInputOf(tree, CHARGE_1).props.value).toBe('1000000');
    expect(hostInputOf(tree, CHARGE_1).props.accessibilityHint).toBeUndefined();
    await act(async () => { hostBlur(tree, CHARGE_1); });
    expect(textsOf(tree)).toContain('Enter a charge from 0 to 999999.');
    expect(hostInputOf(tree, CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 999999.');
    expect(hostInputOf(tree, CHARGE_1).props.value).toBe('1000000');
    expect(lineTotals(tree)).toContain('₹735.00');
  });

  it('lets go of the focus when the keyboard hides after typing (the editor\'s own listener)', async () => {
    const tree = await render();
    await act(async () => { hostFocus(tree, CHARGE_1); });
    await type(tree, CHARGE_1, ['1', '10', '100']);
    // the test renderer's input has a mocked blur(): it records which input the editor let go of
    const focused = TextInput.State.currentlyFocusedInput() as unknown as { blur: jest.Mock; props: { testID: string } };
    expect(focused.props.testID).toBe(CHARGE_1);
    expect(focused.blur).not.toHaveBeenCalled();
    await act(async () => { emitKeyboard(keyboardCalls, 'keyboardDidHide'); });
    expect(focused.blur).toHaveBeenCalledTimes(1);
  });

  it('keeps the table in the gap between one field\'s blur and the next field\'s focus event (Next, focus arriving 400 ms late)', async () => {
    const tree = await render(raiLines());
    const before = widthsOf(tree);
    // the input object of line 2, which react-native hands to the editor: the one it records as focused
    await act(async () => { hostFocus(tree, CHARGE_2); });
    const second = TextInput.State.currentlyFocusedInput() as unknown as { focus: () => void };
    await act(async () => { hostBlur(tree, CHARGE_2); });
    await pause();
    // react-native records the focus at once; the focus event of the host input comes later
    second.focus = () => require('react-native/Libraries/Components/TextInput/TextInputState').default.focusInput(second);
    await act(async () => { hostFocus(tree, CHARGE_1); });
    await type(tree, CHARGE_1, ['9', '99', '999', '9999', '99999', '999999']);
    await act(async () => { hostInputOf(tree, CHARGE_1).props.onSubmitEditing({ nativeEvent: { text: '999999' } }); });
    await act(async () => { hostBlur(tree, CHARGE_1); });
    await pause(400);
    expect(widthsOf(tree)).toEqual(before);
    expect(cardsNow(tree)).toBe(false);
    await act(async () => { hostFocus(tree, CHARGE_2); });
    await act(async () => { hostBlur(tree, CHARGE_2); });
    await pause(400);
    expect(cardsNow(tree)).toBe(true);
  });
});

describe('a focused field drawn again by another component', () => {
  const setCharge = async (id: string, charge: number) => {
    await act(async () => { mockStore.dispatch({ type: 'invoiceForm/updateEditedItem', payload: { temp_id: id, values: { charge } } }); });
    await pause();
  };
  const redraw = async (tree: ReactTestRenderer) => { await act(async () => { tree.update(<ConnectedEditor />); }); };

  it('lets the layout follow the figures again after a width change while a cell is focused (411, 320, 411 dp)', async () => {
    const tree = await render(raiLines());
    await act(async () => { hostFocus(tree, CHARGE_1); });
    await type(tree, CHARGE_1, ['7']);
    mockWidth = 320;
    await redraw(tree);
    expect(cardsNow(tree)).toBe(true);
    mockWidth = 411;
    await redraw(tree);
    await pause();
    expect(cardsNow(tree)).toBe(false);
    // the field is gone with its focus: the hold has ended, and a charge that does not fit a table makes cards
    await setCharge('edit_1_0', 999999);
    expect(cardsNow(tree)).toBe(true);
  });

  it('lets the layout follow the figures again after the screen reader is switched on and off while a cell is focused', async () => {
    let changed: ((on: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (on: boolean) => void) => {
      if (name === 'screenReaderChanged') changed = handler;
      return { remove: jest.fn() };
    }) as never);
    const tree = await render(raiLines());
    await act(async () => { hostFocus(tree, CHARGE_1); });
    await type(tree, CHARGE_1, ['7']);
    await act(async () => { changed!(true); });
    expect(cardsNow(tree)).toBe(true);
    await act(async () => { changed!(false); });
    await pause();
    expect(cardsNow(tree)).toBe(false);
    await setCharge('edit_1_0', 999999);
    expect(cardsNow(tree)).toBe(true);
  });
});
