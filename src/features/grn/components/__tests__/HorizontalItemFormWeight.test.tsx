/**
 * The weight field of the GRN item row. A lot stores one weight, that of one
 * bag, box or crate, so the field says "Weight each" (owner's decision of
 * 2026-10-14). The longer label needs a wider field, and the row scrolls to a
 * field by the widths of the fields before it: Rack and Mark have to follow.
 */
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';
import { QuantityWeightFields } from '../item-form';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: 'RemoteAutocompleteInput' }));
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

const mounted: ReactTestRenderer[] = [];
function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return tree;
}
const onFieldChange = jest.fn();
const renderForm = (item: ItemFormData = ITEM) =>
  mount(
    <HorizontalItemForm
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

beforeEach(() => {
  jest.useFakeTimers();
  mockScrollTo.mockClear();
  onFieldChange.mockClear();
});
afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  jest.useRealTimers();
  setLanguage('en');
});

const isText = (node: ReactTestInstance) => (node.type as unknown) === 'Text';
const textOf = (node: ReactTestInstance) => ([] as unknown[]).concat(node.props.children).filter((child) => typeof child === 'string').join('');
const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((node) => (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === label);
/** The field an input belongs to: the nearest view around it that has a width of its own. */
const fieldOf = (node: ReactTestInstance) => {
  let parent = node.parent;
  while (parent && !(typeof parent.type === 'string' && typeof StyleSheet.flatten(parent.props.style)?.width === 'number')) parent = parent.parent;
  return parent!;
};
const widthOf = (node: ReactTestInstance) => StyleSheet.flatten(fieldOf(node).props.style).width;
/** The label and the unit drawn in a field. */
const fieldTexts = (node: ReactTestInstance) => fieldOf(node).findAll(isText).map(textOf).filter(Boolean);
const focus = (tree: ReactTestRenderer, label: string) => act(() => input(tree, label).props.onFocus());
const scrolledTo = () => mockScrollTo.mock.calls.map(([target]) => target);

describe('GRN item form weight field', () => {
  it('is labelled "Weight each", with kg after the value', () => {
    const tree = renderForm();
    const weight = input(tree, 'Weight each, in kilograms');

    expect(fieldTexts(weight)).toEqual(['Weight each', 'kg']);
    expect(weight.props.value).toBe('50');
    expect(weight.props.placeholder).toBe('0');
    // No field of the row is still called plain "Weight".
    expect(tree.root.findAll(isText).map(textOf)).not.toContain('Weight');
  });

  it('has a width of its own, 152, wider than the quantity field; the other fields keep theirs', () => {
    const tree = renderForm();

    expect(widthOf(input(tree, 'Weight each, in kilograms'))).toBe(152);
    expect(widthOf(input(tree, 'Receipt item quantity'))).toBe(117);
    expect(widthOf(input(tree, 'Rack'))).toBe(196);
    expect(widthOf(input(tree, 'Mark'))).toBe(270);
  });

  it('stores what is typed in 0-9', () => {
    const tree = renderForm();

    act(() => input(tree, 'Weight each, in kilograms').props.onChangeText('૪૫'));

    expect(onFieldChange).toHaveBeenLastCalledWith('weight', '45');
  });

  describe('scrolling to the field in focus', () => {
    // Item 220, Quantity 117, Weight 152, Rack 196: each field is reached by the widths before it.
    it.each([
      ['Receipt item quantity', 220],
      ['Weight each, in kilograms', 337],
      ['Rack', 489],
      ['Mark', 685],
    ])('%s scrolls the row to %d', (label, x) => {
      const tree = renderForm();

      focus(tree, label);

      expect(scrolledTo()).toEqual([{ x, animated: true }]);
    });

    it('Rack and Mark are not scrolled to as if Weight were still 117 wide (454 and 650)', () => {
      const tree = renderForm();

      focus(tree, 'Rack');
      focus(tree, 'Mark');

      expect(scrolledTo().map((target) => target.x)).toEqual([489, 685]);
      expect(scrolledTo().map((target) => target.x)).not.toContain(454);
      expect(scrolledTo().map((target) => target.x)).not.toContain(650);
    });

    it('goes to Quantity after an item is chosen, as before', () => {
      const tree = renderForm();

      act(() => tree.root.findByType('RemoteAutocompleteInput' as never).props.onSelect({ id: 'item-2', name: 'Onion', packaging: 'Crate' }));
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(scrolledTo()).toEqual([{ x: 220, animated: true }]);
    });
  });

  it('says "દરેકનું વજન" in Gujarati, in the label and aloud', () => {
    setLanguage('gu');
    const tree = renderForm();
    const weight = input(tree, 'દરેકનું વજન, કિલોમાં');

    expect(fieldTexts(weight)).toEqual(['દરેકનું વજન', 'કિલો']);
    expect(weight.props.value).toBe('૫૦');
  });
});

// Mounted on no screen; kept in step with the row above.
describe('QuantityWeightFields', () => {
  const renderFields = () =>
    mount(<QuantityWeightFields qty="100" weight="50" onQtyChange={jest.fn()} onWeightChange={jest.fn()} />);

  it('labels the weight "Weight each", says so aloud, and gives it the wider field', () => {
    const tree = renderFields();
    const weight = input(tree, 'Weight each, in kilograms');

    expect(fieldTexts(weight)).toEqual(['Weight each', 'kg']);
    expect(widthOf(weight)).toBe(152);
    expect(widthOf(input(tree, 'Receipt item quantity'))).toBe(117);
    expect(tree.root.findAll(isText).map(textOf)).not.toContain('Weight');
  });

  it('says "દરેકનું વજન" in Gujarati', () => {
    setLanguage('gu');
    const tree = renderFields();

    expect(fieldTexts(input(tree, 'દરેકનું વજન, કિલોમાં'))).toEqual(['દરેકનું વજન', 'કિલો']);
  });
});
