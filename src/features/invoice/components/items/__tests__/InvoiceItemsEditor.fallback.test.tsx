/**
 * The lines are a table whatever the text size, the width or the figures (owner, 2026-10-19: the table scrolls sideways
 * instead), and cards only while a screen reader is on. Lines that differ in labour or tax stay table rows.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { resetScreenReaderKnown } from '@/hooks/useScreenReader';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, hasInput, inputOf, textsOf, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
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

async function mount(lines: InvoiceItemData[], oneTime = false) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await render(<ConnectedEditor oneTime={oneTime} />);
  await openAllGroups();
}
const type = async (key: string, text: string) => {
  await fireEvent(inputOf(key), 'focus', {});
  await fireEvent.changeText(inputOf(key), text);
};
const lines = () => mockStore.getState().invoiceForm.items;

const differing = () => [invoiceLine({ labour_rate: 2 }, 0), invoiceLine({ labour_rate: 3 }, 1)];
const isTable = () =>
  screen.queryAllByTestId('line-edit_0_0').length > 0 && screen.queryAllByTestId('card-edit_0_0').length === 0;

describe('the table is kept whatever the screen', () => {
  it('draws the table at font scale 1.0 and 411 dp', async () => {
    await mount(groupLines(2));
    expect(isTable()).toBe(true);
  });

  it.each([[1.3, 411], [2, 411], [1, 320], [2, 320]])('stays a table at font scale %s and %s dp, with the hint to swipe it sideways', async (scale, width) => {
    mockFontScale = scale;
    mockWidth = width;
    await mount(groupLines(2));
    expect(isTable()).toBe(true);
    expect(hasInput('cell|edit_0_0|charge')).toBe(true);
    expect(hasInput('cell|edit_1_0|labour_rate')).toBe(true);
    expect(textsOf()).toContain('Swipe the table sideways to see more');
    expect(textsOf()).toContain('Amount');
  });

  it('keeps the table at 411 dp for 9,999 bags', async () => {
    await mount([invoiceLine({ qty: 9999, charge: 9.99, labour_rate: 0, tax: 0 })]);
    expect(isTable()).toBe(true);
  });
});

describe('cards with a screen reader', () => {
  it('draw a card per line, with the fields of the line and one block for all lines', async () => {
    screenReaderOn();
    await mount(groupLines(2));
    expect(screen.queryAllByTestId('card-edit_0_0')).not.toHaveLength(0);
    expect(screen.queryAllByTestId('line-edit_0_0')).toHaveLength(0);
    expect(hasInput('cell|edit_0_0|charge')).toBe(true);
    expect(hasInput('cell|edit_1_0|charge')).toBe(true);
    // "All dispatches": Charge, Labour and Tax of every line.
    expect(textsOf()).toContain('All dispatches');
    expect(hasInput('group|i1:::M1|charge')).toBe(true);
    expect(hasInput('group|i1:::M1|labour_rate')).toBe(true);
    expect(hasInput('group|i1:::M1|tax')).toBe(true);
    // No column headings in cards.
    expect(textsOf()).not.toContain('Amount');
  });

  it('have the same rules for a field as a cell: selects its text, decimal pad, and takes a typed charge', async () => {
    screenReaderOn();
    await mount(groupLines(2));
    expect(inputOf('cell|edit_0_0|charge').props).toMatchObject({ selectTextOnFocus: true, keyboardType: 'decimal-pad', value: '5.00' });
    await type('cell|edit_0_0|charge', '8');
    expect(lines()[0].charge).toBe(8);
    expect(textsOf()).toContain('₹1,050.00');
  });
});

describe('lines that differ in labour or tax', () => {
  it('stay table rows with their own Labour cell, and the Tax column has no cell (Tax is set in All dispatches)', async () => {
    await mount(differing());
    expect(isTable()).toBe(true);
    expect(hasInput('cell|edit_0_0|labour_rate')).toBe(true);
    expect(inputOf('cell|edit_1_0|labour_rate').props.value).toBe('3.00');
    expect(hasInput('cell|edit_1_0|tax')).toBe(false);
    // "All dispatches" Labour says Mixed (the lines differ); Tax and Charge are there.
    expect(inputOf('group|i1:::M1|labour_rate').props).toMatchObject({ value: '', placeholder: 'Mixed' });
    expect(hasInput('group|i1:::M1|tax')).toBe(true);
    expect(hasInput('group|i1:::M1|charge')).toBe(true);
  });

  it('are columns at 800 dp: Labour (₹) and Tax (%) headings and a Labour cell for each line', async () => {
    mockWidth = 800;
    await mount(differing());
    expect(isTable()).toBe(true);
    expect(textsOf()).toEqual(expect.arrayContaining(['Labour (₹)', 'Tax (%)']));
    expect(inputOf('cell|edit_1_0|labour_rate').props.value).toBe('3.00');
  });

  it('keep their own cells while the group is shown, even when the lines become equal', async () => {
    mockWidth = 800;
    await mount(differing());
    await type('cell|edit_1_0|labour_rate', '2');
    expect(lines().map((line) => line.labour_rate)).toEqual([2, 2]);
    expect(hasInput('cell|edit_1_0|labour_rate')).toBe(true);
  });
});
