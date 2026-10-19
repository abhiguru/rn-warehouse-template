/** The items editor at 411 dp, font scale 1: the table, its cells and its totals. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { touchTarget } from '@/theme/tokens';
import { makeInvoiceStore, fillNewInvoice, groupLines, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf, textsOf } from '@/tests/helpers/invoiceItemsHarness';

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

async function render(lines = groupLines(2), oneTime = false) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConnectedEditor oneTime={oneTime} />); });
  return tree;
}

describe('the table at 411 dp', () => {
  it('has the columns Dispatch | Qty | Charge (₹) | Amount and the hint under them', async () => {
    const texts = textsOf(await render());
    expect(texts).toEqual(expect.arrayContaining(['Dispatch', 'Qty', 'Charge (₹)', 'Amount', 'Tap a figure to change it.']));
    // Labour and Tax are rows while the lines share them, not columns.
    expect(texts).not.toContain('Labour (₹)');
    expect(texts).not.toContain('Tax (%)');
  });

  it('writes the date and the duration under the dispatch number, read-only', async () => {
    const texts = textsOf(await render());
    // fictional dispatch 2026-10-01, one month of 30 days
    expect(texts.some((text) => text.includes('1 Oct') && text.includes('1 month') && text.includes('30 days'))).toBe(true);
    expect(texts).toContain('I0001');
  });

  it('gives a charge cell the rules of an editable figure', async () => {
    const tree = await render();
    const cell = inputOf(tree, 'cell|edit_0_0|charge');
    expect(cell.props).toMatchObject({
      selectTextOnFocus: true,
      keyboardType: 'decimal-pad',
      maxFontSizeMultiplier: 1.3,
      returnKeyType: 'next',
      value: '5.00',
      accessibilityLabel: 'Charge, dispatch I0001, rupees per bag, per month',
    });
    expect(StyleSheet.flatten(cell.props.style).minHeight).toBe(touchTarget);
    expect(cell.props.accessibilityHint).toBeUndefined();
  });

  it('puts the error in the hint of the cell and as a line under the row after the cell is left', async () => {
    const tree = await render();
    await act(async () => { inputOf(tree, 'cell|edit_0_0|charge').props.onFocus({}); });
    await act(async () => { inputOf(tree, 'cell|edit_0_0|charge').props.onChangeText('7.123'); });
    await act(async () => { inputOf(tree, 'cell|edit_0_0|charge').props.onBlur({}); });
    expect(inputOf(tree, 'cell|edit_0_0|charge').props.accessibilityHint).toMatch(/up to 2 decimals/);
    expect(textsOf(tree).filter((text) => /up to 2 decimals/.test(text))).toHaveLength(1);
  });

  it('has the (all lines) rows for Charge, Labour and Tax of a group of two lines', async () => {
    const tree = await render();
    const texts = textsOf(tree);
    expect(texts).toEqual(expect.arrayContaining(['Charge (₹) (all lines)', 'Labour (₹) (all lines)', 'Tax (%) (all lines)']));
    expect(inputOf(tree, 'group|i1:::M1|charge').props.value).toBe('5.00');
    expect(inputOf(tree, 'group|i1:::M1|labour_rate').props.value).toBe('2.00');
    expect(inputOf(tree, 'group|i1:::M1|tax').props.value).toBe('5');
    expect(inputOf(tree, 'group|i1:::M1|tax').props.accessibilityLabel).toBe('Tax, Example Potatoes, all lines, percent');
  });

  it('shows each line total and the group total, in the heading and in the total row', async () => {
    const texts = textsOf(await render());
    expect(texts.filter((text) => text === '₹735.00')).toHaveLength(2);
    expect(texts.filter((text) => text === '₹1,470.00')).toHaveLength(2);
    expect(texts).toContain('Group total · 2 dispatches');
  });

  it('shows a total near the design edge on one line: ₹96,934.70', async () => {
    const texts = textsOf(await render(edgeLines.nearEdge()));
    expect(texts).toContain('₹96,934.70');
  });

  it('draws no sideways ScrollView anywhere', async () => {
    const tree = await render(edgeLines.manyGroups());
    expect(tree.root.findAll((node) => node.props.horizontal === true)).toEqual([]);
  });

  it('has no Labour row and says "One-time" for a one-time GRN', async () => {
    const tree = await render(edgeLines.oneTime(), true);
    const texts = textsOf(tree);
    expect(texts).not.toContain('Labour (₹) (all lines)');
    expect(texts.some((text) => text.includes('One-time'))).toBe(true);
    expect(texts.some((text) => text.includes('month'))).toBe(false);
    expect(hasInput(tree, 'group|kashmiri:::OT-1|labour_rate')).toBe(false);
    expect(hasInput(tree, 'group|kashmiri:::OT-1|tax')).toBe(true);
  });

  it('reads Gujarati digits and headings', async () => {
    setLanguage('gu');
    const tree = await render();
    expect(textsOf(tree)).toContain('ભાડું (₹)');
    expect(inputOf(tree, 'cell|edit_0_0|charge').props.value).toBe('૫.૦૦');
  });
});
