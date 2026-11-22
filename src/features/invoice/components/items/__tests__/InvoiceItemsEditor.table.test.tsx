/** The items editor at 411 dp, font scale 1: the table, its cells and its totals. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { setLanguage } from '@/i18n/language';
import { touchTarget } from '@/theme/tokens';
import { makeInvoiceStore, fillNewInvoice, groupLines, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf, textsOf, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';

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
beforeEach(() => { mockWidth = 411; mockFontScale = 1; });
afterEach(() => setLanguage('en'));

async function mount(lines = groupLines(2), oneTime = false) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await render(<ConnectedEditor oneTime={oneTime} />);
  await openAllGroups();
}

describe('the table at 411 dp', () => {
  it('has the columns Dispatch | Date | Months | Days | Qty | Charge | Labour | Tax | Amount once the card is open', async () => {
    await mount();
    const texts = textsOf();
    expect(texts).toEqual(expect.arrayContaining(['Dispatch', 'Date', 'Months', 'Days', 'Qty', 'Charge (₹)', 'Labour (₹)', 'Tax (%)', 'Amount']));
    expect(texts).toContain('Swipe the table sideways to see more');
  });

  it('writes the date, the months and the days of a dispatch in their own columns, read-only', async () => {
    await mount();
    const texts = textsOf();
    // fictional dispatch 2026-10-01, one month of 30 days
    expect(texts).toEqual(expect.arrayContaining(['I0001', '01/10/26', '1', '30']));
  });

  it('gives a charge cell the rules of an editable figure', async () => {
    await mount();
    const cell = inputOf('cell|edit_0_0|charge');
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
    await mount();
    await fireEvent(inputOf('cell|edit_0_0|charge'), 'focus', {});
    await fireEvent.changeText(inputOf('cell|edit_0_0|charge'), '7.123');
    await fireEvent(inputOf('cell|edit_0_0|charge'), 'blur', {});
    expect(inputOf('cell|edit_0_0|charge').props.accessibilityHint).toMatch(/up to 2 decimals/);
    expect(textsOf().filter((text) => /up to 2 decimals/.test(text))).toHaveLength(1);
  });

  it('has the All dispatches row with Charge, Labour and Tax of a group of two lines', async () => {
    await mount();
    const texts = textsOf();
    expect(texts).toContain('All dispatches');
    expect(inputOf('group|i1:::M1|charge').props.value).toBe('5.00');
    expect(inputOf('group|i1:::M1|labour_rate').props.value).toBe('2.00');
    expect(inputOf('group|i1:::M1|tax').props.value).toBe('5');
    expect(inputOf('group|i1:::M1|tax').props.accessibilityLabel).toBe('Tax, Example Potatoes, all lines, percent');
  });

  it('shows each line total in its row and the group total once, in the card head', async () => {
    await mount();
    const texts = textsOf();
    expect(texts.filter((text) => text === '₹735.00')).toHaveLength(2);
    expect(texts.filter((text) => text === '₹1,470.00')).toHaveLength(1);
    expect(texts).toContain('Total');
  });

  it('shows a total near the design edge on one line: ₹96,934.70', async () => {
    await mount(edgeLines.nearEdge());
    const texts = textsOf();
    expect(texts).toContain('₹96,934.70');
  });

  it('draws no sideways ScrollView anywhere', async () => {
    await mount(edgeLines.manyGroups());
    expect(screen.root!.queryAll((node) => node.props.horizontal === true, { includeSelf: true })).toEqual([]);
  });

  it('has no Labour row and says "One-time" for a one-time GRN', async () => {
    await mount(edgeLines.oneTime(), true);
    const texts = textsOf();
    expect(texts).not.toContain('Labour (₹) (all lines)');
    expect(texts.some((text) => text.includes('One-time'))).toBe(true);
    expect(texts.some((text) => text.includes('month'))).toBe(false);
    expect(hasInput('group|kashmiri:::OT-1|labour_rate')).toBe(false);
    expect(hasInput('group|kashmiri:::OT-1|tax')).toBe(true);
  });

  it('reads Gujarati digits and headings', async () => {
    setLanguage('gu');
    await mount();
    expect(textsOf()).toContain('ભાડું (₹)');
    expect(inputOf('cell|edit_0_0|charge').props.value).toBe('૫.૦૦');
  });
});
