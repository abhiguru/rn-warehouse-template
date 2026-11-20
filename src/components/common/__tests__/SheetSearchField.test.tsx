/**
 * The one search field of every searchable sheet (WH-219): a text input with a clear X once there is text and an
 * optional spinner, or a display-only search region when the sheet has its own keypad. Real component.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { SheetSearchField, type SheetSearchFieldProps } from '../SheetSearchField';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const renderField = async (props: Partial<SheetSearchFieldProps> = {}) => {
  const onClear = jest.fn();
  const onChangeText = jest.fn();
  const view = await render(
    <SheetSearchField value="" placeholder="Search customers" onClear={onClear} onChangeText={onChangeText} {...props} />,
  );
  return { onClear, onChangeText, ...view };
};

describe('SheetSearchField as an input', () => {
  it('is labelled by its placeholder, passes typing on, and shows no clear X while empty', async () => {
    const { onChangeText } = await renderField();
    const input = screen.getByLabelText('Search customers');
    expect(input).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Search customers')).toBe(input);
    await userEvent.setup().paste(input, 'amb');
    expect(onChangeText).toHaveBeenCalledWith('amb');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeOnTheScreen();
  });

  it('shows "Clear search" once there is text, and pressing it calls onClear', async () => {
    const { onClear } = await renderField({ value: 'amb' });
    expect(screen.getByLabelText('Search customers')).toHaveDisplayValue('amb');
    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(clear).toBeOnTheScreen();
    await userEvent.setup().press(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('shows the spinner only while loading, with its spoken label', async () => {
    const { unmount } = await renderField();
    expect(screen.queryByLabelText('Searching')).not.toBeOnTheScreen();
    await unmount();
    await renderField({ loading: true, loadingLabel: 'Searching' });
    expect(screen.getByLabelText('Searching')).toBeOnTheScreen();
  });

  it("uses the input component it is given (a sheet's own text input)", async () => {
    const Custom = jest.fn((props: Record<string, unknown>) => <TextInput {...props} testID="custom-input" />);
    await renderField({ InputComponent: Custom as never });
    expect(Custom).toHaveBeenCalled();
    expect(screen.getByTestId('custom-input')).toBeOnTheScreen();
  });
});

describe('SheetSearchField as a display (no onChangeText)', () => {
  it('draws no text input and reads as a search region with the placeholder while empty', async () => {
    await renderField({ onChangeText: undefined });
    expect(screen.queryByPlaceholderText('Search customers')).not.toBeOnTheScreen();
    expect(screen.getByText('Search customers')).toBeOnTheScreen();
    expect(screen.getByRole('search', { name: 'Search customers' })).toBeOnTheScreen();
  });

  it('shows the value, speaks displayLabel when given, and clears', async () => {
    const { onClear } = await renderField({ onChangeText: undefined, value: '12', displayLabel: 'Lot number 12' });
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(screen.getByRole('search', { name: 'Lot number 12' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
