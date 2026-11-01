/**
 * The change history's titles are built in the app from the entry's action code (not from the server's English),
 * and the sheet names the order by its number. Names and numbers are fictional.
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

const entry = (id: string, details: Record<string, unknown>, itemName = 'Quantity changed: Fictional Onions'): ChangeLogEntry =>
  ({
    change_id: id,
    change_type: 'quantity_changed',
    item_name: itemName,
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

function render(entries: ChangeLogEntry[], orderNumber?: string) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ChangeLogBottomSheet isVisible onClose={jest.fn()} customer={null} entries={entries} loading={false} orderNumber={orderNumber} />);
  });
  mounted.push(tree);
  return tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().filter(child => typeof child === 'string' || typeof child === 'number').join(''));
}

const grn = { grn_item_name: 'Fictional Onions' };
const qty = (change_type: string, previous_quantity: number, new_quantity: number) => ({ change_type, previous_quantity, new_quantity, change_amount: new_quantity - previous_quantity });

describe('titles from the action code', () => {
  it('says added and removed for a line that appeared or went', () => {
    const texts = render([
      entry('a', { action: 'quantity_changed', grn_details: grn, quantity_change: qty('added', 0, 10) }),
      entry('b', { action: 'quantity_changed', grn_details: grn, quantity_change: qty('removed', 10, 0) }),
      entry('c', { action: 'quantity_changed', grn_details: grn, quantity_change: qty('decreased', 10, 6) }),
    ]);
    expect(texts).toEqual(expect.arrayContaining(['Added: Fictional Onions', 'Removed: Fictional Onions', 'Item quantity updated: Fictional Onions']));
    expect(texts.join('|')).not.toContain('Quantity changed:');
  });

  it('names the dispatch and the bags it took, or gave back when it was deleted', () => {
    const texts = render([
      entry('d', { action: 'quantity_reduced_by_dispatch', grn_details: grn, dispatch_no: 'D0007', dispatch_impact: { dispatched_quantity: 5 }, quantity_change: qty('decreased', 20, 15) }, 'Dispatch reduced quantity: Fictional Onions'),
      entry('e', { action: 'quantity_reduced_by_dispatch', grn_details: grn, dispatch_no: 'D0007', quantity_change: qty('increased', 15, 20) }, 'Dispatch reduced quantity: Fictional Onions'),
    ]);
    expect(texts).toEqual(expect.arrayContaining([
      'Dispatch D0007 took 5 bags from Fictional Onions',
      'Dispatch D0007 deleted: 5 bags given back to Fictional Onions',
    ]));
    expect(texts.join('|')).not.toContain('Dispatch reduced quantity');
  });

  it('writes the bags in Gujarati digits and keeps the dispatch number as typed', () => {
    setLanguage('gu');
    const texts = render([
      entry('d', { action: 'quantity_reduced_by_dispatch', grn_details: grn, dispatch_no: 'D0007', dispatch_impact: { dispatched_quantity: 5 }, quantity_change: qty('decreased', 20, 15) }),
    ]);
    const title = texts.find(text => text.includes('D0007'))!;
    expect(title).toContain('૫');
    expect(title).toContain('Fictional Onions');
  });
});

describe('the order number', () => {
  it('is shown under the business name when the order has one, and not otherwise', () => {
    expect(render([], 'ORD-0042')).toContain('Order ORD-0042');
    expect(render([]).join('|')).not.toContain('Order ORD');
  });
});
