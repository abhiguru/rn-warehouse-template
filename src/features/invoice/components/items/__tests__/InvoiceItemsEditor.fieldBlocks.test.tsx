/**
 * WH-228: Invoice step 2. On the line table the block the wizard bar keeps above itself is the whole row with its
 * error line (the row's own View is marked, the cell is not); the shared fields of a group are the shared Input,
 * whose container is marked. Harness as in InvoiceItemsEditor.editing.test.tsx.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { makeInvoiceStore, fillNewInvoice, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, inputOf, track, unmountAll, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import { blockOf, inputsIn, wordsIn } from '@/tests/helpers/fieldBlock';

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
const LABOUR_1 = 'cell|edit_0_0|labour_rate';
const CHARGE_2 = 'cell|edit_1_0|charge';
const TAX_ALL = 'group|i1:::M1|tax';

let tree: ReactTestRenderer;
beforeEach(async () => {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, groupLines(2));
  await act(async () => { tree = track(create(<ConnectedEditor />)); });
  await openAllGroups(tree);
});
afterEach(() => { act(() => unmountAll()); });

const rowViews = (block: NonNullable<ReturnType<typeof blockOf>>) =>
  block.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('line-'));

describe('Invoice step 2 field blocks', () => {
  it('a Charge cell: the block is the row (it holds the row\'s cells), not the cell', () => {
    const block = blockOf(inputOf(tree, CHARGE_1));
    expect(block).not.toBeNull();
    expect(rowViews(block!).length).toBeGreaterThan(0);
    expect(inputsIn(block!)).toBe(2); // Charge and Labour of this one row
  });

  it('Charge and Labour of one row share the row block; the next row has its own', () => {
    expect(blockOf(inputOf(tree, LABOUR_1))).toBe(blockOf(inputOf(tree, CHARGE_1)));
    expect(blockOf(inputOf(tree, CHARGE_2))).not.toBe(blockOf(inputOf(tree, CHARGE_1)));
  });

  it('the row error line is inside the row block', async () => {
    await act(async () => { inputOf(tree, CHARGE_1).props.onFocus({}); });
    await act(async () => { inputOf(tree, CHARGE_1).props.onChangeText('1000000'); });
    await act(async () => { inputOf(tree, CHARGE_1).props.onBlur({}); });
    const block = blockOf(inputOf(tree, CHARGE_1))!;
    expect(wordsIn(block)).toContain('Enter a charge from 0 to 9999.99.');
  });

  it('a shared field of the group (Tax, all lines): the block is the shared Input container, one field', () => {
    const block = blockOf(inputOf(tree, TAX_ALL));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    expect(rowViews(block!)).toHaveLength(0);
  });
});
