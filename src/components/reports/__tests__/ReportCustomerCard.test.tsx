/**
 * The customer cell of the report screens: where its status tag sits, what a
 * screen reader reads, and how many lines its subtitle may use, in all four
 * themes (docs/STYLE_GUIDE.md §4, §11.4, §13.6). At a large text size or with a
 * long name, the value and the share button move under the name (SR-O10).
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { StatusTag } from '@/components/ui';
import { ReportCustomerCard, type ReportCustomerCardProps } from '../ReportCustomerCard';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }), router: { back: jest.fn() } }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

const TAG = { status: 'informative', label: 'Average: 121–240 days' } as const;
const A11Y_WITH_TAG = 'Apex Cold Storage Traders, Average age 353 days, 1,200 units, Average: 121–240 days';

function render(brand: string, mode: Mode, props: Partial<ReportCustomerCardProps> = {}) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ReportCustomerCard
        title="Apex Cold Storage Traders"
        subtitle="Average age 353 days"
        value={1200}
        onPress={jest.fn()}
        customerId="c-apex"
        {...props}
      />
    );
  });
  return tree;
}

const flat = (node: ReactTestInstance) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const textOf = (node: ReactTestInstance) => [].concat(node.props.children).join('');
const hostTexts = (root: ReactTestInstance) => root.findAll(n => (n.type as unknown) === 'Text');

/** The row (the pressable's own view), and its direct children: avatar, content, value, chevron. */
function columns(tree: ReactTestRenderer, label: string) {
  const row = tree.root.findAll(n => (n.type as unknown) === 'View' && n.props.accessibilityLabel === label && n.props.accessibilityRole === 'button')[0];
  const parts = row.children.filter((child): child is ReactTestInstance => typeof child !== 'string' && (child.type as { name?: string }).name !== 'PressabilityDebugView');
  // The test renderer shows the mocked View as a component around the host view: take the host.
  const holding = (text: string) => parts.find(part => hostTexts(part).some(node => textOf(node) === text))!.findAll(node => typeof node.type === 'string')[0];
  return { row, parts, content: holding('Apex Cold Storage Traders'), value: holding('1,200') };
}

// Jest's window has a text size of 2; the side-by-side card is the one of ordinary text sizes.
const WINDOW = Dimensions.get('window');
const atTextSize = (fontScale: number) => Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale } });
beforeEach(() => atTextSize(1));
afterEach(() => {
  setLanguage('en');
  Dimensions.set({ window: WINDOW });
});

describe.each(THEMES)('report customer card in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('draws the status tag in the content column, under the subtitle, and not in the value column', () => {
    const tree = render(brand, mode, { status: TAG });
    const { parts, content, value } = columns(tree, A11Y_WITH_TAG);
    // Avatar, content, value, chevron (the pressable's own debug view is not the card's).
    expect(parts.map(part => (typeof part.type === 'string' ? part.type : (part.type as { name?: string }).name))).toEqual(['Avatar', 'View', 'View', 'Icon']);

    expect(content.findAllByType(StatusTag)).toHaveLength(1);
    expect(value.findAllByType(StatusTag)).toHaveLength(0);
    // The value column holds the value and its label, nothing else.
    expect(hostTexts(value).map(textOf)).toEqual(['1,200', 'units']);
    expect(hostTexts(content).map(textOf)).toEqual(expect.arrayContaining(['Apex Cold Storage Traders', 'Average age 353 days', TAG.label]));

    // Title, then subtitle, then the tag: the tag is the last thing in the column.
    const order = content.children.map(child => (typeof child === 'string' ? child : child.type));
    expect(order[order.length - 1]).toBe(StatusTag);
    const names = content.findAll(n => (n.type as unknown) === 'Text').map(textOf);
    expect(names.indexOf('Average age 353 days')).toBeLessThan(names.indexOf(TAG.label));

    // On a line of its own, at the left edge of the column, and never wider than it.
    const tag = content.findByType(StatusTag);
    expect(flat(tag.findAll(n => (n.type as unknown) === 'View')[0])).toMatchObject({
      alignSelf: 'flex-start',
      maxWidth: '100%',
      backgroundColor: t.status.informative.background,
    });
    act(() => tree.unmount());
  });

  it('keeps the value column as wide as the value and its label', () => {
    const tree = render(brand, mode, { status: TAG });
    const { value } = columns(tree, A11Y_WITH_TAG);
    const style = flat(value);
    expect(style).toMatchObject({ alignItems: 'flex-end', flexShrink: 0 });
    // It does not stretch (no flex grow, no set width): the content column takes the rest.
    expect(style.flex).toBeUndefined();
    expect(style.flexGrow).toBeUndefined();
    expect(style.width).toBeUndefined();
    const { content } = columns(tree, A11Y_WITH_TAG);
    expect(flat(content)).toMatchObject({ flex: 1 });
    act(() => tree.unmount());
  });

  it('reads the same label as before, the tag last', () => {
    const tagged = render(brand, mode, { status: TAG });
    expect(columns(tagged, A11Y_WITH_TAG).row.props.accessibilityLabel).toBe(A11Y_WITH_TAG);
    act(() => tagged.unmount());

    const plain = render(brand, mode);
    const label = 'Apex Cold Storage Traders, Average age 353 days, 1,200 units';
    expect(columns(plain, label).row.props.accessibilityLabel).toBe(label);
    // No tag, no tag view.
    expect(plain.root.findAllByType(StatusTag)).toHaveLength(0);
    act(() => plain.unmount());

    const given = render(brand, mode, { status: TAG, accessibilityLabel: 'Open Apex' });
    expect(given.root.findAll(n => n.props.accessibilityLabel === 'Open Apex' && typeof n.props.onPress === 'function').length).toBeGreaterThan(0);
    act(() => given.unmount());
  });

  it('lets the subtitle use two lines unless the screen asks for another limit', () => {
    const subtitleLimit = (props: Partial<ReportCustomerCardProps>) => {
      const tree = render(brand, mode, { subtitle: '6 items · 38 GRNs', ...props });
      const limit = hostTexts(tree.root).find(node => textOf(node) === '6 items · 38 GRNs')!.props.numberOfLines;
      act(() => tree.unmount());
      return limit;
    };
    expect(subtitleLimit({})).toBe(2);
    expect(subtitleLimit({ subtitleLines: 3 })).toBe(3);
    expect(subtitleLimit({ subtitleLines: 1 })).toBe(1);
    // The title keeps its two lines.
    const tree = render(brand, mode);
    expect(hostTexts(tree.root).find(node => textOf(node) === 'Apex Cold Storage Traders')!.props.numberOfLines).toBe(2);
    act(() => tree.unmount());
  });

  it('stacks the facts, two lines each, in Gujarati, with the tag still under them', () => {
    setLanguage('gu');
    const tree = render(brand, mode, { subtitle: ['6 items', '38 GRNs'], status: TAG });
    const tag = tree.root.findByType(StatusTag);
    // The tag's parent is the content column: it holds the name and both facts too.
    const content = tag.parent!;
    expect(flat(content)).toMatchObject({ flex: 1 });
    const facts = hostTexts(content).filter(node => ['6 items', '38 GRNs'].includes(textOf(node)));
    expect(facts.map(textOf)).toEqual(['6 items', '38 GRNs']);
    expect(facts.map(node => node.props.numberOfLines)).toEqual([2, 2]);
    expect(content.children[content.children.length - 1]).toBe(tag);
    act(() => tree.unmount());
  });
});

describe('report customer card, a long name or a large text size', () => {
  // 40 characters: wider than a name keeps beside a quantity and a PDF button.
  const LONG = 'Sunrise Agro Foods and Cold Chain Traders';
  const SHORT = 'Apex Cold Storage Traders';

  /** Where the value is: in a column of its own beside the name, or in the name's column under it. */
  function layoutOf(props: Partial<ReportCustomerCardProps>) {
    const tree = render('orange', 'light', { onShare: jest.fn(), ...props });
    const title = props.title ?? SHORT;
    const name = hostTexts(tree.root).find(node => textOf(node) === title)!;
    // 1,200 in either language's digits.
    const value = hostTexts(tree.root).find(node => /^[0-9૦-૯,]+$/.test(textOf(node)))!;
    // The name's column: the nearest host view around the name that takes the row's free width.
    let column: ReactTestInstance | null = name.parent;
    while (column && !(typeof column.type === 'string' && flat(column).flex === 1)) column = column.parent;
    const row = tree.root.findAll(n => (n.type as unknown) === 'View' && n.props.accessibilityRole === 'button' && typeof n.props.accessibilityLabel === 'string')[0];
    const share = tree.root.findAll(n => n.props.accessibilityLabel === `Share PDF for ${title}` && typeof n.props.onPress === 'function');
    const shareInsideRow = row.findAll(n => n.props.accessibilityLabel === `Share PDF for ${title}`).length > 0;
    const result = {
      valueUnderName: column!.findAll(node => node === value).length > 0,
      titleLines: name.props.numberOfLines,
      label: row.props.accessibilityLabel as string,
      shares: share.length > 0,
      shareInsideRow,
    };
    act(() => tree.unmount());
    return result;
  }

  it('keeps the value beside the name for a short name at an ordinary text size', () => {
    expect(layoutOf({ title: SHORT })).toEqual({
      valueUnderName: false,
      titleLines: 2,
      label: `${SHORT}, Average age 353 days, 1,200 units`,
      shares: true,
      shareInsideRow: false,
    });
    atTextSize(1.29);
    expect(layoutOf({ title: SHORT }).valueUnderName).toBe(false);
  });

  it('moves the value under the name at 1.3 times the text size, the name on up to four lines', () => {
    atTextSize(1.3);
    expect(layoutOf({ title: SHORT })).toEqual({
      valueUnderName: true,
      titleLines: 4,
      // The label still has the whole name and the figure, read once.
      label: `${SHORT}, Average age 353 days, 1,200 units`,
      shares: true,
      // The share button is still a target of its own, never inside the row's.
      shareInsideRow: false,
    });
  });

  // Android hands the text size over as a 32-bit float: its 1.3 step arrives as 1.2999999523162842
  // (seen on a Samsung A34), which must stack as 1.3 does; 1.2 stays side by side.
  it.each([
    [1.2999999523162842, true],
    [Math.fround(1.3), true],
    [1.2, false],
  ])('at the text size %d the value is under the name: %s', (fontScale, under) => {
    atTextSize(fontScale);
    const layout = layoutOf({ title: SHORT });
    expect(layout.valueUnderName).toBe(under);
    expect(layout.titleLines).toBe(under ? 4 : 2);
  });

  it('moves the value under a name longer than 28 characters at any text size, in Gujarati too', () => {
    expect([...LONG].length).toBeGreaterThan(28);
    expect(layoutOf({ title: LONG })).toEqual({
      valueUnderName: true,
      titleLines: 4,
      label: `${LONG}, Average age 353 days, 1,200 units`,
      shares: true,
      shareInsideRow: false,
    });
    setLanguage('gu');
    const gujarati = layoutOf({ title: 'સૂર્યોદય ઍગ્રો ફૂડ્સ ઍન્ડ કોલ્ડ ચેઇન ટ્રેડર્સ', valueLabel: 'નંગ' });
    expect(gujarati.valueUnderName).toBe(true);
    expect(gujarati.label).toBe('સૂર્યોદય ઍગ્રો ફૂડ્સ ઍન્ડ કોલ્ડ ચેઇન ટ્રેડર્સ, Average age 353 days, ૧,૨૦૦ નંગ');
  });
});

describe('report customer card, the word beside the figure', () => {
  it('reads "unit" for a stock of one and "units" for more, in the label too, unless the screen names its own', () => {
    const one = render('orange', 'light', { value: 1 });
    expect(hostTexts(one.root).map(textOf)).toEqual(expect.arrayContaining(['1', 'unit']));
    expect(hostTexts(one.root).map(textOf)).not.toContain('units');
    expect(one.root.findAll(n => n.props.accessibilityLabel === 'Apex Cold Storage Traders, Average age 353 days, 1 unit').length).toBeGreaterThan(0);
    act(() => one.unmount());

    const many = render('orange', 'light', { value: 2 });
    expect(hostTexts(many.root).map(textOf)).toEqual(expect.arrayContaining(['2', 'units']));
    act(() => many.unmount());

    const own = render('orange', 'light', { value: 1, valueLabel: 'in stock' });
    expect(hostTexts(own.root).map(textOf)).toEqual(expect.arrayContaining(['1', 'in stock']));
    act(() => own.unmount());
  });
});
