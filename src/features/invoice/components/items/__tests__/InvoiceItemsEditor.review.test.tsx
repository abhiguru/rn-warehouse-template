/**
 * The review and phone findings on the Items step (R3a, P2a): a stable layout while typing, text as
 * typed, blur when the keyboard hides, spoken labels in cards, the keep-own note while Mixed, the
 * keyboard's Next and Done keys, and a refused "(all lines)" value that does not forget the rate.
 */
import React from 'react';
import { AccessibilityInfo, Keyboard, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf, textsOf, track, unmountAll, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
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
  act(() => unmountAll());
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

async function render(lines: InvoiceItemData[], editorRef?: React.Ref<InvoiceItemsEditorHandle>) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = track(create(<ConnectedEditor editorRef={editorRef} />)); });
  await openAllGroups(tree);
  return tree;
}
const focus = async (tree: ReactTestRenderer, key: string) => { await act(async () => { inputOf(tree, key).props.onFocus({}); }); };
const blur = async (tree: ReactTestRenderer, key: string) => { await act(async () => { inputOf(tree, key).props.onBlur({}); }); };
const change = async (tree: ReactTestRenderer, key: string, text: string) => { await act(async () => { inputOf(tree, key).props.onChangeText(text); }); };
/** Some text of the tree contains this one (the average note and the keep-own note are one text, on two lines). */
const hasText = (tree: ReactTestRenderer, part: string) => textsOf(tree).some((text) => text.includes(part));
const state = () => mockStore.getState().invoiceForm;
const byId = (tree: ReactTestRenderer, testID: string) => tree.root.findAll((node) => node.props.testID === testID);
const isTable = (tree: ReactTestRenderer, id = 'edit_0_0') => byId(tree, `line-${id}`).length > 0 && byId(tree, `card-${id}`).length === 0;
const isCards = (tree: ReactTestRenderer, id = 'edit_0_0') => byId(tree, `card-${id}`).length > 0 && byId(tree, `line-${id}`).length === 0;
const spyFocus = (tree: ReactTestRenderer, key: string) => {
  const node = inputOf(tree, key).instance as unknown as { focus: jest.Mock; blur: jest.Mock };
  node.focus = jest.fn();
  node.blur = jest.fn();
  return node;
};

describe('R3a-1: the layout never flips while a field is focused', () => {
  it('WMIV0104 at 393 dp: typing a charge "1", "10", "105" key by key keeps the table and the field', async () => {
    mockWidth = 393;
    const tree = await render(edgeLines.nearEdge());
    const key = 'cell|edit_0_0|charge';
    expect(isTable(tree)).toBe(true);
    await focus(tree, key);
    for (const typed of ['1', '10', '105']) {
      await change(tree, key, typed);
      expect(isTable(tree)).toBe(true);
      // the same cell, with the text as typed (not "105.00" from a card drawn anew)
      expect(inputOf(tree, key).props.value).toBe(typed);
    }
    expect(state().items[0].charge).toBe(105);
  });

  it('keeps the table at 393 dp however wide the total, also after the field is left (no switch to cards by width)', async () => {
    jest.useFakeTimers();
    mockWidth = 393;
    const tree = await render(edgeLines.nearEdge());
    const key = 'cell|edit_0_0|charge';
    const tax = 'group|kashmiri:::HIGH-1|tax';
    await focus(tree, key);
    await change(tree, key, '105');
    await blur(tree, key);
    await act(async () => { jest.advanceTimersByTime(50); });
    expect(isTable(tree)).toBe(true);
    await focus(tree, tax);
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(isTable(tree)).toBe(true);
    await blur(tree, tax);
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(isTable(tree)).toBe(true);
    expect(isCards(tree)).toBe(false);
    expect(inputOf(tree, key).props.value).toBe('105.00');
  });

  it('"1000000" typed key by key into a charge at 411 dp never changes the mode or drops the cell', async () => {
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    for (const typed of ['1', '10', '100', '1000', '10000', '100000', '1000000']) {
      await change(tree, CHARGE_1, typed);
      expect(isTable(tree)).toBe(true);
      expect(inputOf(tree, CHARGE_1).props.value).toBe(typed);
    }
  });
});

describe('P2a-1: text as typed while focused, two decimals on blur', () => {
  it.each([[1], [1.3]])('"5", "5.", "5.5" key by key at font scale %s, then "5.50" on blur', async (scale) => {
    mockFontScale = scale;
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    for (const typed of ['5', '5.', '5.5']) {
      await change(tree, CHARGE_1, typed);
      expect(inputOf(tree, CHARGE_1).props.value).toBe(typed);
    }
    expect(state().items[0].charge).toBe(5.5);
    await blur(tree, CHARGE_1);
    expect(inputOf(tree, CHARGE_1).props.value).toBe('5.50');
  });

  it('"12." keeps its point between key presses and is a finished number only as "12.5"', async () => {
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '12.');
    expect(inputOf(tree, CHARGE_1).props.value).toBe('12.');
    await change(tree, CHARGE_1, '12.5');
    expect(inputOf(tree, CHARGE_1).props.value).toBe('12.5');
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
    const tree = await render(groupLines(2));
    const first = spyFocus(tree, CHARGE_1);
    const second = spyFocus(tree, 'cell|edit_1_0|charge');
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '1000000');
    expect(inputOf(tree, CHARGE_1).props.accessibilityHint).toBeUndefined();

    await act(async () => { hide()(); });
    expect(first.blur).toHaveBeenCalledTimes(1);
    expect(second.blur).not.toHaveBeenCalled();
    // the blur reaches the field as the native event does
    await blur(tree, CHARGE_1);
    expect(inputOf(tree, CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
  });

  it('does nothing when no field has the focus (after it was left, or never entered)', async () => {
    const tree = await render(groupLines(2));
    const first = spyFocus(tree, CHARGE_1);
    await act(async () => { hide()(); });
    expect(first.blur).not.toHaveBeenCalled();
    await focus(tree, CHARGE_1);
    await blur(tree, CHARGE_1);
    await act(async () => { hide()(); });
    expect(first.blur).not.toHaveBeenCalled();
  });
});

describe('R3a-2: "All dispatches" Tax stays on the screen, so its refused text counts for Next', () => {
  // Before the 2026-10-19 tweaks the row went when the lines came to differ in tax, and took the refused text with it.
  // Now "All dispatches" always shows Tax (the lines' own Tax column is read-only), so the field and its text stay.
  it('Next counts the refused "(all lines)" tax after the lines come to differ in tax', async () => {
    const ref = React.createRef<InvoiceItemsEditorHandle>();
    const tree = await render(groupLines(2), ref);
    await focus(tree, TAX_ALL);
    await change(tree, TAX_ALL, '101');
    await blur(tree, TAX_ALL);
    expect(textsOf(tree)).toContain('Enter a tax from 0 to 100.');

    // The saved rate comes back: line 1 has tax 12, so the lines differ. The Tax column of the lines is read-only
    // (no input); the "(all lines)" field keeps the text typed in it.
    await act(async () => {
      mockStore.dispatch(applySavedRates([{ temp_id: 'edit_0_0', charge: 5, labour_rate: 2, tax: 12 }]));
    });
    expect(hasInput(tree, TAX_ALL)).toBe(true);
    expect(hasInput(tree, 'cell|edit_0_0|tax')).toBe(false);
    expect(inputOf(tree, TAX_ALL).props.value).toBe('101');

    let count = -1;
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(1);
    expect(announce).toHaveBeenCalledWith('Fix the highlighted figure, then continue.');
  });
});

describe('R3a-3 and P2a-4: card fields', () => {
  beforeEach(() => { screenReaderOn(); });

  it('keep the full spoken label: field, dispatch or item, and unit', async () => {
    const tree = await render(groupLines(2));
    expect(isCards(tree)).toBe(true);
    expect(inputOf(tree, CHARGE_1).props.accessibilityLabel).toBe('Charge, dispatch I0001, rupees per bag, per month');
    expect(inputOf(tree, 'cell|edit_1_0|charge').props.accessibilityLabel).toBe('Charge, dispatch I0002, rupees per bag, per month');
    expect(inputOf(tree, CHARGE_ALL).props.accessibilityLabel).toBe('Charge, Example Potatoes, all lines, rupees per bag, per month');
    expect(inputOf(tree, TAX_ALL).props.accessibilityLabel).toBe('Tax, Example Potatoes, all lines, percent');
  });

  it('give the error in the hint', async () => {
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '1000000');
    await blur(tree, CHARGE_1);
    expect(inputOf(tree, CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
    expect(inputOf(tree, CHARGE_1).props.accessibilityLabel).toBe('Charge, dispatch I0001, rupees per bag, per month');
  });

  it('are at least a touch target tall: the line fields and the "(all lines)" fields', async () => {
    const tree = await render(groupLines(2));
    const heights = [CHARGE_1, 'cell|edit_1_0|charge', CHARGE_ALL, `group|${GROUP}|labour_rate`, TAX_ALL].map((key) => {
      const style = ([] as object[]).concat(inputOf(tree, key).props.style).flat(3).filter(Boolean);
      return Math.max(0, ...style.map((entry) => (entry as { minHeight?: number }).minHeight ?? 0));
    });
    heights.forEach((height) => expect(height).toBeGreaterThanOrEqual(touchTarget));
  });
});

describe('R3a-4: the keyboard key says what Next does', () => {
  const returnKeys = (tree: ReactTestRenderer) =>
    Object.fromEntries(
      tree.root
        .findAllByType(TextInput)
        .filter((node) => typeof node.props.testID === 'string')
        .map((node) => [node.props.testID as string, node.props.returnKeyType as string])
    );

  it('table: "next" on every field, "done" on the last field of the page (the Labour of the last line)', async () => {
    const keys = returnKeys(await render(groupLines(2)));
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
    const keys = returnKeys(await render(groupLines(2)));
    expect(keys[CHARGE_ALL]).toBe('next');
    expect(keys[TAX_ALL]).toBe('next');
    expect(keys[CHARGE_1]).toBe('next');
    expect(Object.entries(keys).filter(([, key]) => key === 'done')).toHaveLength(1);
    expect(keys['cell|edit_1_0|tax']).toBeUndefined();
  });

  it('one line, one-time pricing is not special: the only field left is "done"', async () => {
    const keys = returnKeys(await render([invoiceLine({}, 0)]));
    // a group of one line has its tax and labour in the line row's group rows
    const ordered = Object.entries(keys);
    expect(ordered.filter(([, key]) => key === 'done')).toHaveLength(1);
  });
});

describe('R3a-6 and R3a-7: the applied group rate and the keep-own note', () => {
  const three = () => groupLines(3);

  it('a refused "(all lines)" value puts the lines back and keeps the rate applied to the group', async () => {
    const tree = await render(three());
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'edit_1_0', values: { charge: 9 } })); });
    await focus(tree, CHARGE_ALL);
    await change(tree, CHARGE_ALL, '6');
    await blur(tree, CHARGE_ALL);
    expect(state().items.map((line) => line.charge)).toEqual([6, 9, 6]);
    expect(state().bulkPricing[GROUP]).toEqual({ charge: 6 });
    expect(hasText(tree, '1 line keeps its own charge')).toBe(true);

    await focus(tree, CHARGE_ALL);
    await change(tree, CHARGE_ALL, '1');
    await change(tree, CHARGE_ALL, '1000000');
    expect(state().items.map((line) => line.charge)).toEqual([6, 9, 6]);
    expect(state().bulkPricing[GROUP]).toEqual({ charge: 6 });
    await blur(tree, CHARGE_ALL);
    // The refused text's error takes the place of the note under the field.
    expect(textsOf(tree)).toContain('Enter a charge from 0 to 9999.99.');
    expect(inputOf(tree, CHARGE_ALL).props.value).toBe('1000000');
  });

  // Charge shows the average of its lines, weighted by bag-months, instead of "Mixed" (owner, 2026-10-19).
  it('shows the average and the note under it while the lines differ: table', async () => {
    const tree = await render(three());
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'edit_1_0', values: { charge: 9 } })); });
    expect(inputOf(tree, CHARGE_ALL).props.value).toBe('6.33');
    expect(inputOf(tree, CHARGE_ALL).props.placeholder).toBe('6.33');
    expect(hasText(tree, 'Average of 3 lines')).toBe(true);
    expect(hasText(tree, '1 line keeps its own charge')).toBe(true);
  });

  it('shows the average and the note under it while the lines differ: cards', async () => {
    screenReaderOn();
    const tree = await render(three());
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'edit_1_0', values: { charge: 9 } })); });
    expect(inputOf(tree, CHARGE_ALL).props.value).toBe('6.33');
    expect(inputOf(tree, CHARGE_ALL).props.accessibilityHint).toBeUndefined();
    expect(hasText(tree, 'Average of 3 lines')).toBe(true);
    expect(hasText(tree, '1 line keeps its own charge')).toBe(true);
  });

  it('shows no keep-own note when no line was typed (lines that differ because of saved rates)', async () => {
    const tree = await render([invoiceLine({ charge: 4 }, 0), invoiceLine({ charge: 5 }, 1)]);
    expect(inputOf(tree, CHARGE_ALL).props.value).toBe('4.50');
    expect(hasText(tree, 'Average of 2 lines')).toBe(true);
    expect(textsOf(tree).filter((text) => text.includes('keeps their own') || text.includes('keeps its own'))).toEqual([]);
  });

  it('says "Mixed" in Labour when the lines without their own figure differ', async () => {
    const tree = await render([invoiceLine({ labour_rate: 1 }, 0), invoiceLine({ labour_rate: 2 }, 1)]);
    const labour = `group|${GROUP}|labour_rate`;
    expect(inputOf(tree, labour).props.placeholder).toBe('Mixed');
    expect(inputOf(tree, labour).props.value).toBe('');
  });
});

describe('P2a-5: Next with refused figures', () => {
  it('announces the count and focuses the first wrong field', async () => {
    const ref = React.createRef<InvoiceItemsEditorHandle>();
    const tree = await render(groupLines(3), ref);
    await focus(tree, 'cell|edit_2_0|charge');
    await change(tree, 'cell|edit_2_0|charge', '1000000');
    await focus(tree, 'cell|edit_1_0|charge');
    await change(tree, 'cell|edit_1_0|charge', '-1');
    const second = spyFocus(tree, 'cell|edit_1_0|charge');
    let count = 0;
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(2);
    expect(announce).toHaveBeenCalledWith('Fix the 2 highlighted figures, then continue.');
    expect(second.focus).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['charge', 'Enter a charge from 0 to 9999.99.'],
    ['labour_rate', 'Enter a labour rate from 0 to 999999.'],
    ['tax', 'Enter a tax from 0 to 100.'],
  ])('an emptied %s stays empty, says the range once left, and blocks Next; a typed 0 is fine', async (field, message) => {
    const ref = React.createRef<InvoiceItemsEditorHandle>();
    const tree = await render(groupLines(2), ref);
    // Tax is typed in the shared "(all lines)" field; Charge and Labour in the line.
    const key = field === 'tax' ? TAX_ALL : `cell|edit_0_0|${field}`;
    const before = (state().items[0] as unknown as Record<string, number>)[field];
    await focus(tree, key);
    await change(tree, key, '');
    // Not 0: the field stays empty and the form still holds the figure it had.
    expect(inputOf(tree, key).props.value).toBe('');
    expect((state().items[0] as unknown as Record<string, number>)[field]).toBe(before);
    await blur(tree, key);
    expect(inputOf(tree, key).props.value).toBe('');
    expect(hasText(tree, message)).toBe(true);
    let count = 0;
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(1);
    await focus(tree, key);
    await change(tree, key, '0');
    await blur(tree, key);
    expect((state().items[0] as unknown as Record<string, number>)[field]).toBe(0);
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(0);
  });
});
