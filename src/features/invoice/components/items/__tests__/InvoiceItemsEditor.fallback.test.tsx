/**
 * The lines are a table whatever the text size, the width or the figures (owner, 2026-10-19: the table scrolls sideways
 * instead), and cards only while a screen reader is on. Lines that differ in labour or tax stay table rows.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { resetScreenReaderKnown } from '@/hooks/useScreenReader';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf, textsOf, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import type { InvoiceItemData } from '@/types/invoice.types';

let mockStore: InvoiceStore;
let mockWidth = 411;
let mockFontScale = 1;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 3, fontScale: mockFontScale }),
}));
beforeEach(() => { mockWidth = 411; mockFontScale = 1; });
afterEach(() => {
  setLanguage('en');
  jest.restoreAllMocks();
  // React Native's own jest mock stays a mock after restoreAllMocks: set it back to "off".
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  resetScreenReaderKnown();
});
/** The lines are cards only while a screen reader is on. */
const screenReaderOn = () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: () => {} })) as never);
};

async function render(lines: InvoiceItemData[], oneTime = false) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConnectedEditor oneTime={oneTime} />); });
  await openAllGroups(tree);
  return tree;
}
const type = async (tree: ReactTestRenderer, key: string, text: string) => {
  await act(async () => { inputOf(tree, key).props.onFocus({}); });
  await act(async () => { inputOf(tree, key).props.onChangeText(text); });
};
const lines = () => mockStore.getState().invoiceForm.items;

const differing = () => [invoiceLine({ labour_rate: 2 }, 0), invoiceLine({ labour_rate: 3 }, 1)];
const isTable = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.testID === 'line-edit_0_0').length > 0 && tree.root.findAll((node) => node.props.testID === 'card-edit_0_0').length === 0;

describe('the table is kept whatever the screen', () => {
  it('draws the table at font scale 1.0 and 411 dp', async () => {
    expect(isTable(await render(groupLines(2)))).toBe(true);
  });

  it.each([[1.3, 411], [2, 411], [1, 320], [2, 320]])('stays a table at font scale %s and %s dp, with the hint to swipe it sideways', async (scale, width) => {
    mockFontScale = scale;
    mockWidth = width;
    const tree = await render(groupLines(2));
    expect(isTable(tree)).toBe(true);
    expect(hasInput(tree, 'cell|edit_0_0|charge')).toBe(true);
    expect(hasInput(tree, 'cell|edit_1_0|labour_rate')).toBe(true);
    expect(textsOf(tree)).toContain('Swipe the table sideways to see more');
    expect(textsOf(tree)).toContain('Amount');
  });

  it('keeps the table at 411 dp for 9,999 bags', async () => {
    expect(isTable(await render([invoiceLine({ qty: 9999, charge: 9.99, labour_rate: 0, tax: 0 })]))).toBe(true);
  });
});

describe('cards with a screen reader', () => {
  it('draw a card per line, with the fields of the line and one block for all lines', async () => {
    screenReaderOn();
    const tree = await render(groupLines(2));
    expect(tree.root.findAll((node) => node.props.testID === 'card-edit_0_0')).not.toHaveLength(0);
    expect(tree.root.findAll((node) => node.props.testID === 'line-edit_0_0')).toHaveLength(0);
    expect(hasInput(tree, 'cell|edit_0_0|charge')).toBe(true);
    expect(hasInput(tree, 'cell|edit_1_0|charge')).toBe(true);
    // "All dispatches": Charge, Labour and Tax of every line.
    expect(textsOf(tree)).toContain('All dispatches');
    expect(hasInput(tree, 'group|i1:::M1|charge')).toBe(true);
    expect(hasInput(tree, 'group|i1:::M1|labour_rate')).toBe(true);
    expect(hasInput(tree, 'group|i1:::M1|tax')).toBe(true);
    // No column headings in cards.
    expect(textsOf(tree)).not.toContain('Amount');
  });

  it('have the same rules for a field as a cell: selects its text, decimal pad, and takes a typed charge', async () => {
    screenReaderOn();
    const tree = await render(groupLines(2));
    expect(inputOf(tree, 'cell|edit_0_0|charge').props).toMatchObject({ selectTextOnFocus: true, keyboardType: 'decimal-pad', value: '5.00' });
    await type(tree, 'cell|edit_0_0|charge', '8');
    expect(lines()[0].charge).toBe(8);
    expect(textsOf(tree)).toContain('₹1,050.00');
  });
});

describe('lines that differ in labour or tax', () => {
  it('stay table rows with their own Labour cell, and the Tax column has no cell (Tax is set in All dispatches)', async () => {
    const tree = await render(differing());
    expect(isTable(tree)).toBe(true);
    expect(hasInput(tree, 'cell|edit_0_0|labour_rate')).toBe(true);
    expect(inputOf(tree, 'cell|edit_1_0|labour_rate').props.value).toBe('3.00');
    expect(hasInput(tree, 'cell|edit_1_0|tax')).toBe(false);
    // "All dispatches" Labour says Mixed (the lines differ); Tax and Charge are there.
    expect(inputOf(tree, 'group|i1:::M1|labour_rate').props).toMatchObject({ value: '', placeholder: 'Mixed' });
    expect(hasInput(tree, 'group|i1:::M1|tax')).toBe(true);
    expect(hasInput(tree, 'group|i1:::M1|charge')).toBe(true);
  });

  it('are columns at 800 dp: Labour (₹) and Tax (%) headings and a Labour cell for each line', async () => {
    mockWidth = 800;
    const tree = await render(differing());
    expect(isTable(tree)).toBe(true);
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['Labour (₹)', 'Tax (%)']));
    expect(inputOf(tree, 'cell|edit_1_0|labour_rate').props.value).toBe('3.00');
  });

  it('keep their own cells while the group is shown, even when the lines become equal', async () => {
    mockWidth = 800;
    const tree = await render(differing());
    await type(tree, 'cell|edit_1_0|labour_rate', '2');
    expect(lines().map((line) => line.labour_rate)).toEqual([2, 2]);
    expect(hasInput(tree, 'cell|edit_1_0|labour_rate')).toBe(true);
  });
});
