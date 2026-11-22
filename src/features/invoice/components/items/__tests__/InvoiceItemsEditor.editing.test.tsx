/**
 * Typing in the items editor: a valid figure is applied at once, a refused one never changes a
 * total and shows its error only after the field is left, and Next walks the fields.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { setLanguage } from '@/i18n/language';
import { makeInvoiceStore, fillNewInvoice, groupLines, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, blurredIds, clearFocused, focusedIds, inputOf, textsOf, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import type { InvoiceItemsEditorHandle } from '../InvoiceItemsEditor';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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
const lineTotal = () => textsOf().filter((text) => /^₹[\d,]+\.\d\d$/.test(text));

async function mount(lines = groupLines(2)) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  const ref = React.createRef<InvoiceItemsEditorHandle>();
  await render(<ConnectedEditor editorRef={ref} />);
  await openAllGroups();
  return { ref };
}
const change = async (key: string, text: string) => {
  await fireEvent.changeText(inputOf(key), text);
};
const focus = async (key: string) => {
  await fireEvent(inputOf(key), 'focus', {});
};
const blur = async (key: string) => {
  await fireEvent(inputOf(key), 'blur', {});
};
const total = () => mockStore.getState().invoiceForm.header.total;
const lineCharge = (n: number) => mockStore.getState().invoiceForm.items[n].charge;

const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
beforeEach(() => announce.mockClear());
afterEach(() => {
  setLanguage('en');
});

describe('typing a figure', () => {
  it('updates the line amount and the group total as the keys come', async () => {
    await mount();
    expect(lineTotal()).toContain('₹735.00');
    await focus(CHARGE_1);
    await change(CHARGE_1, '8');
    expect(lineCharge(0)).toBe(8);
    expect(lineTotal()).toContain('₹1,050.00');
    // The group total is the two lines: 1,050 + 735.
    expect(lineTotal()).toContain('₹1,785.00');
  });

  it('shows two decimals once the cell is left: 12.5 becomes 12.50', async () => {
    await mount();
    await focus(CHARGE_1);
    await change(CHARGE_1, '12.5');
    expect(inputOf(CHARGE_1).props.value).toBe('12.5');
    await blur(CHARGE_1);
    expect(inputOf(CHARGE_1).props.value).toBe('12.50');
  });
});

describe('Gujarati', () => {
  it('reads digits typed as ૦-૯ as 0-9 and shows the cell in Gujarati digits', async () => {
    setLanguage('gu');
    await mount();
    await focus(CHARGE_1);
    await change(CHARGE_1, '૧૨');
    expect(lineCharge(0)).toBe(12);
    expect(inputOf(CHARGE_1).props.value).toBe('૧૨');
  });
});

describe('a refused value', () => {
  it('never changes a total: "1000000" typed key by key leaves the amounts as they were on focus', async () => {
    await mount();
    const before = total();
    await focus(CHARGE_1);
    for (const typed of ['1', '10', '100', '1000']) {
      await change(CHARGE_1, typed);
    }
    // 1000 is a valid charge: the amounts follow it while it is valid.
    expect(lineCharge(0)).toBe(1000);
    // A line's charge is limited to 9999.99 on entry (owner, 2026-10-19): "10000" is refused.
    await change(CHARGE_1, '10000');

    // Refused: the form holds the charge the cell had on focus, and no total shows the 100000 result.
    expect(lineCharge(0)).toBe(5);
    expect(total()).toBe(before);
    expect(lineTotal()).not.toContain('₹1,00,00,000.00');
    expect(lineTotal().filter((text) => text.length > 12)).toEqual([]);
    expect(inputOf(CHARGE_1).props.value).toBe('10000');
  });

  it('"101" in the group tax leaves every amount as it was', async () => {
    await mount();
    const before = total();
    await focus(TAX_ALL);
    await change(TAX_ALL, '101');
    expect(total()).toBe(before);
    expect(mockStore.getState().invoiceForm.items.map((line) => line.tax)).toEqual([5, 5]);
  });

  it('puts the lines back when text becomes refused after a valid prefix: "10" then "101" in the group tax', async () => {
    await mount();
    const before = total();
    await focus(TAX_ALL);
    await change(TAX_ALL, '10');
    expect(mockStore.getState().invoiceForm.items.map((line) => line.tax)).toEqual([10, 10]);
    await change(TAX_ALL, '101');
    expect(mockStore.getState().invoiceForm.items.map((line) => line.tax)).toEqual([5, 5]);
    expect(total()).toBe(before);
  });

  it.each([['-5'], ['5.123'], ['abc'], ['1,500']])('"%s" in a charge cell changes nothing', async (typed) => {
    await mount();
    const before = total();
    await focus(CHARGE_1);
    await change(CHARGE_1, typed);
    expect(total()).toBe(before);
    expect(lineCharge(0)).toBe(5);
  });

  it('shows its error only after the cell is left, and keeps the text there', async () => {
    await mount();
    await focus(CHARGE_1);
    await change(CHARGE_1, '1000000');
    expect(textsOf()).not.toContain('Enter a charge from 0 to 9999.99.');
    expect(inputOf(CHARGE_1).props.accessibilityHint).toBeUndefined();

    await blur(CHARGE_1);
    expect(textsOf()).toContain('Enter a charge from 0 to 9999.99.');
    expect(inputOf(CHARGE_1).props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
    expect(inputOf(CHARGE_1).props.value).toBe('1000000');
    expect(total()).toBe(mockStore.getState().invoiceForm.header.total);
  });

  it('is cleared when the text is corrected to a valid figure', async () => {
    await mount();
    await focus(CHARGE_1);
    await change(CHARGE_1, '1000000');
    await blur(CHARGE_1);
    await focus(CHARGE_1);
    await change(CHARGE_1, '100');
    await blur(CHARGE_1);
    expect(textsOf()).not.toContain('Enter a charge from 0 to 9999.99.');
    expect(inputOf(CHARGE_1).props.value).toBe('100.00');
    expect(lineCharge(0)).toBe(100);
  });
});

describe('Next', () => {
  it('walks the shared fields, then each line (Charge, Labour), then closes the keyboard', async () => {
    await mount();
    const CHARGE_ALL = 'group|i1:::M1|charge';
    const LABOUR_ALL = 'group|i1:::M1|labour_rate';
    const LABOUR_1 = 'cell|edit_0_0|labour_rate';
    const LABOUR_2 = 'cell|edit_1_0|labour_rate';
    const next = async (from: string, to: string) => {
      clearFocused();
      await fireEvent(inputOf(from), 'submitEditing');
      expect(focusedIds()).toEqual([to]);
    };
    await next(CHARGE_ALL, LABOUR_ALL);
    await next(LABOUR_ALL, TAX_ALL);
    await next(TAX_ALL, CHARGE_1);
    await next(CHARGE_1, LABOUR_1);
    await next(LABOUR_1, CHARGE_2);
    await next(CHARGE_2, LABOUR_2);
    clearFocused();
    await fireEvent(inputOf(LABOUR_2), 'submitEditing');
    expect(blurredIds()).toEqual([LABOUR_2]);
  });

  it('is refused while a figure holds refused text: it announces the count and focuses the first wrong cell', async () => {
    const { ref } = await mount(groupLines(3));
    // Wrong text in the third line, then in the second: the first in screen order is the second line.
    await focus('cell|edit_2_0|charge');
    await change('cell|edit_2_0|charge', '1000000');
    await focus(CHARGE_2);
    await change(CHARGE_2, '-1');

    clearFocused();
    let count = 0;
    await act(async () => { count = ref.current!.checkAll(); });

    expect(count).toBe(2);
    expect(announce).toHaveBeenCalledWith('Fix the 2 highlighted figures, then continue.');
    expect(focusedIds()).toEqual([CHARGE_2]);
    // Both errors show now, without leaving either cell.
    expect(inputOf(CHARGE_2).props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
    expect(inputOf('cell|edit_2_0|charge').props.accessibilityHint).toBe('Enter a charge from 0 to 9999.99.');
  });

  it('is clear with nothing wrong: 0', async () => {
    const { ref } = await mount([invoiceLine()]);
    await focus(CHARGE_1);
    await change(CHARGE_1, '7');
    let count = -1;
    await act(async () => { count = ref.current!.checkAll(); });
    expect(count).toBe(0);
    expect(announce).not.toHaveBeenCalled();
  });
});
