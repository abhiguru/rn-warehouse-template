/**
 * The avatar draws the initials of src/utils/avatar.ts (tested in
 * src/utils/__tests__/avatar.test.ts) and keeps its colour keyed by the id, or
 * by the name when there is no id, in all four themes (docs/STYLE_GUIDE.md §3.2).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { avatarColors, avatarIndex } from '@/utils/avatar';
import { Avatar } from '../Avatar';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

describe.each(THEMES)('avatar in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  function render(props: React.ComponentProps<typeof Avatar>) {
    mockState = { theme: { preference: mode, brand } };
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Avatar {...props} />);
    });
    const circle = tree.root.findAll(node => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.borderRadius !== undefined)[0];
    const text = tree.root.findAll(node => (node.type as unknown) === 'Text')[0];
    const shown = [].concat(text.props.children).join('');
    const colours = { background: StyleSheet.flatten(circle.props.style).backgroundColor, text: StyleSheet.flatten(text.props.style).color };
    act(() => tree.unmount());
    return { shown, ...colours };
  }

  it('draws the letters of a name that starts with an emoji', () => {
    expect(render({ name: '🧊 Ice Depot', id: 'c-ice' }).shown).toBe('ID');
    expect(render({ name: '(A-One) Traders & Co.', id: 'c-aone' }).shown).toBe('AT');
    expect(render({ name: 'Sunrise Agro Foods' }).shown).toBe('SA');
    expect(render({ name: '' }).shown).toBe('?');
  });

  it('keeps the colour keyed by the id, or by the name when there is no id', () => {
    const palette = t.avatar;
    const byId = render({ name: '🧊 Ice Depot', id: 'c-ice' });
    expect(byId.background).toBe(palette[avatarIndex('c-ice', palette.length)]);
    expect(byId).toMatchObject(avatarColors('c-ice', t));
    // The same id gives the same colour whatever the name says (or its initials).
    expect(render({ name: 'Ice Depot Ltd', id: 'c-ice' }).background).toBe(byId.background);

    const byName = render({ name: '🧊 Ice Depot' });
    expect(byName).toMatchObject(avatarColors('🧊 Ice Depot', t));
    // A numeric id is keyed by its text, as before.
    expect(render({ name: 'x', id: 42 })).toMatchObject(avatarColors(42, t));
  });
});
