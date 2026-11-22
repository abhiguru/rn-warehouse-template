/**
 * The review and phone findings on the Items step (R3a, P2a): a stable layout while typing, text as
 * typed, blur when the keyboard hides, spoken labels in cards, the keep-own note while Mixed, the
 * keyboard's Next and Done keys, and a refused "(all lines)" value that does not forget the rate.
 */
import React from 'react';
import { AccessibilityInfo, Keyboard } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, blurredIds, clearFocused, focusedIds, hasInput, hasInputMounted, inputOf, textsOf, openAllGroups, HIDDEN } from '@/tests/helpers/invoiceItemsHarness';
import { applySavedRates, updateEditedItem } from '@/store/slices/invoiceFormSlice';
import { touchTarget } from '@/theme/tokens';
import { resetScreenReaderKnown } from '@/hooks/useScreenReader';
import type { InvoiceItemsEditorHandle } from '../InvoiceItemsEditor';
import type { InvoiceItemData } from '@/types/invoice.types';

let mockStore: InvoiceStore;
let mockWidth = 411;
let mockFontScale = 1;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 3, fontScale: mockFontScale }),
}));
const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
beforeEach(() => {
  mockWidth = 411;
  mockFontScale = 1;
  announce.mockClear();
});
afterEach(() => {
  readerSpies.splice(0).forEach((spy) => spy.mockRestore());
  // React Native's own jest mock stays a mock after mockRestore: set it back to "off".
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  resetScreenReaderKnown();
  setLanguage('en');
  jest.useRealTimers();
});

/** The lines are cards only while a screen reader is on (TalkBack, VoiceOver): the test turns one on. */
const readerSpies: jest.SpyInstance[] = [];
const screenReaderOn = () => {
  readerSpies.push(jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true));
  readerSpies.push(jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: () => {} })) as never));
};

const GROUP = 'i1:::M1';
const CHARGE_1 = 'cell|edit_0_0|charge';
const CHARGE_ALL = `group|${GROUP}|charge`;
const TAX_ALL = `group|${GROUP}|tax`;

async function mount(lines: InvoiceItemData[], editorRef?: React.Ref<InvoiceItemsEditorHandle>) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await render(<ConnectedEditor editorRef={editorRef} />);
  await openAllGroups();
}
const focus = async (key: string) => { await fireEvent(inputOf(key), 'focus', {}); };
const blur = async (key: string) => { await fireEvent(inputOf(key), 'blur', {}); };
const change = async (key: string, text: string) => { await fireEvent.changeText(inputOf(key), text); };
/** Some text of the tree contains this one (the average note and the keep-own note are one text, on two lines). */
const hasText = (part: string) => textsOf().some((text) => text.includes(part));
const state = () => mockStore.getState().invoiceForm;
const byId = (testID: string) => screen.queryAllByTestId(testID);
const byIdMounted = (testID: string) => screen.queryAllByTestId(testID, HIDDEN);
const isTable = (id = 'edit_0_0') => byId(`line-${id}`).length > 0 && byIdMounted(`card-${id}`).length === 0;
const isCards = (id = 'edit_0_0') => byId(`card-${id}`).length > 0 && byIdMounted(`line-${id}`).length === 0;

describe('R3a-1: the layout never flips while a field is focused', () => {
  it('WMIV0104 at 393 dp: typing a charge "1", "10", "105" key by key keeps the table and the field', async () => {
    mockWidth = 393;
    await mount(edgeLines.nearEdge());
    const key = 'cell|edit_0_0|charge';
    expect(isTable()).toBe(true);
    await focus(key);
    for (const typed of ['1', '10', '105']) {
      await change(key, typed);
      expect(isTable()).toBe(true);
      // the same cell, with the text as typed (not "105.00" from a card drawn anew)
      expect(inputOf(key).props.value).toBe(typed);
    }
    expect(state().items[0].charge).toBe(105);
  });

  it('keeps the table at 393 dp however wide the total, also after the field is left (no switch to cards by width)', async () => {
    jest.useFakeTimers();
    mockWidth = 393;
    await mount(edgeLines.nearEdge());
    const key = 'cell|edit_0_0|charge';
    const tax = 'group|kashmiri:::HIGH-1|tax';
    await focus(key);
    await change(key, '105');
    await blur(key);
    await act(async () => { jest.advanceTimersByTime(50); });
    expect(isTable()).toBe(true);
    await focus(tax);
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(isTable()).toBe(true);
    await blur(tax);
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(isTable()).toBe(true);
    expect(isCards()).toBe(false);
    expect(inputOf(key).props.value).toBe('105.00');
  });

  it('"1000000" typed key by key into a charge at 411 dp never changes the mode or drops the cell', async () => {
    await mount(groupLines(2));
    await focus(CHARGE_1);
    for (const typed of ['1', '10', '100', '1000', '10000', '100000', '1000000']) {
      await change(CHARGE_1, typed);
      expect(isTable()).toBe(true);
      expect(inputOf(CHARGE_1).props.value).toBe(typed);
    }
  });
});

describe('P2a-1: text as typed while focused, two decimals on blur', () => {
  it.each([[1], [1.3]])('"5", "5.", "5.5" key by key at font scale %s, then "5.50" on blur', async (scale) => {
    mockFontScale = scale;
    await mount(groupLines(2));
    await focus(CHARGE_1);
    for (const typed of ['5', '5.', '5.5']) {
      await change(CHARGE_1, typed);
      expect(inputOf(CHARGE_1).props.value).toBe(typed);
    }
    expect(state().items[0].charge).toBe(5.5);
    await blur(CHARGE_1);
    expect(inputOf(CHARGE_1).props.value).toBe('5.50');
  });

  it('"12." keeps its point between key presses and is a finished number only as "12.5"', async () => {
    await mount(groupLines(2));
    await focus(CHARGE_1);
    await change(CHARGE_1, '12.');
    expect(inputOf(CHARGE_1).props.value).toBe('12.');
    await change(CHARGE_1, '12.5');
    expect(inputOf(CHARGE_1).props.value).toBe('12.5');
  });
});

describe('P2a-2: the field is left when the keyboard hides', () => {
  const hide = () => {
    const calls = jest.mocked(Keyboard.addListener).mock.calls.filter(([event]) => event === 'keyboardDidHide');
    return () => calls.forEach(([, handler]) => (handler as () => void)());
  };
  beforeEach(() => { jest.spyOn(Keyboard, 'addListener').mockImplementation(() => ({ remove: jest.fn() }) as never); });
  afterEach(() => jest.restoreAllMocks());

  it('blurs the focused field only, so its error shows', async () => {
    announce.mockImplementation(() => {});
    await mount(groupLines(2));
    clearFocused();
    await focus(CHARGE_1);
    await change(CHARGE_1, '1000000');
    expect(inputOf(CHARGE_1).props.accessibilityHint).toBeUndefined();

    await act(async () => { hide()(); });
    expect(blurredIds()).toEqual([CHARGE_1]);
    // the blur reaches the field as the native event does
    await blur(CHARGE_1);
    expect(inputOf(CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
  });

  it('does nothing when no field has the focus (after it was left, or never entered)', async () => {
    await mount(groupLines(2));
    clearFocused();
    await act(async () => { hide()(); });
    expect(blurredIds()).toEqual([]);
    await focus(CHARGE_1);
    await blur(CHARGE_1);
    await act(async () => { hide()(); });
    expect(blurredIds()).toEqual([]);
  });
});

describe('R3a-2: "All dispatches" Tax stays on the screen, so its refused text counts for Next', () => {
  // Before the 2026-10-19 tweaks the row went when the lines came to differ in tax, and took the refused text with it.
  // Now "All dispatches" always shows Tax (the lines' own Tax column is read-only), so the field and its text stay.
  it('Next counts the refused "(all lines)" tax after the lines come to differ in tax', async () => {
    const ref = React.createRef<InvoiceItemsEditorHandle>();
    await mount(groupLines(2), ref);
    await focus(TAX_ALL);
    await change(TAX_ALL, '101');
    await blur(TAX_ALL);
    expect(textsOf()).toContain('Enter a tax from 0 to 100.');

    // The saved rate comes back: line 1 has tax 12, so the lines differ. The Tax column of the lines is read-only
    // (no input); the "(all lines)" field keeps the text typed in it.
    await act(async () => {
      mockStore.dispatch(applySavedRates([{ temp_id: 'edit_0_0', charge: 5, labour_rate: 2, tax: 12 }]));
    });
    expect(hasInput(TAX_ALL)).toBe(true);
    expect(hasInputMounted('cell|edit_0_0|tax')).toBe(false);
    expect(inputOf(TAX_ALL).props.value).toBe('101');

    let count = -1;
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(1);
    expect(announce).toHaveBeenCalledWith('Fix the highlighted figure, then continue.');
  });
});

describe('R3a-3 and P2a-4: card fields', () => {
  beforeEach(() => { screenReaderOn(); });

  it('keep the full spoken label: field, dispatch or item, and unit', async () => {
    await mount(groupLines(2));
    expect(isCards()).toBe(true);
    expect(inputOf(CHARGE_1).props.accessibilityLabel).toBe('Charge, dispatch I0001, rupees per bag, per month');
    expect(inputOf('cell|edit_1_0|charge').props.accessibilityLabel).toBe('Charge, dispatch I0002, rupees per bag, per month');
    expect(inputOf(CHARGE_ALL).props.accessibilityLabel).toBe('Charge, Example Potatoes, all lines, rupees per bag, per month');
    expect(inputOf(TAX_ALL).props.accessibilityLabel).toBe('Tax, Example Potatoes, all lines, percent');
  });

  it('give the error in the hint', async () => {
    await mount(groupLines(2));
    await focus(CHARGE_1);
    await change(CHARGE_1, '1000000');
    await blur(CHARGE_1);
    expect(inputOf(CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
    expect(inputOf(CHARGE_1).props.accessibilityLabel).toBe('Charge, dispatch I0001, rupees per bag, per month');
  });

  it('are at least a touch target tall: the line fields and the "(all lines)" fields', async () => {
    await mount(groupLines(2));
    const heights = [CHARGE_1, 'cell|edit_1_0|charge', CHARGE_ALL, `group|${GROUP}|labour_rate`, TAX_ALL].map((key) => {
      const style = ([] as object[]).concat(inputOf(key).props.style).flat(3).filter(Boolean);
      return Math.max(0, ...style.map((entry) => (entry as { minHeight?: number }).minHeight ?? 0));
    });
    heights.forEach((height) => expect(height).toBeGreaterThanOrEqual(touchTarget));
  });
});

describe('R3a-4: the keyboard key says what Next does', () => {
  const returnKeys = () =>
    Object.fromEntries(
      screen.root!
        .queryAll((node) => node.type === 'TextInput' && typeof node.props.testID === 'string', { includeSelf: true })
        .map((node) => [node.props.testID as string, node.props.returnKeyType as string])
    );

  it('table: "next" on every field, "done" on the last field of the page (the Labour of the last line)', async () => {
    await mount(groupLines(2));
    const keys = returnKeys();
    expect(keys[CHARGE_ALL]).toBe('next');
    expect(keys[`group|${GROUP}|labour_rate`]).toBe('next');
    expect(keys[TAX_ALL]).toBe('next');
    expect(keys[CHARGE_1]).toBe('next');
    expect(keys['cell|edit_0_0|labour_rate']).toBe('next');
    expect(keys['cell|edit_1_0|charge']).toBe('next');
    expect(keys['cell|edit_1_0|labour_rate']).toBe('done');
  });

  it('cards: the page ends in the last line card, which has no Tax field (Tax is set in All dispatches)', async () => {
    screenReaderOn();
    await mount(groupLines(2));
    const keys = returnKeys();
    expect(keys[CHARGE_ALL]).toBe('next');
    expect(keys[TAX_ALL]).toBe('next');
    expect(keys[CHARGE_1]).toBe('next');
    expect(Object.entries(keys).filter(([, key]) => key === 'done')).toHaveLength(1);
    expect(keys['cell|edit_1_0|tax']).toBeUndefined();
  });

  it('one line, one-time pricing is not special: the only field left is "done"', async () => {
    await mount([invoiceLine({}, 0)]);
    const keys = returnKeys();
    // a group of one line has its tax and labour in the line row's group rows
    const ordered = Object.entries(keys);
    expect(ordered.filter(([, key]) => key === 'done')).toHaveLength(1);
  });
});

describe('R3a-6 and R3a-7: the applied group rate and the keep-own note', () => {
  const three = () => groupLines(3);

  it('a refused "(all lines)" value puts the lines back and keeps the rate applied to the group', async () => {
    await mount(three());
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'edit_1_0', values: { charge: 9 } })); });
    await focus(CHARGE_ALL);
    await change(CHARGE_ALL, '6');
    await blur(CHARGE_ALL);
    expect(state().items.map((line) => line.charge)).toEqual([6, 9, 6]);
    expect(state().bulkPricing[GROUP]).toEqual({ charge: 6 });
    expect(hasText('1 line keeps its own charge')).toBe(true);

    await focus(CHARGE_ALL);
    await change(CHARGE_ALL, '1');
    await change(CHARGE_ALL, '1000000');
    expect(state().items.map((line) => line.charge)).toEqual([6, 9, 6]);
    expect(state().bulkPricing[GROUP]).toEqual({ charge: 6 });
    await blur(CHARGE_ALL);
    // The refused text's error takes the place of the note under the field.
    expect(textsOf()).toContain('Enter a charge from 0 to 9999.99.');
    expect(inputOf(CHARGE_ALL).props.value).toBe('1000000');
  });

  // Charge shows the average of its lines, weighted by bag-months, instead of "Mixed" (owner, 2026-10-19).
  it('shows the average and the note under it while the lines differ: table', async () => {
    await mount(three());
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'edit_1_0', values: { charge: 9 } })); });
    expect(inputOf(CHARGE_ALL).props.value).toBe('6.33');
    expect(inputOf(CHARGE_ALL).props.placeholder).toBe('6.33');
    expect(hasText('Average of 3 lines')).toBe(true);
    expect(hasText('1 line keeps its own charge')).toBe(true);
  });

  it('shows the average and the note under it while the lines differ: cards', async () => {
    screenReaderOn();
    await mount(three());
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'edit_1_0', values: { charge: 9 } })); });
    expect(inputOf(CHARGE_ALL).props.value).toBe('6.33');
    expect(inputOf(CHARGE_ALL).props.accessibilityHint).toBeUndefined();
    expect(hasText('Average of 3 lines')).toBe(true);
    expect(hasText('1 line keeps its own charge')).toBe(true);
  });

  it('shows no keep-own note when no line was typed (lines that differ because of saved rates)', async () => {
    await mount([invoiceLine({ charge: 4 }, 0), invoiceLine({ charge: 5 }, 1)]);
    expect(inputOf(CHARGE_ALL).props.value).toBe('4.50');
    expect(hasText('Average of 2 lines')).toBe(true);
    expect(textsOf().filter((text) => text.includes('keeps their own') || text.includes('keeps its own'))).toEqual([]);
  });

  it('says "Mixed" in Labour when the lines without their own figure differ', async () => {
    await mount([invoiceLine({ labour_rate: 1 }, 0), invoiceLine({ labour_rate: 2 }, 1)]);
    const labour = `group|${GROUP}|labour_rate`;
    expect(inputOf(labour).props.placeholder).toBe('Mixed');
    expect(inputOf(labour).props.value).toBe('');
  });
});

describe('P2a-5: Next with refused figures', () => {
  it('announces the count and focuses the first wrong field', async () => {
    const ref = React.createRef<InvoiceItemsEditorHandle>();
    await mount(groupLines(3), ref);
    await focus('cell|edit_2_0|charge');
    await change('cell|edit_2_0|charge', '1000000');
    await focus('cell|edit_1_0|charge');
    await change('cell|edit_1_0|charge', '-1');
    clearFocused();
    let count = 0;
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(2);
    expect(announce).toHaveBeenCalledWith('Fix the 2 highlighted figures, then continue.');
    expect(focusedIds()).toEqual(['cell|edit_1_0|charge']);
  });

  it.each([
    ['charge', 'Enter a charge from 0 to 9999.99.'],
    ['labour_rate', 'Enter a labour rate from 0 to 999999.'],
    ['tax', 'Enter a tax from 0 to 100.'],
  ])('an emptied %s stays empty, says the range once left, and blocks Next; a typed 0 is fine', async (field, message) => {
    const ref = React.createRef<InvoiceItemsEditorHandle>();
    await mount(groupLines(2), ref);
    // Tax is typed in the shared "(all lines)" field; Charge and Labour in the line.
    const key = field === 'tax' ? TAX_ALL : `cell|edit_0_0|${field}`;
    const before = (state().items[0] as unknown as Record<string, number>)[field];
    await focus(key);
    await change(key, '');
    // Not 0: the field stays empty and the form still holds the figure it had.
    expect(inputOf(key).props.value).toBe('');
    expect((state().items[0] as unknown as Record<string, number>)[field]).toBe(before);
    await blur(key);
    expect(inputOf(key).props.value).toBe('');
    expect(hasText(message)).toBe(true);
    let count = 0;
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(1);
    await focus(key);
    await change(key, '0');
    await blur(key);
    expect((state().items[0] as unknown as Record<string, number>)[field]).toBe(0);
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(0);
  });
});
