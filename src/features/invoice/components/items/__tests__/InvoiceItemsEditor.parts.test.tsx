/**
 * The owner's blank-card bug: one card is drawn as several list rows (head, shared block, toggle, column
 * headings, lines). Whatever adds, removes or resizes a part of a card in the middle of the list
 * must leave every part of every card drawn, with its name, total and fields.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { resetScreenReaderKnown } from '@/hooks/useScreenReader';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { makeInvoiceStore, fillNewInvoice, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, flashListOf, hasInput, inputOf, textsOf, openAllGroups, HIDDEN } from '@/tests/helpers/invoiceItemsHarness';
import { setFlashListWindow, resetFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import { updateEditedItem } from '@/store/slices/invoiceFormSlice';
import type { ItemsRow } from '../itemsModel';

let mockStore: InvoiceStore;
let mockWidth = 411;
let mockFontScale = 1;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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
  jest.restoreAllMocks();
  resetScreenReaderKnown();
  readerChanged = undefined;
});
/** The lines become cards only while a screen reader is on: the test switches one on while the step is open. */
const turnScreenReader = async (on: boolean) => {
  await act(async () => { readerChanged!(on); });
};

async function mount() {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (on: boolean) => void) => {
    if (name === 'screenReaderChanged') readerChanged = handler;
    return { remove: () => {} };
  }) as never);
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, fiveGroups());
  await render(<ConnectedEditor />);
  await openAllGroups();
}
const rowsOf = (): ItemsRow[] => flashListOf().props.data;
const byId = (testID: string) => screen.queryAllByTestId(testID, HIDDEN);

/** The rows of some groups, as the index range a window must cover. */
const windowOf = (groups: number[]): [number, number] => {
  const wanted = groups.map(groupKey);
  const indexes = rowsOf().map((row, index) => (wanted.includes(row.groupKey) ? index : -1)).filter((index) => index >= 0);
  return [Math.min(...indexes), Math.max(...indexes) + 1];
};

/** Every row of the groups is drawn, with its content. */
const expectGroupDrawn = (g: number) => {
  const key = groupKey(g);
  const rows = rowsOf().filter((row) => row.groupKey === key);
  expect(rows.map((row) => row.type)).toEqual(expect.arrayContaining(['head', 'block', 'toggle']));
  rows.forEach((row) => {
    const id =
      row.type === 'head' ? `items-head-${key}`
      : row.type === 'cols' ? `cols-${key}`
      : row.type === 'line' ? `line-${row.tempId}`
      : row.type === 'card' ? `card-${row.tempId}`
      : row.type === 'block' ? `block-${key}`
      : `group-toggle-${key}`;
    const found = byId(id);
    expect(found.length).toBeGreaterThan(0);
    // Not an empty box: the part holds something.
    expect(found[0].children.length).toBeGreaterThan(0);
  });
  const texts = textsOf();
  expect(texts).toContain(name(g));
  // the group's total, in the heading
  expect(texts.filter((text) => /^₹[\d,]+\.\d\d$/.test(text)).length).toBeGreaterThan(0);
  for (let i = 0; i < PER_GROUP; i++) expect(hasInput(`cell|${tempId(g, i)}|charge`)).toBe(true);
  expect(hasInput(`group|${key}|charge`)).toBe(true);
};
/** Drawn in the middle window and, with the window open, all five cards. */
const expectEverythingDrawn = async () => {
  await act(async () => { setFlashListWindow(...windowOf([MIDDLE - 1, MIDDLE, MIDDLE + 1])); });
  [MIDDLE - 1, MIDDLE, MIDDLE + 1].forEach((g) => expectGroupDrawn(g));
  await act(async () => { setFlashListWindow(); });
  for (let g = 0; g < GROUPS; g++) expectGroupDrawn(g);
};

describe('every part of every card stays drawn', () => {
  it('to begin with', async () => {
    await mount();
    await expectEverythingDrawn();
  });

  it('when the middle card is drawn in a window of the list and the text grows to 1.3 (table to cards)', async () => {
    await mount();
    await act(async () => { setFlashListWindow(...windowOf([MIDDLE])); });
    expectGroupDrawn(MIDDLE);
    await turnScreenReader(true);
    expect(rowsOf().filter((row) => row.groupKey === groupKey(MIDDLE)).map((row) => row.type)).toContain('card');
    await expectEverythingDrawn();
  });

  it('when the screen reader is switched off again (cards to table)', async () => {
    await mount();
    await turnScreenReader(true);
    await expectEverythingDrawn();
    await turnScreenReader(false);
    expect(rowsOf().filter((row) => row.groupKey === groupKey(MIDDLE)).map((row) => row.type)).toContain('line');
    await expectEverythingDrawn();
  });

  it('when an error line appears under a row of the middle card', async () => {
    await mount();
    const key = `cell|${tempId(MIDDLE, 1)}|charge`;
    await fireEvent(inputOf(key), 'focus', {});
    await fireEvent.changeText(inputOf(key), '1000000');
    await fireEvent(inputOf(key), 'blur', {});
    expect(textsOf()).toContain('Enter a charge from 0 to 9999.99.');
    await expectEverythingDrawn();
    // and when it goes
    await fireEvent(inputOf(key), 'focus', {});
    await fireEvent.changeText(inputOf(key), '4');
    await fireEvent(inputOf(key), 'blur', {});
    expect(textsOf()).not.toContain('Enter a charge from 0 to 9999.99.');
    await expectEverythingDrawn();
  });

  it('when the middle card gets an average Charge and then a note that lines keep their own charge', async () => {
    await mount();
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: tempId(MIDDLE, 0), values: { charge: 9 } })); });
    expect(textsOf().some((text) => text.includes('Average of 3 lines'))).toBe(true);
    await expectEverythingDrawn();

    const shared = `group|${groupKey(MIDDLE)}|charge`;
    await fireEvent(inputOf(shared), 'focus', {});
    await fireEvent.changeText(inputOf(shared), '6');
    await fireEvent(inputOf(shared), 'blur', {});
    expect(textsOf().some((text) => text.includes('1 line keeps its own charge'))).toBe(true);
    await expectEverythingDrawn();
  });

  it('when the lines of the middle card come to differ in labour (the card stays a table of the same rows)', async () => {
    await mount();
    const before = rowsOf().filter((row) => row.groupKey === groupKey(MIDDLE)).length;
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: tempId(MIDDLE, 2), values: { labour_rate: 7 } })); });
    const rows = rowsOf().filter((row) => row.groupKey === groupKey(MIDDLE));
    expect(rows.length).toBe(before);
    expect(rows.map((row) => row.type)).not.toContain('card');
    expect(hasInput(`cell|${tempId(MIDDLE, 2)}|labour_rate`)).toBe(true);
    await expectEverythingDrawn();
  });

  it('when a line leaves the invoice', async () => {
    await mount();
    mockStore = makeInvoiceStore();
    fillNewInvoice(mockStore, fiveGroups().filter((line) => line.temp_id !== tempId(MIDDLE, 1)));
    await screen.rerender(<ConnectedEditor />);
    expect(hasInput(`cell|${tempId(MIDDLE, 1)}|charge`)).toBe(false);
    expect(hasInput(`cell|${tempId(MIDDLE, 0)}|charge`)).toBe(true);
    expect(textsOf()).toContain(name(MIDDLE));
    expect(rowsOf().filter((row) => row.groupKey === groupKey(MIDDLE) && row.type === 'line')).toHaveLength(2);
  });
});
