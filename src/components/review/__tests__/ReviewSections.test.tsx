/**
 * The shared Review sections (style guide §14.3): the toggle, the label, the closed line, the kept-mounted body, the
 * Edit pencil, one section open at a time, Reduce Motion, the key-values at large text, and all four themes.
 */
import React from 'react';
import { Dimensions, LayoutAnimation, Text, View } from 'react-native';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { useReducedMotion } from 'react-native-reanimated';
import { BRANDS, getTokens, touchTarget, type Brand, type Mode } from '@/theme/tokens';
import { ReviewCard, ReviewKeyBlock, ReviewKeyValue, ReviewKeyValues, ReviewSection, useReviewSections } from '../ReviewSections';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  jest.restoreAllMocks();
  (useReducedMotion as jest.Mock).mockReturnValue(false);
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
});

function renderIn(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return tree;
}
const render = (element: React.ReactElement) => renderIn('orange', 'light', element);
const byId = (tree: ReactTestRenderer, id: string) => tree.root.find((n) => n.props.testID === id && 'onPress' in n.props);
const hosts = (tree: ReactTestRenderer, id: string) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
const exists = (tree: ReactTestRenderer, id: string) => hosts(tree, id).length > 0;
const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([] as unknown[]).concat(style as never).flat(Infinity as 1).filter(Boolean));
const texts = (node: ReactTestInstance) => node.findAll((n) => (n.type as unknown) === 'Text').map((n) => n.children.join(''));

function Demo({ initial = 'a' as 'a' | 'b' | null }: { initial?: 'a' | 'b' | null }) {
  const { open, toggle } = useReviewSections<'a' | 'b'>(initial);
  return (
    <ReviewCard testID="demo-card">
      <ReviewSection id="a" testIDPrefix="demo" title="Alpha" count={3} closedLine="A summary" open={open === 'a'} onToggle={toggle as (id: string) => void} first>
        <Text>Alpha body</Text>
      </ReviewSection>
      <ReviewSection id="b" testIDPrefix="demo" title="Beta" closedLine="B summary" onEdit={jest.fn()} editLabel="Edit beta" open={open === 'b'} onToggle={toggle as (id: string) => void}>
        <Text>Beta body</Text>
      </ReviewSection>
    </ReviewCard>
  );
}

describe('ReviewSection', () => {
  it('is a button with its expanded state, and tapping it opens one and closes the other', () => {
    const tree = render(<Demo />);
    expect(byId(tree, 'demo-section-a').props.accessibilityRole).toBe('button');
    expect(byId(tree, 'demo-section-a').props.accessibilityState).toEqual({ expanded: true });
    expect(byId(tree, 'demo-section-b').props.accessibilityState).toEqual({ expanded: false });
    act(() => byId(tree, 'demo-section-b').props.onPress());
    expect(byId(tree, 'demo-section-a').props.accessibilityState).toEqual({ expanded: false });
    expect(byId(tree, 'demo-section-b').props.accessibilityState).toEqual({ expanded: true });
    act(() => byId(tree, 'demo-section-b').props.onPress());
    expect(byId(tree, 'demo-section-b').props.accessibilityState).toEqual({ expanded: false });
  });

  it('labels the toggle with the title, the count, the tag and the closed line', () => {
    const tree = render(
      <ReviewSection id="r" testIDPrefix="x" title="Rates" count={2} tag="1 without a rate" closedLine="All priced" open={false} onToggle={jest.fn()}>
        <Text>body</Text>
      </ReviewSection>,
    );
    expect(byId(tree, 'x-section-r').props.accessibilityLabel).toBe('Rates, 2, 1 without a rate, All priced');
    expect(texts(tree.root)).toEqual(expect.arrayContaining(['RATES (2)', '1 without a rate']));
  });

  it('shows the closed line only while the section is closed', () => {
    const tree = render(<Demo />);
    expect(exists(tree, 'demo-section-a-line')).toBe(false);
    expect(byId(tree, 'demo-section-a').props.accessibilityLabel).toBe('Alpha, 3');
    expect(exists(tree, 'demo-section-b-line')).toBe(true);
    expect(texts(hosts(tree, 'demo-section-b-line')[0])).toEqual(['B summary']);
    act(() => byId(tree, 'demo-section-a').props.onPress());
    expect(exists(tree, 'demo-section-a-line')).toBe(true);
  });

  it('keeps a closed body mounted but hidden', () => {
    const tree = render(<Demo />);
    const closed = hosts(tree, 'demo-body-b')[0];
    expect(flat(closed.props.style).display).toBe('none');
    expect(texts(closed)).toContain('Beta body');
    expect(flat(hosts(tree, 'demo-body-a')[0].props.style).display).toBeUndefined();
  });

  it('draws Edit as its own icon-only target beside the toggle, not inside it', () => {
    const tree = render(<Demo />);
    const edit = byId(tree, 'demo-section-b-edit');
    expect(edit.props.accessibilityLabel).toBe('Edit beta');
    expect(edit.props.accessibilityRole).toBe('button');
    expect(flat(edit.props.style({ pressed: false }))).toMatchObject({ width: touchTarget, height: touchTarget });
    expect(texts(edit)).toEqual([]);
    expect(exists(tree, 'demo-section-a-edit')).toBe(false);
    // Edit is not a child of the toggle, so a tap on it never reaches the toggle.
    const toggle = byId(tree, 'demo-section-b');
    expect(toggle.findAll((n) => n.props.testID === 'demo-section-b-edit')).toHaveLength(0);
  });
});

describe('useReviewSections', () => {
  const Probe = React.forwardRef<{ api: ReturnType<typeof useReviewSections<'a' | 'b'>> }>((_p, ref) => {
    const api = useReviewSections<'a' | 'b'>('a');
    React.useImperativeHandle(ref, () => ({ api }));
    return null;
  });
  Probe.displayName = 'Probe';

  it('keeps one section open: toggle swaps or closes, show only opens', () => {
    const ref = React.createRef<{ api: ReturnType<typeof useReviewSections<'a' | 'b'>> }>();
    render(<Probe ref={ref} />);
    expect(ref.current!.api.open).toBe('a');
    act(() => ref.current!.api.toggle('b'));
    expect(ref.current!.api.open).toBe('b');
    act(() => ref.current!.api.show('b'));
    expect(ref.current!.api.open).toBe('b');
    act(() => ref.current!.api.toggle('b'));
    expect(ref.current!.api.open).toBeNull();
    act(() => ref.current!.api.show('a'));
    expect(ref.current!.api.open).toBe('a');
  });

  it('animates a change as an expanding section, and not under Reduce Motion', () => {
    const configure = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
    const tree = render(<Demo />);
    act(() => byId(tree, 'demo-section-b').props.onPress());
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure.mock.calls[0][0]).toMatchObject({ duration: 200 });

    configure.mockClear();
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const reduced = render(<Demo />);
    act(() => byId(reduced, 'demo-section-b').props.onPress());
    expect(byId(reduced, 'demo-section-b').props.accessibilityState).toEqual({ expanded: true });
    expect(configure).not.toHaveBeenCalled();
  });
});

describe('ReviewKeyValue', () => {
  const rows = (
    <ReviewKeyValues>
      <ReviewKeyValue label="Customer" value="Fictional Traders" first />
      <ReviewKeyValue label="Date" value="9 Oct 2026" emphasized />
    </ReviewKeyValues>
  );
  const row = (tree: ReactTestRenderer, label: string) => tree.root.find((n) => n.props.accessibilityLabel?.startsWith(`${label},`) && n.props.accessible);

  it('puts the label and the value side by side at font scale 1 and speaks both', () => {
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
    const tree = render(rows);
    expect(flat(row(tree, 'Customer').props.style).flexDirection).toBe('row');
    expect(row(tree, 'Customer').props.accessibilityLabel).toBe('Customer, Fictional Traders');
  });

  it('stacks the label over the value from font scale 1.5', () => {
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1.5 } });
    const tree = render(rows);
    expect(flat(row(tree, 'Customer').props.style).flexDirection).toBe('column');
    const value = tree.root.find((n) => (n.type as unknown) === 'Text' && n.children.join('') === 'Fictional Traders');
    expect(flat(value.props.style).textAlign).toBe('left');
  });

  it('takes a node as the value, without an invented spoken label', () => {
    const tree = render(<ReviewKeyValue label="Leon" value={<View testID="tag" />} />);
    expect(tree.root.find((n) => n.props.accessible).props.accessibilityLabel).toBeUndefined();
  });
});

describe.each(BRANDS.flatMap((brand) => (['light', 'dark'] as Mode[]).map((mode) => [brand, mode] as const)))('%s %s', (brand, mode) => {
  it('draws the card, the open fill, the divider and the title in the theme', () => {
    const t = getTokens(brand, mode);
    const tree = renderIn(brand, mode, <Demo />);
    const card = hosts(tree, 'demo-card')[0];
    expect(flat(card.props.style)).toMatchObject({ backgroundColor: t.surface.card, borderColor: t.table.outline });
    const blocks = tree.root.findAll((n) => (n.type as unknown) === 'View' && n.props.style && flat(n.props.style).backgroundColor === t.table.insetFill);
    expect(blocks.length).toBeGreaterThan(0);
    let second = hosts(tree, 'demo-body-b')[0].parent!;
    while (second.parent && flat(second.props.style).borderTopWidth === undefined) second = second.parent;
    expect(flat(second.props.style)).toMatchObject({ borderTopColor: t.table.separator, borderTopWidth: 1 });
    const title = tree.root.find((n) => (n.type as unknown) === 'Text' && n.children.join('') === 'ALPHA (3)');
    expect(flat(title.props.style).color).toBe(t.text.primary);
  });
});

describe('ReviewKeyBlock', () => {
  const NOTE = 'Deliver after 6 pm to the side gate. Call the supervisor before unloading.';

  it.each([[1], [1.5]])('puts the label above the value, left-aligned, at font scale %s', (fontScale) => {
    Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale } });
    const tree = render(
      <ReviewKeyValues>
        <ReviewKeyValue label="Date" value="9 Oct 2026" first />
        <ReviewKeyBlock label="Notes" value={NOTE} />
      </ReviewKeyValues>,
    );
    const block = tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityLabel === `Notes, ${NOTE}`);
    expect(texts(block)).toEqual(['Notes', NOTE]);
    expect(flat(block.props.style).flexDirection).toBeUndefined();
    const value = block.findAll((n) => (n.type as unknown) === 'Text' && n.children.join('') === NOTE)[0];
    expect(flat(value.props.style).textAlign).toBe('left');
    // The plain key-value beside it is right-aligned at font scale 1 (and only stacks from 1.5).
    const date = tree.root.findAll((n) => (n.type as unknown) === 'Text' && n.children.join('') === '9 Oct 2026')[0];
    expect(flat(date.props.style).textAlign).toBe(fontScale >= 1.5 ? 'left' : 'right');
  });

  it('has a divider above it unless it is first', () => {
    const tree = render(
      <ReviewKeyValues>
        <ReviewKeyBlock label="Notes" value="One" first />
        <ReviewKeyBlock label="Address" value="Two" />
      </ReviewKeyValues>,
    );
    const borderTop = (label: string) => flat(tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityLabel?.startsWith(label)).props.style).borderTopWidth;
    expect(borderTop('Notes')).toBeUndefined();
    expect(borderTop('Address')).toBeGreaterThan(0);
  });
});
