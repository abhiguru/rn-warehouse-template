/**
 * The weight field of the GRN item row. A lot stores one weight, that of one
 * bag, box or crate, so the field says "Weight each" (owner's decision of
 * 2026-10-14). The longer label needs a wider field, and the row scrolls to a
 * field by the widths of the fields before it: Rack and Mark have to follow.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { HorizontalItemForm, type HorizontalItemFormRef, type ItemFormData } from '../HorizontalItemForm';
import { QuantityWeightFields } from '../item-form';

// The weight box and the scroll offsets follow the text size (WH-56): 1 unless a test sets it.
let mockFontScale = 1;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isStaffRole: false }) })); // WH-79: staff may add an item
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 392, height: 780, scale: 3, fontScale: mockFontScale }),
}));
// The add-item sheet in the entry form (WH-56) needs the safe area and the network state.
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
// A stand-in for the item search: one button that picks Onion through the real onSelect of the row.
jest.mock('@/components/RemoteAutocompleteInput', () => {
  const { Pressable } = require('react-native');
  return {
    RemoteAutocompleteInput: ({ onSelect }: { onSelect: (item: unknown) => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="Choose Onion" onPress={() => onSelect({ id: 'item-2', name: 'Onion', packaging: 'Crate' })} />
    ),
  };
});
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

// The row's ref is the jest mock's instance, whose scrollTo is one shared jest.fn (react-native's jest preset).
const mockScrollTo = ScrollView.prototype.scrollTo as unknown as jest.Mock;

const ITEM: ItemFormData = {
  grn_trl_id: 'line-1',
  item_table_id: 'item-1',
  item_name: 'Potato',
  packaging: 'Bag',
  qty: '100',
  weight: '50',
  rack: '20B',
  package_mark: 'PT',
  trl_images: [],
  errors: {},
};

const onFieldChange = jest.fn();
const formElement = (item: ItemFormData = ITEM, ref?: React.Ref<HorizontalItemFormRef>) => (
  <HorizontalItemForm
    ref={ref}
    currentItem={item}
    onFieldChange={onFieldChange}
    onImagePick={jest.fn()}
    onImageRemove={jest.fn()}
    onSaveItem={jest.fn()}
    isValid
    isEditing
    editingItemNumber={1}
    savedItemsCount={1}
  />
);
const renderForm = (item: ItemFormData = ITEM, ref?: React.Ref<HorizontalItemFormRef>) => render(formElement(item, ref));

beforeEach(() => {
  jest.useFakeTimers();
  mockScrollTo.mockClear();
  onFieldChange.mockClear();
});
afterEach(async () => {
  await act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  setLanguage('en');
  mockFontScale = 1;
});

// A width and a minWidth are in the style of a view that has no role, so the field around an input is found by walking
// up the rendered tree from the input (a host element's parent).
type Host = ReturnType<typeof screen.getByLabelText>;
const input = (label: string) => screen.getByLabelText(label);
const ancestorWith = (node: Host, key: 'width' | 'minWidth') => {
  let parent = node.parent;
  while (parent && typeof StyleSheet.flatten(parent.props.style)?.[key] !== 'number') parent = parent.parent;
  return parent!;
};
/** The field an input belongs to: the nearest view around it that has a width of its own. */
const widthOf = (node: Host) => StyleSheet.flatten(ancestorWith(node, 'width').props.style).width;
/** The label and the unit drawn in a field. */
const fieldTexts = (node: Host) =>
  within(ancestorWith(node, 'width'))
    .getAllByText(/./)
    .map((text) => ([] as unknown[]).concat(text.props.children).filter((child) => typeof child === 'string').join(''))
    .filter(Boolean);
const focus = (label: string) => fireEvent(input(label), 'focus', {});
const scrolledTo = () => mockScrollTo.mock.calls.map(([target]) => target);

describe('GRN item form weight field', () => {
  it('is labelled "Weight each", with kg after the value', async () => {
    await renderForm();
    const weight = input('Weight each, in kilograms');

    expect(fieldTexts(weight)).toEqual(['Weight each', 'kg']);
    expect(weight).toHaveDisplayValue('50');
    expect(weight).toHaveProp('placeholder', '0');
    // No field of the row is still called plain "Weight".
    expect(screen.queryByText('Weight')).not.toBeOnTheScreen();
  });

  it('has a width of its own, 112, 5 dp narrower than the quantity field (WH-56); the other fields keep theirs', async () => {
    await renderForm();

    expect(widthOf(input('Weight each, in kilograms'))).toBe(112);
    expect(widthOf(input('Receipt item quantity'))).toBe(117);
    // The Rack column is as wide as its longest chip line: 196 is its least (minWidth).
    expect(StyleSheet.flatten(ancestorWith(input('Rack'), 'minWidth').props.style).minWidth).toBe(196);
    expect(widthOf(input('Mark'))).toBe(270);
  });

  it('grows with the text size, up to 2.0, and the row scrolls by the grown width (WH-56)', async () => {
    mockFontScale = 2;
    await renderForm();
    expect(widthOf(input('Weight each, in kilograms'))).toBe(224);
    expect(widthOf(input('Receipt item quantity'))).toBe(117);

    await focus('Rack');
    await focus('Mark');

    // 232 + 117 + 12 = 361 for Weight; Rack 361 + 224 + 12 = 597; Mark 597 + 196 + 12 = 805.
    expect(scrolledTo().map((target) => target.x)).toEqual([597, 805]);

    // Mounted again at the larger text size (the row reads the size on every draw).
    mockFontScale = 3;
    await screen.rerender(formElement());
    expect(widthOf(input('Weight each, in kilograms'))).toBe(224);
  });

  it('stores what is typed in 0-9', async () => {
    await renderForm();

    await fireEvent.changeText(input('Weight each, in kilograms'), '૪૫');

    expect(onFieldChange).toHaveBeenLastCalledWith('weight', '45');
  });

  describe('scrolling to the field in focus', () => {
    // Item 220, Quantity 117, Weight 112, Rack 196, each followed by the 12 dp gap: a field is reached by the widths before it.
    it.each([
      ['Receipt item quantity', 232],
      ['Weight each, in kilograms', 361],
      ['Rack', 485],
      ['Mark', 693],
    ])('%s scrolls the row to %d', async (label, x) => {
      await renderForm();

      await focus(label);

      expect(scrolledTo()).toEqual([{ x, animated: true }]);
    });

    it('Rack and Mark are not scrolled to as if Weight were still 152 wide (525 and 733)', async () => {
      await renderForm();

      await focus('Rack');
      await focus('Mark');

      expect(scrolledTo().map((target) => target.x)).toEqual([485, 693]);
      expect(scrolledTo().map((target) => target.x)).not.toContain(525);
      expect(scrolledTo().map((target) => target.x)).not.toContain(733);
    });

    it('goes to Quantity after an item is chosen, as before', async () => {
      await renderForm();

      await userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime }).press(screen.getByRole('button', { name: 'Choose Onion' }));
      await act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(scrolledTo()).toEqual([{ x: 232, animated: true }]);
    });
  });

  // After a save that was refused the items step names the first field with an
  // error: Weight, Rack and Mark are out of view while Item and Quantity are shown.
  describe('scrolling to a field the items step names', () => {
    it.each([
      ['item', 0],
      ['qty', 232],
      ['weight', 361],
      ['rack', 485],
      ['package_mark', 693],
    ] as const)('%s scrolls the row to %d, the place it has when it takes focus', async (field, x) => {
      const ref = React.createRef<HorizontalItemFormRef>();
      await renderForm(ITEM, ref);

      await act(() => ref.current!.revealField(field));

      expect(scrolledTo()).toEqual([{ x, animated: true }]);
    });
  });

  it('says "દરેકનું વજન" in Gujarati, in the label and aloud', async () => {
    setLanguage('gu');
    await renderForm();
    const weight = input('દરેકનું વજન, કિલોમાં');

    expect(fieldTexts(weight)).toEqual(['દરેકનું વજન', 'કિલો']);
    expect(weight).toHaveDisplayValue('૫૦');
  });
});

// Mounted on no screen; kept in step with the row above.
describe('QuantityWeightFields', () => {
  const renderFields = () =>
    render(<QuantityWeightFields qty="100" weight="50" onQtyChange={jest.fn()} onWeightChange={jest.fn()} />);

  it('labels the weight "Weight each", says so aloud, and gives it the wider field', async () => {
    await renderFields();
    const weight = input('Weight each, in kilograms');

    expect(fieldTexts(weight)).toEqual(['Weight each', 'kg']);
    expect(widthOf(weight)).toBe(152);
    expect(widthOf(input('Receipt item quantity'))).toBe(117);
    expect(screen.queryByText('Weight')).not.toBeOnTheScreen();
  });

  it('says "દરેકનું વજન" in Gujarati', async () => {
    setLanguage('gu');
    await renderFields();

    expect(fieldTexts(input('દરેકનું વજન, કિલોમાં'))).toEqual(['દરેકનું વજન', 'કિલો']);
  });
});
