/**
 * A field of the GRN item row that has an error, and the cursor given to it
 * after a refused save (owner decision of 2026-10-14, phone plan B step B16).
 *
 * On the phone the Quantity field kept the cursor while the "Check the item
 * details" alert was open. After OK it showed "Quantity is required" under a
 * blue focus border, not the red error border, and no keyboard: focus() on the
 * field that React Native still counts as focused asks for nothing.
 *
 * The style guide (13.2) gives an input's error border as 2 px
 * `status.negative.border` and its focus border as 2 px `border.fieldFocus`.
 */
import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { getTokens } from '@/theme/tokens';
import { HorizontalItemForm, type HorizontalItemFormRef, type ItemFormData } from '../HorizontalItemForm';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: 'RemoteAutocompleteInput' }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const t = getTokens('orange', 'light');

const ITEM: ItemFormData = {
  grn_trl_id: 'line-1',
  item_table_id: 'item-1',
  item_name: 'Fictional potato',
  packaging: 'Bag',
  qty: '100',
  weight: '50',
  rack: '20B',
  package_mark: 'PT',
  trl_images: [],
  errors: {},
};

/** The four fields typed into: error key, spoken name of the input, an error message. */
const FIELDS = [
  ['qty', 'Receipt item quantity', 'Quantity is required'],
  ['weight', 'Weight each, in kilograms', 'Weight must be a whole number'],
  ['rack', 'Rack', 'Rack can be at most 30 characters'],
  ['package_mark', 'Mark', 'Mark can be at most 60 characters'],
] as const;

const mounted: ReactTestRenderer[] = [];
const formElement = (item: ItemFormData, ref?: React.Ref<HorizontalItemFormRef>) => (
  <HorizontalItemForm
    ref={ref}
    currentItem={item}
    onFieldChange={jest.fn()}
    onImagePick={jest.fn()}
    onImageRemove={jest.fn()}
    onSaveItem={jest.fn()}
    isValid
    isEditing
    editingItemNumber={1}
    savedItemsCount={1}
  />
);
function renderForm(item: ItemFormData = ITEM, ref?: React.Ref<HorizontalItemFormRef>) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(formElement(item, ref));
  });
  mounted.push(tree);
  return tree;
}
const withError = (field: string, message: string): ItemFormData => ({ ...ITEM, errors: { [field]: message } });

const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((node) => (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === label);
/** The drawn border of a field: of the input, or of the box around it (Weight has its unit inside the box). */
const borderOf = (tree: ReactTestRenderer, label: string) => {
  let node: ReactTestInstance | null = input(tree, label);
  while (node) {
    const style = typeof node.type === 'string' ? StyleSheet.flatten(node.props.style) : undefined;
    if (typeof style?.borderWidth === 'number') return { color: style.borderColor, width: style.borderWidth };
    node = node.parent;
  }
  throw new Error(`no border around ${label}`);
};
const isText = (node: ReactTestInstance) => (node.type as unknown) === 'Text';
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll(isText).map((node) => ([] as unknown[]).concat(node.props.children).filter((c) => typeof c === 'string').join(''));

const ERROR_BORDER = { color: t.status.negative.border, width: 2 };
const FOCUS_BORDER = { color: t.border.fieldFocus, width: 2 };
const PLAIN_BORDER = { color: t.border.field, width: 1 };

// TextInput's jest stand-in shares one jest.fn for each method across its instances; `this` says which field was called.
const textInputMethod = (name: 'focus' | 'blur' | 'isFocused') =>
  (TextInput.prototype as unknown as Record<typeof name, jest.Mock>)[name];
const calledOn = (name: 'focus' | 'blur') =>
  textInputMethod(name).mock.contexts.map((instance: { props: { accessibilityLabel?: string } }) => instance.props.accessibilityLabel);

beforeEach(() => {
  jest.useFakeTimers();
  textInputMethod('focus').mockClear();
  textInputMethod('blur').mockClear();
  textInputMethod('isFocused').mockReset();
});
afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  textInputMethod('isFocused').mockReset();
  jest.useRealTimers();
});

it('draws the error border and the focus border in different colours, so the tests below can tell them apart', () => {
  expect(ERROR_BORDER.color).not.toBe(FOCUS_BORDER.color);
  expect(ERROR_BORDER.color).not.toBe(PLAIN_BORDER.color);
});

describe.each(FIELDS)('the %s field', (field, label, message) => {
  it('with an error: the red error border, with the cursor in it and without', () => {
    const tree = renderForm(withError(field, message));
    expect(texts(tree)).toContain(message);
    expect(borderOf(tree, label)).toEqual(ERROR_BORDER);

    act(() => input(tree, label).props.onFocus());
    expect(borderOf(tree, label)).toEqual(ERROR_BORDER);

    act(() => input(tree, label).props.onBlur());
    expect(borderOf(tree, label)).toEqual(ERROR_BORDER);
  });

  it('without an error: the focus border while it has the cursor; an error shown then turns it red, and fixing it turns it back', () => {
    const tree = renderForm();
    expect(borderOf(tree, label)).toEqual(PLAIN_BORDER);

    act(() => input(tree, label).props.onFocus());
    expect(borderOf(tree, label)).toEqual(FOCUS_BORDER);

    // A refused save while the field has the cursor.
    act(() => tree.update(formElement(withError(field, message))));
    expect(borderOf(tree, label)).toEqual(ERROR_BORDER);

    // The worker types: the items step takes the error off.
    act(() => tree.update(formElement(ITEM)));
    expect(borderOf(tree, label)).toEqual(FOCUS_BORDER);
  });

  it('focusField while the field still has the cursor: it lets go, then takes the cursor again after the dialog has gone', () => {
    const ref = React.createRef<HorizontalItemFormRef>();
    renderForm(withError(field, message), ref);
    textInputMethod('isFocused').mockImplementation(function (this: { props: { accessibilityLabel?: string } }) {
      return this.props.accessibilityLabel === label;
    });

    act(() => ref.current!.focusField(field));

    expect(calledOn('blur')).toEqual([label]);
    expect(calledOn('focus')).toEqual([]);
    act(() => {
      jest.advanceTimersByTime(249);
    });
    expect(calledOn('focus')).toEqual([]);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(calledOn('focus')).toEqual([label]);
  });

  it('focusField while another field or none has the cursor: no blur, and the field takes the cursor', () => {
    const ref = React.createRef<HorizontalItemFormRef>();
    renderForm(withError(field, message), ref);
    textInputMethod('isFocused').mockReturnValue(false);

    act(() => ref.current!.focusField(field));
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(calledOn('blur')).toEqual([]);
    expect(calledOn('focus')).toEqual([label]);
  });
});
