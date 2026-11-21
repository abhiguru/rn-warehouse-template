/**
 * The avatar draws the initials of src/utils/avatar.ts (tested in
 * src/utils/__tests__/avatar.test.ts) and keeps its colour keyed by the id, or
 * by the name when there is no id, in all four themes (docs/STYLE_GUIDE.md §3.2).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render as renderScreen, screen } from '@testing-library/react-native';
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

  async function render(props: React.ComponentProps<typeof Avatar>) {
    mockState = { theme: { preference: mode, brand } };
    await renderScreen(<Avatar {...props} />);
    // The circle is the root view (it has no role or text of its own); the initials are the only text in it.
    const circle = screen.root!;
    const text = screen.getByText(/.+/);
    const shown = [].concat(text.props.children).join('');
    const colours = { background: StyleSheet.flatten(circle.props.style).backgroundColor, text: StyleSheet.flatten(text.props.style).color };
    await screen.unmount();
    return { shown, ...colours };
  }

  it('draws the letters of a name that starts with an emoji', async () => {
    expect((await render({ name: '🧊 Ice Depot', id: 'c-ice' })).shown).toBe('ID');
    expect((await render({ name: '(A-One) Traders & Co.', id: 'c-aone' })).shown).toBe('AT');
    expect((await render({ name: 'Sunrise Agro Foods' })).shown).toBe('SA');
    expect((await render({ name: '' })).shown).toBe('?');
  });

  it('keeps the colour keyed by the id, or by the name when there is no id', async () => {
    const palette = t.avatar;
    const byId = await render({ name: '🧊 Ice Depot', id: 'c-ice' });
    expect(byId.background).toBe(palette[avatarIndex('c-ice', palette.length)]);
    expect(byId).toMatchObject(avatarColors('c-ice', t));
    // The same id gives the same colour whatever the name says (or its initials).
    expect((await render({ name: 'Ice Depot Ltd', id: 'c-ice' })).background).toBe(byId.background);

    const byName = await render({ name: '🧊 Ice Depot' });
    expect(byName).toMatchObject(avatarColors('🧊 Ice Depot', t));
    // A numeric id is keyed by its text, as before.
    expect(await render({ name: 'x', id: 42 })).toMatchObject(avatarColors(42, t));
  });
});
