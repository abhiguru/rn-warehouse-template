/**
 * The list recycles rows (the windowed stand-in does too): a mounted row is reused for another
 * record of the same type when the list scrolls. Nothing that belongs to one record may stay with
 * the row: not the focus ring, not the text, not a row's identity.
 */
import React from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf } from '@/tests/helpers/invoiceItemsHarness';
import { setFlashListWindow, resetFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import type { InvoiceItemData } from '@/types/invoice.types';
import type { ItemsRow } from '../itemsModel';

let mockStore: InvoiceStore;
let mockFontScale = 1;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: mockFontScale }),
}));
beforeEach(() => {
  mockFontScale = 1;
  resetFlashListWindow();
});

/** Thirty lines of one group whose charges differ: line n has charge n + 1. */
const lines = (): InvoiceItemData[] => Array.from({ length: 30 }, (_, n) => invoiceLine({ charge: n + 1 }, n));
async function render(data: InvoiceItemData[] = lines()) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, data);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConnectedEditor />); });
  return tree;
}
const list = (tree: ReactTestRenderer) => tree.root.findByType('FlashList' as never);
const rowsOf = (tree: ReactTestRenderer): ItemsRow[] => list(tree).props.data;
const chargeInputs = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).filter((node) => /^cell\|.*\|charge$/.test(String(node.props.testID)));
/** A table cell shows the focus as a ring: its border is not transparent (the wrapper around it never takes touches). */
const focusShown = (node: { props: { style?: StyleProp<TextStyle> } }) => {
  const color = StyleSheet.flatten(node.props.style)?.borderColor;
  return color !== undefined && color !== 'transparent';
};

describe('rows that are reused for another line', () => {
  it('carry no focus ring: a line that scrolls in is not shown as the one being typed in', async () => {
    mockFontScale = 1;
    const tree = await render();
    await act(async () => { setFlashListWindow(0, 6); });
    const first = 'cell|edit_0_0|charge';
    await act(async () => { inputOf(tree, first).props.onFocus({}); });
    expect(focusShown(inputOf(tree, first))).toBe(true);

    // The list scrolls on: the first rows leave and their mounted rows are reused for lines 8 to 13.
    await act(async () => { setFlashListWindow(10, 16); });
    expect(hasInput(tree, first)).toBe(false);
    const drawn = chargeInputs(tree);
    expect(drawn.length).toBeGreaterThanOrEqual(4);
    drawn.forEach((node) => expect(focusShown(node)).toBe(false));
  });

  it('carry no focus ring in cards either (the field of a card shows it from its own state)', async () => {
    mockFontScale = 1.3;
    const tree = await render();
    await act(async () => { setFlashListWindow(0, 4); });
    const first = 'cell|edit_0_0|charge';
    await act(async () => { inputOf(tree, first).props.onFocus({}); });
    await act(async () => { setFlashListWindow(10, 14); });
    expect(chargeInputs(tree).length).toBeGreaterThanOrEqual(2);
    // a card field that shows its clear icon has the focus
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Clear charge (₹)')).toHaveLength(0);
  });

  it('carry no focus ring in an "(all lines)" row either: the row of another group reuses the mounted row', async () => {
    const groups = Array.from({ length: 4 }, (_, g) =>
      Array.from({ length: 2 }, (_, i) => invoiceLine({ item_id: `it${g}`, item_name: `Example Item ${g}`, package_mark: `P${g}` }, g * 2 + i))
    ).flat();
    const tree = await render(groups);
    // a group is 8 rows: head, headings, two lines, charge, labour, tax, total
    await act(async () => { setFlashListWindow(0, 8); });
    const tax = 'group|it0:::P0|tax';
    await act(async () => { inputOf(tree, tax).props.onFocus({}); });
    expect(focusShown(inputOf(tree, tax))).toBe(true);
    await act(async () => { setFlashListWindow(16, 24); });
    expect(hasInput(tree, tax)).toBe(false);
    const shared = tree.root.findAllByType(TextInput).filter((node) => /^group\|/.test(String(node.props.testID)));
    expect(shared).toHaveLength(3);
    shared.forEach((node) => expect(focusShown(node)).toBe(false));
  });

  it('show their own figures: each cell has its own line charge after any number of scrolls', async () => {
    const tree = await render();
    for (const [start, end] of [[0, 6], [8, 14], [3, 9], [20, 26], [0, 6]]) {
      await act(async () => { setFlashListWindow(start, end); });
      const drawn = chargeInputs(tree);
      expect(drawn.length).toBeGreaterThan(0);
      drawn.forEach((node) => {
        const n = Number(String(node.props.testID).split('_')[1]);
        expect(node.props.value).toBe(`${n + 1}.00`);
      });
    }
  });

  it('keep a refused figure with its line: the text and its error come back when the line scrolls back in', async () => {
    const tree = await render();
    const key = 'cell|edit_1_0|charge';
    await act(async () => { inputOf(tree, key).props.onFocus({}); });
    await act(async () => { inputOf(tree, key).props.onChangeText('12.3.4'); });
    await act(async () => { inputOf(tree, key).props.onBlur({}); });
    expect(inputOf(tree, key).props.accessibilityHint).toBe('Enter a number with up to 2 decimals, for example 5.50.');

    await act(async () => { setFlashListWindow(12, 18); });
    expect(hasInput(tree, key)).toBe(false);
    // and the lines now drawn in the reused rows have none of it
    chargeInputs(tree).forEach((node) => {
      expect(node.props.accessibilityHint).toBeUndefined();
      expect(node.props.value).not.toBe('12.3.4');
    });
    await act(async () => { setFlashListWindow(); });
    expect(inputOf(tree, key).props.value).toBe('12.3.4');
    expect(inputOf(tree, key).props.accessibilityHint).toBe('Enter a number with up to 2 decimals, for example 5.50.');
  });
});

describe('the row plan', () => {
  it('gives each kind of part its own type, and each part a key that follows its record, not its place', async () => {
    const tree = await render();
    const props = list(tree).props as { keyExtractor: (row: ItemsRow, index: number) => string; getItemType: (row: ItemsRow, index: number) => string };
    const rows = rowsOf(tree);
    const types = new Set(rows.map((row, index) => props.getItemType(row, index)));
    expect(types).toEqual(new Set(['head', 'cols', 'line', 'shared', 'total']));
    expect(new Set(rows.map((row, index) => props.keyExtractor(row, index))).size).toBe(rows.length);
    const keyOfLine = (data: ItemsRow[], tempId: string) => {
      const index = data.findIndex((row) => row.type === 'line' && row.tempId === tempId);
      return props.keyExtractor(data[index], index);
    };
    const before = keyOfLine(rows, 'edit_5_0');

    // line 2 leaves the invoice: every row after it moves up one place, and keeps its key
    mockStore = makeInvoiceStore();
    fillNewInvoice(mockStore, lines().filter((line) => line.temp_id !== 'edit_2_0'));
    await act(async () => { tree.update(<ConnectedEditor />); });
    expect(rowsOf(tree)).toHaveLength(rows.length - 1);
    expect(keyOfLine(rowsOf(tree), 'edit_5_0')).toBe(before);
  });
});
