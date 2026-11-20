/**
 * The status tag: its label is one line that gives way when the tag's box is
 * narrower than the label, so a tag never draws wider than the column it is in
 * (docs/STYLE_GUIDE.md §3.5, §4, §13.5). Four themes.
 *
 * This reads the style tree the renderer builds. It cannot measure text, so
 * that the label really is cut at a given width on a phone is not covered here.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { render as renderScreen, screen } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { BRANDS, getTokens, iconSize, radius, space, type Mode } from '@/theme/tokens';
import { StatusTag, type StatusKind } from '../StatusTag';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));
const KINDS: StatusKind[] = ['negative', 'critical', 'positive', 'informative', 'neutral'];
const LONG = 'Average: 121–240 days';

type Host = ReturnType<typeof screen.getByText>;

const flat = (node: Host) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
// The icon is a stand-in host element ('Icon') with no role or text, so it is found by walking the rendered tree.
const hostsOf = (node: Host, type: string): Host[] => [
  ...(node.type === type ? [node] : []),
  ...node.children.flatMap(child => (typeof child === 'string' ? [] : hostsOf(child as Host, type))),
];
const icons = () => hostsOf(screen.root as Host, 'Icon');

async function render(brand: string, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  await renderScreen(element);
}

afterEach(() => setLanguage('en'));

describe.each(THEMES)('status tag in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('draws its label on the status tone, one line, with room to give way', async () => {
    for (const kind of KINDS) {
      await render(brand, mode, <StatusTag status={kind} label="Pending" />);
      const label = screen.getByText('Pending');
      expect(label).toHaveProp('numberOfLines', 1);
      expect(label).toHaveStyle({ color: t.status[kind].text, fontWeight: '600', flexShrink: 1 });
      // The English label has no shrink-to-fit of its own: its layout stays as it is.
      expect(label.props.adjustsFontSizeToFit).toBeUndefined();
      await screen.unmount();
    }
  });

  it('with wrap, the label is not held to one line (English and Gujarati) and still gives way to its box', async () => {
    for (const lang of ['en', 'gu'] as const) {
      setLanguage(lang);
      await render(brand, mode, <StatusTag wrap status="neutral" label={LONG} />);
      const label = screen.getByText(LONG);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.adjustsFontSizeToFit).toBeUndefined();
      expect(label).toHaveStyle({ flexShrink: 1 });
      await screen.unmount();
    }
  });

  it('keeps the look of the tag where there is room: the box, the padding and the icon are as they were', async () => {
    await render(brand, mode, <StatusTag status="positive" label="In stock" />);
    const box = screen.getByLabelText('In stock');
    expect(flat(box)).toEqual({
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: space.xs,
      paddingHorizontal: space.sm,
      paddingVertical: space.xxs,
      borderRadius: radius.field,
      backgroundColor: t.status.positive.background,
    });
    expect(icons()[0].props).toMatchObject({ name: 'check-circle', size: iconSize.xs, color: t.status.positive.text });
  });

  it('keeps its box within a 150-wide column: nothing on the way to the label fixes a width, and only the label shrinks', async () => {
    await render(
      brand,
      mode,
      <View style={{ width: 150 }} testID="column">
        <StatusTag status="informative" label={LONG} style={{ maxWidth: '100%', marginTop: space.xs }} />
      </View>
    );
    const column = screen.getByTestId('column');
    expect(flat(column).width).toBe(150);

    const box = screen.getByLabelText(LONG);
    // The box is as wide as its content up to its parent: it is capped at the parent's width, left-aligned.
    expect(flat(box)).toMatchObject({ alignSelf: 'flex-start', maxWidth: '100%' });
    const label = screen.getByText(LONG);

    // From the column down to the label no element sets a width of its own or refuses to shrink,
    // except the icon, whose size is fixed (it must stay whole).
    const path: Host[] = [];
    for (let node: Host | null = label.parent; node && node !== column; node = node.parent) path.push(node);
    expect(path).toContain(box);
    for (const node of path) {
      const style = flat(node);
      expect(style.width).toBeUndefined();
      expect(style.minWidth).toBeUndefined();
      expect(style.flexBasis).toBeUndefined();
      expect(style.flexShrink).not.toBe(0);
    }
    // The label can shrink and is cut to one line; it is the only child that can.
    expect(label).toHaveStyle({ flexShrink: 1 });
    expect(label).toHaveProp('numberOfLines', 1);
    expect(box.children.filter(child => typeof child !== 'string').map(child => (child as Host).type)).toEqual(
      expect.arrayContaining(['Icon'])
    );
    expect(flat(icons()[0]).flexShrink).toBeUndefined();
  });

  it('shows the value and lets a screen reader say the word (accessibilityLabel)', async () => {
    await render(brand, mode, <StatusTag status="neutral" label="15AB/F3" accessibilityLabel="Rack 15AB/F3" icon="view-grid-outline" />);
    const box = screen.getByLabelText('Rack 15AB/F3');
    expect(box).toHaveProp('accessible', true);
    expect(screen.getByText('15AB/F3')).toBeOnTheScreen();
  });

  it('shrinks the label to fit in Gujarati, as before, and keeps its flexShrink', async () => {
    setLanguage('gu');
    await render(brand, mode, <StatusTag status="neutral" label="બાકી" />);
    const label = screen.getByText('બાકી');
    expect(label.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.9 });
    expect(label).toHaveStyle({ flexShrink: 1 });
  });
});
