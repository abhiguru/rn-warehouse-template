import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ITEM_PICKER_SNAP_POINTS, ItemPickerSheet } from '../components/ItemPickerSheet';

let sheetProps: Record<string, any> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const ITEMS = [
  { id: 'i1', name: 'Review Garlic Desi', packaging: 'Bag' },
  { id: 'i2', name: 'Review Ginger Fresh', packaging: null },
  { id: 'i3', name: 'Review Garlic Pole', packaging: null },
];
const mount = (items = ITEMS, onSelect = jest.fn(), emptyText?: string) => {
  act(() => { create(<ItemPickerSheet visible onClose={jest.fn()} onSelect={onSelect} items={items} title="Choose an item" emptyText={emptyText} />); });
  return onSelect;
};

describe('ItemPickerSheet', () => {
  it('searches from zero letters at the tall height of the customer sheet', () => {
    mount();
    expect(sheetProps.minQueryLength).toBe(0);
    expect(sheetProps.snapPoints).toBe(ITEM_PICKER_SNAP_POINTS);
    expect(ITEM_PICKER_SNAP_POINTS[0]).toBe('90%');
    expect(sheetProps.title).toBe('Choose an item');
  });

  it('lists every item with no search, and filters by every word typed', async () => {
    mount();
    let all: { id: string }[] = [];
    let garlic: { id: string }[] = [];
    let none: { id: string }[] = [];
    await act(async () => {
      all = await sheetProps.searchFn('');
      garlic = await sheetProps.searchFn('GARLIC');
      none = await sheetProps.searchFn('garlic fresh');
    });
    expect(all.map(i => i.id)).toEqual(['i1', 'i2', 'i3']);
    expect(garlic.map(i => i.id)).toEqual(['i1', 'i3']);
    expect(none).toEqual([]);
    expect(sheetProps.emptySearchText).toBe('No items match "garlic fresh".');
  });

  it('shows the name, and the packaging under it when there is one', () => {
    mount();
    const rows = ITEMS.map(item => {
      let r!: ReturnType<typeof create>;
      act(() => { r = create(sheetProps.renderItem(item, jest.fn())); });
      return r.root.findAllByType(Text).map(n => String(n.props.children));
    });
    expect(rows).toEqual([['Review Garlic Desi', 'Bag'], ['Review Ginger Fresh'], ['Review Garlic Pole']]);
  });

  it('hands the chosen item to the caller', () => {
    const onSelect = mount();
    sheetProps.onSelect(ITEMS[1]);
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
  });

  it('says why when there is nothing to choose from', () => {
    mount([], jest.fn(), 'No other item has a rate in force today to copy.');
    expect(sheetProps.emptySearchText).toBe('No other item has a rate in force today to copy.');
    expect(sheetProps.emptyInitialText).toBe('No other item has a rate in force today to copy.');
  });
});
