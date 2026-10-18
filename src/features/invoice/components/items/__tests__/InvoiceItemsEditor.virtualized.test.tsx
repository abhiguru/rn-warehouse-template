/** The editor is a virtualized list: a group of 125 or 300 lines draws only the rows near the screen. */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, groupLines, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, focusedIds, hasInput, inputOf, textsOf } from '@/tests/helpers/invoiceItemsHarness';
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
  return tree;
}
const rowsOf = (tree: ReactTestRenderer): ItemsRow[] => tree.root.findByType('FlashList' as never).props.data;
const chargeCells = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).filter((node) => /^cell\|.*\|charge$/.test(String(node.props.testID)));

describe.each([[125], [300]])('a group of %d lines', (count) => {
  it('is one row per line plus the head, the headings, the shared rows and the total, with no "Show more"', async () => {
    const tree = await render(groupLines(count));
    const rows = rowsOf(tree);
    expect(rows.filter((row) => row.type === 'line')).toHaveLength(count);
    expect(rows).toHaveLength(count + 1 + 1 + 3 + 1);
    expect(textsOf(tree)).not.toContain('Show more');
  });

  it('draws only the rows of the window', async () => {
    const tree = await render(groupLines(count));
    await act(async () => { setFlashListWindow(10, 18); });
    expect(chargeCells(tree).length).toBeLessThanOrEqual(8);
    expect(hasInput(tree, 'cell|' + `edit_${count - 1}_0` + '|charge')).toBe(false);
    expect(hasInput(tree, 'cell|edit_9_0|charge')).toBe(true); // the line at row 10 (head and headings come first)
    expect(textsOf(tree)).not.toContain('Show more');
  });
});

describe('Next', () => {
  it('scrolls to a cell the list has not drawn and focuses it as it mounts', async () => {
    const tree = await render(groupLines(300));
    await act(async () => { setFlashListWindow(0, 6); });
    // The last drawn line is the row at index 5: edit_3_0 (head and headings come first).
    expect(hasInput(tree, 'cell|edit_3_0|charge')).toBe(true);
    expect(hasInput(tree, 'cell|edit_4_0|charge')).toBe(false);

    (inputOf(tree, 'cell|edit_3_0|charge').instance.focus as jest.Mock).mockClear();
    await act(async () => { inputOf(tree, 'cell|edit_3_0|charge').props.onSubmitEditing(); });

    // The list moved to the next cell's row and that cell, and no other, took the focus.
    expect(hasInput(tree, 'cell|edit_4_0|charge')).toBe(true);
    expect(focusedIds(tree)).toEqual(['cell|edit_4_0|charge']);
  });

  it('reaches a shared field far below the lines', async () => {
    const tree = await render(groupLines(300));
    // The last four lines are drawn; the "(all lines)" rows and the total, below them, are not.
    await act(async () => { setFlashListWindow(rowsOf(tree).length - 10, rowsOf(tree).length - 4); });
    expect(hasInput(tree, 'cell|edit_299_0|charge')).toBe(true);
    expect(hasInput(tree, 'group|i1:::M1|charge')).toBe(false);
    (inputOf(tree, 'cell|edit_299_0|charge').instance.focus as jest.Mock).mockClear();
    await act(async () => { inputOf(tree, 'cell|edit_299_0|charge').props.onSubmitEditing(); });
    expect(hasInput(tree, 'group|i1:::M1|charge')).toBe(true);
    expect(focusedIds(tree)).toEqual(['group|i1:::M1|charge']);
  });
});

describe('the edge-case GRNs', () => {
  it('WMIV0101: 128 lines in two groups, 125 and 3', async () => {
    const tree = await render(edgeLines.bulk125());
    const rows = rowsOf(tree);
    expect(rows.filter((row) => row.type === 'line')).toHaveLength(128);
    expect(rows.filter((row) => row.type === 'head')).toHaveLength(2);
    expect(textsOf(tree)).toContain('Group total · 125 dispatches');
    expect(textsOf(tree)).toContain('Group total · 3 dispatches');
  });

  it('WMIV0102: 12 groups, and two lots of one item and mark are one group', async () => {
    const tree = await render(edgeLines.manyGroups());
    const rows = rowsOf(tree);
    expect(rows.filter((row) => row.type === 'head')).toHaveLength(12);
    expect(rows.filter((row) => row.groupKey === 'rai:::SAME-MARK' && row.type === 'line').length).toBeGreaterThanOrEqual(4);
  });
});
