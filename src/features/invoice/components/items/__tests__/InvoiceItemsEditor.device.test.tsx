/**
 * What the phone showed in run P2 and Jest did not: a ref released while a field is typed in, the
 * keyboard's Next key leaving the field under the keyboard, the list closing the keyboard on a drag,
 * and a table row that claims no touch (a vertical swipe over it must reach the list).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, inputOf, track, unmountAll } from '@/tests/helpers/invoiceItemsHarness';
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
  return tree;
}
const focus = async (tree: ReactTestRenderer, key: string) => { await act(async () => { inputOf(tree, key).props.onFocus({}); }); };
const change = async (tree: ReactTestRenderer, key: string, text: string) => { await act(async () => { inputOf(tree, key).props.onChangeText(text); }); };
const cellOf = (tree: ReactTestRenderer, key: string) => tree.root.findAllByType(EditableNumberCell).find((node) => node.props.testID === key)!;

describe('a ref released while the field is typed in', () => {
  it('does not take the typed text away: "5", ".", "5" stays "5.5" (phone: "5.00.5")', async () => {
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '5');
    // the device releases the ref (the row is drawn again) after the commit
    await act(async () => { (cellOf(tree, CHARGE_1).props.ref as (node: null) => void)(null); });
    expect(inputOf(tree, CHARGE_1).props.value).toBe('5');
    await change(tree, CHARGE_1, '5.');
    await act(async () => { (cellOf(tree, CHARGE_1).props.ref as (node: null) => void)(null); });
    await change(tree, CHARGE_1, '5.5');
    expect(inputOf(tree, CHARGE_1).props.value).toBe('5.5');
    expect(mockStore.getState().invoiceForm.items[0].charge).toBe(5.5);
  });

  it('still drops a valid entry of a field that has no focus', async () => {
    const tree = await render(groupLines(2));
    await focus(tree, CHARGE_1);
    await change(tree, CHARGE_1, '5');
    await act(async () => { inputOf(tree, CHARGE_1).props.onBlur({}); });
    expect(inputOf(tree, CHARGE_1).props.value).toBe('5.00');
  });
});

describe('the keyboard\'s Next key scrolls the next field above the keyboard', () => {
  it('asks the list for the target row with the upper-part view position, on every step', async () => {
    const tree = await render(groupLines(2));
    const scrollToIndex = jest.fn();
    act(() => { tree.root.findByType('FlashList' as never).props.innerRef({ scrollToIndex }); });
    const rows: { key: string }[] = tree.root.findByType('FlashList' as never).props.data;
    const rowOf = (key: string) => rows.findIndex((row) => row.key.includes(key.split('|')[1]) && row.key.includes('line'));
    await focus(tree, CHARGE_1);
    await act(async () => { inputOf(tree, CHARGE_1).props.onSubmitEditing(); });
    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    const call = scrollToIndex.mock.calls[0][0];
    expect(call.viewPosition).toBe(SCROLL_VIEW_POSITION);
    expect(SCROLL_VIEW_POSITION).toBeLessThan(0.5);
    expect(rows[call.index].key).toContain('edit_1_0');
    expect(rowOf(CHARGE_2)).toBe(call.index);
    await focus(tree, CHARGE_2);
    await act(async () => { inputOf(tree, CHARGE_2).props.onSubmitEditing(); });
    // the next field is the group's "(all lines)" charge: another step, another scroll
    expect(scrollToIndex).toHaveBeenCalledTimes(2);
    expect(scrollToIndex.mock.calls[1][0].index).not.toBe(call.index);
  });
});

describe('the list', () => {
  it('closes the keyboard on a drag, so no field keeps a focus ring on a row that scrolls away', async () => {
    const tree = await render(groupLines(2));
    expect(tree.root.findByType('FlashList' as never).props.keyboardDismissMode).toBe('on-drag');
  });
});

describe('P2-5: a vertical swipe over the table body', () => {
  const claims = (tree: ReactTestRenderer) =>
    tree.root
      .findAll((node) => typeof node.type === 'string')
      .filter((node) => node.props.onMoveShouldSetResponder || node.props.onMoveShouldSetResponderCapture || node.props.onStartShouldSetResponderCapture)
      .map((node) => String(node.props.testID ?? node.type));

  it('is claimed by no row in table mode on move or capture (only the cell\'s own Pressable takes a tap)', async () => {
    const tree = await render(groupLines(2));
    expect(claims(tree)).toEqual([]);
  });

  it('the dev responder log is off by default', async () => {
    const { responderLog, LOG_TABLE_RESPONDERS } = require('../responderLog');
    expect(LOG_TABLE_RESPONDERS).toBe(false);
    expect(responderLog('line')).toEqual({});
  });
});
