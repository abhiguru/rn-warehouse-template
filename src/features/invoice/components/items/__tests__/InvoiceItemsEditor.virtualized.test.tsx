/** The editor is a virtualized list: a group of 125 or 300 lines draws only the rows near the screen. */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { makeInvoiceStore, fillNewInvoice, groupLines, edgeLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, clearFocused, flashListOf, focusedIds, hasInput, hasInputMounted, inputOf, textsOf, openAllGroups, HIDDEN } from '@/tests/helpers/invoiceItemsHarness';
import { setFlashListWindow, resetFlashListWindow } from '@/tests/helpers/windowedFlashListMock';
import type { InvoiceItemData } from '@/types/invoice.types';
import type { ItemsRow } from '../itemsModel';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: 1 }),
}));
beforeEach(() => resetFlashListWindow());

async function mount(lines: InvoiceItemData[]) {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await render(<ConnectedEditor />);
  await openAllGroups();
}
const rowsOf = (): ItemsRow[] => flashListOf().props.data;
const chargeCells = () =>
  screen.queryAllByTestId(/^cell\|.*\|charge$/, HIDDEN);

// Rendering 300 lines takes about 3 s on a lightly loaded machine; parallel workers (npm test) make it slower.
jest.setTimeout(20000);

describe.each([[125], [300]])('a group of %d lines', (count) => {
  it('is one row per line plus the head, the shared block, the toggle and the headings, with no "Show more"', async () => {
    await mount(groupLines(count));
    const rows = rowsOf();
    expect(rows.filter((row) => row.type === 'line')).toHaveLength(count);
    expect(rows).toHaveLength(count + 1 + 1 + 1 + 1);
    expect(textsOf()).not.toContain('Show more');
  });

  it('draws only the rows of the window', async () => {
    await mount(groupLines(count));
    await act(async () => { setFlashListWindow(10, 18); });
    expect(chargeCells().length).toBeLessThanOrEqual(8);
    expect(hasInputMounted('cell|' + `edit_${count - 1}_0` + '|charge')).toBe(false);
    expect(hasInput('cell|edit_9_0|charge')).toBe(true); // the line at row 10 (the head, the shared block, the toggle and the headings come first)
    expect(textsOf()).not.toContain('Show more');
  });
});

describe('Next', () => {
  it('scrolls to a cell the list has not drawn and focuses it as it mounts', async () => {
    await mount(groupLines(300));
    await act(async () => { setFlashListWindow(0, 8); });
    // The last drawn line is the row at index 7: edit_3_0 (the head, the shared block, the toggle and the headings come first).
    expect(hasInput('cell|edit_3_0|charge')).toBe(true);
    expect(hasInputMounted('cell|edit_4_0|charge')).toBe(false);

    // Next walks a line's Charge, then its Labour, then the next line's Charge.
    const labour = 'cell|edit_3_0|labour_rate';
    clearFocused();
    await fireEvent(inputOf(labour), 'submitEditing');

    // The list moved to the next cell's row and that cell, and no other, took the focus.
    expect(hasInput('cell|edit_4_0|charge')).toBe(true);
    expect(focusedIds()).toEqual(['cell|edit_4_0|charge']);
  });

  it('goes from the last shared field (Tax) to the first line, which the list has not drawn', async () => {
    await mount(groupLines(300));
    // Only the head, the shared block and the toggle are drawn; the first line is the row at index 4.
    await act(async () => { setFlashListWindow(0, 3); });
    expect(hasInput('group|i1:::M1|tax')).toBe(true);
    expect(hasInputMounted('cell|edit_0_0|charge')).toBe(false);
    clearFocused();
    await fireEvent(inputOf('group|i1:::M1|tax'), 'submitEditing');
    expect(hasInput('cell|edit_0_0|charge')).toBe(true);
    expect(focusedIds()).toEqual(['cell|edit_0_0|charge']);
  });
});

describe('the edge-case GRNs', () => {
  it('WMIV0101: 128 lines in two groups, 125 and 3', async () => {
    await mount(edgeLines.bulk125());
    const rows = rowsOf();
    expect(rows.filter((row) => row.type === 'line')).toHaveLength(128);
    expect(rows.filter((row) => row.type === 'head')).toHaveLength(2);
    expect(rows.filter((row) => row.groupKey === 'rai:::BULK-125' && row.type === 'line')).toHaveLength(125);
    expect(textsOf()).toContain('BULK-125');
  });

  it('WMIV0102: 12 groups, and two lots of one item and mark are one group', async () => {
    await mount(edgeLines.manyGroups());
    const rows = rowsOf();
    expect(rows.filter((row) => row.type === 'head')).toHaveLength(12);
    expect(rows.filter((row) => row.groupKey === 'rai:::SAME-MARK' && row.type === 'line').length).toBeGreaterThanOrEqual(4);
  });
});
