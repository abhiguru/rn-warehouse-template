/**
 * The fixed strip above the GRN item row. The five fields scroll sideways, so
 * while Rack or Mark is on screen the Item and Quantity fields are not; the
 * strip keeps the line's number, item, quantity and packaging in view (owner's
 * decision of 2026-10-14: the sideways row stays, the strip names the line,
 * the save button stays a bare check mark).
 */
import React from 'react';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

// The add-item sheet in the entry form (WH-56) needs the safe area and the network state.
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isStaffRole: false }) })); // WH-79: staff may add an item
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
// Draws two buttons that choose or clear an item through the real onSelect prop, as the suggestion list does.
jest.mock('@/components/RemoteAutocompleteInput', () => ({
  RemoteAutocompleteInput: (props: { onSelect?: (item: { id: string; name: string; packaging?: string } | null) => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose Onion" onPress={() => props.onSelect?.({ id: 'item-7', name: 'Onion', packaging: 'Crate' })}>
          <Text>Choose Onion</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear item" onPress={() => props.onSelect?.(null)}>
          <Text>Clear item</Text>
        </Pressable>
      </>
    );
  },
}));
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

const renderForm = (initial: ItemFormData, options: Options = {}) => render(<Harness initial={initial} options={options} />);
/** A correction of line 5 of a receipt with ten saved lines. */
const CORRECTION: Options = { isEditing: true, editingItemNumber: 5, savedItemsCount: 10 };

const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });

beforeEach(() => {
  jest.useFakeTimers();
  onViewAll.mockClear();
});
afterEach(async () => {
  // Choosing an item focuses Quantity a moment later: let that run before the tree goes.
  await act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  setLanguage('en');
});

type Host = ReturnType<typeof screen.getByRole>;
const textOf = (node: { props: { children?: unknown } }) => ([] as unknown[]).concat(node.props.children).join('');
/** The icon names drawn inside a node. The mocked icon is a bare host 'Icon' that no query reaches, so this walks its children. */
const iconsIn = (node: Host): string[] =>
  node.children.flatMap((child) =>
    typeof child === 'string' ? [] : child.type === 'Icon' ? [child.props.name as string] : iconsIn(child)
  );
/** The strip: the first control of the form, a button when the saved items can be opened and a header otherwise. */
const STRIP_NAME = /^(Editing item|New item|આઇટમ . માં ફેરફાર|નવી આઇટમ)/;
const strip = (): Host => screen.queryByRole('button', { name: STRIP_NAME }) ?? screen.getByRole('header', { name: STRIP_NAME });
const stripTextNodes = () => within(strip()).queryAllByText(/[\s\S]*/);
/** The strip's texts, top to bottom. */
const stripTexts = () => stripTextNodes().map(textOf);
const stripLabel = () => strip().props.accessibilityLabel as string;
const stripText = (text: string) => within(strip()).getByText(text);
const quantityInput = (label = 'Receipt item quantity') => screen.getByLabelText(label);
const typeQuantity = (text: string, label?: string) => fireEvent.changeText(quantityInput(label), text);
const chooseItem = (name: 'Choose Onion' | 'Clear item') => user().press(screen.getByRole('button', { name }));

describe('GRN item form strip', () => {
  it('names the line being corrected: overline and saved link, number with item, quantity with packaging', async () => {
    await renderForm(line(), CORRECTION);

    expect(stripTexts()).toEqual(['Editing item', '10 saved', 'Item 5 · Potato', '99 Bag']);
  });

  it('shows the number alone, and no third line, before an item is chosen', async () => {
    await renderForm(EMPTY, { savedItemsCount: 10 });

    expect(stripTexts()).toEqual(['New item', '10 saved', 'Item 11']);
  });

  it('puts the saved link at the end of the overline row, not beside the title', async () => {
    await renderForm(line(), CORRECTION);

    const overlineRow = stripText('Editing item').parent!;
    expect(within(overlineRow).queryAllByText(/[\s\S]*/).map(textOf)).toEqual(['Editing item', '10 saved']);
    expect(iconsIn(overlineRow)).toEqual(['chevron-right']);
    // The row is drawn from its two ends.
    expect(overlineRow.props.style).toEqual(expect.objectContaining({ flexDirection: 'row', justifyContent: 'space-between' }));
    // The title is a line of its own under that row: its parent is the strip itself, not the overline row.
    expect(stripText('Item 5 · Potato').parent).toBe(strip());
    expect(stripText('Item 5 · Potato').parent).not.toBe(overlineRow);
  });

  it('has no saved link while nothing is saved, or when the saved items cannot be opened', async () => {
    await renderForm(line(), { savedItemsCount: 0 });
    expect(stripTexts()).toEqual(['New item', 'Item 1 · Potato', '99 Bag']);
    await renderForm(line(), { ...CORRECTION, canOpenSaved: false });
    expect(stripTexts()).toEqual(['Editing item', 'Item 5 · Potato', '99 Bag']);
  });

  it('follows the quantity as it is typed: 99 becomes 1,200', async () => {
    await renderForm(line(), CORRECTION);
    expect(stripTexts()).toContain('99 Bag');

    await typeQuantity('1200');

    expect(stripTexts()).toContain('1,200 Bag');
    expect(stripTexts()).not.toContain('99 Bag');
    expect(stripLabel()).toBe('Editing item 5, Potato, quantity 1,200, Bag, View 10 saved items');
  });

  it('follows the item as it is chosen and cleared', async () => {
    await renderForm(EMPTY, { savedItemsCount: 10 });
    expect(stripTexts()).toEqual(['New item', '10 saved', 'Item 11']);

    await chooseItem('Choose Onion');
    expect(stripTexts()).toEqual(['New item', '10 saved', 'Item 11 · Onion', 'Crate']);
    await typeQuantity('40');
    expect(stripTexts()).toEqual(['New item', '10 saved', 'Item 11 · Onion', '40 Crate']);

    await chooseItem('Clear item');
    expect(stripTexts()).toEqual(['New item', '10 saved', 'Item 11', '40']);
  });

  it('shows the packaging alone while no quantity is typed', async () => {
    await renderForm(line({ qty: '' }), CORRECTION);

    expect(stripTexts()).toEqual(['Editing item', '10 saved', 'Item 5 · Potato', 'Bag']);
    expect(stripLabel()).toBe('Editing item 5, Potato, Bag, View 10 saved items');
  });

  it('shows the quantity alone for an item without packaging', async () => {
    await renderForm(line({ packaging: '' }), CORRECTION);

    expect(stripTexts()).toEqual(['Editing item', '10 saved', 'Item 5 · Potato', '99']);
    expect(stripLabel()).toBe('Editing item 5, Potato, quantity 99, View 10 saved items');
  });

  it('shows no third line when there is neither a quantity nor packaging', async () => {
    await renderForm(line({ qty: '  ', packaging: ' ' }), CORRECTION);

    expect(stripTexts()).toEqual(['Editing item', '10 saved', 'Item 5 · Potato']);
    expect(stripLabel()).toBe('Editing item 5, Potato, View 10 saved items');
  });

  // The strip shows what is in the field; whether it can be saved is the field's own message.
  it.each([
    ['0', '0 Bag'],
    ['12.5', '12.5 Bag'],
    ['12a', '12a Bag'],
    ['007', '7 Bag'],
    [' 250 ', '250 Bag'],
  ])('shows the typed quantity %p as %p', async (typed, shown) => {
    await renderForm(line(), CORRECTION);

    await typeQuantity(typed);

    expect(stripTexts()[3]).toBe(shown);
  });

  it('gives the item name three lines with an ellipsis at the end and no cap on text size', async () => {
    const name = 'Potato Kufri Jyoti first grade washed and sorted for the retail counter at Deesa market yard';
    await renderForm(line({ item_name: name }), CORRECTION);

    const title = stripText(`Item 5 · ${name}`);
    expect(title.props.numberOfLines).toBe(3);
    expect(title.props.ellipsizeMode).toBe('tail');
    for (const node of stripTextNodes()) {
      expect(node.props.maxFontSizeMultiplier).toBeUndefined();
      expect(node.props.allowFontScaling).not.toBe(false);
    }
  });

  it('never cuts the quantity line short, and holds no text to one line', async () => {
    await renderForm(line({ qty: '123456789', packaging: 'Jumbo bag, double stitched, 50 kg' }), CORRECTION);

    const quantity = stripText('12,34,56,789 Jumbo bag, double stitched, 50 kg');
    expect(quantity.props.numberOfLines).toBeUndefined();
    expect(stripTextNodes().filter((node) => node.props.numberOfLines === 1)).toEqual([]);
  });

  it('draws the quantity line as secondary-size text in the primary text colour', async () => {
    await renderForm(line(), CORRECTION);

    const { typography, getTokens } = jest.requireActual<typeof import('@/theme/tokens')>('@/theme/tokens');
    expect(stripText('99 Bag').props.style).toEqual(
      expect.objectContaining({ ...typography.subhead, color: getTokens('orange', 'light').text.primary })
    );
  });

  describe('spoken label', () => {
    it('reads a correction as number, item, quantity, packaging, then the way to the saved items', async () => {
      await renderForm(line(), CORRECTION);

      expect(stripLabel()).toBe('Editing item 5, Potato, quantity 99, Bag, View 10 saved items');
      expect(strip().props.accessibilityRole).toBe('button');
    });

    it('reads a new item the same way, and "item" for one saved line', async () => {
      await renderForm(line(), { savedItemsCount: 1 });
      expect(stripLabel()).toBe('New item 2, Potato, quantity 99, Bag, View 1 saved item');
    });

    it('is a header with only the number while the form is empty and nothing is saved', async () => {
      await renderForm(EMPTY);

      expect(stripLabel()).toBe('New item 1');
      expect(strip().props.accessibilityRole).toBe('header');
    });

    it('does not offer the saved items when they cannot be opened', async () => {
      await renderForm(line(), { ...CORRECTION, canOpenSaved: false });
      expect(stripLabel()).toBe('Editing item 5, Potato, quantity 99, Bag');
    });
  });

  it('opens the saved items from anywhere on the strip', async () => {
    await renderForm(line(), CORRECTION);

    await user().press(strip());

    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('keeps the save button a bare check mark, with its spoken name', async () => {
    await renderForm(line(), CORRECTION);

    const save = screen.getByRole('button', { name: 'Save receipt item' });
    expect(within(save).queryAllByText(/[\s\S]*/)).toEqual([]);
    expect(iconsIn(save)).toEqual(['check']);
  });

  describe('in Gujarati', () => {
    beforeEach(() => setLanguage('gu'));

    it('writes the number and the quantity in Gujarati digits and leaves the typed names as they are', async () => {
      await renderForm(line(), CORRECTION);

      expect(stripTexts()).toEqual(['આઇટમમાં ફેરફાર', '૧૦ સાચવેલી', 'આઇટમ ૫ · Potato', '૯૯ Bag']);
    });

    it('follows the typed quantity, which the field stores in 0-9', async () => {
      await renderForm(line(), CORRECTION);

      await typeQuantity('૧૨૦૦', 'આઇટમના નંગ');
      expect(stripTexts()[3]).toBe('૧,૨૦૦ Bag');
      // Not a quantity yet: shown as typed, in the language's digits.
      await typeQuantity('12.5', 'આઇટમના નંગ');
      expect(stripTexts()[3]).toBe('૧૨.૫ Bag');
    });

    it('reads the label in Gujarati', async () => {
      await renderForm(line(), CORRECTION);
      expect(stripLabel()).toBe('આઇટમ ૫ માં ફેરફાર, Potato, નંગ ૯૯, Bag, સાચવેલી ૧૦ આઇટમ જુઓ');
      await renderForm(EMPTY, { savedItemsCount: 10 });
      expect(stripLabel()).toBe('નવી આઇટમ ૧૧, સાચવેલી ૧૦ આઇટમ જુઓ');
    });
  });
});
