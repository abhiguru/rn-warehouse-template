import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { ITEM_PICKER_SNAP_POINTS, ItemPickerSheet } from '../components/ItemPickerSheet';

// The sheet is drawn by a stand-in that does what the real one does with these props: it shows the title, asks searchFn
// for the rows (from zero letters), draws each through renderItem, and says emptySearchText / emptyInitialText when there
// are none. The two props nothing can show (the height and the letters needed) are read from the last render.
let sheetProps: Record<string, any> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => {
  const mockReact = jest.requireActual('react');
  const rn = jest.requireActual('react-native');
  return {
    SearchableBottomSheet: (props: Record<string, any>) => {
      sheetProps = props;
      const [query, setQuery] = mockReact.useState('');
      const [rows, setRows] = mockReact.useState(null as null | Record<string, any>[]);
      mockReact.useEffect(() => {
        let live = true;
        props.searchFn(query).then((found: Record<string, any>[]) => { if (live) setRows(found); });
        return () => { live = false; };
      }, [query, props.searchFn]);
      return (
        <rn.View>
          <rn.Text>{props.title}</rn.Text>
          <rn.TextInput accessibilityLabel="Search" value={query} onChangeText={setQuery} />
          {rows?.map((item: Record<string, any>) => <rn.View key={item.id}>{props.renderItem(item, props.onSelect)}</rn.View>)}
          {rows && rows.length === 0 ? <rn.Text>{query === '' ? props.emptyInitialText : props.emptySearchText}</rn.Text> : null}
        </rn.View>
      );
    },
  };
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const ITEMS = [
  { id: 'i1', name: 'Review Garlic Desi', packaging: 'Bag' },
  { id: 'i2', name: 'Review Ginger Fresh', packaging: null },
  { id: 'i3', name: 'Review Garlic Pole', packaging: null },
];
async function mount(items = ITEMS, onSelect = jest.fn(), emptyText?: string) {
  await render(<ItemPickerSheet visible onClose={jest.fn()} onSelect={onSelect} items={items} title="Choose an item" emptyText={emptyText} />);
  return onSelect;
}
const rowNames = () => screen.queryAllByRole('button').map(b => b.props.accessibilityLabel);

describe('ItemPickerSheet', () => {
  it('searches from zero letters at the tall height of the customer sheet', async () => {
    await mount();
    expect(sheetProps.minQueryLength).toBe(0);
    expect(sheetProps.snapPoints).toBe(ITEM_PICKER_SNAP_POINTS);
    expect(ITEM_PICKER_SNAP_POINTS[0]).toBe('90%');
    expect(screen.getByText('Choose an item')).toBeOnTheScreen();
  });

  it('lists every item with no search, and filters by every word typed', async () => {
    const user = userEvent.setup({ delay: 0 });
    await mount();
    expect(await screen.findAllByRole('button')).toHaveLength(3);
    expect(rowNames()).toEqual(['Review Garlic Desi · Bag', 'Review Ginger Fresh · Bag', 'Review Garlic Pole · Bag']);
    await user.type(screen.getByLabelText('Search'), 'GARLIC');
    expect(await screen.findByRole('button', { name: 'Review Garlic Desi · Bag' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Review Ginger Fresh · Bag' })).not.toBeOnTheScreen();
    expect(rowNames()).toEqual(['Review Garlic Desi · Bag', 'Review Garlic Pole · Bag']);
    await user.clear(screen.getByLabelText('Search'));
    await user.type(screen.getByLabelText('Search'), 'garlic fresh');
    expect(await screen.findByText('No items match "garlic fresh".')).toBeOnTheScreen();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('shows the name with its packaging word beside it (a blank packaging reads Bag)', async () => {
    await mount();
    for (const name of ['Review Garlic Desi · Bag', 'Review Ginger Fresh · Bag', 'Review Garlic Pole · Bag']) {
      expect(await screen.findByText(name)).toBeOnTheScreen();
    }
    expect(screen.getAllByText(/·/)).toHaveLength(3);
  });

  it('hands the chosen item to the caller', async () => {
    const user = userEvent.setup({ delay: 0 });
    const onSelect = await mount();
    await user.press(await screen.findByRole('button', { name: 'Review Ginger Fresh · Bag' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
  });

  it('says why when there is nothing to choose from', async () => {
    const user = userEvent.setup({ delay: 0 });
    await mount([], jest.fn(), 'No other item has a rate in force today to copy.');
    expect(await screen.findByText('No other item has a rate in force today to copy.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Search'), 'x');
    expect(await screen.findByText('No other item has a rate in force today to copy.')).toBeOnTheScreen();
    expect(sheetProps.emptyInitialText).toBe('No other item has a rate in force today to copy.');
    expect(sheetProps.emptySearchText).toBe('No other item has a rate in force today to copy.');
  });
});
