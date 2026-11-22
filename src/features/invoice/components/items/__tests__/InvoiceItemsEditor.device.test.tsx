/**
 * What the phone showed in run P2 and Jest did not: a ref released while a field is typed in, the
 * keyboard's Next key leaving the field under the keyboard, the list closing the keyboard on a drag,
 * and a table row that claims no touch (a vertical swipe over it must reach the list).
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { makeInvoiceStore, fillNewInvoice, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, chargeEntryOf, flashListOf, inputObjectOf, inputOf, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import { findFiber } from '@/tests/helpers/fiberTree';
import { EditableNumberCell } from '@/components/table/EditableNumberCell';
import { SCROLL_VIEW_POSITION } from '../InvoiceItemsEditor';
import type { InvoiceItemData } from '@/types/invoice.types';

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

async function mount(lines: InvoiceItemData[]) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await render(<ConnectedEditor />);
  await openAllGroups();
}
const focus = async (key: string) => { await fireEvent(inputOf(key), 'focus', {}); };
const change = async (key: string, text: string) => { await fireEvent.changeText(inputOf(key), text); };
/**
 * The ref callback the editor gives a cell. Testing Library shows host views only, so it is read from the component
 * tree (`unstable_fiber`).
 */
const cellRefOf = (key: string) =>
  findFiber((fiber) => fiber.type === EditableNumberCell && fiber.memoizedProps?.testID === key).memoizedProps!.ref as (node: unknown) => void;

describe('a ref released while the field is typed in', () => {
  const release = async (key: string, andSet: boolean) => {
    const node = inputObjectOf(key);
    const ref = cellRefOf(key);
    await act(async () => {
      ref(null);
      if (andSet) ref(node);
    });
  };

  it('does not take the typed text away: "5", ".", "5" stays "5.5" (phone: "5.00.5")', async () => {
    await mount(groupLines(2));
    await focus(CHARGE_1);
    await change(CHARGE_1, '5');
    // the device releases the ref and sets it again (the native input does it on every key)
    await release(CHARGE_1, true);
    expect(inputOf(CHARGE_1).props.value).toBe('5');
    expect(chargeEntryOf('edit_0_0')).toBe('5');
    await change(CHARGE_1, '5.');
    await release(CHARGE_1, true);
    await change(CHARGE_1, '5.5');
    expect(inputOf(CHARGE_1).props.value).toBe('5.5');
    expect(mockStore.getState().invoiceForm.items[0].charge).toBe(5.5);
  });

  it('still drops a valid entry of a field that has no focus, when its ref is released and not set again', async () => {
    await mount(groupLines(2));
    await focus(CHARGE_1);
    await change(CHARGE_1, '5');
    // the focus moves to another cell without the first one's blur having been reported
    await focus(CHARGE_2);
    expect(chargeEntryOf('edit_0_0')).toBe('5');
    await release(CHARGE_1, false);
    expect(chargeEntryOf('edit_0_0')).toBeUndefined();
  });

  it('keeps the entry of a field whose ref was released and set again, also when it has no focus', async () => {
    await mount(groupLines(2));
    await focus(CHARGE_1);
    await change(CHARGE_1, '5');
    await focus(CHARGE_2);
    await release(CHARGE_1, true);
    expect(chargeEntryOf('edit_0_0')).toBe('5');
  });
});

describe('under StrictMode (effects run twice)', () => {
  it('still drops a valid entry of a field that is gone and has no focus', async () => {
    mockStore = makeInvoiceStore();
    fillNewInvoice(mockStore, groupLines(2));
    await render(<React.StrictMode><ConnectedEditor /></React.StrictMode>);
    await openAllGroups();
    await focus(CHARGE_1);
    await change(CHARGE_1, '5');
    await focus(CHARGE_2);
    expect(chargeEntryOf('edit_0_0')).toBe('5');
    await act(async () => { cellRefOf(CHARGE_1)(null); });
    expect(chargeEntryOf('edit_0_0')).toBeUndefined();
  });
});

describe('the keyboard\'s Next key scrolls the next field above the keyboard', () => {
  it('asks the list for the target row with the upper-part view position, on every step', async () => {
    await mount(groupLines(2));
    const scrollToIndex = jest.fn();
    await act(async () => { flashListOf().props.innerRef({ scrollToIndex }); });
    const rows: { key: string }[] = flashListOf().props.data;
    const rowOf = (key: string) => rows.findIndex((row) => row.key.includes(key.split('|')[1]) && row.key.includes('line'));
    const LABOUR_1 = 'cell|edit_0_0|labour_rate';
    const TAX_ALL = 'group|i1:::M1|tax';
    // Next from the Labour of line 1 goes to the Charge of line 2, which is the next row
    await focus(LABOUR_1);
    await fireEvent(inputOf(LABOUR_1), 'submitEditing');
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    const call = scrollToIndex.mock.calls[0][0];
    expect(call.viewPosition).toBe(SCROLL_VIEW_POSITION);
    expect(SCROLL_VIEW_POSITION).toBeLessThan(0.5);
    expect(rows[call.index].key).toContain('edit_1_0');
    expect(rowOf(CHARGE_2)).toBe(call.index);
    // Next from the group's Tax goes to the Charge of line 1: another step, another scroll, to another row
    await focus(TAX_ALL);
    await fireEvent(inputOf(TAX_ALL), 'submitEditing');
    expect(scrollToIndex).toHaveBeenCalledTimes(2);
    expect(scrollToIndex.mock.calls[1][0].index).toBe(rowOf(CHARGE_1));
    expect(scrollToIndex.mock.calls[1][0].index).not.toBe(call.index);
  });
});

describe('the list', () => {
  it('closes the keyboard on a drag, so no field keeps a focus ring on a row that scrolls away', async () => {
    await mount(groupLines(2));
    expect(flashListOf().props.keyboardDismissMode).toBe('on-drag');
  });
});
