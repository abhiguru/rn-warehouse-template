/**
 * The change history of an order: the weight on a row is the lot's own, the
 * weight of one bag, box or crate. It reads "50 kg each" wherever the server
 * put it (the order line's snapshot, or the GRN line of a dispatch entry), and
 * a lot without a weight shows no weight. Names and numbers are fictional.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ChangeLogBottomSheet from '../ChangeLogBottomSheet';
import { setLanguage } from '@/i18n';
import type { ChangeLogEntry } from '@/types/order.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// The sheet as a plain box that draws every row, so a row's texts can be read.
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  return {
    __esModule: true,
    BottomSheetModal: ReactMock.forwardRef((props: { children?: React.ReactNode }, ref: unknown) => {
      ReactMock.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return ReactMock.createElement('BottomSheetModal', null, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetFlatList: (props: { data: unknown[]; renderItem: (info: { item: unknown; index: number }) => React.ReactNode }) =>
      ReactMock.createElement(
        'FlatList',
        null,
        props.data.map((item, index) => ReactMock.createElement(ReactMock.Fragment, { key: index }, props.renderItem({ item, index })))
      ),
  };
});

const entry = (id: string, details: ChangeLogEntry['change_details']): ChangeLogEntry =>
  ({
    change_id: id,
    change_type: 'item_updated',
    item_name: 'Fictional Onions',
    change_details: details,
    change_timestamp: '',
    changed_by_name: 'Asha Example',
    relative_time: '2 hours ago',
  }) as unknown as ChangeLogEntry;

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  setLanguage('en');
});

function render(entries: ChangeLogEntry[]) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ChangeLogBottomSheet isVisible onClose={jest.fn()} customer={null} entries={entries} loading={false} />);
  });
  mounted.push(tree);
  const texts = () =>
    tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().filter(child => typeof child === 'string' || typeof child === 'number').join(''));
  return {
    texts,
    /** The weight chips: the texts beside a scale icon. */
    weightIcons: () => tree.root.findAll(node => (node.type as unknown) === 'Icon' && node.props.name === 'scale'),
    /** Text drawn outside a Text (a `0` left by `weight && …`), which a phone refuses to draw. */
    bareTexts: () =>
      tree.root.findAll(node => (node.type as unknown) === 'View').flatMap(node => node.children.filter(child => typeof child === 'string')),
  };
}

describe('change history, the weight of a lot', () => {
  it('an order line (item_details.weight) reads "50 kg each", beside its rack and mark', () => {
    const { texts, weightIcons } = render([
      entry('a', { action: 'item_added', item_details: { item_name: 'Fictional Onions', grn_no: 'A0010', rack: 'B-14', package_mark: 'PT', weight: 50 } }),
    ]);
    expect(texts()).toEqual(expect.arrayContaining(['B-14', '50 kg each', 'PT']));
    expect(texts()).not.toContain('50 kg');
    expect(weightIcons()).toHaveLength(1);
  });

  it('a dispatch entry (grn_details.grn_item_weight) reads "1,250.5 kg each"', () => {
    const { texts, weightIcons } = render([
      entry('b', { action: 'quantity_reduced_by_dispatch', grn_details: { grn_no: 'A0010', grn_item_rack: 'B-14', grn_item_weight: 1250.5, grn_item_package_mark: 'PT' } }),
    ]);
    expect(texts()).toContain('1,250.5 kg each');
    expect(weightIcons()).toHaveLength(1);
  });

  it('reads "દરેક ૫૦ કિલો" in Gujarati', () => {
    setLanguage('gu');
    const { texts } = render([entry('c', { action: 'item_added', item_details: { item_name: 'Fictional Onions', grn_no: 'A0010', weight: 50 } })]);
    expect(texts()).toContain('દરેક ૫૦ કિલો');
  });

  it.each([
    ['0', { weight: 0 }],
    ['none', {}],
    ['null', { weight: null }],
    ['0 from the GRN line', { grn_item_weight: 0 }],
  ])('a lot with weight %s shows its rack and mark and no weight', (_name, weight) => {
    const { texts, weightIcons, bareTexts } = render([
      entry('d', { action: 'item_added', item_details: { item_name: 'Fictional Onions', grn_no: 'A0010', rack: 'B-14', package_mark: 'PT', ...weight } as never }),
    ]);
    expect(texts()).toEqual(expect.arrayContaining(['B-14', 'PT']));
    expect(texts().filter(text => /kg|each/.test(text))).toEqual([]);
    expect(weightIcons()).toEqual([]);
    expect(bareTexts()).toEqual([]);
  });

  it('a lot with nothing but a zero weight draws no details row at all', () => {
    const { texts, weightIcons, bareTexts } = render([
      entry('e', { action: 'quantity_reduced_by_dispatch', grn_details: { grn_no: 'A0010', grn_item_rack: '', grn_item_weight: 0, grn_item_package_mark: '' } }),
    ]);
    expect(texts().filter(text => /kg|each/.test(text))).toEqual([]);
    expect(weightIcons()).toEqual([]);
    expect(bareTexts()).toEqual([]);
  });
});
