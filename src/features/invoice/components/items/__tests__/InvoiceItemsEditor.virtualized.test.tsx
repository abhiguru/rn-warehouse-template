/** The editor is a virtualized list: a group of 125 or 300 lines draws only the rows near the screen. */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, groupLines, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, focusedIds, hasInput, inputOf, textsOf, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import { setFlashListWindow, resetFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import type { InvoiceItemData } from '@/types/invoice.types';
import type { ItemsRow } from '../itemsModel';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: 1 }),
}));
beforeEach(() => resetFlashListWindow());

async function render(lines: InvoiceItemData[]) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConnectedEditor />); });
  await openAllGroups(tree);
  return tree;
}
const rowsOf = (tree: ReactTestRenderer): ItemsRow[] => tree.root.findByType('FlashList' as never).props.data;
const chargeCells = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).filter((node) => /^cell\|.*\|charge$/.test(String(node.props.testID)));

describe.each([[125], [300]])('a group of %d lines', (count) => {
  it('is one row per line plus the head, the shared block, the toggle and the headings, with no "Show more"', async () => {
    const tree = await render(groupLines(count));
    const rows = rowsOf(tree);
    expect(rows.filter((row) => row.type === 'line')).toHaveLength(count);
    expect(rows).toHaveLength(count + 1 + 1 + 1 + 1);
    expect(textsOf(tree)).not.toContain('Show more');
  });

  it('draws only the rows of the window', async () => {
    const tree = await render(groupLines(count));
    await act(async () => { setFlashListWindow(10, 18); });
    expect(chargeCells(tree).length).toBeLessThanOrEqual(8);
    expect(hasInput(tree, 'cell|' + `edit_${count - 1}_0` + '|charge')).toBe(false);
    expect(hasInput(tree, 'cell|edit_9_0|charge')).toBe(true); // the line at row 10 (the head, the shared block, the toggle and the headings come first)
    expect(textsOf(tree)).not.toContain('Show more');
  });
});

describe('Next', () => {
  it('scrolls to a cell the list has not drawn and focuses it as it mounts', async () => {
    const tree = await render(groupLines(300));
    await act(async () => { setFlashListWindow(0, 8); });
    // The last drawn line is the row at index 7: edit_3_0 (the head, the shared block, the toggle and the headings come first).
    expect(hasInput(tree, 'cell|edit_3_0|charge')).toBe(true);
    expect(hasInput(tree, 'cell|edit_4_0|charge')).toBe(false);

    // Next walks a line's Charge, then its Labour, then the next line's Charge.
    const labour = 'cell|edit_3_0|labour_rate';
    (inputOf(tree, labour).instance.focus as jest.Mock).mockClear();
    await act(async () => { inputOf(tree, labour).props.onSubmitEditing(); });

    // The list moved to the next cell's row and that cell, and no other, took the focus.
    expect(hasInput(tree, 'cell|edit_4_0|charge')).toBe(true);
    expect(focusedIds(tree)).toEqual(['cell|edit_4_0|charge']);
  });

  it('goes from the last shared field (Tax) to the first line, which the list has not drawn', async () => {
    const tree = await render(groupLines(300));
    // Only the head, the shared block and the toggle are drawn; the first line is the row at index 4.
    await act(async () => { setFlashListWindow(0, 3); });
    expect(hasInput(tree, 'group|i1:::M1|tax')).toBe(true);
    expect(hasInput(tree, 'cell|edit_0_0|charge')).toBe(false);
    (inputOf(tree, 'group|i1:::M1|tax').instance.focus as jest.Mock).mockClear();
    await act(async () => { inputOf(tree, 'group|i1:::M1|tax').props.onSubmitEditing(); });
    expect(hasInput(tree, 'cell|edit_0_0|charge')).toBe(true);
    expect(focusedIds(tree)).toEqual(['cell|edit_0_0|charge']);
  });
});

describe('the edge-case GRNs', () => {
  it('WMIV0101: 128 lines in two groups, 125 and 3', async () => {
    const tree = await render(edgeLines.bulk125());
    const rows = rowsOf(tree);
    expect(rows.filter((row) => row.type === 'line')).toHaveLength(128);
    expect(rows.filter((row) => row.type === 'head')).toHaveLength(2);
    expect(rows.filter((row) => row.groupKey === 'rai:::BULK-125' && row.type === 'line')).toHaveLength(125);
    expect(textsOf(tree)).toContain('BULK-125');
  });

  it('WMIV0102: 12 groups, and two lots of one item and mark are one group', async () => {
    const tree = await render(edgeLines.manyGroups());
    const rows = rowsOf(tree);
    expect(rows.filter((row) => row.type === 'head')).toHaveLength(12);
    expect(rows.filter((row) => row.groupKey === 'rai:::SAME-MARK' && row.type === 'line').length).toBeGreaterThanOrEqual(4);
  });
});
