/**
 * The one search field of every searchable sheet (WH-219): a text input with a clear X once there is text and an
 * optional spinner, or a display-only search region when the sheet has its own keypad. Real component.
 */
import React from 'react';
import { ActivityIndicator, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SheetSearchField, type SheetSearchFieldProps } from '../SheetSearchField';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

const render = async (props: Partial<SheetSearchFieldProps> = {}) => {
  const onClear = jest.fn();
  const onChangeText = jest.fn();
  await act(async () => {
    tree = create(<SheetSearchField value="" placeholder="Search customers" onClear={onClear} onChangeText={onChangeText} {...props} />);
  });
  return { onClear, onChangeText };
};
const clearX = () => tree!.root.findAll(n => n.props.accessibilityLabel === 'Clear search' && typeof n.props.onPress === 'function');
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));

describe('SheetSearchField as an input', () => {
  it('is labelled by its placeholder, passes typing on, and shows no clear X while empty', async () => {
    const { onChangeText } = await render();
    const input = tree!.root.findByType(TextInput);
    expect(input.props.accessibilityLabel).toBe('Search customers');
    expect(input.props.placeholder).toBe('Search customers');
    await act(async () => input.props.onChangeText('amb'));
    expect(onChangeText).toHaveBeenCalledWith('amb');
    expect(clearX()).toHaveLength(0);
  });

  it('shows "Clear search" once there is text, and pressing it calls onClear', async () => {
    const { onClear } = await render({ value: 'amb' });
    expect(tree!.root.findByType(TextInput).props.value).toBe('amb');
    expect(clearX()).toHaveLength(1);
    await act(async () => clearX()[0].props.onPress());
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows the spinner only while loading, with its spoken label', async () => {
    await render();
    expect(tree!.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    await act(async () => { tree!.unmount(); });
    await render({ loading: true, loadingLabel: 'Searching' });
    expect(tree!.root.findByType(ActivityIndicator).props.accessibilityLabel).toBe('Searching');
  });

  it('uses the input component it is given (a sheet\'s own text input)', async () => {
    const Custom = jest.fn((props: Record<string, unknown>) => <TextInput {...props} testID="custom-input" />);
    await render({ InputComponent: Custom as never });
    expect(tree!.root.findAll(n => n.props.testID === 'custom-input').length).toBeGreaterThan(0);
  });
});

describe('SheetSearchField as a display (no onChangeText)', () => {
  it('draws no text input and reads as a search region with the placeholder while empty', async () => {
    await render({ onChangeText: undefined });
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(0);
    expect(texts()).toContain('Search customers');
    const region = tree!.root.find(n => n.props.accessibilityRole === 'search');
    expect(region.props.accessibilityLabel).toBe('Search customers');
  });

  it('shows the value, speaks displayLabel when given, and clears', async () => {
    const { onClear } = await render({ onChangeText: undefined, value: '12', displayLabel: 'Lot number 12' });
    expect(texts()).toContain('12');
    expect(tree!.root.find(n => n.props.accessibilityRole === 'search').props.accessibilityLabel).toBe('Lot number 12');
    await act(async () => clearX()[0].props.onPress());
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
