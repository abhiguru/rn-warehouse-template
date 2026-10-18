/** Cards instead of the table: from font scale 1.3, when the columns crowd the first one, and for lines that differ in labour or tax. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf, textsOf } from '@/tests/helpers/invoiceItemsHarness';
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
afterEach(() => setLanguage('en'));

async function render(lines: InvoiceItemData[], oneTime = false) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConnectedEditor oneTime={oneTime} />); });
  return tree;
}
const type = async (tree: ReactTestRenderer, key: string, text: string) => {
  await act(async () => { inputOf(tree, key).props.onFocus({}); });
  await act(async () => { inputOf(tree, key).props.onChangeText(text); });
};
const lines = () => mockStore.getState().invoiceForm.items;

const differing = () => [invoiceLine({ labour_rate: 2 }, 0), invoiceLine({ labour_rate: 3 }, 1)];

describe('cards instead of the table', () => {
  it('draws the table at font scale 1.0 and 411 dp', async () => {
    const tree = await render(groupLines(2));
    expect(tree.root.findAll((node) => node.props.testID === 'line-edit_0_0')).not.toHaveLength(0);
    expect(tree.root.findAll((node) => node.props.testID === 'card-edit_0_0')).toHaveLength(0);
  });

  it('draws a card per line at font scale 1.3, with the fields of the line and one block for all lines', async () => {
    mockFontScale = 1.3;
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

  it('a card field has the same rules as a cell: selects its text, decimal pad, and takes a typed charge', async () => {
    mockFontScale = 1.3;
    const tree = await render(groupLines(2));
    expect(inputOf(tree, 'cell|edit_0_0|charge').props).toMatchObject({ selectTextOnFocus: true, keyboardType: 'decimal-pad', value: '5.00' });
    await type(tree, 'cell|edit_0_0|charge', '8');
    expect(lines()[0].charge).toBe(8);
    expect(textsOf(tree)).toContain('₹1,050.00');
  });

  it('draws cards when the columns would crowd the first one (320 dp)', async () => {
    mockWidth = 320;
    const tree = await render(groupLines(2));
    expect(tree.root.findAll((node) => node.props.testID === 'card-edit_0_0')).not.toHaveLength(0);
  });

  it('keeps the table at 411 dp for 9,999 bags', async () => {
    const tree = await render([invoiceLine({ qty: 9999, charge: 9.99, labour_rate: 0, tax: 0 })]);
    expect(tree.root.findAll((node) => node.props.testID === 'line-edit_0_0')).not.toHaveLength(0);
  });
});

describe('lines that differ in labour or tax', () => {
  it('are cards with their own Labour and Tax at 411 dp, and have no (all lines) Labour or Tax', async () => {
    const tree = await render(differing());
    expect(tree.root.findAll((node) => node.props.testID === 'card-edit_0_0')).not.toHaveLength(0);
    expect(hasInput(tree, 'cell|edit_0_0|labour_rate')).toBe(true);
    expect(hasInput(tree, 'cell|edit_1_0|tax')).toBe(true);
    expect(hasInput(tree, 'group|i1:::M1|labour_rate')).toBe(false);
    expect(hasInput(tree, 'group|i1:::M1|tax')).toBe(false);
    expect(hasInput(tree, 'group|i1:::M1|charge')).toBe(true);
  });

  it('are columns at 800 dp: Labour (₹) and Tax (%) headings and a cell for each line', async () => {
    mockWidth = 800;
    const tree = await render(differing());
    expect(tree.root.findAll((node) => node.props.testID === 'line-edit_0_0')).not.toHaveLength(0);
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['Labour (₹)', 'Tax (%)']));
    expect(inputOf(tree, 'cell|edit_1_0|labour_rate').props.value).toBe('3.00');
    expect(hasInput(tree, 'group|i1:::M1|labour_rate')).toBe(false);
  });

  it('keep their own columns while the group is shown, even when the lines become equal', async () => {
    mockWidth = 800;
    const tree = await render(differing());
    await type(tree, 'cell|edit_1_0|labour_rate', '2');
    expect(lines().map((line) => line.labour_rate)).toEqual([2, 2]);
    expect(hasInput(tree, 'cell|edit_1_0|labour_rate')).toBe(true);
  });
});
