/** The item chooser counts an item's lots in its packaging: boxes for a Box item, bags otherwise. Names are fictional. */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GRNItemBottomSheet } from '../GRNItemBottomSheet';
import type { GRNDetailItem } from '@/types/dispatch.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@gorhom/bottom-sheet', () => {
  const ReactMock = require('react');
  return {
    BottomSheetModal: ReactMock.forwardRef((props: { children?: React.ReactNode }, ref: unknown) => {
      ReactMock.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
      return ReactMock.createElement('BottomSheet', null, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetFlatList: (props: { data: { item_id: string }[]; renderItem: (info: { item: unknown }) => React.ReactNode }) =>
      ReactMock.createElement('List', null, props.data.map((item) => ReactMock.createElement(ReactMock.Fragment, { key: item.item_id }, props.renderItem({ item })))),
  };
});

const lot = (id: string, packaging: string, stock: number): GRNDetailItem =>
  ({ id, item_id: 'sample', item_name: 'Sample Item', quantity: 200, stock, package_mark: '', packaging, rack: 'A1', weight: 30 }) as GRNDetailItem;

it.each([
  ['Box', '105 boxes available'],
  ['Bag', '105 bags available'],
])('says how many %s lots are available in the packaging word', (packaging, expected) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<GRNItemBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} items={[lot('l1', packaging, 100), lot('l2', packaging, 5)]} />);
  });
  const texts = tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
  expect(texts).toContain(expected);
  act(() => tree.unmount());
});

it('counts the stock of an item whose lots differ in packaging as units', () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<GRNItemBottomSheet isVisible onClose={jest.fn()} onSelect={jest.fn()} items={[lot('l1', 'Box', 100), lot('l2', 'Bag', 5)]} />);
  });
  const texts = tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
  expect(texts).toContain('105 units available');
  act(() => tree.unmount());
});
