/** R3a-8: a key press draws again only what it changed: its own line and group, not every mounted row. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { formatDate, formatWeightEach } from '@/utils/formatters';
import { makeInvoiceStore, fillNewInvoice, invoiceLine, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, inputOf } from '@/tests/helpers/invoiceItemsHarness';
import { groupCellLabel } from '../itemsModel';
import { updateEditedItem } from '@/store/slices/invoiceFormSlice';
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
jest.mock('../itemsModel', () => {
  const actual = jest.requireActual('../itemsModel');
  return { ...actual, groupCellLabel: jest.fn(actual.groupCellLabel) };
});
jest.mock('@/utils/formatters', () => {
  const actual = jest.requireActual('@/utils/formatters');
  return { ...actual, formatWeightEach: jest.fn(actual.formatWeightEach), formatDate: jest.fn(actual.formatDate) };
});

/** Five groups of three lines; the lots of group g weigh 10 * (g + 1) kg, so a head tells its group. */
const fixture = (): InvoiceItemData[] =>
  Array.from({ length: 5 }, (_, g) =>
    Array.from({ length: 3 }, (_, i) =>
      invoiceLine({ item_id: `it${g}`, item_name: `Example Item ${g}`, package_mark: `P${g}`, weight: 10 * (g + 1), dispatch_date: `2026-10-0${g + 1}` }, g * 3 + i)
    )
  ).flat();
async function render() {
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, fixture());
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ConnectedEditor />); });
  return tree;
}
const headsDrawn = () => new Set(jest.mocked(formatWeightEach).mock.calls.map(([weight]) => weight));
const datesDrawn = () => jest.mocked(formatDate).mock.calls.map(([date]) => date);

describe('typing in one group', () => {
  it('a line charge draws that group\'s head and its own line again, not the other groups or lines', async () => {
    const tree = await render();
    const key = 'cell|edit_7_0|charge'; // group 2, the second line
    await act(async () => { inputOf(tree, key).props.onFocus({}); });
    jest.mocked(formatWeightEach).mockClear();
    jest.mocked(formatDate).mockClear();

    await act(async () => { inputOf(tree, key).props.onChangeText('8'); });

    expect(headsDrawn()).toEqual(new Set([30]));
    // group 2's lines are dated 2026-10-03: only the typed line is drawn again, the others are not
    expect(new Set(datesDrawn().map(String))).toEqual(new Set(['2026-10-03']));
    expect(datesDrawn().length).toBeLessThanOrEqual(1);
  });

  it('a change that comes while no field has the focus (the layout is looked at again) draws the same: its line alone', async () => {
    await render();
    jest.mocked(formatWeightEach).mockClear();
    jest.mocked(formatDate).mockClear();
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'edit_7_0', values: { charge: 8 } })); });
    expect(headsDrawn()).toEqual(new Set([30]));
    expect(new Set(datesDrawn().map(String))).toEqual(new Set(['2026-10-03']));
    expect(datesDrawn().length).toBeLessThanOrEqual(1);
  });

  it('the "(all lines)" rows of the other groups, and of the same group whose figure did not change, are not drawn again', async () => {
    const tree = await render();
    const key = 'cell|edit_7_0|charge';
    await act(async () => { inputOf(tree, key).props.onFocus({}); });
    jest.mocked(groupCellLabel).mockClear();
    // the typed charge makes group 2's charge "Mixed" with a note; its labour and tax stay as they were
    await act(async () => { inputOf(tree, key).props.onChangeText('8'); });
    expect(jest.mocked(groupCellLabel).mock.calls.map(([field, item]) => `${item}:${field}`)).toEqual(['Example Item 2:charge']);
  });

  it('a group rate draws that group alone again', async () => {
    const tree = await render();
    const key = 'group|it4:::P4|charge';
    await act(async () => { inputOf(tree, key).props.onFocus({}); });
    jest.mocked(formatWeightEach).mockClear();
    jest.mocked(formatDate).mockClear();

    await act(async () => { inputOf(tree, key).props.onChangeText('6'); });

    expect(headsDrawn()).toEqual(new Set([50]));
    expect(new Set(datesDrawn().map(String))).toEqual(new Set(['2026-10-05']));
  });

  it('leaving a field with an error draws only that field\'s line', async () => {
    const tree = await render();
    const key = 'cell|edit_0_0|charge';
    await act(async () => { inputOf(tree, key).props.onFocus({}); });
    await act(async () => { inputOf(tree, key).props.onChangeText('1000000'); });
    jest.mocked(formatWeightEach).mockClear();
    jest.mocked(formatDate).mockClear();
    await act(async () => { inputOf(tree, key).props.onBlur({}); });
    expect(headsDrawn().size).toBe(0);
    expect(datesDrawn().length).toBeLessThanOrEqual(1);
  });
});
