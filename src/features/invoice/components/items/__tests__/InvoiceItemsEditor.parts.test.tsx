/**
 * The owner's blank-card bug: one card is drawn as several list rows (head, shared block, toggle, column
 * headings, lines). Whatever adds, removes or resizes a part of a card in the middle of the list
 * must leave every part of every card drawn, with its name, total and fields.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { resetScreenReaderKnown } from '@/hooks/useScreenReader';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf, textsOf, track, unmountAll, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import { setFlashListWindow, resetFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import { updateEditedItem } from '@/store/slices/invoiceFormSlice';
import type { ItemsRow } from '../itemsModel';

let mockStore: InvoiceStore;
let mockWidth = 411;
let mockFontScale = 1;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 3, fontScale: mockFontScale }),
}));
beforeEach(() => {
  mockWidth = 411;
  mockFontScale = 1;
  resetFlashListWindow();
});

const GROUPS = 5;
const PER_GROUP = 3;
const MIDDLE = 2;
const groupKey = (g: number) => `it${g}:::P${g}`;
const name = (g: number) => `Example Item ${g}`;

const fiveGroups = () =>
  Array.from({ length: GROUPS }, (_, g) =>
    Array.from({ length: PER_GROUP }, (_, i) =>
      invoiceLine({ item_id: `it${g}`, item_name: name(g), package_mark: `P${g}` }, g * PER_GROUP + i)
    )
  ).flat();
const tempId = (g: number, i: number) => `edit_${g * PER_GROUP + i}_0`;

let readerChanged: ((on: boolean) => void) | undefined;
afterEach(() => {
  act(() => unmountAll());
  jest.restoreAllMocks();
  resetScreenReaderKnown();
  readerChanged = undefined;
});
/** The lines become cards only while a screen reader is on: the test switches one on while the step is open. */
const turnScreenReader = async (on: boolean) => {
  await act(async () => { readerChanged!(on); });
};

async function render() {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (on: boolean) => void) => {
    if (name === 'screenReaderChanged') readerChanged = handler;
    return { remove: () => {} };
  }) as never);
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, fiveGroups());
  let tree!: ReactTestRenderer;
  await act(async () => { tree = track(create(<ConnectedEditor />)); });
  await openAllGroups(tree);
  return tree;
}
const rowsOf = (tree: ReactTestRenderer): ItemsRow[] => tree.root.findByType('FlashList' as never).props.data;
const byId = (tree: ReactTestRenderer, testID: string) => tree.root.findAll((node) => node.props.testID === testID);

/** The rows of some groups, as the index range a window must cover. */
const windowOf = (tree: ReactTestRenderer, groups: number[]): [number, number] => {
  const wanted = groups.map(groupKey);
  const indexes = rowsOf(tree).map((row, index) => (wanted.includes(row.groupKey) ? index : -1)).filter((index) => index >= 0);
  return [Math.min(...indexes), Math.max(...indexes) + 1];
};

/** Every row of the groups is drawn, with its content. */
const expectGroupDrawn = (tree: ReactTestRenderer, g: number) => {
  const key = groupKey(g);
  const rows = rowsOf(tree).filter((row) => row.groupKey === key);
  expect(rows.map((row) => row.type)).toEqual(expect.arrayContaining(['head', 'block', 'toggle']));
  rows.forEach((row) => {
    const id =
      row.type === 'head' ? `items-head-${key}`
      : row.type === 'cols' ? `cols-${key}`
      : row.type === 'line' ? `line-${row.tempId}`
      : row.type === 'card' ? `card-${row.tempId}`
      : row.type === 'block' ? `block-${key}`
      : `group-toggle-${key}`;
    const found = byId(tree, id);
    expect(found.length).toBeGreaterThan(0);
    // Not an empty box: the part holds something.
    expect(found[0].children.length).toBeGreaterThan(0);
  });
  const texts = textsOf(tree);
  expect(texts).toContain(name(g));
  // the group's total, in the heading
  expect(texts.filter((text) => /^₹[\d,]+\.\d\d$/.test(text)).length).toBeGreaterThan(0);
  for (let i = 0; i < PER_GROUP; i++) expect(hasInput(tree, `cell|${tempId(g, i)}|charge`)).toBe(true);
  expect(hasInput(tree, `group|${key}|charge`)).toBe(true);
};
/** Drawn in the middle window and, with the window open, all five cards. */
const expectEverythingDrawn = async (tree: ReactTestRenderer) => {
  await act(async () => { setFlashListWindow(...windowOf(tree, [MIDDLE - 1, MIDDLE, MIDDLE + 1])); });
  [MIDDLE - 1, MIDDLE, MIDDLE + 1].forEach((g) => expectGroupDrawn(tree, g));
  await act(async () => { setFlashListWindow(); });
  for (let g = 0; g < GROUPS; g++) expectGroupDrawn(tree, g);
};

describe('every part of every card stays drawn', () => {
  it('to begin with', async () => {
    await expectEverythingDrawn(await render());
  });

  it('when the middle card is drawn in a window of the list and the text grows to 1.3 (table to cards)', async () => {
    const tree = await render();
    await act(async () => { setFlashListWindow(...windowOf(tree, [MIDDLE])); });
    expectGroupDrawn(tree, MIDDLE);
    await turnScreenReader(true);
    expect(rowsOf(tree).filter((row) => row.groupKey === groupKey(MIDDLE)).map((row) => row.type)).toContain('card');
    await expectEverythingDrawn(tree);
  });

  it('when the screen reader is switched off again (cards to table)', async () => {
    const tree = await render();
    await turnScreenReader(true);
    await expectEverythingDrawn(tree);
    await turnScreenReader(false);
    expect(rowsOf(tree).filter((row) => row.groupKey === groupKey(MIDDLE)).map((row) => row.type)).toContain('line');
    await expectEverythingDrawn(tree);
  });

  it('when an error line appears under a row of the middle card', async () => {
    const tree = await render();
    const key = `cell|${tempId(MIDDLE, 1)}|charge`;
    await act(async () => { inputOf(tree, key).props.onFocus({}); });
    await act(async () => { inputOf(tree, key).props.onChangeText('1000000'); });
    await act(async () => { inputOf(tree, key).props.onBlur({}); });
    expect(textsOf(tree)).toContain('Enter a charge from 0 to 9999.99.');
    await expectEverythingDrawn(tree);
    // and when it goes
    await act(async () => { inputOf(tree, key).props.onFocus({}); });
    await act(async () => { inputOf(tree, key).props.onChangeText('4'); });
    await act(async () => { inputOf(tree, key).props.onBlur({}); });
    expect(textsOf(tree)).not.toContain('Enter a charge from 0 to 9999.99.');
    await expectEverythingDrawn(tree);
  });

  it('when the middle card gets an average Charge and then a note that lines keep their own charge', async () => {
    const tree = await render();
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: tempId(MIDDLE, 0), values: { charge: 9 } })); });
    expect(textsOf(tree).some((text) => text.includes('Average of 3 lines'))).toBe(true);
    await expectEverythingDrawn(tree);

    const shared = `group|${groupKey(MIDDLE)}|charge`;
    await act(async () => { inputOf(tree, shared).props.onFocus({}); });
    await act(async () => { inputOf(tree, shared).props.onChangeText('6'); });
    await act(async () => { inputOf(tree, shared).props.onBlur({}); });
    expect(textsOf(tree).some((text) => text.includes('1 line keeps its own charge'))).toBe(true);
    await expectEverythingDrawn(tree);
  });

  it('when the lines of the middle card come to differ in labour (the card stays a table of the same rows)', async () => {
    const tree = await render();
    const before = rowsOf(tree).filter((row) => row.groupKey === groupKey(MIDDLE)).length;
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: tempId(MIDDLE, 2), values: { labour_rate: 7 } })); });
    const rows = rowsOf(tree).filter((row) => row.groupKey === groupKey(MIDDLE));
    expect(rows.length).toBe(before);
    expect(rows.map((row) => row.type)).not.toContain('card');
    expect(hasInput(tree, `cell|${tempId(MIDDLE, 2)}|labour_rate`)).toBe(true);
    await expectEverythingDrawn(tree);
  });

  it('when a line leaves the invoice', async () => {
    const tree = await render();
    mockStore = makeInvoiceStore();
    fillNewInvoice(mockStore, fiveGroups().filter((line) => line.temp_id !== tempId(MIDDLE, 1)));
    await act(async () => { tree.update(<ConnectedEditor />); });
    expect(hasInput(tree, `cell|${tempId(MIDDLE, 1)}|charge`)).toBe(false);
    expect(hasInput(tree, `cell|${tempId(MIDDLE, 0)}|charge`)).toBe(true);
    expect(textsOf(tree)).toContain(name(MIDDLE));
    expect(rowsOf(tree).filter((row) => row.groupKey === groupKey(MIDDLE) && row.type === 'line')).toHaveLength(2);
  });
});
