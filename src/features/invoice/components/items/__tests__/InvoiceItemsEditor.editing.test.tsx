/**
 * Typing in the items editor: a valid figure is applied at once, a refused one never changes a
 * total and shows its error only after the field is left, and Next walks the fields.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, inputOf, textsOf, track, unmountAll } from '@/tests/helpers/invoiceItemsHarness';
import type { InvoiceItemsEditorHandle } from '../InvoiceItemsEditor';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: 1 }),
}));

const CHARGE_1 = 'cell|edit_0_0|charge';
const CHARGE_2 = 'cell|edit_1_0|charge';
const TAX_ALL = 'group|i1:::M1|tax';

// Qty 100, charge 5, labour 2, tax 5, 1 month: total 735. At charge 8: 100*8 = 800, +200 labour, +50 tax = 1050.
const lineTotal = (tree: ReactTestRenderer) => textsOf(tree).filter((text) => /^₹[\d,]+\.\d\d$/.test(text));

async function render(lines = groupLines(2)) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  const ref = React.createRef<InvoiceItemsEditorHandle>();
  let tree!: ReactTestRenderer;
  await act(async () => { tree = track(create(<ConnectedEditor editorRef={ref} />)); });
  return { tree, ref };
}
const change = async (tree: ReactTestRenderer, key: string, text: string) => {
  await act(async () => { inputOf(tree, key).props.onChangeText(text); });
};
const focus = async (tree: ReactTestRenderer, key: string) => {
  await act(async () => { inputOf(tree, key).props.onFocus({}); });
};
const blur = async (tree: ReactTestRenderer, key: string) => {
  await act(async () => { inputOf(tree, key).props.onBlur({}); });
};
const total = () => mockStore.getState().invoiceForm.header.total;
const lineCharge = (n: number) => mockStore.getState().invoiceForm.items[n].charge;

const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
beforeEach(() => announce.mockClear());
afterEach(() => {
  act(() => unmountAll());
  setLanguage('en');
});

/** The focus() of one input, on its own (the test renderer shares one mock between all inputs). */
const spyFocus = (tree: ReactTestRenderer, key: string) => {
  const node = inputOf(tree, key).instance as unknown as { focus: jest.Mock; blur: jest.Mock };
  node.focus = jest.fn();
  node.blur = jest.fn();
  return node;
};

describe('typing a figure', () => {
  it('updates the line amount and the group total as the keys come', async () => {
    const { tree } = await render();
    expect(lineTotal(tree)).toContain('₹735.00');
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '8');
    expect(lineCharge(0)).toBe(8);
    expect(lineTotal(tree)).toContain('₹1,050.00');
    // The group total is the two lines: 1,050 + 735.
    expect(lineTotal(tree)).toContain('₹1,785.00');
  });

  it('shows two decimals once the cell is left: 12.5 becomes 12.50', async () => {
    const { tree } = await render();
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '12.5');
    expect(inputOf(tree, CHARGE_1).props.value).toBe('12.5');
    await blur(tree, CHARGE_1);
    expect(inputOf(tree, CHARGE_1).props.value).toBe('12.50');
  });
});

describe('Gujarati', () => {
  it('reads digits typed as ૦-૯ as 0-9 and shows the cell in Gujarati digits', async () => {
    setLanguage('gu');
    const { tree } = await render();
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '૧૨');
    expect(lineCharge(0)).toBe(12);
    expect(inputOf(tree, CHARGE_1).props.value).toBe('૧૨');
  });
});

describe('a refused value', () => {
  it('never changes a total: "1000000" typed key by key leaves the amounts as they were on focus', async () => {
    const { tree } = await render();
    const before = total();
    await focus(tree, CHARGE_1);
    for (const typed of ['1', '10', '100', '1000', '10000', '100000']) {
      await change(tree, CHARGE_1, typed);
    }
    // 100000 is a valid charge: the amounts follow it while it is valid.
    expect(lineCharge(0)).toBe(100000);
    await change(tree, CHARGE_1, '1000000');

    // Refused: the form holds the charge the cell had on focus, and no total shows the 100000 result.
    expect(lineCharge(0)).toBe(5);
    expect(total()).toBe(before);
    expect(lineTotal(tree)).not.toContain('₹1,00,00,000.00');
    expect(lineTotal(tree).filter((text) => text.length > 12)).toEqual([]);
    expect(inputOf(tree, CHARGE_1).props.value).toBe('1000000');
  });

  it('"101" in the group tax leaves every amount as it was', async () => {
    const { tree } = await render();
    const before = total();
    await focus(tree, TAX_ALL);
    await change(tree, TAX_ALL, '101');
    expect(total()).toBe(before);
    expect(mockStore.getState().invoiceForm.items.map((line) => line.tax)).toEqual([5, 5]);
  });

  it('puts the lines back when text becomes refused after a valid prefix: "10" then "101" in the group tax', async () => {
    const { tree } = await render();
    const before = total();
    await focus(tree, TAX_ALL);
    await change(tree, TAX_ALL, '10');
    expect(mockStore.getState().invoiceForm.items.map((line) => line.tax)).toEqual([10, 10]);
    await change(tree, TAX_ALL, '101');
    expect(mockStore.getState().invoiceForm.items.map((line) => line.tax)).toEqual([5, 5]);
    expect(total()).toBe(before);
  });

  it.each([['-5'], ['5.123'], ['abc'], ['1,500']])('"%s" in a charge cell changes nothing', async (typed) => {
    const { tree } = await render();
    const before = total();
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, typed);
    expect(total()).toBe(before);
    expect(lineCharge(0)).toBe(5);
  });

  it('shows its error only after the cell is left, and keeps the text there', async () => {
    const { tree } = await render();
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '1000000');
    expect(textsOf(tree)).not.toContain('Enter a charge from 0 to 999999.');
    expect(inputOf(tree, CHARGE_1).props.accessibilityHint).toBeUndefined();

    await blur(tree, CHARGE_1);
    expect(textsOf(tree)).toContain('Enter a charge from 0 to 999999.');
    expect(inputOf(tree, CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 999999.');
    expect(inputOf(tree, CHARGE_1).props.value).toBe('1000000');
    expect(total()).toBe(mockStore.getState().invoiceForm.header.total);
  });

  it('is cleared when the text is corrected to a valid figure', async () => {
    const { tree } = await render();
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '1000000');
    await blur(tree, CHARGE_1);
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '100');
    await blur(tree, CHARGE_1);
    expect(textsOf(tree)).not.toContain('Enter a charge from 0 to 999999.');
    expect(inputOf(tree, CHARGE_1).props.value).toBe('100.00');
    expect(lineCharge(0)).toBe(100);
  });
});

describe('Next', () => {
  it('walks the charge cells line by line, then the shared fields, then closes the keyboard', async () => {
    const { tree } = await render();
    const keys = [CHARGE_2, 'group|i1:::M1|charge', 'group|i1:::M1|labour_rate', TAX_ALL];
    const nodes = Object.fromEntries(keys.map((key) => [key, spyFocus(tree, key)]));
    const focusOf = (key: string) => nodes[key].focus;
    await act(async () => { inputOf(tree, CHARGE_1).props.onSubmitEditing(); });
    expect(focusOf(CHARGE_2)).toHaveBeenCalledTimes(1);
    await act(async () => { inputOf(tree, CHARGE_2).props.onSubmitEditing(); });
    expect(focusOf('group|i1:::M1|charge')).toHaveBeenCalledTimes(1);
    await act(async () => { inputOf(tree, 'group|i1:::M1|charge').props.onSubmitEditing(); });
    expect(focusOf('group|i1:::M1|labour_rate')).toHaveBeenCalledTimes(1);
    await act(async () => { inputOf(tree, 'group|i1:::M1|labour_rate').props.onSubmitEditing(); });
    expect(focusOf(TAX_ALL)).toHaveBeenCalledTimes(1);
    await act(async () => { inputOf(tree, TAX_ALL).props.onSubmitEditing(); });
    expect(nodes[TAX_ALL].blur).toHaveBeenCalledTimes(1);
  });

  it('is refused while a figure holds refused text: it announces the count and focuses the first wrong cell', async () => {
    const { tree, ref } = await render(groupLines(3));
    // Wrong text in the third line, then in the second: the first in screen order is the second line.
    await focus(tree, 'cell|edit_2_0|charge');
    await change(tree, 'cell|edit_2_0|charge', '1000000');
    await focus(tree, CHARGE_2);
    await change(tree, CHARGE_2, '-1');

    const second = spyFocus(tree, CHARGE_2);
    const third = spyFocus(tree, 'cell|edit_2_0|charge');
    let count = 0;
    await act(async () => { count = ref.current!.checkAll(); });

    expect(count).toBe(2);
    expect(announce).toHaveBeenCalledWith('Fix the 2 highlighted figures, then continue.');
    expect(second.focus).toHaveBeenCalledTimes(1);
    expect(third.focus).not.toHaveBeenCalled();
    // Both errors show now, without leaving either cell.
    expect(inputOf(tree, CHARGE_2).props.accessibilityHint).toBe('Enter a charge from 0 to 999999.');
    expect(inputOf(tree, 'cell|edit_2_0|charge').props.accessibilityHint).toBe('Enter a charge from 0 to 999999.');
  });

  it('is clear with nothing wrong: 0', async () => {
    const { tree, ref } = await render([invoiceLine()]);
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '7');
    let count = -1;
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(0);
    expect(announce).not.toHaveBeenCalled();
  });
});
