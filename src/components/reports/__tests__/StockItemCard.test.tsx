/**
 * The shared stock item card (stock summary and item stock summary): drawn in all
 * four themes closed and open; opening and closing (state, hint, animation and
 * Reduce Motion); GRN rows that open a GRN and rows that do not; GRN numbers in
 * full; the loading, error-with-retry and empty GRN states; the "Low stock" rule;
 * search highlighting and the match line of a closed card, in all four themes;
 * and digits in Gujarati. All names and numbers are fictional.
 */
import React, { useState } from 'react';
import { ActivityIndicator, LayoutAnimation, StyleSheet } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { BRANDS, fontWeight, getTokens, motion, touchTarget, typography, type Mode } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import { formatDate, formatSpokenDate } from '@/utils/formatters';
import { Button } from '@/components/ui/Button';
import { StatusTag } from '@/components/ui';
import {
  EXPAND_ANIMATION,
  LOW_STOCK_PERCENT,
  StockItemCard,
  isLowStock,
  type StockGRNRowData,
  type StockGRNState,
  type StockItemCardProps,
} from '../StockItemCard';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
let mockReduceMotion = false;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

const LONG_GR_NO = 'KL-2026-000123456789-B';
const ROWS: StockGRNRowData[] = [
  { key: 'a', grnId: 'g-311', grNo: '311', packageMark: 'RS', customerName: 'Fictional Traders', receivedDate: '2026-10-01', rack: 'B-14', weight: 1250.5, stock: 60, total: 100 },
  { key: 'b', grnId: null, grNo: LONG_GR_NO, receivedDate: '2026-09-02', stock: 5, total: 0, weightEach: 50 },
];

// The list rows show the short date, which adds the year outside the current one.
const OCT_1 = () => formatDate('2026-10-01');
const OCT_1_SPOKEN = () => formatSpokenDate('2026-10-01');
const SEP_2 = () => formatDate('2026-09-02');
const SEP_2_SPOKEN = () => formatSpokenDate('2026-09-02');

const configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  setLanguage('en');
  mockReduceMotion = false;
  configureNext.mockClear();
});

const baseProps = (over: Partial<StockItemCardProps> = {}): StockItemCardProps => ({
  name: 'Example Potatoes',
  packaging: '50 kg bag',
  grnCount: 2,
  stock: 65,
  total: 100,
  isExpanded: false,
  onToggle: jest.fn(),
  grns: { status: 'loaded', rows: ROWS },
  emptyGRNsText: 'No GRNs with this item in stock.',
  onOpenGRN: jest.fn(),
  ...over,
});

function render(props: StockItemCardProps) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<StockItemCard {...props} />);
  });
  mounted.push(tree);
  return helpers(tree);
}

function helpers(tree: TestRenderer.ReactTestRenderer) {
  const textNodes = () => tree.root.findAll(node => (node.type as unknown) === 'Text');
  const texts = () => textNodes().map(node => [].concat(node.props.children).join(''));
  const pressables = () =>
    tree.root.findAll(node => typeof node.type !== 'string' && typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button');
  const header = () => pressables().find(node => node.props.accessibilityState?.expanded !== undefined) as ReactTestInstance;
  const grnButtons = () => pressables().filter(node => node.props.accessibilityHint === 'Opens the GRN');
  const icons = (name: string) => tree.root.findAll(node => (node.type as unknown) === 'Icon' && node.props.name === name);
  const bold = () =>
    textNodes()
      .filter(node => flat(node.props.style)?.fontWeight === fontWeight.bold)
      .map(node => [].concat(node.props.children).join(''));
  const matchLine = () => tree.root.findAll(node => (node.type as unknown) === 'Text' && node.props.testID === 'stock-item-match-line');
  return { tree, texts, textNodes, header, grnButtons, icons, bold, matchLine };
}

const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
const pressedStyle = (node: ReactTestInstance, pressed: boolean) => flat(node.props.style({ pressed }));

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('stock item card, %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  beforeEach(() => {
    mockState = { theme: { preference: mode, brand } };
  });

  it('closed: the item, its facts and its stock on the card surface; no GRNs', () => {
    const { tree, texts, header } = render(baseProps());
    expect(flat(tree.root.findAllByType('View' as never)[0].props.style).backgroundColor).toBe(t.surface.card);
    expect(texts()).toEqual(expect.arrayContaining(['Example Potatoes', '50 kg bag · 2 GRNs', '65', 'of 100']));
    expect(texts()).not.toContain('GRN 311');
    expect(pressedStyle(header(), false).backgroundColor).toBeUndefined();
    expect(pressedStyle(header(), true).backgroundColor).toBe(t.surface.cardPressed);
  });

  it('open: the GRN rows on the base background, the opening row pressed in the theme colour', () => {
    const { tree, texts, grnButtons } = render(baseProps({ isExpanded: true }));
    expect(texts()).toEqual(expect.arrayContaining(['GRN 311', `GRN ${LONG_GR_NO}`, 'Fictional Traders', `Received ${OCT_1()}`]));
    const backgrounds = tree.root.findAllByType('View' as never).map(node => flat(node.props.style)?.backgroundColor);
    expect(backgrounds).toContain(t.background.base);
    expect(pressedStyle(grnButtons()[0], true).backgroundColor).toBe(t.surface.cardPressed);
  });
});

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('search on the stock item card, %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  beforeEach(() => {
    mockState = { theme: { preference: mode, brand } };
  });

  it('no words: the same tree as without the prop, the name and GRN numbers as plain text, nothing bold', () => {
    for (const isExpanded of [false, true]) {
      // The drawn tree (elements, props and text; handlers are new closures on every render, so left out).
      const drawn = (tree: TestRenderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());
      const plain = render(baseProps({ isExpanded }));
      const before = drawn(plain.tree);
      expect(before).toContain('"Example Potatoes"');
      for (const highlightWords of [[], ['nothing-matches']]) {
        expect(drawn(render(baseProps({ isExpanded, highlightWords })).tree)).toBe(before);
      }
      // As before the props existed: one Text holding the name as a string, two lines at most.
      const title = plain.textNodes().find(node => node.props.children === 'Example Potatoes') as ReactTestInstance;
      expect(title.props.numberOfLines).toBe(2);
      expect(flat(title.props.style).color).toBe(t.text.primary);
      expect(plain.bold()).toEqual([]);
      expect(plain.matchLine()).toHaveLength(0);
    }
    const open = render(baseProps({ isExpanded: true }));
    expect(open.textNodes().filter(node => node.props.children === 'GRN 311')).toHaveLength(1);
  });

  it('words: bold in the item name, and in each GRN number once opened; the rest keeps its colour', () => {
    const closed = render(baseProps({ highlightWords: ['potat', '311'] }));
    expect(closed.bold()).toEqual(['Potat']);
    const title = closed.textNodes().find(node => [].concat(node.props.children).length === 3) as ReactTestInstance;
    expect(flat(title.props.style).color).toBe(t.text.primary);
    expect(title.props.numberOfLines).toBe(2);
    // The header label is the plain name: bold is not read out.
    expect(closed.header().props.accessibilityLabel).toBe('Example Potatoes, 50 kg bag, 65 of 100 in stock, 2 GRNs');

    const open = render(baseProps({ isExpanded: true, highlightWords: ['potat', '311', 'b'] }));
    // "B" also matches inside the long GRN number; its row button label stays the plain text.
    expect(open.bold()).toEqual(['Potat', '311', 'B']);
    expect(open.grnButtons()[0].props.accessibilityLabel).toMatch(/^GRN 311, mark RS,/);
    const grnTitle = open.textNodes().find(node => [].concat(node.props.children)[0] === 'GRN ') as ReactTestInstance;
    expect(grnTitle.props.numberOfLines).toBeUndefined();
  });

  it('match line: under a closed card in the footnote style, its match in bold, read with the header', () => {
    const { matchLine, header, bold } = render(baseProps({ matchLine: 'GRN A0042', highlightWords: ['a0042'] }));
    expect(matchLine()).toHaveLength(1);
    const style = flat(matchLine()[0].props.style);
    expect(style.color).toBe(t.text.secondary);
    expect(style.fontSize).toBe(typography.footnote.fontSize);
    expect(matchLine()[0].props.numberOfLines).toBe(2);
    expect(bold()).toEqual(['A0042']);
    expect(header().props.accessibilityLabel).toBe('Example Potatoes, 50 kg bag, 65 of 100 in stock, 2 GRNs, GRN A0042');
  });

  it('match line: not drawn once the card is open, nor read with its header', () => {
    const { matchLine, header, texts } = render(baseProps({ isExpanded: true, matchLine: 'GRN A0042', highlightWords: ['a0042'] }));
    expect(matchLine()).toHaveLength(0);
    expect(texts()).not.toContain('GRN A0042');
    expect(header().props.accessibilityLabel).toBe('Example Potatoes, 50 kg bag, 65 of 100 in stock, 2 GRNs');
  });
});

describe('the match line while opening and closing', () => {
  function Toggling() {
    const [open, setOpen] = useState(false);
    return <StockItemCard {...baseProps({ matchLine: 'GRN A0042 · GRN A0043' })} isExpanded={open} onToggle={() => setOpen(value => !value)} />;
  }

  it('goes when the card opens and comes back when it closes; without words it is plain text', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Toggling />);
    });
    mounted.push(tree);
    const { header, matchLine, bold } = helpers(tree);
    expect(matchLine().map(node => node.props.children)).toEqual(['GRN A0042 · GRN A0043']);
    expect(bold()).toEqual([]);
    expect(header().props.accessibilityLabel).toMatch(/, GRN A0042 · GRN A0043$/);

    act(() => header().props.onPress());
    expect(matchLine()).toHaveLength(0);
    expect(header().props.accessibilityLabel).toBe('Example Potatoes, 50 kg bag, 65 of 100 in stock, 2 GRNs');

    act(() => header().props.onPress());
    expect(matchLine()).toHaveLength(1);
  });

  it('an empty match line draws nothing', () => {
    const { matchLine, header } = render(baseProps({ matchLine: '' }));
    expect(matchLine()).toHaveLength(0);
    expect(header().props.accessibilityLabel).toBe('Example Potatoes, 50 kg bag, 65 of 100 in stock, 2 GRNs');
  });
});

describe('opening and closing', () => {
  function Toggling({ onToggle }: { onToggle: jest.Mock }) {
    const [open, setOpen] = useState(false);
    return (
      <StockItemCard
        {...baseProps()}
        isExpanded={open}
        onToggle={() => {
          onToggle();
          setOpen(value => !value);
        }}
      />
    );
  }

  it('the header is a button with a label, a hint and the expanded state, and toggles it', () => {
    const onToggle = jest.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Toggling onToggle={onToggle} />);
    });
    mounted.push(tree);
    const { header, texts } = helpers(tree);

    expect(header().props.accessibilityLabel).toBe('Example Potatoes, 50 kg bag, 65 of 100 in stock, 2 GRNs');
    expect(header().props.accessibilityState).toEqual({ expanded: false });
    expect(header().props.accessibilityHint).toBe('Shows the GRNs for this item');
    expect(texts()).not.toContain('GRN 311');

    act(() => header().props.onPress());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(header().props.accessibilityState).toEqual({ expanded: true });
    expect(header().props.accessibilityHint).toBe('Hides the GRNs');
    expect(texts()).toContain('GRN 311');

    act(() => header().props.onPress());
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(header().props.accessibilityState).toEqual({ expanded: false });
  });

  it('animates with the standard motion token, not the 300 ms preset', () => {
    const { header } = render(baseProps());
    act(() => header().props.onPress());
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenCalledWith(EXPAND_ANIMATION);
    expect(EXPAND_ANIMATION.duration).toBe(motion.standard);
    expect(motion.standard).toBe(200);
  });

  it('does not animate when Reduce Motion is on, and still toggles', () => {
    mockReduceMotion = true;
    const onToggle = jest.fn();
    const { header } = render(baseProps({ onToggle }));
    act(() => header().props.onPress());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('the header is at least a touch target high', () => {
    const { header } = render(baseProps());
    expect(pressedStyle(header(), false).minHeight).toBeGreaterThanOrEqual(touchTarget);
  });
});

describe('GRN rows', () => {
  it('a row with a GRN id opens that GRN: a button with one label, the hint and a chevron', () => {
    const onOpenGRN = jest.fn();
    const { grnButtons, icons } = render(baseProps({ isExpanded: true, onOpenGRN }));
    expect(grnButtons()).toHaveLength(1);
    const row = grnButtons()[0];
    expect(row.props.accessibilityLabel).toBe(
      `GRN 311, mark RS, Fictional Traders, Received ${OCT_1_SPOKEN()}, Rack B-14 · 1,250.5 kg each, 60 of 100 in stock`
    );
    expect(pressedStyle(row, false).minHeight).toBeGreaterThanOrEqual(touchTarget);
    act(() => row.props.onPress());
    expect(onOpenGRN).toHaveBeenCalledWith('g-311');
    // One chevron for the row that opens; the other row has none.
    expect(icons('chevron-right')).toHaveLength(1);
  });

  it('a row without a GRN id is read as one element: no button role, no hint, no chevron', () => {
    const { tree, grnButtons, icons } = render(
      baseProps({ isExpanded: true, grns: { status: 'loaded', rows: [ROWS[1]] } })
    );
    expect(grnButtons()).toHaveLength(0);
    expect(icons('chevron-right')).toHaveLength(0);
    const row = tree.root.find(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith(`GRN ${LONG_GR_NO}`));
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityRole).toBeUndefined();
    expect(row.props.onPress).toBeUndefined();
    expect(row.props.accessibilityLabel).toBe(`GRN ${LONG_GR_NO}, Received ${SEP_2_SPOKEN()}, 5 units, 50 kg each`);
  });

  it('rows do not open without a handler, even with a GRN id', () => {
    const { grnButtons, icons } = render(baseProps({ isExpanded: true, onOpenGRN: undefined }));
    expect(grnButtons()).toHaveLength(0);
    expect(icons('chevron-right')).toHaveLength(0);
  });

  it('a long GRN number is drawn in full: no line limit', () => {
    const { textNodes } = render(baseProps({ isExpanded: true }));
    const title = textNodes().find(node => [].concat(node.props.children).join('') === `GRN ${LONG_GR_NO}`) as ReactTestInstance;
    expect(title).toBeDefined();
    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.ellipsizeMode).toBeUndefined();
  });

  it('a long package mark is drawn in full as the first fact of the footnote line, not in a tag', () => {
    const LONG_MARK = 'RS/KHEDA-LOT-2026-0099-COLD-ROOM-B-NORTH-WALL';
    const rows: StockGRNRowData[] = [{ ...ROWS[0], packageMark: LONG_MARK }];
    mockState = { theme: { preference: 'light', brand: 'orange' } };
    const t = getTokens('orange', 'light');
    const { tree, textNodes, grnButtons }= render(baseProps({ isExpanded: true, grns: { status: 'loaded', rows } }));
    // No status tag in the row: a tag is one line and shrinks, so it would cut the mark.
    expect(tree.root.findAllByType(StatusTag)).toHaveLength(0);
    const line = textNodes().find(node => [].concat(node.props.children).join('').includes(LONG_MARK)) as ReactTestInstance;
    expect([].concat(line.props.children).join('')).toBe(`Mark ${LONG_MARK} · Rack B-14 · 1,250.5 kg each`);
    expect(line.props.numberOfLines).toBeUndefined();
    expect(line.props.ellipsizeMode).toBeUndefined();
    expect(flat(line.props.style)).toMatchObject({ fontSize: typography.footnote.fontSize, color: t.text.secondary });
    // The row's label names the mark once, after the GRN number.
    expect(grnButtons()[0].props.accessibilityLabel).toBe(
      `GRN 311, mark ${LONG_MARK}, Fictional Traders, Received ${OCT_1_SPOKEN()}, Rack B-14 · 1,250.5 kg each, 60 of 100 in stock`
    );
  });

  it('a row without a mark has no mark fact', () => {
    const { texts } = render(baseProps({ isExpanded: true, grns: { status: 'loaded', rows: [{ ...ROWS[0], packageMark: null }] } }));
    expect(texts()).toContain('Rack B-14 · 1,250.5 kg each');
    expect(texts().filter(text => text.startsWith('Mark '))).toEqual([]);
  });

  it('figures are right-aligned with tabular numerals; "of total" only when something was received', () => {
    const { textNodes, texts } = render(baseProps({ isExpanded: true }));
    const figure = (value: string) => flat(textNodes().find(node => [].concat(node.props.children).join('') === value)?.props.style);
    for (const value of ['65', '60', '5', '50 kg each']) {
      expect(figure(value).textAlign).toBe('right');
      expect(figure(value).fontVariant).toEqual(['tabular-nums']);
    }
    // 65 of 100 on the card, 60 of 100 on the first GRN; the second received nothing known.
    expect(texts().filter(text => text === 'of 100')).toHaveLength(2);
    expect(texts()).not.toContain('of 0');
  });
});

describe('GRNs read on demand', () => {
  const states: Record<string, StockGRNState> = {
    loading: { status: 'loading' },
    empty: { status: 'loaded', rows: [] },
  };

  it('while loading: a spinner and "Loading GRNs", no rows and no "no GRNs"', () => {
    const { tree, texts } = render(baseProps({ isExpanded: true, grns: states.loading }));
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(texts()).toContain('Loading GRNs');
    expect(texts()).not.toContain('No GRNs with this item in stock.');
    expect(texts()).not.toContain('GRN 311');
  });

  it('after a failure: the error and "Try again", which calls the retry handler; never "no GRNs"', () => {
    const onRetry = jest.fn();
    const { tree, texts } = render(baseProps({ isExpanded: true, grns: { status: 'failed', onRetry } }));
    expect(texts()).toContain("Couldn't load the GRNs for this item.");
    expect(texts()).not.toContain('No GRNs with this item in stock.');
    const retry = tree.root.findAllByType(Button).filter(button => button.props.children === 'Try again');
    expect(retry).toHaveLength(1);
    act(() => retry[0].props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('none: the empty text the screen gives', () => {
    const { texts } = render(baseProps({ isExpanded: true, grns: states.empty }));
    expect(texts()).toContain('No GRNs with this item in stock.');
  });

  it('none and no empty text (stock summary): nothing under the header, as before', () => {
    const { tree, texts } = render(baseProps({ isExpanded: true, grns: states.empty, emptyGRNsText: undefined }));
    expect(texts()).not.toContain('No GRNs with this item in stock.');
    const base = getTokens('orange', 'light').background.base;
    expect(tree.root.findAllByType('View' as never).map(node => flat(node.props.style)?.backgroundColor)).not.toContain(base);
  });

  it('nothing is drawn under a closed card in any state', () => {
    for (const grns of [states.loading, { status: 'failed' as const, onRetry: jest.fn() }, states.empty]) {
      const { texts } = render(baseProps({ grns }));
      expect(texts()).not.toContain('Loading GRNs');
      expect(texts()).not.toContain("Couldn't load the GRNs for this item.");
      expect(texts()).not.toContain('No GRNs with this item in stock.');
    }
  });
});

describe('more GRN lines to read (grnsMore)', () => {
  const more = (state: 'none' | 'more' | 'loading' | 'failed') => ({ state, onLoadMore: jest.fn(), onRetry: jest.fn() });
  const buttons = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root.findAllByType(Button).filter(button => button.props.children === label);
  const FOOTNOTE = 'Showing 2 of 240 GRN lines';

  it('more: "Show more GRN lines" under the lines and their footnote, which asks for the next lines', () => {
    const grnsMore = more('more');
    const { tree, texts } = render(baseProps({ isExpanded: true, grnsFooter: FOOTNOTE, grnsMore }));
    const shown = texts();
    // The lines stay, the footnote says how many, and the button follows them.
    expect(shown).toContain('GRN 311');
    expect(shown.indexOf(FOOTNOTE)).toBeGreaterThan(shown.indexOf('GRN 311'));
    const button = buttons(tree, 'Show more GRN lines');
    expect(button).toHaveLength(1);
    act(() => button[0].props.onPress());
    expect(grnsMore.onLoadMore).toHaveBeenCalledTimes(1);
    expect(grnsMore.onRetry).not.toHaveBeenCalled();
  });

  it('loading: a spinner and "Loading more GRN lines" under the lines, no button', () => {
    const { tree, texts } = render(baseProps({ isExpanded: true, grnsFooter: FOOTNOTE, grnsMore: more('loading') }));
    expect(texts()).toEqual(expect.arrayContaining(['GRN 311', FOOTNOTE, 'Loading more GRN lines']));
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(buttons(tree, 'Show more GRN lines')).toHaveLength(0);
  });

  it('failed: the lines stay, "Couldn\'t load more GRN lines." and "Try again", which retries', () => {
    const grnsMore = more('failed');
    const { tree, texts } = render(baseProps({ isExpanded: true, grnsMore }));
    expect(texts()).toEqual(expect.arrayContaining(['GRN 311', "Couldn't load more GRN lines."]));
    expect(texts()).not.toContain("Couldn't load the GRNs for this item.");
    const retry = buttons(tree, 'Try again');
    expect(retry).toHaveLength(1);
    act(() => retry[0].props.onPress());
    expect(grnsMore.onRetry).toHaveBeenCalledTimes(1);
  });

  it('none, a closed card, lines not loaded yet, or the lines drawn by the list: nothing', () => {
    const cases: Partial<StockItemCardProps>[] = [
      { isExpanded: true, grnsMore: more('none') },
      { isExpanded: false, grnsMore: more('more') },
      { isExpanded: true, grns: { status: 'loading' }, grnsMore: more('more') },
      { isExpanded: true, grns: { status: 'loaded', rows: [] }, grnsMore: more('more') },
      { isExpanded: true, grnsInList: true, grnsMore: more('more') },
    ];
    for (const over of cases) {
      const { tree, texts } = render(baseProps(over));
      expect(buttons(tree, 'Show more GRN lines')).toHaveLength(0);
      expect(texts()).not.toContain('Loading more GRN lines');
    }
  });

  it('says it in Gujarati', () => {
    setLanguage('gu');
    const { tree } = render(baseProps({ isExpanded: true, grnsMore: more('more') }));
    expect(buttons(tree, 'આવક પાવતીની વધુ લાઇન બતાવો')).toHaveLength(1);
  });
});

describe('status tags', () => {
  it(`"Low stock" is under ${LOW_STOCK_PERCENT}% of what was received, rounded to a whole percent`, () => {
    expect(isLowStock(19, 100)).toBe(true);
    expect(isLowStock(20, 100)).toBe(false);
    // 19.4% rounds to 19 (low); 19.5% rounds to 20 (not low), as the screen did before.
    expect(isLowStock(194, 1000)).toBe(true);
    expect(isLowStock(195, 1000)).toBe(false);
    expect(isLowStock(100, 100)).toBe(false);
    // Nothing received counts as 0%.
    expect(isLowStock(0, 0)).toBe(true);
  });

  it('the card shows "Low stock" only when told, and says it in the header label', () => {
    const low = render(baseProps({ stock: 10, lowStock: isLowStock(10, 100) }));
    expect(low.texts()).toContain('Low stock');
    expect(low.header().props.accessibilityLabel).toMatch(/, Low stock$/);

    const fine = render(baseProps({ stock: 65, lowStock: isLowStock(65, 100) }));
    expect(fine.texts()).not.toContain('Low stock');
  });

  it('an out-of-stock item: "Out of stock" tag, muted icon, no value, GRNs "dispatched"', () => {
    const { texts, header, icons } = render(baseProps({ packaging: null, stock: 0, total: undefined, outOfStock: true, grnCount: 1 }));
    expect(texts()).toEqual(expect.arrayContaining(['Out of stock', '1 GRN dispatched']));
    expect(texts()).not.toContain('units');
    expect(icons('cube-off-outline')).toHaveLength(1);
    expect(header().props.accessibilityLabel).toBe('Example Potatoes, 1 GRN dispatched, Out of stock');
  });

  it('without a received total the value reads in units', () => {
    const { texts, header } = render(baseProps({ packaging: null, total: undefined, stock: 40, grnCount: 1 }));
    expect(texts()).toEqual(expect.arrayContaining(['40', 'units', '1 GRN']));
    expect(header().props.accessibilityLabel).toBe('Example Potatoes, 40 units, 1 GRN');
  });
});

describe('in Gujarati', () => {
  it('figures use Gujarati digits; the GRN number is shown as stored', () => {
    setLanguage('gu');
    const { texts } = render(baseProps({ stock: 1250, total: 4000, isExpanded: true }));
    expect(texts()).toEqual(expect.arrayContaining(['૧,૨૫૦', '૪,૦૦૦માંથી', '૬૦', 'આવક પાવતી 311', `આવક પાવતી ${LONG_GR_NO}`]));
    expect(texts()).not.toContain('1,250');
  });
});

// A lot stores one weight, the weight of one bag, box or crate. Both reports say "each":
// the item stock summary gives it as `weight` (a fact of the footnote line), the stock
// summary as `weightEach` (under the stock figure). Neither is ever a total.
describe('the weight of a lot', () => {
  const lot = (over: Partial<StockGRNRowData>): StockGRNRowData => ({ key: 'w', grnId: 'g-9', grNo: 'A0042', rack: 'B-14', stock: 10, total: 100, ...over });
  const open = (over: Partial<StockGRNRowData>) => render(baseProps({ isExpanded: true, grns: { status: 'loaded', rows: [lot(over)] } }));
  const weightWords = (texts: string[]) => texts.filter(text => /kg|each|કિલો|દરેક/.test(text) && text !== '50 kg bag · 2 GRNs' && text !== '50 kg bag');

  it('item stock summary: "Rack B-14 · 50 kg each" on the footnote line, and read so', () => {
    const { texts, grnButtons } = open({ weight: 50 });
    expect(texts()).toContain('Rack B-14 · 50 kg each');
    expect(texts()).not.toContain('Rack B-14 · 50 kg');
    expect(grnButtons()[0].props.accessibilityLabel).toBe('GRN A0042, Rack B-14 · 50 kg each, 10 of 100 in stock');
  });

  it('stock summary: "50 kg each" under the stock figure, and read last', () => {
    const { texts, grnButtons } = open({ weightEach: 50 });
    expect(texts()).toEqual(expect.arrayContaining(['Rack B-14', '10', 'of 100', '50 kg each']));
    expect(grnButtons()[0].props.accessibilityLabel).toBe('GRN A0042, Rack B-14, 10 of 100 in stock, 50 kg each');
  });

  it.each([
    ['weight 0', { weight: 0 }],
    ['weight null', { weight: null }],
    ['a negative weight', { weight: -5 }],
    ['weightEach 0', { weightEach: 0 }],
    ['weightEach null', { weightEach: null }],
    ['no weight field', {}],
  ])('a lot with %s shows and reads no weight', (_name, over) => {
    const { texts, grnButtons } = open(over);
    expect(texts()).toContain('Rack B-14');
    expect(weightWords(texts())).toEqual([]);
    expect(grnButtons()[0].props.accessibilityLabel).toBe('GRN A0042, Rack B-14, 10 of 100 in stock');
  });

  it('in Gujarati both read "દરેક ૫૦ કિલો"', () => {
    setLanguage('gu');
    // Gujarati stacks the facts: the rack and the weight each have a line.
    expect(open({ weight: 50 }).texts()).toEqual(expect.arrayContaining(['રેક B-14', 'દરેક ૫૦ કિલો']));
    expect(open({ weightEach: 1250.5 }).texts()).toContain('દરેક ૧,૨૫૦.૫ કિલો');
  });
});
