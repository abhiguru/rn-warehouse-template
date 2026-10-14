/**
 * Weights on the sheets of the dispatch items step (phone review 2026-10-14, UX-06).
 *
 * A lot stores one weight: the weight of one bag, box or crate. Printed as
 * "50 kg" it read like the weight of the line, and the saved-items sheet added
 * a "Weight 250 kg" total on top. The owner's decision: that weight says
 * "each" everywhere, and total weights are not shown. A lot without a weight
 * shows no weight at all (these sheets printed "0 kg").
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import type { DispatchItemData, GRNDetailItem } from '@/types/dispatch.types';
import { LotBottomSheet } from '../LotBottomSheet';
import { ItemsSummaryBottomSheet } from '../ItemsSummaryBottomSheet';
import { AddItemBottomSheet } from '../AddItemBottomSheet';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => ({
  Swipeable: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  return {
    BottomSheetModal: ReactMock.forwardRef((props: { children?: React.ReactNode }, ref: unknown) => {
      ReactMock.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return ReactMock.createElement('BottomSheet', null, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: (props: { children?: React.ReactNode }) => ReactMock.createElement('Scroll', null, props.children),
    BottomSheetFlatList: (props: { data: { id: string }[]; renderItem: (info: { item: unknown }) => React.ReactNode; ListEmptyComponent: () => React.ReactNode }) =>
      ReactMock.createElement(
        'List',
        null,
        props.data.length
          ? props.data.map((item) => ReactMock.createElement(ReactMock.Fragment, { key: item.id }, props.renderItem({ item })))
          : props.ListEmptyComponent()
      ),
  };
});
// The saved-items sheet is the shared sheet with dispatch rows and totals. This
// stand-in draws what the dispatch sheet hands it: each row, and each total badge.
jest.mock('@/components/common/ItemsSummaryBottomSheet', () => {
  const ReactMock = require('react');
  return {
    ItemsSummaryBottomSheet: (props: {
      items: { unique_id: string }[];
      renderItem: (item: unknown, index: number, isEditing: boolean) => React.ReactNode;
      getTotals: (items: unknown[]) => { label: string; value: string }[];
    }) =>
      ReactMock.createElement(
        'Sheet',
        null,
        props.items.map((item, index) => ReactMock.createElement(ReactMock.Fragment, { key: item.unique_id }, props.renderItem(item, index, false))),
        props.getTotals(props.items).map((badge) => ReactMock.createElement('Badge', { key: badge.label, label: badge.label, value: badge.value }))
      ),
  };
});
// The add-item sheet opens these two; they are not under test.
jest.mock('../GRNAutocompleteBottomSheet', () => ({ GRNAutocompleteBottomSheet: () => null }));
jest.mock('../GRNItemBottomSheet', () => ({ GRNItemBottomSheet: () => null }));
jest.mock('../../services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

const texts = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
const mentionsWeight = (tree: ReactTestRenderer) => texts(tree).some((text) => /kg|કિલો|weight|વજન/i.test(text));

const lot = (weight: number | null): GRNDetailItem =>
  ({ id: 'lot-1', item_id: 'potato', item_name: 'Potatoes', quantity: 100, stock: 40, package_mark: 'PM', rack: 'B-14', weight }) as GRNDetailItem;

/** 5 bags of a lot whose bags weigh `weight`: the total the sheet used to show was 250 kg. */
const line = (weight: number | null): DispatchItemData =>
  ({
    unique_id: 'line-1',
    grns_id: 'grn-1',
    grns_gr_no: 'G0311',
    grns_date: '2026-10-01',
    grns_customer_name: 'Example Traders',
    grnItems_id: 'lot-1',
    grnItems_item_id: 'potato',
    grnItems_item_name: 'Potatoes',
    grnItems_quantity: 100,
    grnItems_stock: 40,
    grnItems_package_mark: 'PM',
    grnItems_rack: 'B-14',
    grnItems_weight: weight,
    disp_quantity: 5,
  }) as DispatchItemData;

let tree: ReactTestRenderer;
const render = (element: React.ReactElement) => {
  act(() => { tree = create(element); });
  return tree;
};
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  act(() => tree.unmount());
  setLanguage('en');
  jest.restoreAllMocks();
});

describe('the lot picker', () => {
  const sheet = (weight: number | null) => (
    <LotBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} lots={[lot(weight)]} grnInfo={{ id: 'grn-1', gr_no: 'G0311' }} />
  );

  it('says "Weight" and "50 kg each"', () => {
    render(sheet(50));

    expect(texts(tree)).toEqual(expect.arrayContaining(['Weight', '50 kg each']));
    expect(texts(tree)).not.toContain('50 kg');
  });

  it('says દરેક ૫૦ કિલો in Gujarati', () => {
    setLanguage('gu');
    render(sheet(50));

    expect(texts(tree)).toEqual(expect.arrayContaining(['વજન', 'દરેક ૫૦ કિલો']));
  });

  it.each([[0], [null]])('shows no weight row for a lot without a weight (%s)', (weight) => {
    render(sheet(weight));

    expect(texts(tree)).toContain('40 bags');
    expect(mentionsWeight(tree)).toBe(false);
  });
});

describe('the saved-items sheet', () => {
  const badges = () => tree.root.findAll((node) => (node.type as unknown) === 'Badge').map((node) => `${node.props.label} ${node.props.value}`);
  const sheet = (weight: number | null) => (
    <ItemsSummaryBottomSheet isVisible onClose={jest.fn()} items={[line(weight)]} onDeleteItem={jest.fn()} />
  );

  it('totals the bags and the GRNs, and no weight', () => {
    render(sheet(50));

    expect(badges()).toEqual(['Bags 5', 'GRNs 1']);
    expect(badges().some((badge) => /weight|kg|250/i.test(badge))).toBe(false);
  });

  it('gives the weight of one bag on the item, as "50 kg each"', () => {
    render(sheet(50));

    expect(texts(tree)).toEqual(expect.arrayContaining(['Potatoes', '5 bags', '50 kg each']));
    expect(texts(tree)).not.toContain('50 kg');
    expect(texts(tree)).not.toContain('250 kg');
  });

  it.each([[0], [null]])('shows no weight on an item whose lot has none (%s)', (weight) => {
    render(sheet(weight));

    expect(texts(tree)).toEqual(expect.arrayContaining(['Potatoes', '5 bags', 'PM', 'B-14']));
    expect(mentionsWeight(tree)).toBe(false);
    expect(badges()).toEqual(['Bags 5', 'GRNs 1']);
  });
});

// No screen opens this sheet today; it is kept in step with the items step.
describe('the add-item sheet', () => {
  const chooseLot = (weight: number | null) => {
    render(<AddItemBottomSheet isVisible onClose={jest.fn()} onAddItem={jest.fn()} existingItems={[]} />);
    act(() => tree.root.findByType(LotBottomSheet).props.onSelect(lot(weight)));
  };

  it('says "Weight" and "50 kg each" in the lot details', () => {
    chooseLot(50);

    expect(texts(tree)).toEqual(expect.arrayContaining(['Lot details', 'Weight', '50 kg each']));
    expect(texts(tree)).not.toContain('50 kg');
  });

  it.each([[0], [null]])('shows no weight row for a lot without a weight (%s)', (weight) => {
    chooseLot(weight);

    expect(texts(tree)).toEqual(expect.arrayContaining(['Lot details', '40 bags']));
    expect(mentionsWeight(tree)).toBe(false);
  });
});
