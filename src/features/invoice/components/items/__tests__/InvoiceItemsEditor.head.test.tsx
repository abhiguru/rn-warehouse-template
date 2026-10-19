/** R3a-5: the group total in the heading is never cut: when it would not fit beside the name it goes under it. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, edgeLines, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, textsOf } from '@/tests/helpers/invoiceItemsHarness';
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

const GROUP = 'kashmiri:::HIGH-1';
async function render(lines: InvoiceItemData[], width: number, fontScale: number) {
  mockWidth = width;
  mockFontScale = fontScale;
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, lines);
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConnectedEditor onEditPricing={jest.fn()} />); });
  return tree;
}
const where = (tree: ReactTestRenderer, kind: 'under' | 'beside') =>
  tree.root.findAll((node) => (node.type as unknown) === 'View' && node.props.testID === `items-head-total-${kind}-${GROUP}`);

describe('the total in the heading of a group', () => {
  it.each([
    [411, 2.0],
    [360, 1.5],
    [320, 1.3],
  ])('with ₹96,934.70 at %i dp and font scale %s goes under the name, in full', async (width, scale) => {
    const tree = await render(edgeLines.nearEdge(), width, scale);
    expect(where(tree, 'under')).toHaveLength(1);
    expect(where(tree, 'beside')).toHaveLength(0);
    const value = where(tree, 'under')[0].findAll((node) => (node.type as unknown) === 'Text' && node.props.children === '₹96,934.70');
    expect(value).toHaveLength(1);
    expect(textsOf(tree)).toContain('₹96,934.70');
  });

  it.each([
    [411, 1.0],
    [393, 1.0],
  ])('stays beside the name at %i dp and font scale %s', async (width, scale) => {
    const tree = await render(edgeLines.nearEdge(), width, scale);
    expect(where(tree, 'beside')).toHaveLength(1);
    expect(where(tree, 'under')).toHaveLength(0);
  });

  it('a small total stays beside the name even at font scale 2.0', async () => {
    const tree = await render([invoiceLine({ item_id: 'kashmiri', package_mark: 'HIGH-1', qty: 1, charge: 1, labour_rate: 0, tax: 0 })], 411, 2.0);
    expect(where(tree, 'beside')).toHaveLength(1);
  });
});
