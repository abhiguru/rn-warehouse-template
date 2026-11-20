/**
 * The change history of an order: the weight on a row is the lot's own, the
 * weight of one bag, box or crate. It reads "50 kg each" wherever the server
 * put it (the order line's snapshot, or the GRN line of a dispatch entry), and
 * a lot without a weight shows no weight. Names and numbers are fictional.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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

afterEach(() => {
  setLanguage('en');
});

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };

/** Every host node of the rendered tree (the scale icon is a bare mocked host element with no role or text). */
function allNodes(): Json[] {
  const out: Json[] = [];
  const walk = (node: Json | string | null | (Json | string)[]) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    out.push(node);
    node.children?.forEach(walk);
  };
  walk(screen.toJSON() as unknown as Json | Json[] | null);
  return out;
}

async function show(entries: ChangeLogEntry[]) {
  await render(<ChangeLogBottomSheet isVisible onClose={jest.fn()} customer={null} entries={entries} loading={false} />);
}
/** The weight chips: the scale icons. */
const weightIcons = () => allNodes().filter(node => node.type === 'Icon' && node.props.name === 'scale');
/** Text drawn outside a Text (a `0` left by `weight && …`), which a phone refuses to draw. */
const bareTexts = () => allNodes().filter(node => node.type === 'View').flatMap(node => (node.children ?? []).filter(child => typeof child === 'string'));

describe('change history, the weight of a lot', () => {
  it('an order line (item_details.weight) reads "50 kg each", beside its rack and mark', async () => {
    await show([
      entry('a', { action: 'item_added', item_details: { item_name: 'Fictional Onions', grn_no: 'A0010', rack: 'B-14', package_mark: 'PT', weight: 50 } }),
    ]);
    expect(screen.getByText('B-14')).toBeOnTheScreen();
    expect(screen.getByText('50 kg each')).toBeOnTheScreen();
    expect(screen.getByText('PT')).toBeOnTheScreen();
    expect(screen.queryByText('50 kg')).not.toBeOnTheScreen();
    expect(weightIcons()).toHaveLength(1);
  });

  it('a dispatch entry (grn_details.grn_item_weight) reads "1,250.5 kg each"', async () => {
    await show([
      entry('b', { action: 'quantity_reduced_by_dispatch', grn_details: { grn_no: 'A0010', grn_item_rack: 'B-14', grn_item_weight: 1250.5, grn_item_package_mark: 'PT' } }),
    ]);
    expect(screen.getByText('1,250.5 kg each')).toBeOnTheScreen();
    expect(weightIcons()).toHaveLength(1);
  });

  it('reads "દરેક ૫૦ કિલો" in Gujarati', async () => {
    setLanguage('gu');
    await show([entry('c', { action: 'item_added', item_details: { item_name: 'Fictional Onions', grn_no: 'A0010', weight: 50 } })]);
    expect(screen.getByText('દરેક ૫૦ કિલો')).toBeOnTheScreen();
  });

  it.each([
    ['0', { weight: 0 }],
    ['none', {}],
    ['null', { weight: null }],
    ['0 from the GRN line', { grn_item_weight: 0 }],
  ])('a lot with weight %s shows its rack and mark and no weight', async (_name, weight) => {
    await show([
      entry('d', { action: 'item_added', item_details: { item_name: 'Fictional Onions', grn_no: 'A0010', rack: 'B-14', package_mark: 'PT', ...weight } as never }),
    ]);
    expect(screen.getByText('B-14')).toBeOnTheScreen();
    expect(screen.getByText('PT')).toBeOnTheScreen();
    expect(screen.queryByText(/kg|each/)).not.toBeOnTheScreen();
    expect(weightIcons()).toEqual([]);
    expect(bareTexts()).toEqual([]);
  });

  it('a lot with nothing but a zero weight draws no details row at all', async () => {
    await show([
      entry('e', { action: 'quantity_reduced_by_dispatch', grn_details: { grn_no: 'A0010', grn_item_rack: '', grn_item_weight: 0, grn_item_package_mark: '' } }),
    ]);
    expect(screen.queryByText(/kg|each/)).not.toBeOnTheScreen();
    expect(weightIcons()).toEqual([]);
    expect(bareTexts()).toEqual([]);
  });
});
