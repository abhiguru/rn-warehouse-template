/**
 * The customer cell of the report screens: where its status tag sits, what a
 * screen reader reads, and how many lines its subtitle may use, in all four
 * themes (docs/STYLE_GUIDE.md §4, §11.4, §13.6). At a large text size or with a
 * long name, the value and the share button move under the name (SR-O10).
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { render as renderScreen, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { setLanguage } from '@/i18n';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { ReportCustomerCard, type ReportCustomerCardProps } from '../ReportCustomerCard';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

async function render(brand: string, mode: Mode, props: Partial<ReportCustomerCardProps> = {}) {
  mockState = { theme: { preference: mode, brand } };
  await renderScreen(
    <ReportCustomerCard
      title="Apex Cold Storage Traders"
      subtitle="Average age 353 days"
      value={1200}
      onPress={jest.fn()}
      customerId="c-apex"
      {...props}
    />
  );
}

const flat = (node: TestInstance) => (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const textOf = (node: TestInstance) => [].concat(node.props.children).join('');
const hostTexts = (root: TestInstance) => root.queryAll(node => node.type === 'Text');
const elements = (node: TestInstance): TestInstance[] => node.children.filter((child): child is TestInstance => typeof child !== 'string');

/** The row (the pressable's own view) and its direct children: avatar, content, value, chevron. */
function columns(label: string) {
  const row = screen.getByRole('button', { name: label });
  const parts = elements(row);
  const holding = (text: string) => parts.find(part => hostTexts(part).some(node => textOf(node) === text))!;
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

  it('draws the status tag in the content column, under the subtitle, and not in the value column', async () => {
    await render(brand, mode, { status: TAG });
    const { parts, content, value } = columns(A11Y_WITH_TAG);
    // Avatar, content, value, chevron.
    expect(parts.map(part => part.type)).toEqual(['View', 'View', 'View', 'Icon']);

    expect(hostTexts(content).map(textOf)).toContain(TAG.label);
    expect(hostTexts(value).map(textOf)).not.toContain(TAG.label);
    // The value column holds the value and its label, nothing else.
    expect(hostTexts(value).map(textOf)).toEqual(['1,200', 'units']);
    expect(hostTexts(content).map(textOf)).toEqual(expect.arrayContaining(['Apex Cold Storage Traders', 'Average age 353 days', TAG.label]));

    // Title, then subtitle, then the tag: the tag is the last thing in the column.
    const names = hostTexts(content).map(textOf);
    expect(names.indexOf('Average age 353 days')).toBeLessThan(names.indexOf(TAG.label));
    const tag = elements(content).at(-1)!;
    expect(hostTexts(tag).map(textOf)).toEqual([TAG.label]);
    expect(elements(content).filter(child => hostTexts(child).some(node => textOf(node) === TAG.label)).length).toBe(1);

    // On a line of its own, at the left edge of the column, and never wider than it.
    expect(flat(tag)).toMatchObject({
      alignSelf: 'flex-start',
      maxWidth: '100%',
      backgroundColor: t.status.informative.background,
    });
  });

  it('keeps the value column as wide as the value and its label', async () => {
    await render(brand, mode, { status: TAG });
    const { content, value } = columns(A11Y_WITH_TAG);
    const style = flat(value);
    expect(style).toMatchObject({ alignItems: 'flex-end', flexShrink: 0 });
    // It does not stretch (no flex grow, no set width): the content column takes the rest.
    expect(style.flex).toBeUndefined();
    expect(style.flexGrow).toBeUndefined();
    expect(style.width).toBeUndefined();
    expect(flat(content)).toMatchObject({ flex: 1 });
  });

  it('reads the same label as before, the tag last', async () => {
    await render(brand, mode, { status: TAG });
    expect(columns(A11Y_WITH_TAG).row).toHaveAccessibleName(A11Y_WITH_TAG);
    await screen.unmount();

    await render(brand, mode);
    const label = 'Apex Cold Storage Traders, Average age 353 days, 1,200 units';
    expect(columns(label).row).toHaveAccessibleName(label);
    // No tag, no tag text.
    expect(screen.queryByText(TAG.label)).not.toBeOnTheScreen();
    await screen.unmount();

    await render(brand, mode, { status: TAG, accessibilityLabel: 'Open Apex' });
    expect(screen.getByRole('button', { name: 'Open Apex' })).toBeOnTheScreen();
  });

  it('lets the subtitle use two lines unless the screen asks for another limit', async () => {
    const subtitleLimit = async (props: Partial<ReportCustomerCardProps>) => {
      await render(brand, mode, { subtitle: '6 items · 38 GRNs', ...props });
      const limit = screen.getByText('6 items · 38 GRNs').props.numberOfLines;
      await screen.unmount();
      return limit;
    };
    expect(await subtitleLimit({})).toBe(2);
    expect(await subtitleLimit({ subtitleLines: 3 })).toBe(3);
    expect(await subtitleLimit({ subtitleLines: 1 })).toBe(1);
    // The title keeps its two lines.
    await render(brand, mode);
    expect(screen.getByText('Apex Cold Storage Traders').props.numberOfLines).toBe(2);
  });

  it('stacks the facts, two lines each, in Gujarati, with the tag still under them', async () => {
    setLanguage('gu');
    await render(brand, mode, { subtitle: ['6 items', '38 GRNs'], status: TAG });
    // The tag's label sits in the content column, which holds the name and both facts too.
    let tag = screen.getByText(TAG.label);
    while (flat(tag.parent!).flex !== 1) tag = tag.parent!;
    const content = tag.parent!;
    expect(flat(content)).toMatchObject({ flex: 1 });
    const facts = hostTexts(content).filter(node => ['6 items', '38 GRNs'].includes(textOf(node)));
    expect(facts.map(textOf)).toEqual(['6 items', '38 GRNs']);
    expect(facts.map(node => node.props.numberOfLines)).toEqual([2, 2]);
    expect(elements(content).at(-1)).toBe(tag);
  });
});

describe('report customer card, a long name or a large text size', () => {
  // 40 characters: wider than a name keeps beside a quantity and a PDF button.
  const LONG = 'Sunrise Agro Foods and Cold Chain Traders';
  const SHORT = 'Apex Cold Storage Traders';

  /** Where the value is: in a column of its own beside the name, or in the name's column under it. */
  async function layoutOf(props: Partial<ReportCustomerCardProps>) {
    await render('orange', 'light', { onShare: jest.fn(), ...props });
    const title = props.title ?? SHORT;
    const name = screen.getByText(title);
    // 1,200 in either language's digits.
    const value = hostTexts(screen.container).find(node => /^[0-9૦-૯,]+$/.test(textOf(node)))!;
    // The name's column: the nearest host view around the name that takes the row's free width.
    let column: TestInstance | null = name.parent;
    while (column && flat(column).flex !== 1) column = column.parent;
    const row = screen.getAllByRole('button')[0];
    const shareName = `Share PDF for ${title}`;
    const result = {
      valueUnderName: column!.queryAll(node => node === value).length > 0,
      titleLines: name.props.numberOfLines,
      label: row.props.accessibilityLabel as string,
      shares: screen.queryByRole('button', { name: shareName }) !== null,
      shareInsideRow: row.queryAll(node => node.props.accessibilityLabel === shareName).length > 0,
    };
    await screen.unmount();
    return result;
  }

  it('keeps the value beside the name for a short name at an ordinary text size', async () => {
    expect(await layoutOf({ title: SHORT })).toEqual({
      valueUnderName: false,
      titleLines: 2,
      label: `${SHORT}, Average age 353 days, 1,200 units`,
      shares: true,
      shareInsideRow: false,
    });
    atTextSize(1.29);
    expect((await layoutOf({ title: SHORT })).valueUnderName).toBe(false);
  });

  it('moves the value under the name at 1.3 times the text size, the name on up to four lines', async () => {
    atTextSize(1.3);
    expect(await layoutOf({ title: SHORT })).toEqual({
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
  ])('at the text size %d the value is under the name: %s', async (fontScale, under) => {
    atTextSize(fontScale);
    const layout = await layoutOf({ title: SHORT });
    expect(layout.valueUnderName).toBe(under);
    expect(layout.titleLines).toBe(under ? 4 : 2);
  });

  it('moves the value under a name longer than 28 characters at any text size, in Gujarati too', async () => {
    expect([...LONG].length).toBeGreaterThan(28);
    expect(await layoutOf({ title: LONG })).toEqual({
      valueUnderName: true,
      titleLines: 4,
      label: `${LONG}, Average age 353 days, 1,200 units`,
      shares: true,
      shareInsideRow: false,
    });
    setLanguage('gu');
    const gujarati = await layoutOf({ title: 'સૂર્યોદય ઍગ્રો ફૂડ્સ ઍન્ડ કોલ્ડ ચેઇન ટ્રેડર્સ', valueLabel: 'નંગ' });
    expect(gujarati.valueUnderName).toBe(true);
    expect(gujarati.label).toBe('સૂર્યોદય ઍગ્રો ફૂડ્સ ઍન્ડ કોલ્ડ ચેઇન ટ્રેડર્સ, Average age 353 days, ૧,૨૦૦ નંગ');
  });
});

describe('report customer card, the share button under a stacked card', () => {
  const SHORT = 'Apex Cold Storage Traders';
  const { space, iconSize, touchTarget } = jest.requireActual('@/theme/tokens');

  /** The row, the share button (host views), the line holding the button, and the card around both. */
  async function shareParts() {
    await render('orange', 'light', { title: SHORT, subtitle: ['6 items', '38 GRNs'], onShare: jest.fn() });
    const row = screen.getAllByRole('button').find(node => String(node.props.accessibilityLabel).startsWith(SHORT))!;
    const share = screen.getByRole('button', { name: `Share PDF for ${SHORT}` });
    const line = share.parent!;
    const card = line.parent!;
    const facts = screen.getByText('6 items · 38 GRNs');
    return { row, share, line, card, facts };
  }

  it('stacked: the share icon sits a small gap under the facts, its full touch area below the row', async () => {
    atTextSize(1.3);
    const { row, share, line, card, facts } = await shareParts();
    // The facts are the last line of the row's content; the row and the share line are the card's two parts.
    expect(row.queryAll(node => node === facts).length).toBe(1);
    expect(card.queryAll(node => node === row).length).toBe(1);
    expect(row.queryAll(node => node === share).length).toBe(0);

    // No stretched spacer between the facts and the share line.
    for (const part of [card, line]) {
      const style = flat(part);
      expect(style.flex).toBeUndefined();
      expect(style.flexGrow).toBeUndefined();
      expect(style.minHeight).toBeUndefined();
      expect(style.height).toBeUndefined();
      expect(style.paddingTop ?? 0).toBe(0);
      expect(style.marginTop ?? 0).toBe(0);
    }

    // Facts to the icon: the row's bottom padding plus the space above the icon in its button.
    const rowStyle = flat(row);
    const button = flat(share);
    const aboveIcon = ((button.height as number) - iconSize.lg) / 2;
    const rowBottom = (rowStyle.paddingBottom ?? rowStyle.paddingVertical ?? rowStyle.padding ?? 0) as number;
    expect(rowBottom + aboveIcon).toBeLessThanOrEqual(space.sm);

    // The touch area is still a full target, all of it under the row (they never overlap) and inside its line.
    const slop = share.props.hitSlop ?? {};
    expect((button.height as number) + (slop.top ?? 0) + (slop.bottom ?? 0)).toBeGreaterThanOrEqual(touchTarget);
    expect(button.width).toBe(touchTarget);
    expect(slop.top ?? 0).toBe(0);
    expect(flat(line).paddingBottom).toBeGreaterThanOrEqual(slop.bottom ?? 0);
  });

  it('side by side: the share button keeps its full square target and the row its padding', async () => {
    const { row, share } = await shareParts();
    expect(flat(share)).toMatchObject({ width: touchTarget, height: touchTarget });
    expect(share.props.hitSlop).toBeUndefined();
    expect(flat(row).paddingVertical).toBe(space.md);
    expect(flat(row).paddingBottom).toBeUndefined();
  });
});

describe('report customer card, the word beside the figure', () => {
  it('reads "unit" for a stock of one and "units" for more, in the label too, unless the screen names its own', async () => {
    await render('orange', 'light', { value: 1 });
    expect(hostTexts(screen.container).map(textOf)).toEqual(expect.arrayContaining(['1', 'unit']));
    expect(hostTexts(screen.container).map(textOf)).not.toContain('units');
    expect(screen.getByRole('button', { name: 'Apex Cold Storage Traders, Average age 353 days, 1 unit' })).toBeOnTheScreen();
    await screen.unmount();

    await render('orange', 'light', { value: 2 });
    expect(hostTexts(screen.container).map(textOf)).toEqual(expect.arrayContaining(['2', 'units']));
    await screen.unmount();

    await render('orange', 'light', { value: 1, valueLabel: 'in stock' });
    expect(hostTexts(screen.container).map(textOf)).toEqual(expect.arrayContaining(['1', 'in stock']));
  });
});
