/** R3a-5: the group total in the heading is never cut: when it would not fit beside the name it goes under it. */
import React from 'react';
import { render as renderScreen, screen, within } from '@testing-library/react-native';
import { makeInvoiceStore, fillNewInvoice, edgeLines, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor } from '@/tests/helpers/invoiceItemsHarness';
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

const GROUP = 'kashmiri:::HIGH-1';
async function renderEditor(lines: InvoiceItemData[], width: number, fontScale: number) {
  mockWidth = width;
  mockFontScale = fontScale;
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  await renderScreen(<ConnectedEditor />);
}
const under = () => screen.queryByTestId(`items-head-total-under-${GROUP}`);
const beside = () => screen.queryByTestId(`items-head-total-beside-${GROUP}`);

describe('the total in the heading of a group', () => {
  it.each([
    [411, 2.0],
    [360, 1.5],
    [320, 1.3],
  ])('with ₹96,934.70 at %i dp and font scale %s goes under the name, in full', async (width, scale) => {
    await renderEditor(edgeLines.nearEdge(), width, scale);
    expect(under()).toBeOnTheScreen();
    expect(beside()).not.toBeOnTheScreen();
    expect(within(under()!).getByText('₹96,934.70')).toBeOnTheScreen();
    expect(screen.getAllByText('₹96,934.70')[0]).toBeOnTheScreen();
  });

  it.each([
    [411, 1.0],
    [393, 1.0],
  ])('stays beside the name at %i dp and font scale %s', async (width, scale) => {
    await renderEditor(edgeLines.nearEdge(), width, scale);
    expect(beside()).toBeOnTheScreen();
    expect(under()).not.toBeOnTheScreen();
  });

  it('a small total stays beside the name even at font scale 2.0', async () => {
    await renderEditor([invoiceLine({ item_id: 'kashmiri', package_mark: 'HIGH-1', qty: 1, charge: 1, labour_rate: 0, tax: 0 })], 411, 2.0);
    expect(beside()).toBeOnTheScreen();
  });
});
