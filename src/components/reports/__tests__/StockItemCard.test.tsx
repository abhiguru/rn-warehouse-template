/**
 * The shared stock item card (stock summary and item stock summary): drawn in all
 * four themes closed and open; opening and closing (state, hint, animation and
 * Reduce Motion); GRN rows that open a GRN and rows that do not; GRN numbers in
 * full; the loading, error-with-retry and empty GRN states; the "Low stock" rule;
 * search highlighting and the match line of a closed card, in all four themes;
 * and digits in Gujarati. All names and numbers are fictional.
 */
import React, { useState } from 'react';
import { LayoutAnimation, StyleSheet } from 'react-native';
import { render, screen, userEvent, waitFor, type RenderResult } from '@testing-library/react-native';
import { BRANDS, fontWeight, getTokens, motion, touchTarget, typography, type Mode } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import { formatDate, formatSpokenDate } from '@/utils/formatters';
import {
  EXPAND_ANIMATION,
  LOW_STOCK_PERCENT,
  StockItemCard,
  isLowStock,
  type StockGRNRowData,
  type StockGRNState,
  type StockItemCardProps,
} from '../StockItemCard';

type Tree = RenderResult['container'];

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
const SEP_2_SPOKEN = () => formatSpokenDate('2026-09-02');

const configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);

afterEach(() => {
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

const show = (props: StockItemCardProps) => render(<StockItemCard {...props} />);

const flat = (style: unknown) => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
const joined = (node: Tree) => [node.props.children].flat().join('');
// A style or an icon has no query of its own, so these read the rendered host elements.
const bold = () => screen.root!.queryAll(node => node.type === 'Text' && flat(node.props.style).fontWeight === fontWeight.bold).map(joined);
const icons = (name: string) => screen.root!.queryAll(node => node.type === 'Icon' && node.props.name === name);
const spinners = () => screen.root!.queryAll(node => node.type === 'ActivityIndicator');
const backgrounds = () => screen.root!.queryAll(node => node.type === 'View').map(node => flat(node.props.style).backgroundColor);

const header = () => screen.getByRole('button', { name: /^Example Potatoes/ });
const grnButtons = () => screen.queryAllByHintText('Opens the GRN');
const PLAIN_LABEL = 'Example Potatoes, 50 kg bag, 65 of 100 in stock, 2 GRNs';
const user = () => userEvent.setup({ delay: 0 });

/** Holds a press on the element and runs the check while it is down (a pressed style lasts only that long). */
async function whilePressed(element: Tree, check: () => void) {
  const hold = user().longPress(element, { duration: 300 });
  await waitFor(check);
  await hold;
}

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('stock item card, %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  beforeEach(() => {
    mockState = { theme: { preference: mode, brand } };
  });

  it('closed: the item, its facts and its stock on the card surface; no GRNs', async () => {
    await show(baseProps());
    expect(screen.root).toHaveStyle({ backgroundColor: t.surface.card });
    for (const text of ['Example Potatoes', '50 kg bag · 2 GRNs', '65', 'of 100']) expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.queryByText('GRN 311')).not.toBeOnTheScreen();
    expect(flat(header().props.style).backgroundColor).toBeUndefined();
    await whilePressed(header(), () => expect(header()).toHaveStyle({ backgroundColor: t.surface.cardPressed }));
  });

  it('open: the GRN rows on the base background, the opening row pressed in the theme colour', async () => {
    await show(baseProps({ isExpanded: true }));
    for (const text of ['GRN 311', `GRN ${LONG_GR_NO}`, 'Fictional Traders', `Received ${OCT_1()}`]) expect(screen.getByText(text)).toBeOnTheScreen();
    expect(backgrounds()).toContain(t.background.base);
    const [row] = grnButtons();
    await whilePressed(row, () => expect(row).toHaveStyle({ backgroundColor: t.surface.cardPressed }));
  });
});

describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('search on the stock item card, %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);
  beforeEach(() => {
    mockState = { theme: { preference: mode, brand } };
  });

  it('no words: the same tree as without the prop, the name and GRN numbers as plain text, nothing bold', async () => {
    for (const isExpanded of [false, true]) {
      // The drawn tree (elements, props and text; handlers are new closures on every render, so left out).
      const drawn = () => JSON.stringify(screen.toJSON());
      await show(baseProps({ isExpanded }));
      const before = drawn();
      expect(before).toContain('"Example Potatoes"');
      // As before the props existed: one Text holding the name as a string, two lines at most.
      const title = screen.getByText('Example Potatoes');
      expect(title).toHaveProp('children', 'Example Potatoes');
      expect(title).toHaveProp('numberOfLines', 2);
      expect(title).toHaveStyle({ color: t.text.primary });
      expect(bold()).toEqual([]);
      expect(screen.queryByTestId('stock-item-match-line')).not.toBeOnTheScreen();
      for (const highlightWords of [[], ['nothing-matches']]) {
        await show(baseProps({ isExpanded, highlightWords }));
        expect(drawn()).toBe(before);
      }
    }
    await show(baseProps({ isExpanded: true }));
    expect(screen.getAllByText('GRN 311')).toHaveLength(1);
    expect(screen.getByText('GRN 311')).toHaveProp('children', 'GRN 311');
  });

  it('words: bold in the item name, and in each GRN number once opened; the rest keeps its colour', async () => {
    await show(baseProps({ highlightWords: ['potat', '311'] }));
    expect(bold()).toEqual(['Potat']);
    const title = screen.getByText('Example Potatoes');
    expect(title.props.children).toHaveLength(3);
    expect(title).toHaveStyle({ color: t.text.primary });
    expect(title).toHaveProp('numberOfLines', 2);
    // The header label is the plain name: bold is not read out.
    expect(header()).toHaveAccessibleName(PLAIN_LABEL);

    await show(baseProps({ isExpanded: true, highlightWords: ['potat', '311', 'b'] }));
    // "B" also matches inside the long GRN number; its row button label stays the plain text.
    expect(bold()).toEqual(['Potat', '311', 'B']);
    expect(grnButtons()[0]).toHaveAccessibleName(/^GRN 311, mark RS,/);
    expect(screen.getByText('GRN 311')).not.toHaveProp('numberOfLines');
  });

  it('match line: under a closed card in the footnote style, its match in bold, read with the header', async () => {
    await show(baseProps({ matchLine: 'GRN A0042', highlightWords: ['a0042'] }));
    const line = screen.getByText('GRN A0042');
    expect(line).toHaveStyle({ color: t.text.secondary, fontSize: typography.footnote.fontSize });
    expect(line).toHaveProp('numberOfLines', 2);
    expect(bold()).toEqual(['A0042']);
    expect(header()).toHaveAccessibleName('Example Potatoes, 50 kg bag, 65 of 100 in stock, 2 GRNs, GRN A0042');
  });

  it('match line: not drawn once the card is open, nor read with its header', async () => {
    await show(baseProps({ isExpanded: true, matchLine: 'GRN A0042', highlightWords: ['a0042'] }));
    expect(screen.queryByTestId('stock-item-match-line')).not.toBeOnTheScreen();
    expect(screen.queryByText('GRN A0042')).not.toBeOnTheScreen();
    expect(header()).toHaveAccessibleName(PLAIN_LABEL);
  });
});

describe('the match line while opening and closing', () => {
  function Toggling() {
    const [open, setOpen] = useState(false);
    return <StockItemCard {...baseProps({ matchLine: 'GRN A0042 · GRN A0043' })} isExpanded={open} onToggle={() => setOpen(value => !value)} />;
  }

  it('goes when the card opens and comes back when it closes; without words it is plain text', async () => {
    await render(<Toggling />);
    const line = screen.getByTestId('stock-item-match-line');
    expect(line).toHaveProp('children', 'GRN A0042 · GRN A0043');
    expect(bold()).toEqual([]);
    expect(header()).toHaveAccessibleName(/, GRN A0042 · GRN A0043$/);

    await user().press(header());
    expect(screen.queryByTestId('stock-item-match-line')).not.toBeOnTheScreen();
    expect(header()).toHaveAccessibleName(PLAIN_LABEL);

    await user().press(header());
    expect(screen.getAllByTestId('stock-item-match-line')).toHaveLength(1);
  });

  it('an empty match line draws nothing', async () => {
    await show(baseProps({ matchLine: '' }));
    expect(screen.queryByTestId('stock-item-match-line')).not.toBeOnTheScreen();
    expect(header()).toHaveAccessibleName(PLAIN_LABEL);
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

  it('the header is a button with a label, a hint and the expanded state, and toggles it', async () => {
    const onToggle = jest.fn();
    await render(<Toggling onToggle={onToggle} />);

    expect(header()).toHaveAccessibleName(PLAIN_LABEL);
    expect(header()).toBeCollapsed();
    expect(screen.getByHintText('Shows the GRNs for this item')).toHaveAccessibleName(PLAIN_LABEL);
    expect(screen.queryByText('GRN 311')).not.toBeOnTheScreen();

    await user().press(header());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(header()).toBeExpanded();
    expect(screen.getByHintText('Hides the GRNs')).toHaveAccessibleName(/^Example Potatoes/);
    expect(screen.getByText('GRN 311')).toBeOnTheScreen();

    await user().press(header());
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(header()).toBeCollapsed();
  });

  it('animates with the standard motion token, not the 300 ms preset', async () => {
    await show(baseProps());
    await user().press(header());
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext).toHaveBeenCalledWith(EXPAND_ANIMATION);
    expect(EXPAND_ANIMATION.duration).toBe(motion.standard);
    expect(motion.standard).toBe(200);
  });

  it('does not animate when Reduce Motion is on, and still toggles', async () => {
    mockReduceMotion = true;
    const onToggle = jest.fn();
    await show(baseProps({ onToggle }));
    await user().press(header());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('the header is at least a touch target high', async () => {
    await show(baseProps());
    expect(Number(flat(header().props.style).minHeight)).toBeGreaterThanOrEqual(touchTarget);
  });
});

describe('GRN rows', () => {
  it('a row with a GRN id opens that GRN: a button with one label, the hint and a chevron', async () => {
    const onOpenGRN = jest.fn();
    await show(baseProps({ isExpanded: true, onOpenGRN }));
    expect(grnButtons()).toHaveLength(1);
    const [row] = grnButtons();
    expect(row).toHaveAccessibleName(
      `GRN 311, mark RS, Fictional Traders, Received ${OCT_1_SPOKEN()}, Rack B-14 · 1,250.5 kg each, 60 of 100 in stock`
    );
    expect(Number(flat(row.props.style).minHeight)).toBeGreaterThanOrEqual(touchTarget);
    await user().press(row);
    expect(onOpenGRN).toHaveBeenCalledWith('g-311');
    // One chevron for the row that opens; the other row has none.
    expect(icons('chevron-right')).toHaveLength(1);
  });

  it('a row without a GRN id is read as one element: no button role, no hint, no chevron', async () => {
    await show(baseProps({ isExpanded: true, grns: { status: 'loaded', rows: [ROWS[1]] } }));
    expect(grnButtons()).toHaveLength(0);
    expect(icons('chevron-right')).toHaveLength(0);
    const row = screen.getByLabelText(new RegExp(`^GRN ${LONG_GR_NO}`));
    expect(row).toHaveProp('accessible', true);
    expect(row).not.toHaveProp('accessibilityRole');
    expect(row).not.toHaveProp('onPress');
    expect(row).toHaveAccessibleName(`GRN ${LONG_GR_NO}, Received ${SEP_2_SPOKEN()}, 5 units, 50 kg each`);
    expect(screen.queryByRole('button', { name: new RegExp(`^GRN ${LONG_GR_NO}`) })).not.toBeOnTheScreen();
  });

  it('rows do not open without a handler, even with a GRN id', async () => {
    await show(baseProps({ isExpanded: true, onOpenGRN: undefined }));
    expect(grnButtons()).toHaveLength(0);
    expect(icons('chevron-right')).toHaveLength(0);
  });

  it('a long GRN number is drawn in full: no line limit', async () => {
    await show(baseProps({ isExpanded: true }));
    const title = screen.getByText(`GRN ${LONG_GR_NO}`);
    expect(title).not.toHaveProp('numberOfLines');
    expect(title).not.toHaveProp('ellipsizeMode');
  });

  it('a long package mark is drawn in full as the first fact of the footnote line, not in a tag', async () => {
    const LONG_MARK = 'RS/KHEDA-LOT-2026-0099-COLD-ROOM-B-NORTH-WALL';
    const rows: StockGRNRowData[] = [{ ...ROWS[0], packageMark: LONG_MARK }];
    mockState = { theme: { preference: 'light', brand: 'orange' } };
    const t = getTokens('orange', 'light');
    await show(baseProps({ isExpanded: true, grns: { status: 'loaded', rows } }));
    // No status tag in the row: a tag is one line and shrinks, so it would cut the mark. The mark is
    // part of the footnote line and no Text of its own.
    expect(screen.queryByText(LONG_MARK)).not.toBeOnTheScreen();
    const line = screen.getByText(new RegExp(LONG_MARK));
    expect(joined(line)).toBe(`Mark ${LONG_MARK} · Rack B-14 · 1,250.5 kg each`);
    expect(line).not.toHaveProp('numberOfLines');
    expect(line).not.toHaveProp('ellipsizeMode');
    expect(line).toHaveStyle({ fontSize: typography.footnote.fontSize, color: t.text.secondary });
    // The row's label names the mark once, after the GRN number.
    expect(grnButtons()[0]).toHaveAccessibleName(
      `GRN 311, mark ${LONG_MARK}, Fictional Traders, Received ${OCT_1_SPOKEN()}, Rack B-14 · 1,250.5 kg each, 60 of 100 in stock`
    );
  });

  it('a row without a mark has no mark fact', async () => {
    await show(baseProps({ isExpanded: true, grns: { status: 'loaded', rows: [{ ...ROWS[0], packageMark: null }] } }));
    expect(screen.getByText('Rack B-14 · 1,250.5 kg each')).toBeOnTheScreen();
    expect(screen.queryAllByText(/^Mark /)).toEqual([]);
  });

  it('figures are right-aligned with tabular numerals; "of total" only when something was received', async () => {
    await show(baseProps({ isExpanded: true }));
    for (const value of ['65', '60', '5', '50 kg each']) {
      const figure = screen.getByText(value);
      expect(figure).toHaveStyle({ textAlign: 'right', fontVariant: ['tabular-nums'] });
    }
    // 65 of 100 on the card, 60 of 100 on the first GRN; the second received nothing known.
    expect(screen.getAllByText('of 100')).toHaveLength(2);
    expect(screen.queryByText('of 0')).not.toBeOnTheScreen();
  });
});

describe('GRNs read on demand', () => {
  const states: Record<string, StockGRNState> = {
    loading: { status: 'loading' },
    empty: { status: 'loaded', rows: [] },
  };

  it('while loading: a spinner and "Loading GRNs", no rows and no "no GRNs"', async () => {
    await show(baseProps({ isExpanded: true, grns: states.loading }));
    expect(spinners()).toHaveLength(1);
    expect(screen.getByText('Loading GRNs')).toBeOnTheScreen();
    expect(screen.queryByText('No GRNs with this item in stock.')).not.toBeOnTheScreen();
    expect(screen.queryByText('GRN 311')).not.toBeOnTheScreen();
  });

  it('after a failure: the error and "Try again", which calls the retry handler; never "no GRNs"', async () => {
    const onRetry = jest.fn();
    await show(baseProps({ isExpanded: true, grns: { status: 'failed', onRetry } }));
    expect(screen.getByText("Couldn't load the GRNs for this item.")).toBeOnTheScreen();
    expect(screen.queryByText('No GRNs with this item in stock.')).not.toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    await user().press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('none: the empty text the screen gives', async () => {
    await show(baseProps({ isExpanded: true, grns: states.empty }));
    expect(screen.getByText('No GRNs with this item in stock.')).toBeOnTheScreen();
  });

  it('none and no empty text (stock summary): nothing under the header, as before', async () => {
    await show(baseProps({ isExpanded: true, grns: states.empty, emptyGRNsText: undefined }));
    expect(screen.queryByText('No GRNs with this item in stock.')).not.toBeOnTheScreen();
    expect(backgrounds()).not.toContain(getTokens('orange', 'light').background.base);
  });

  it('nothing is drawn under a closed card in any state', async () => {
    for (const grns of [states.loading, { status: 'failed' as const, onRetry: jest.fn() }, states.empty]) {
      await show(baseProps({ grns }));
      expect(screen.queryByText('Loading GRNs')).not.toBeOnTheScreen();
      expect(screen.queryByText("Couldn't load the GRNs for this item.")).not.toBeOnTheScreen();
      expect(screen.queryByText('No GRNs with this item in stock.')).not.toBeOnTheScreen();
    }
  });
});

describe('more GRN lines to read (grnsMore)', () => {
  const more = (state: 'none' | 'more' | 'loading' | 'failed') => ({ state, onLoadMore: jest.fn(), onRetry: jest.fn() });
  const FOOTNOTE = 'Showing 2 of 240 GRN lines';

  it('more: "Show more GRN lines" under the lines and their footnote, which asks for the next lines', async () => {
    const grnsMore = more('more');
    await show(baseProps({ isExpanded: true, grnsFooter: FOOTNOTE, grnsMore }));
    // The lines stay, the footnote says how many, and the button follows them.
    expect(screen.getAllByText(/^(GRN 311|Showing 2 of 240 GRN lines)$/).map(joined)).toEqual(['GRN 311', FOOTNOTE]);
    expect(screen.getAllByRole('button', { name: 'Show more GRN lines' })).toHaveLength(1);
    await user().press(screen.getByRole('button', { name: 'Show more GRN lines' }));
    expect(grnsMore.onLoadMore).toHaveBeenCalledTimes(1);
    expect(grnsMore.onRetry).not.toHaveBeenCalled();
  });

  it('loading: a spinner and "Loading more GRN lines" under the lines, no button', async () => {
    await show(baseProps({ isExpanded: true, grnsFooter: FOOTNOTE, grnsMore: more('loading') }));
    for (const text of ['GRN 311', FOOTNOTE, 'Loading more GRN lines']) expect(screen.getByText(text)).toBeOnTheScreen();
    expect(spinners()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Show more GRN lines' })).not.toBeOnTheScreen();
  });

  it('failed: the lines stay, "Couldn\'t load more GRN lines." and "Try again", which retries', async () => {
    const grnsMore = more('failed');
    await show(baseProps({ isExpanded: true, grnsMore }));
    for (const text of ['GRN 311', "Couldn't load more GRN lines."]) expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.queryByText("Couldn't load the GRNs for this item.")).not.toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1);
    await user().press(screen.getByRole('button', { name: 'Try again' }));
    expect(grnsMore.onRetry).toHaveBeenCalledTimes(1);
  });

  it('none, a closed card, lines not loaded yet, or the lines drawn by the list: nothing', async () => {
    const cases: Partial<StockItemCardProps>[] = [
      { isExpanded: true, grnsMore: more('none') },
      { isExpanded: false, grnsMore: more('more') },
      { isExpanded: true, grns: { status: 'loading' }, grnsMore: more('more') },
      { isExpanded: true, grns: { status: 'loaded', rows: [] }, grnsMore: more('more') },
      { isExpanded: true, grnsInList: true, grnsMore: more('more') },
    ];
    for (const over of cases) {
      await show(baseProps(over));
      expect(screen.queryByRole('button', { name: 'Show more GRN lines' })).not.toBeOnTheScreen();
      expect(screen.queryByText('Loading more GRN lines')).not.toBeOnTheScreen();
    }
  });

  it('says it in Gujarati', async () => {
    setLanguage('gu');
    await show(baseProps({ isExpanded: true, grnsMore: more('more') }));
    expect(screen.getAllByRole('button', { name: 'આવક પાવતીની વધુ લાઇન બતાવો' })).toHaveLength(1);
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

  it('the card shows "Low stock" only when told, and says it in the header label', async () => {
    await show(baseProps({ stock: 10, lowStock: isLowStock(10, 100) }));
    expect(screen.getByText('Low stock')).toBeOnTheScreen();
    expect(header()).toHaveAccessibleName(/, Low stock$/);

    await show(baseProps({ stock: 65, lowStock: isLowStock(65, 100) }));
    expect(screen.queryByText('Low stock')).not.toBeOnTheScreen();
  });

  it('an out-of-stock item: "Out of stock" tag, muted icon, no value, GRNs "dispatched"', async () => {
    await show(baseProps({ packaging: null, stock: 0, total: undefined, outOfStock: true, grnCount: 1 }));
    for (const text of ['Out of stock', '1 GRN dispatched']) expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.queryByText('units')).not.toBeOnTheScreen();
    expect(icons('cube-off-outline')).toHaveLength(1);
    expect(header()).toHaveAccessibleName('Example Potatoes, 1 GRN dispatched, Out of stock');
  });

  it('without a received total the value reads in units', async () => {
    await show(baseProps({ packaging: null, total: undefined, stock: 40, grnCount: 1 }));
    for (const text of ['40', 'units', '1 GRN']) expect(screen.getByText(text)).toBeOnTheScreen();
    expect(header()).toHaveAccessibleName('Example Potatoes, 40 units, 1 GRN');
  });
});

describe('in Gujarati', () => {
  it('figures use Gujarati digits; the GRN number is shown as stored', async () => {
    setLanguage('gu');
    await show(baseProps({ stock: 1250, total: 4000, isExpanded: true }));
    for (const text of ['૧,૨૫૦', '૪,૦૦૦માંથી', '૬૦', 'આવક પાવતી 311', `આવક પાવતી ${LONG_GR_NO}`]) expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.queryByText('1,250')).not.toBeOnTheScreen();
  });
});

// A lot stores one weight, the weight of one bag, box or crate. Both reports say "each":
// the item stock summary gives it as `weight` (a fact of the footnote line), the stock
// summary as `weightEach` (under the stock figure). Neither is ever a total.
describe('the weight of a lot', () => {
  const lot = (over: Partial<StockGRNRowData>): StockGRNRowData => ({ key: 'w', grnId: 'g-9', grNo: 'A0042', rack: 'B-14', stock: 10, total: 100, ...over });
  const open = (over: Partial<StockGRNRowData>) => show(baseProps({ isExpanded: true, grns: { status: 'loaded', rows: [lot(over)] } }));
  const weightWords = () =>
    screen
      .queryAllByText(/kg|each|કિલો|દરેક/)
      .map(joined)
      .filter(text => text !== '50 kg bag · 2 GRNs' && text !== '50 kg bag');

  it('item stock summary: "Rack B-14 · 50 kg each" on the footnote line, and read so', async () => {
    await open({ weight: 50 });
    expect(screen.getByText('Rack B-14 · 50 kg each')).toBeOnTheScreen();
    expect(screen.queryByText('Rack B-14 · 50 kg')).not.toBeOnTheScreen();
    expect(grnButtons()[0]).toHaveAccessibleName('GRN A0042, Rack B-14 · 50 kg each, 10 of 100 in stock');
  });

  it('stock summary: "50 kg each" under the stock figure, and read last', async () => {
    await open({ weightEach: 50 });
    // "of 100" is also on the card itself, so it is found twice.
    for (const text of ['Rack B-14', '10', '50 kg each']) expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.getAllByText('of 100')).toHaveLength(2);
    expect(grnButtons()[0]).toHaveAccessibleName('GRN A0042, Rack B-14, 10 of 100 in stock, 50 kg each');
  });

  it.each([
    ['weight 0', { weight: 0 }],
    ['weight null', { weight: null }],
    ['a negative weight', { weight: -5 }],
    ['weightEach 0', { weightEach: 0 }],
    ['weightEach null', { weightEach: null }],
    ['no weight field', {}],
  ])('a lot with %s shows and reads no weight', async (_name, over) => {
    await open(over);
    expect(screen.getByText('Rack B-14')).toBeOnTheScreen();
    expect(weightWords()).toEqual([]);
    expect(grnButtons()[0]).toHaveAccessibleName('GRN A0042, Rack B-14, 10 of 100 in stock');
  });

  it('in Gujarati both read "દરેક ૫૦ કિલો"', async () => {
    setLanguage('gu');
    // Gujarati stacks the facts: the rack and the weight each have a line.
    await open({ weight: 50 });
    for (const text of ['રેક B-14', 'દરેક ૫૦ કિલો']) expect(screen.getByText(text)).toBeOnTheScreen();
    await open({ weightEach: 1250.5 });
    expect(screen.getByText('દરેક ૧,૨૫૦.૫ કિલો')).toBeOnTheScreen();
  });
});
