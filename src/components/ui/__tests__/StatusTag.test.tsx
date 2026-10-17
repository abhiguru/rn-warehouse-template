/**
 * The status tag: its label is one line that gives way when the tag's box is
 * narrower than the label, so a tag never draws wider than the column it is in
 * (docs/STYLE_GUIDE.md §3.5, §4, §13.5). Four themes.
 *
 * This reads the style tree the test renderer builds. It cannot measure text, so
 * that the label really is cut at a given width on a phone is not covered here.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { BRANDS, getTokens, iconSize, radius, space, type Mode } from '@/theme/tokens';
import { StatusTag, type StatusKind } from '../StatusTag';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));
const KINDS: StatusKind[] = ['negative', 'critical', 'positive', 'informative', 'neutral'];
const LONG = 'Average: 121–240 days';

const flat = (node: ReactTestInstance) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const hosts = (root: ReactTestInstance, type: string) => root.findAll(node => (node.type as unknown) === type);

function render(brand: string, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

afterEach(() => setLanguage('en'));

describe.each(THEMES)('status tag in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('draws its label on the status tone, one line, with room to give way', () => {
    for (const kind of KINDS) {
      const tree = render(brand, mode, <StatusTag status={kind} label="Pending" />);
      const label = hosts(tree.root, 'Text')[0];
      expect(label.props.children).toBe('Pending');
      expect(label.props.numberOfLines).toBe(1);
      expect(flat(label)).toMatchObject({ color: t.status[kind].text, fontWeight: '600', flexShrink: 1 });
      // The English label has no shrink-to-fit of its own: its layout stays as it is.
      expect(label.props.adjustsFontSizeToFit).toBeUndefined();
      act(() => tree.unmount());
    }
  });

  it('with wrap, the label is not held to one line (English and Gujarati) and still gives way to its box', () => {
    for (const lang of ['en', 'gu'] as const) {
      setLanguage(lang);
      const tree = render(brand, mode, <StatusTag wrap status="neutral" label={LONG} />);
      const label = hosts(tree.root, 'Text')[0];
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.adjustsFontSizeToFit).toBeUndefined();
      expect(flat(label)).toMatchObject({ flexShrink: 1 });
      act(() => tree.unmount());
    }
  });

  it('keeps the look of the tag where there is room: the box, the padding and the icon are as they were', () => {
    const tree = render(brand, mode, <StatusTag status="positive" label="In stock" />);
    const box = tree.root.findAll(node => (node.type as unknown) === 'View' && node.props.accessibilityLabel === 'In stock')[0];
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
    const icon = hosts(tree.root, 'Icon')[0];
    expect(icon.props).toMatchObject({ name: 'check-circle', size: iconSize.xs, color: t.status.positive.text });
    act(() => tree.unmount());
  });

  it('keeps its box within a 150-wide column: nothing on the way to the label fixes a width, and only the label shrinks', () => {
    const tree = render(
      brand,
      mode,
      <View style={{ width: 150 }} testID="column">
        <StatusTag status="informative" label={LONG} style={{ maxWidth: '100%', marginTop: space.xs }} />
      </View>
    );
    const column = tree.root.findAll(node => (node.type as unknown) === 'View' && node.props.testID === 'column')[0];
    expect(flat(column).width).toBe(150);

    const box = tree.root.findAll(node => (node.type as unknown) === 'View' && node.props.accessibilityLabel === LONG)[0];
    // The box is as wide as its content up to its parent: it is capped at the parent's width, left-aligned.
    expect(flat(box)).toMatchObject({ alignSelf: 'flex-start', maxWidth: '100%' });
    const label = hosts(tree.root, 'Text')[0];
    expect(label.props.children).toBe(LONG);

    // From the column down to the label no element sets a width of its own or refuses to shrink,
    // except the icon, whose size is fixed (it must stay whole).
    const path: ReactTestInstance[] = [];
    for (let node: ReactTestInstance | null = label.parent; node && node !== column; node = node.parent) {
      if (typeof node.type === 'string') path.push(node);
    }
    expect(path).toContain(box);
    for (const node of path) {
      const style = flat(node);
      expect(style.width).toBeUndefined();
      expect(style.minWidth).toBeUndefined();
      expect(style.flexBasis).toBeUndefined();
      expect(style.flexShrink).not.toBe(0);
    }
    // The label can shrink and is cut to one line; it is the only child that can.
    expect(flat(label).flexShrink).toBe(1);
    expect(label.props.numberOfLines).toBe(1);
    expect(box.children.filter(child => typeof child !== 'string').map(child => (child as ReactTestInstance).type)).toEqual(
      expect.arrayContaining(['Icon'])
    );
    expect(flat(hosts(tree.root, 'Icon')[0]).flexShrink).toBeUndefined();
    act(() => tree.unmount());
  });

  it('shrinks the label to fit in Gujarati, as before, and keeps its flexShrink', () => {
    setLanguage('gu');
    const tree = render(brand, mode, <StatusTag status="neutral" label="બાકી" />);
    const label = hosts(tree.root, 'Text')[0];
    expect(label.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.9 });
    expect(flat(label).flexShrink).toBe(1);
    act(() => tree.unmount());
  });
});
