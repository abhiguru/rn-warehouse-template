/**
 * What the phone showed in run P2 and Jest did not: a ref released while a field is typed in, the
 * keyboard's Next key leaving the field under the keyboard, the list closing the keyboard on a drag,
 * and a table row that claims no touch (a vertical swipe over it must reach the list).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, chargeEntryOf, inputOf, track, unmountAll, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import { EditableNumberCell } from '@/components/table/EditableNumberCell';
import { SCROLL_VIEW_POSITION } from '../InvoiceItemsEditor';
import type { InvoiceItemData } from '@/types/invoice.types';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: 1 }),
}));

afterEach(() => { act(() => unmountAll()); });

const CHARGE_1 = 'cell|edit_0_0|charge';
const CHARGE_2 = 'cell|edit_1_0|charge';

async function render(lines: InvoiceItemData[]) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = track(create(<ConnectedEditor />)); });
  await openAllGroups(tree);
  return tree;
}
const focus = async (tree: ReactTestRenderer, key: string) => { await act(async () => { inputOf(tree, key).props.onFocus({}); }); };
const change = async (tree: ReactTestRenderer, key: string, text: string) => { await act(async () => { inputOf(tree, key).props.onChangeText(text); }); };
const cellOf = (tree: ReactTestRenderer, key: string) => tree.root.findAllByType(EditableNumberCell).find((node) => node.props.testID === key)!;

describe('a ref released while the field is typed in', () => {
  const release = async (tree: ReactTestRenderer, key: string, andSet: boolean) => {
    const node = inputOf(tree, key).instance;
    const ref = cellOf(tree, key).props.ref as (node: unknown) => void;
    await act(async () => {
      ref(null);
      if (andSet) ref(node);
    });
  };

  it('does not take the typed text away: "5", ".", "5" stays "5.5" (phone: "5.00.5")', async () => {
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '5');
    // the device releases the ref and sets it again (the native input does it on every key)
    await release(tree, CHARGE_1, true);
    expect(inputOf(tree, CHARGE_1).props.value).toBe('5');
    expect(chargeEntryOf(tree, 'edit_0_0')).toBe('5');
    await change(tree, CHARGE_1, '5.');
    await release(tree, CHARGE_1, true);
    await change(tree, CHARGE_1, '5.5');
    expect(inputOf(tree, CHARGE_1).props.value).toBe('5.5');
    expect(mockStore.getState().invoiceForm.items[0].charge).toBe(5.5);
  });

  it('still drops a valid entry of a field that has no focus, when its ref is released and not set again', async () => {
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '5');
    // the focus moves to another cell without the first one's blur having been reported
    await focus(tree, CHARGE_2);
    expect(chargeEntryOf(tree, 'edit_0_0')).toBe('5');
    await release(tree, CHARGE_1, false);
    expect(chargeEntryOf(tree, 'edit_0_0')).toBeUndefined();
  });

  it('keeps the entry of a field whose ref was released and set again, also when it has no focus', async () => {
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '5');
    await focus(tree, CHARGE_2);
    await release(tree, CHARGE_1, true);
    expect(chargeEntryOf(tree, 'edit_0_0')).toBe('5');
  });
});

describe('under StrictMode (effects run twice)', () => {
  it('still drops a valid entry of a field that is gone and has no focus', async () => {
    mockStore = makeInvoiceStore();
    fillNewInvoice(mockStore, groupLines(2));
    let tree!: ReactTestRenderer;
    await act(async () => { tree = track(create(<React.StrictMode><ConnectedEditor /></React.StrictMode>)); });
    await openAllGroups(tree);
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '5');
    await focus(tree, CHARGE_2);
    expect(chargeEntryOf(tree, 'edit_0_0')).toBe('5');
    await act(async () => { (cellOf(tree, CHARGE_1).props.ref as (node: null) => void)(null); });
    expect(chargeEntryOf(tree, 'edit_0_0')).toBeUndefined();
  });
});

describe('the keyboard\'s Next key scrolls the next field above the keyboard', () => {
  it('asks the list for the target row with the upper-part view position, on every step', async () => {
    const tree = await render(groupLines(2));
    const scrollToIndex = jest.fn();
    act(() => { tree.root.findByType('FlashList' as never).props.innerRef({ scrollToIndex }); });
    const rows: { key: string }[] = tree.root.findByType('FlashList' as never).props.data;
    const rowOf = (key: string) => rows.findIndex((row) => row.key.includes(key.split('|')[1]) && row.key.includes('line'));
    const LABOUR_1 = 'cell|edit_0_0|labour_rate';
    const TAX_ALL = 'group|i1:::M1|tax';
    // Next from the Labour of line 1 goes to the Charge of line 2, which is the next row
    await focus(tree, LABOUR_1);
    await act(async () => { inputOf(tree, LABOUR_1).props.onSubmitEditing(); });
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    const call = scrollToIndex.mock.calls[0][0];
    expect(call.viewPosition).toBe(SCROLL_VIEW_POSITION);
    expect(SCROLL_VIEW_POSITION).toBeLessThan(0.5);
    expect(rows[call.index].key).toContain('edit_1_0');
    expect(rowOf(CHARGE_2)).toBe(call.index);
    // Next from the group's Tax goes to the Charge of line 1: another step, another scroll, to another row
    await focus(tree, TAX_ALL);
    await act(async () => { inputOf(tree, TAX_ALL).props.onSubmitEditing(); });
    expect(scrollToIndex).toHaveBeenCalledTimes(2);
    expect(scrollToIndex.mock.calls[1][0].index).toBe(rowOf(CHARGE_1));
    expect(scrollToIndex.mock.calls[1][0].index).not.toBe(call.index);
  });
});

describe('the list', () => {
  it('closes the keyboard on a drag, so no field keeps a focus ring on a row that scrolls away', async () => {
    const tree = await render(groupLines(2));
    expect(tree.root.findByType('FlashList' as never).props.keyboardDismissMode).toBe('on-drag');
  });
});
