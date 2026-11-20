/**
 * WH-227: ui/Input gains additive `hardLimit`, `prefix` and a multiline layout. Real Input; callers that pass
 * none of the new props keep the old behaviour (soft limit with an error, no prefix, single-line layout).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { Input, type InputProps } from '../ui/Input';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const renderInput = async (props: Partial<InputProps> = {}) => {
  const onChangeText = jest.fn();
  const result = await render(<Input label="Name" value="abc" onChangeText={onChangeText} {...props} />);
  return { onChangeText, ...result };
};
const field = () => screen.getByLabelText('Name');
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('hardLimit', () => {
  it('gives the TextInput the maxLength, so typing stops at it', async () => {
    await renderInput({ maxLength: 5, hardLimit: true });
    expect(field()).toHaveProp('maxLength', 5);
  });

  it('without hardLimit the TextInput has no maxLength (the soft limit stays)', async () => {
    await renderInput({ maxLength: 5 });
    expect(field().props.maxLength).toBeUndefined();
  });

  it('hardLimit without a maxLength limits nothing', async () => {
    await renderInput({ hardLimit: true });
    expect(field().props.maxLength).toBeUndefined();
  });
});

describe('prefix', () => {
  it('is shown, hidden from the screen reader, and is not part of the value', async () => {
    const user = userEvent.setup({ delay: 0 });
    const { onChangeText } = await renderInput({ prefix: '+91', value: '90000' });
    // Hidden from the screen reader, so only a query that includes hidden elements finds it.
    expect(screen.queryByText('+91')).not.toBeOnTheScreen();
    const shown = screen.getByText('+91', { includeHiddenElements: true });
    expect(shown).toHaveProp('accessibilityElementsHidden', true);
    expect(shown).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(field()).toHaveDisplayValue('90000');
    // paste: type mis-reports on a controlled input
    await user.clear(field());
    await user.paste(field(), '90001');
    expect(onChangeText).toHaveBeenLastCalledWith('90001');
  });

  it('is not drawn when none is given', async () => {
    await renderInput();
    expect(screen.queryByText('+91', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });
});

describe('multiline layout', () => {
  it('lays a multiline field out from the top with room for at least two lines', async () => {
    await renderInput({ multiline: true });
    expect(field()).toHaveStyle({ textAlignVertical: 'top' });
    expect(flat(field().props.style).minHeight).toBeGreaterThan(0);
    expect(field().parent).toHaveStyle({ alignItems: 'flex-start' });
  });

  it('a single-line field keeps the old layout', async () => {
    await renderInput();
    expect(field()).not.toHaveStyle({ textAlignVertical: 'top' });
    expect(flat(field().props.style).minHeight).toBeUndefined();
    expect(field().parent).not.toHaveStyle({ alignItems: 'flex-start' });
  });
});

describe('callers without the new props', () => {
  it('still show the soft length error when typing past maxLength', async () => {
    const user = userEvent.setup({ delay: 0 });
    const { onChangeText } = await renderInput({ maxLength: 5, value: 'abcdef', showCharacterCount: true });
    expect(field().props.maxLength).toBeUndefined();
    expect(screen.getByText('Use 5 characters or fewer.')).toBeOnTheScreen();
    expect(screen.getByText('6/5')).toBeOnTheScreen();
    await user.paste(field(), 'abcdefg');
    expect(onChangeText).toHaveBeenCalledWith('abcdefg');
  });
});

describe('last (WH-227)', () => {
  // The outermost view of the field block.
  const outer = () => flat(screen.root!.props.style);
  it('removes only the bottom margin of the field', async () => {
    const first = await renderInput();
    const normal = outer();
    await first.unmount();
    await renderInput({ last: true });
    const last = outer();
    expect(normal.marginBottom).toBeGreaterThan(0);
    expect(last.marginBottom).toBe(0);
    expect({ ...last, marginBottom: normal.marginBottom }).toEqual(normal);
  });

  it('is off by default, so other callers keep their bottom margin', async () => {
    await renderInput({ last: false });
    expect(outer().marginBottom).toBeGreaterThan(0);
  });
});
