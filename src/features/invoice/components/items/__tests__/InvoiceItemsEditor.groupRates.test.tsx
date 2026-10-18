/** The (all lines) rows: Mixed, the note for lines that keep their own charge, one-line and one-time groups. */
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

const FREE_AND_PAID = () => [invoiceLine({ charge: 0 }, 0), invoiceLine({}, 1)];
const GROUP = 'i1:::M1';

describe('a group whose lines differ', () => {
  it('shows "Mixed" for the charge that differs, not an average, and the shared labour and tax', async () => {
    const tree = await render(FREE_AND_PAID());
    // The average of 0 and 5 would be 2.50.
    expect(inputOf(tree, `group|${GROUP}|charge`).props).toMatchObject({ value: '', placeholder: 'Mixed' });
    expect(inputOf(tree, `group|${GROUP}|labour_rate`).props).toMatchObject({ value: '2.00', placeholder: '0' });
    expect(inputOf(tree, `group|${GROUP}|tax`).props).toMatchObject({ value: '5', placeholder: '0' });
    // Each line shows its own charge in its cell.
    expect(inputOf(tree, 'cell|edit_0_0|charge').props.value).toBe('0.00');
    expect(inputOf(tree, 'cell|edit_1_0|charge').props.value).toBe('5.00');
  });

  it('says it in Gujarati', async () => {
    setLanguage('gu');
    const tree = await render(FREE_AND_PAID());
    expect(inputOf(tree, `group|${GROUP}|charge`).props).toMatchObject({ value: '', placeholder: 'જુદા જુદા' });
  });

  it('typing the group charge sets the charge of every line and leaves labour and tax alone', async () => {
    const tree = await render(FREE_AND_PAID());
    await type(tree, `group|${GROUP}|charge`, '6');
    expect(lines().map((line) => [line.charge, line.labour_rate, line.tax])).toEqual([[6, 2, 5], [6, 2, 5]]);
    expect(inputOf(tree, `group|${GROUP}|charge`).props).toMatchObject({ value: '6', placeholder: '0' });
  });

  it('a charge typed on one line stays when the group charge is typed, and the group says so', async () => {
    const tree = await render(groupLines(3));
    await type(tree, 'cell|edit_1_0|charge', '9');
    await type(tree, `group|${GROUP}|charge`, '6');

    expect(lines().map((line) => line.charge)).toEqual([6, 9, 6]);
    expect(inputOf(tree, `group|${GROUP}|charge`).props.value).toBe('6');
    expect(textsOf(tree)).toContain('1 line keeps its own charge');
  });

  it('counts the lines that keep their own charge: 2 lines', async () => {
    const tree = await render(groupLines(3));
    await type(tree, 'cell|edit_0_0|charge', '9');
    await type(tree, 'cell|edit_1_0|charge', '8');
    await type(tree, `group|${GROUP}|charge`, '6');
    expect(textsOf(tree)).toContain('2 lines keep their own charge');
  });

  it('keeps showing a group rate that was applied when one line is given its own charge afterwards', async () => {
    const tree = await render(groupLines(3));
    await type(tree, `group|${GROUP}|charge`, '6');
    await type(tree, 'cell|edit_1_0|charge', '9');
    expect(lines().map((line) => line.charge)).toEqual([6, 9, 6]);
    expect(inputOf(tree, `group|${GROUP}|charge`).props).toMatchObject({ value: '6', placeholder: '0' });
    expect(textsOf(tree)).toContain('1 line keeps its own charge');
  });

  it('shows no note when no line keeps its own charge', async () => {
    const tree = await render(groupLines(3));
    await type(tree, `group|${GROUP}|charge`, '6');
    expect(textsOf(tree).filter((text) => /keep/.test(text))).toEqual([]);
  });
});

describe('a group whose lines agree', () => {
  it('shows the shared rates, and an empty field with the placeholder 0 when every line is free (not "Mixed")', async () => {
    const tree = await render([invoiceLine({ charge: 0 }, 0), invoiceLine({ charge: 0 }, 1)]);
    expect(inputOf(tree, `group|${GROUP}|charge`).props).toMatchObject({ value: '', placeholder: '0' });
    expect(inputOf(tree, `group|${GROUP}|labour_rate`).props.value).toBe('2.00');
  });
});

describe('a group of one line', () => {
  it('has no Charge (all lines) row, and labels Labour and Tax without "(all lines)"', async () => {
    const tree = await render(edgeLines.smallest());
    const texts = textsOf(tree);
    expect(hasInput(tree, 'group|garlic:::|charge')).toBe(false);
    expect(texts).toEqual(expect.arrayContaining(['Labour (₹)', 'Tax (%)']));
    expect(texts.some((text) => text.includes('(all lines)'))).toBe(false);
    expect(inputOf(tree, 'group|garlic:::|labour_rate').props.value).toBe('3.00');
  });

  it('a one-time GRN has no Labour row', async () => {
    const tree = await render([edgeLines.oneTime()[0]], true);
    expect(hasInput(tree, 'group|kashmiri:::OT-1|labour_rate')).toBe(false);
    expect(hasInput(tree, 'group|kashmiri:::OT-1|tax')).toBe(true);
  });
});
