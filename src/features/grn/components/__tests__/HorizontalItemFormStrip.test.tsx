/**
 * The fixed strip above the GRN item row. The five fields scroll sideways, so
 * while Rack or Mark is on screen the Item and Quantity fields are not; the
 * strip keeps the line's number, item, quantity and packaging in view (owner's
 * decision of 2026-10-14: the sideways row stays, the strip names the line,
 * the save button stays a bare check mark).
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
// A stand-in that keeps its props, so a test can choose an item as the list does.
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: 'RemoteAutocompleteInput' }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const line = (over: Partial<ItemFormData> = {}): ItemFormData => ({
  grn_trl_id: 'line-5',
  item_table_id: 'item-1',
  item_name: 'Potato',
  packaging: 'Bag',
  qty: '99',
  weight: '50',
  rack: '20B/F1/C4',
  package_mark: 'PT',
  trl_images: [],
  errors: {},
  ...over,
});
const EMPTY = line({ grn_trl_id: 'new', item_table_id: '', item_name: '', packaging: '', qty: '', weight: '', rack: '', package_mark: '' });

interface Options {
  isEditing?: boolean;
  editingItemNumber?: number;
  savedItemsCount?: number;
  /** false: the form is drawn without a way to the saved items. */
  canOpenSaved?: boolean;
}

const onViewAll = jest.fn();

/** The form with a parent that keeps what is typed, as the items step does. */
function Harness({ initial, options }: { initial: ItemFormData; options: Options }) {
  const [current, setCurrent] = React.useState(initial);
  return (
    <HorizontalItemForm
      currentItem={current}
      onFieldChange={(field, value) => setCurrent((prev) => ({ ...prev, [field]: value }))}
      onImagePick={jest.fn()}
      onImageRemove={jest.fn()}
      onSaveItem={jest.fn()}
      onViewAll={options.canOpenSaved === false ? undefined : onViewAll}
      isValid
      isEditing={options.isEditing ?? false}
      editingItemNumber={options.editingItemNumber ?? 0}
      savedItemsCount={options.savedItemsCount ?? 0}
    />
  );
}

const mounted: ReactTestRenderer[] = [];
function render(initial: ItemFormData, options: Options = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Harness initial={initial} options={options} />);
  });
  mounted.push(tree);
  return tree;
}
/** A correction of line 5 of a receipt with ten saved lines. */
const CORRECTION: Options = { isEditing: true, editingItemNumber: 5, savedItemsCount: 10 };

beforeEach(() => {
  jest.useFakeTimers();
  onViewAll.mockClear();
});
afterEach(() => {
  // Choosing an item focuses Quantity a moment later: let that run before the tree goes.
  act(() => {
    jest.runOnlyPendingTimers();
  });
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  jest.useRealTimers();
  setLanguage('en');
});

const isText = (node: ReactTestInstance) => (node.type as unknown) === 'Text';
/** The view or text a drawn node sits in. */
const hostParent = (node: ReactTestInstance) => {
  let parent = node.parent;
  while (parent && typeof parent.type !== 'string') parent = parent.parent;
  return parent!;
};
const textOf = (node: ReactTestInstance) => ([] as unknown[]).concat(node.props.children).join('');
/** The strip: the first control of the form, a button when the saved items can be opened and a header otherwise. */
const strip = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    (node) => typeof node.type === 'string' && (node.props.accessibilityRole === 'button' || node.props.accessibilityRole === 'header') && typeof node.props.accessibilityLabel === 'string'
  )[0];
const stripTextNodes = (tree: ReactTestRenderer) => strip(tree).findAll(isText);
/** The strip's texts, top to bottom. */
const stripTexts = (tree: ReactTestRenderer) => stripTextNodes(tree).map(textOf);
const stripLabel = (tree: ReactTestRenderer) => strip(tree).props.accessibilityLabel as string;
const stripText = (tree: ReactTestRenderer, text: string) => stripTextNodes(tree).find((node) => textOf(node) === text)!;
const quantityInput = (tree: ReactTestRenderer) =>
  tree.root.find((node) => (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === 'Receipt item quantity');
const typeQuantity = (tree: ReactTestRenderer, text: string) => act(() => quantityInput(tree).props.onChangeText(text));
const chooseItem = (tree: ReactTestRenderer, item: { id: string; name: string; packaging?: string } | null) =>
  act(() => tree.root.findByType('RemoteAutocompleteInput' as never).props.onSelect(item));

describe('GRN item form strip', () => {
  it('names the line being corrected: overline and saved link, number with item, quantity with packaging', () => {
    const tree = render(line(), CORRECTION);

    expect(stripTexts(tree)).toEqual(['Editing item', '10 saved', 'Item 5 · Potato', '99 Bag']);
  });

  it('shows the number alone, and no third line, before an item is chosen', () => {
    const tree = render(EMPTY, { savedItemsCount: 10 });

    expect(stripTexts(tree)).toEqual(['New item', '10 saved', 'Item 11']);
  });

  it('puts the saved link at the end of the overline row, not beside the title', () => {
    const tree = render(line(), CORRECTION);

    const overlineRow = hostParent(stripText(tree, 'Editing item'));
    expect(overlineRow.findAll(isText).map(textOf)).toEqual(['Editing item', '10 saved']);
    expect(overlineRow.findAll((node) => (node.type as unknown) === 'Icon').map((node) => node.props.name)).toEqual(['chevron-right']);
    // The row is drawn from its two ends.
    expect(overlineRow.props.style).toEqual(expect.objectContaining({ flexDirection: 'row', justifyContent: 'space-between' }));
    // The title is a line of its own under that row.
    expect(hostParent(stripText(tree, 'Item 5 · Potato'))).toBe(strip(tree));
  });

  it('has no saved link while nothing is saved, or when the saved items cannot be opened', () => {
    expect(stripTexts(render(line(), { savedItemsCount: 0 }))).toEqual(['New item', 'Item 1 · Potato', '99 Bag']);
    expect(stripTexts(render(line(), { ...CORRECTION, canOpenSaved: false }))).toEqual(['Editing item', 'Item 5 · Potato', '99 Bag']);
  });

  it('follows the quantity as it is typed: 99 becomes 1,200', () => {
    const tree = render(line(), CORRECTION);
    expect(stripTexts(tree)).toContain('99 Bag');

    typeQuantity(tree, '1200');

    expect(stripTexts(tree)).toContain('1,200 Bag');
    expect(stripTexts(tree)).not.toContain('99 Bag');
    expect(stripLabel(tree)).toBe('Editing item 5, Potato, quantity 1,200, Bag, View 10 saved items');
  });

  it('follows the item as it is chosen and cleared', () => {
    const tree = render(EMPTY, { savedItemsCount: 10 });
    expect(stripTexts(tree)).toEqual(['New item', '10 saved', 'Item 11']);

    chooseItem(tree, { id: 'item-7', name: 'Onion', packaging: 'Crate' });
    expect(stripTexts(tree)).toEqual(['New item', '10 saved', 'Item 11 · Onion', 'Crate']);
    typeQuantity(tree, '40');
    expect(stripTexts(tree)).toEqual(['New item', '10 saved', 'Item 11 · Onion', '40 Crate']);

    chooseItem(tree, null);
    expect(stripTexts(tree)).toEqual(['New item', '10 saved', 'Item 11', '40']);
  });

  it('shows the packaging alone while no quantity is typed', () => {
    const tree = render(line({ qty: '' }), CORRECTION);

    expect(stripTexts(tree)).toEqual(['Editing item', '10 saved', 'Item 5 · Potato', 'Bag']);
    expect(stripLabel(tree)).toBe('Editing item 5, Potato, Bag, View 10 saved items');
  });

  it('shows the quantity alone for an item without packaging', () => {
    const tree = render(line({ packaging: '' }), CORRECTION);

    expect(stripTexts(tree)).toEqual(['Editing item', '10 saved', 'Item 5 · Potato', '99']);
    expect(stripLabel(tree)).toBe('Editing item 5, Potato, quantity 99, View 10 saved items');
  });

  it('shows no third line when there is neither a quantity nor packaging', () => {
    const tree = render(line({ qty: '  ', packaging: ' ' }), CORRECTION);

    expect(stripTexts(tree)).toEqual(['Editing item', '10 saved', 'Item 5 · Potato']);
    expect(stripLabel(tree)).toBe('Editing item 5, Potato, View 10 saved items');
  });

  // The strip shows what is in the field; whether it can be saved is the field's own message.
  it.each([
    ['0', '0 Bag'],
    ['12.5', '12.5 Bag'],
    ['12a', '12a Bag'],
    ['007', '7 Bag'],
    [' 250 ', '250 Bag'],
  ])('shows the typed quantity %p as %p', (typed, shown) => {
    const tree = render(line(), CORRECTION);

    typeQuantity(tree, typed);

    expect(stripTexts(tree)[3]).toBe(shown);
  });

  it('gives the item name three lines with an ellipsis at the end and no cap on text size', () => {
    const name = 'Potato Kufri Jyoti first grade washed and sorted for the retail counter at Deesa market yard';
    const tree = render(line({ item_name: name }), CORRECTION);

    const title = stripText(tree, `Item 5 · ${name}`);
    expect(title.props.numberOfLines).toBe(3);
    expect(title.props.ellipsizeMode).toBe('tail');
    for (const node of stripTextNodes(tree)) {
      expect(node.props.maxFontSizeMultiplier).toBeUndefined();
      expect(node.props.allowFontScaling).not.toBe(false);
    }
  });

  it('never cuts the quantity line short, and holds no text to one line', () => {
    const tree = render(line({ qty: '123456789', packaging: 'Jumbo bag, double stitched, 50 kg' }), CORRECTION);

    const quantity = stripText(tree, '12,34,56,789 Jumbo bag, double stitched, 50 kg');
    expect(quantity.props.numberOfLines).toBeUndefined();
    expect(stripTextNodes(tree).filter((node) => node.props.numberOfLines === 1)).toEqual([]);
  });

  it('draws the quantity line as secondary-size text in the primary text colour', () => {
    const tree = render(line(), CORRECTION);

    const { typography, getTokens } = jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens');
    expect(stripText(tree, '99 Bag').props.style).toEqual(
      expect.objectContaining({ ...typography.subhead, color: getTokens('orange', 'light').text.primary })
    );
  });

  describe('spoken label', () => {
    it('reads a correction as number, item, quantity, packaging, then the way to the saved items', () => {
      const tree = render(line(), CORRECTION);

      expect(stripLabel(tree)).toBe('Editing item 5, Potato, quantity 99, Bag, View 10 saved items');
      expect(strip(tree).props.accessibilityRole).toBe('button');
    });

    it('reads a new item the same way, and "item" for one saved line', () => {
      expect(stripLabel(render(line(), { savedItemsCount: 1 }))).toBe('New item 2, Potato, quantity 99, Bag, View 1 saved item');
    });

    it('is a header with only the number while the form is empty and nothing is saved', () => {
      const tree = render(EMPTY);

      expect(stripLabel(tree)).toBe('New item 1');
      expect(strip(tree).props.accessibilityRole).toBe('header');
    });

    it('does not offer the saved items when they cannot be opened', () => {
      expect(stripLabel(render(line(), { ...CORRECTION, canOpenSaved: false }))).toBe('Editing item 5, Potato, quantity 99, Bag');
    });
  });

  it('opens the saved items from anywhere on the strip', () => {
    const tree = render(line(), CORRECTION);
    const press = tree.root.findAll((node) => node.props.accessibilityLabel === stripLabel(tree) && typeof node.props.onPress === 'function')[0];

    act(() => press.props.onPress());

    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('keeps the save button a bare check mark, with its spoken name', () => {
    const tree = render(line(), CORRECTION);

    const save = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityLabel === 'Save receipt item')[0];
    expect(save.findAll(isText)).toEqual([]);
    expect(save.findAll((node) => (node.type as unknown) === 'Icon').map((node) => node.props.name)).toEqual(['check']);
  });

  describe('in Gujarati', () => {
    beforeEach(() => setLanguage('gu'));

    it('writes the number and the quantity in Gujarati digits and leaves the typed names as they are', () => {
      const tree = render(line(), CORRECTION);

      expect(stripTexts(tree)).toEqual(['આઇટમમાં ફેરફાર', '૧૦ સાચવેલી', 'આઇટમ ૫ · Potato', '૯૯ Bag']);
    });

    it('follows the typed quantity, which the field stores in 0-9', () => {
      const tree = render(line(), CORRECTION);
      const quantity = tree.root.find((node) => (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === 'આઇટમના નંગ');

      act(() => quantity.props.onChangeText('૧૨૦૦'));
      expect(stripTexts(tree)[3]).toBe('૧,૨૦૦ Bag');
      // Not a quantity yet: shown as typed, in the language's digits.
      act(() => quantity.props.onChangeText('12.5'));
      expect(stripTexts(tree)[3]).toBe('૧૨.૫ Bag');
    });

    it('reads the label in Gujarati', () => {
      expect(stripLabel(render(line(), CORRECTION))).toBe('આઇટમ ૫ માં ફેરફાર, Potato, નંગ ૯૯, Bag, સાચવેલી ૧૦ આઇટમ જુઓ');
      expect(stripLabel(render(EMPTY, { savedItemsCount: 10 }))).toBe('નવી આઇટમ ૧૧, સાચવેલી ૧૦ આઇટમ જુઓ');
    });
  });
});
