/**
 * WH-227: ui/Input gains additive `hardLimit`, `prefix` and a multiline layout. Real Input; callers that pass
 * none of the new props keep the old behaviour (soft limit with an error, no prefix, single-line layout).
 */
import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Input, type InputProps } from '../ui/Input';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

let tree: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

const render = async (props: Partial<InputProps> = {}) => {
  const onChangeText = jest.fn();
  await act(async () => {
    tree = create(<Input label="Name" value="abc" onChangeText={onChangeText} {...props} />);
  });
  return onChangeText;
};
const field = () => tree!.root.findByType(TextInput);
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('hardLimit', () => {
  it('gives the TextInput the maxLength, so typing stops at it', async () => {
    await render({ maxLength: 5, hardLimit: true });
    expect(field().props.maxLength).toBe(5);
  });

  it('without hardLimit the TextInput has no maxLength (the soft limit stays)', async () => {
    await render({ maxLength: 5 });
    expect(field().props.maxLength).toBeUndefined();
  });

  it('hardLimit without a maxLength limits nothing', async () => {
    await render({ hardLimit: true });
    expect(field().props.maxLength).toBeUndefined();
  });
});

describe('prefix', () => {
  it('is shown, hidden from the screen reader, and is not part of the value', async () => {
    const onChangeText = await render({ prefix: '+91', value: '90000' });
    const shown = tree!.root.findAllByType(Text).find(n => n.props.children === '+91');
    expect(shown).toBeDefined();
    expect(shown!.props.accessibilityElementsHidden).toBe(true);
    expect(shown!.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(field().props.value).toBe('90000');
    await act(async () => { field().props.onChangeText('90001'); });
    expect(onChangeText).toHaveBeenCalledWith('90001');
  });

  it('is not drawn when none is given', async () => {
    await render();
    expect(texts()).not.toContain('+91');
  });
});

describe('multiline layout', () => {
  it('lays a multiline field out from the top with room for at least two lines', async () => {
    await render({ multiline: true });
    const input = flat(field().props.style);
    expect(input.textAlignVertical).toBe('top');
    expect(input.minHeight).toBeGreaterThan(0);
    const container = tree!.root.findAll(n => (n.type as unknown) === 'View' && flat(n.props.style).alignItems === 'flex-start');
    expect(container.length).toBeGreaterThan(0);
  });

  it('a single-line field keeps the old layout', async () => {
    await render();
    const input = flat(field().props.style);
    expect(input.textAlignVertical).not.toBe('top');
    expect(input.minHeight).toBeUndefined();
    const container = tree!.root.findAll(n => (n.type as unknown) === 'View' && flat(n.props.style).alignItems === 'flex-start');
    expect(container.length).toBe(0);
  });
});

describe('callers without the new props', () => {
  it('still show the soft length error when typing past maxLength', async () => {
    const onChangeText = await render({ maxLength: 5, value: 'abcdef', showCharacterCount: true });
    expect(field().props.maxLength).toBeUndefined();
    expect(texts().some(text => /too long|5/i.test(text) && text !== 'Name')).toBe(true);
    expect(texts()).toContain('6/5');
    await act(async () => { field().props.onChangeText('abcdefg'); });
    expect(onChangeText).toHaveBeenCalledWith('abcdefg');
  });
});
