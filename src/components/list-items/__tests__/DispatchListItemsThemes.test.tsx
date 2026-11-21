/**
 * Renders the dispatch object cells in all four themes (brand × mode): surfaces
 * come from tokens, the status tag carries a word, and no brand fill is used.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import { MemoizedDispatchItem } from '@/components/list-items/MemoizedDispatchItem';
import { RecentDispatchedOrderCard } from '@/components/list-items/RecentDispatchedOrderCard';
import type { Dispatch } from '@/services/dispatch-service';
import type { RecentDispatchedOrder } from '@/types/dispatch.types';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// A 392 dp phone at font scale 1 unless a test sets another (the default mock is a scale 2 window, which stacks the tables).
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 392, height: 780, scale: 3, fontScale: mockFontScale }),
}));

afterEach(() => {
  setLanguage('en');
  mockFontScale = 1;
});

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

async function renderIn(brand: string, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  return render(element);
}

/** The style of every drawn host element (surfaces have no role or text to query by). */
function hostStyles() {
  return screen.container.queryAll(() => true).map(node => StyleSheet.flatten(node.props.style) ?? {});
}

/** The text a Text node draws, without the invisible mark where the GRN cell may break. */
const ZERO_WIDTH_SPACE = '​';
const shown = (node: { props: Record<string, any> }) => [].concat(node.props.children).join('').split(ZERO_WIDTH_SPACE).join('');

const textNodes = () => screen.queryAllByText(/[\s\S]*/, { includeHiddenElements: true });
const texts = (): string[] => textNodes().map(shown);

const dispatch = {
  dispatch_id: 'd1',
  disp_no: '42',
  disp_date: '2026-10-09',
  customer_name: 'Patel Traders',
  total_qty: 120,
  // Still sent by the backend; the card no longer shows a total weight.
  total_weight: 6000,
  total_items: 2,
  registration: 'GJ01AB1234',
  items: [
    { grn_item_id: 'g1', item_name: 'Potatoes', rack: 'B-14', package_mark: 'PM', weight: 50, gr_no: '311', grn_qty: 200, disp_qty: 100 },
  ],
} as unknown as Dispatch;

const recent: RecentDispatchedOrder = {
  dispatch_id: 'd2',
  disp_no: '43',
  disp_date: '2026-10-09',
  customer_id: 'c1',
  customer_name: 'Patel Traders',
  order_id: 'o1',
  order_no: '1042',
  item_count: 1,
  total_qty: 1,
  registration: null,
  created_by_name: 'Asha',
  items: [],
} as RecentDispatchedOrder;

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders MemoizedDispatchItem as a token object cell with a status word', async () => {
    await renderIn(brand, mode, <MemoizedDispatchItem dispatch={dispatch} onPress={jest.fn()} />);
    const bgs = hostStyles().map(s => s.backgroundColor);
    expect(bgs).toContain(t.surface.card);
    expect(bgs).toContain(t.status.positive.background);
    expect(bgs).not.toContain(t.brand.fill);
    expect(texts()).toEqual(expect.arrayContaining(['Dispatch 42', 'Complete', '120 bags']));
    expect(texts().some(text => /kg/i.test(text))).toBe(false);
  });

  it('renders RecentDispatchedOrderCard as a token object cell with a status word', async () => {
    await renderIn(brand, mode, <RecentDispatchedOrderCard dispatch={recent} onPress={jest.fn()} />);
    const bgs = hostStyles().map(s => s.backgroundColor);
    expect(bgs).toContain(t.surface.card);
    expect(bgs).not.toContain(t.brand.fill);
    expect(texts()).toEqual(expect.arrayContaining(['Dispatch 43', 'Dispatched', '1 bag', 'Order 1042']));
  });
});

const draw = (element: React.ReactElement) => renderIn('orange', 'light', element);

// M9-9: the memo comparators looked at the totals only, so a card kept its old
// lines after a refetch that changed lines without changing a total.
describe('a refetched dispatch whose lines changed is drawn again', () => {
  const allText = () => texts().join(' | ');

  it('dispatch card: a line swapped for another of the same quantity and weight', async () => {
    const onPress = jest.fn();
    const words = undefined as never;
    const element = (value: Dispatch) => <MemoizedDispatchItem dispatch={value} onPress={onPress} expanded words={words} />;
    await draw(element(dispatch));
    expect(allText()).toContain('B-14');

    const edited = { ...dispatch, items: [{ ...(dispatch.items as any[])[0], rack: 'C-02' }] } as unknown as Dispatch;
    await screen.rerender(element(edited));
    expect(allText()).toContain('C-02');
    expect(allText()).not.toContain('B-14');
  });

  it('recent order card: the name of who made it', async () => {
    const onPress = jest.fn();
    const element = (value: RecentDispatchedOrder) => <RecentDispatchedOrderCard dispatch={value} onPress={onPress} />;
    await draw(element(recent));
    expect(screen.getByText('Asha')).toBeOnTheScreen();
    expect(allText()).toContain('Asha');
    await screen.rerender(element({ ...recent, created_by_name: 'Meera' }));
    expect(allText()).toContain('Meera');
  });
});

/** Every spoken label on the screen (the labels the cards give their rows). */
const labels = () => screen.queryAllByLabelText(/[\s\S]*/, { includeHiddenElements: true }).map(node => node.props.accessibilityLabel as string);
const line = { grn_item_id: 'g1', item_name: 'Potatoes', rack: 'B-14', package_mark: 'PM', weight: 50, gr_no: '311', grn_qty: 200, disp_qty: 5 };
/** 5 bags of 50 kg: the total the card used to print was 250 kg. */
const fiveBags = (over: Partial<Omit<typeof line, 'weight' | 'rack'>> & { weight?: number | null; rack?: string | null } = {}) =>
  ({ ...dispatch, total_qty: 5, total_weight: 250, total_items: 1, items: [{ ...line, ...over }] }) as unknown as Dispatch;
const recentFiveBags = (over: { item_name?: string; weight?: number | null; rack?: string | null } = {}) =>
  ({ ...recent, total_qty: 5, items: [{ item_name: 'Potatoes', disp_qty: 5, rack: 'B-14', package_mark: 'PM', gr_no: '311', weight: 50, ...over }] }) as RecentDispatchedOrder;
const open = (value: Dispatch) => draw(<MemoizedDispatchItem dispatch={value} onPress={jest.fn()} expanded />);
/** Press the card's toggle (the one control that is closed) to open its lines. */
const openToggle = () => userEvent.press(screen.getByRole('button', { expanded: false }));
const openRecent = async (value: RecentDispatchedOrder) => {
  await draw(<RecentDispatchedOrderCard dispatch={value} onPress={jest.fn()} />);
  await openToggle();
};
/** The one Text that draws exactly this value. */
const textNode = (value: string) => {
  const found = textNodes().filter(node => shown(node) === value);
  expect(found).toHaveLength(1);
  return found[0];
};

// Phone review 2026-10-14 (UX-06). A lot stores one weight, the weight of one bag.
// The card printed "250 kg" under "5 bags" (a total) and headed the table column
// "Kg" over 50 (one bag). The owner's decision: no total weight anywhere, and a
// weight of one bag says "each".
describe('weights on the dispatch cards', () => {
  it('dispatch card, closed: "5 bags" and no "250 kg", shown or spoken', async () => {
    await draw(<MemoizedDispatchItem dispatch={fiveBags()} onPress={jest.fn()} />);

    expect(screen.getByText('5 bags')).toBeOnTheScreen();
    expect(texts()).toContain('5 bags');
    expect(texts()).not.toContain('250 kg');
    expect(texts().some(text => /kg/i.test(text))).toBe(false);
    const spoken = labels().find(label => label.startsWith('Dispatch 42'))!;
    expect(spoken).toContain('5 bags');
    expect(spoken).not.toMatch(/kg/i);
  });

  it('dispatch card, open: the column is headed "Kg each" over 50, and the line is read "50 kg each"', async () => {
    await open(fiveBags());

    expect(texts()).toEqual(expect.arrayContaining(['Kg each', '50', '311/200', '5']));
    expect(texts()).not.toContain('Kg');
    expect(texts()).not.toContain('250 kg');
    expect(labels()).toContain('Potatoes, PM, rack B-14, 50 kg each, GRN 311, 5 dispatched');
  });

  it('recent dispatch card, open: the same heading, number and reading', async () => {
    await openRecent(recentFiveBags());

    expect(texts()).toEqual(expect.arrayContaining(['Kg each', '50', '311', '5']));
    expect(texts()).not.toContain('Kg');
    expect(labels()).toContain('Potatoes, PM, rack B-14, 50 kg each, GRN 311, 5 dispatched');
  });

  it.each([[0], [null]])('a line whose lot has no weight (%s) shows a dash, not 0, and is read without a weight', async (weight) => {
    await open(fiveBags({ weight }));
    expect(texts()).toEqual(expect.arrayContaining(['Kg each', '—']));
    expect(texts()).not.toContain('0');
    expect(labels()).toContain('Potatoes, PM, rack B-14, GRN 311, 5 dispatched');
    expect(labels().some(label => /kg/i.test(label))).toBe(false);
    await screen.unmount();

    await open(fiveBags({ weight, rack: null }));
    expect(labels()).toContain('Potatoes, PM, GRN 311, 5 dispatched');
    await screen.unmount();

    await openRecent(recentFiveBags({ weight }));
    expect(texts()).toEqual(expect.arrayContaining(['Kg each', '—']));
    expect(texts()).not.toContain('0');
    expect(labels()).toContain('Potatoes, PM, rack B-14, GRN 311, 5 dispatched');
    await screen.unmount();

    await openRecent(recentFiveBags({ weight, rack: null }));
    expect(labels()).toContain('Potatoes, PM, GRN 311, 5 dispatched');
  });

  it('in Gujarati: "દરેકના kg" over ૫૦, read as દરેક ૫૦ કિલો, and without a weight read without one', async () => {
    setLanguage('gu');
    await open(fiveBags());
    expect(texts()).toEqual(expect.arrayContaining(['દરેકના kg', '૫૦']));
    expect(labels()).toContain('Potatoes, PM, રેક B-14, દરેક ૫૦ કિલો, આવક પાવતી 311, ૫ નંગ જાવક');
    await screen.unmount();

    await open(fiveBags({ weight: null }));
    expect(labels()).toContain('Potatoes, PM, રેક B-14, આવક પાવતી 311, ૫ નંગ જાવક');
    await screen.unmount();

    await open(fiveBags({ weight: null, rack: null }));
    expect(labels()).toContain('Potatoes, PM, આવક પાવતી 311, ૫ નંગ જાવક');
  });

  it('the recent card opens the GRN of a line that has a GRN id, and shows plain text for one that has none', async () => {
    const onViewGRN = jest.fn();
    const withId = { ...recentFiveBags(), items: [{ ...recentFiveBags().items[0], grn_id: 'grn-9', grn_qty: 200 }] } as RecentDispatchedOrder;
    await draw(<RecentDispatchedOrderCard dispatch={withId} onPress={jest.fn()} onViewGRN={onViewGRN} />);
    await openToggle();
    // The link is hidden from a screen reader on purpose (the row offers the action): it is found by test id.
    await userEvent.press(screen.getByTestId('dispatch-line-grn-grn-9', { includeHiddenElements: true }));
    expect(onViewGRN).toHaveBeenCalledWith('grn-9');
    expect(texts()).toContain('311/200');
    await screen.unmount();

    await openRecent(recentFiveBags());
    expect(screen.queryAllByTestId(/^dispatch-line-grn-/, { includeHiddenElements: true })).toHaveLength(0);
  });

  it('the recent card draws the same lines table as the dispatch card', async () => {
    await openRecent(recentFiveBags());
    expect(screen.getByTestId('recent-dispatch-lines-d2')).toBeOnTheScreen();
    expect(texts()).toEqual(expect.arrayContaining(['Item', 'Kg each', 'GRN/Received', 'Qty']));
  });

  // Review 2026-10-14, finding 2. The 72 dp weight column leaves the name about 70 dp on a
  // 360 dp phone (about 54 dp in Gujarati): on one line it was cut to a few letters.
  it('dispatch card, open: the item name may take two lines, as on the GRN list, and the line is one element', async () => {
    const name = 'Fictional long-grain basmati rice';
    await open(fiveBags({ item_name: name }));

    const nameText = textNode(name);
    expect(nameText).toHaveProp('numberOfLines', 2);
    expect(nameText).toHaveProp('ellipsizeMode', 'tail');

    const row = screen.getByLabelText(new RegExp(`^${name}`));
    expect(row).toHaveProp('accessible', true);
    expect(row).toHaveProp('testID', expect.stringMatching(/^d1-item-g1-0$/));
    // The weight and the quantity stay on one line each.
    for (const value of ['50', '5']) {
      expect(textNode(value)).toHaveProp('numberOfLines', 1);
    }
  });
});

// Phone review 2026-10-14, plan C step 13 (font scale 1.3): the rack sat beside the name
// in a wrapping row, and the name was drawn as one letter over "..", while the GRN cell
// "RV15001/100" was clipped to "RV15001/10". The owner's decision: the rack goes on its
// own line under the name; the weight column stays as it is.
describe('the item cell of the dispatch cards', () => {
  const name = 'Fictional long-grain basmati rice';
  const cards = [
    ['dispatch card', (over: { rack?: string | null } = {}) => open(fiveBags({ item_name: name, ...over }))],
    ['recent dispatch card', (over: { rack?: string | null } = {}) => openRecent(recentFiveBags({ item_name: name, ...over }))],
  ] as const;

  /** The item cell is the view that holds the name. */
  const itemCell = () => textNode(name).parent!;
  const cellTexts = () => within(itemCell()).queryAllByText(/[\s\S]*/, { includeHiddenElements: true }).map(shown);

  it.each(cards)('%s: the rack is its own Text under the name, which may take two lines', async (_card, openCard) => {
    await openCard();

    const nameText = textNode(name);
    const rackText = textNode('(B-14)');
    expect(rackText).not.toBe(nameText);
    expect(nameText.queryAll(node => node === rackText)).toHaveLength(0);
    // Name, mark and rack are stacked in one column, in that order.
    expect(rackText.parent).toBe(itemCell());
    expect(StyleSheet.flatten(itemCell().props.style)?.flexDirection ?? 'column').toBe('column');
    expect(cellTexts()).toEqual([name, 'PM', '(B-14)']);
    // The name keeps two lines and then a tail ellipsis; a long rack wraps, it is not cut.
    expect(nameText).toHaveProp('numberOfLines', 2);
    expect(nameText).toHaveProp('ellipsizeMode', 'tail');
    expect(rackText.props.numberOfLines).toBeUndefined();
    // A mark is cut with "…" on one line at the normal size (§13.7, phone run GL 2026-10-18); the whole mark is in the row's label.
    expect(textNode('PM')).toHaveProp('numberOfLines', 1);
    expect(textNode('PM')).toHaveProp('ellipsizeMode', 'tail');
    // The table styles the rack as the shared secondary text (footnote, 13).
    expect(rackText).toHaveStyle({ fontSize: 13 });
    // What the row says is unchanged.
    expect(labels()).toContain(`${name}, PM, rack B-14, 50 kg each, GRN 311, 5 dispatched`);
  });

  it.each(cards)('%s: a lot with no rack has no rack line', async (_card, openCard) => {
    for (const rack of [null, '']) {
      await openCard({ rack });
      expect(cellTexts()).toEqual([name, 'PM']);
      expect(texts().some(text => text.startsWith('('))).toBe(false);
      expect(labels()).toContain(`${name}, PM, 50 kg each, GRN 311, 5 dispatched`);
      if (rack === null) await screen.unmount();
    }
  });

  it('dispatch card: the table is the shared nested DataTable, one row per line, each read as one element', async () => {
    await open(fiveBags({ item_name: name }));
    expect(screen.getByTestId('dispatch-lines-d1')).toBeOnTheScreen();
    const row = screen.getByTestId('d1-item-g1-0');
    expect(row).toHaveProp('accessible', true);
  });

  it('dispatch card: "311/200" is one figure on one line, in a column sized to it', async () => {
    await open(fiveBags());
    expect(textNode('311/200')).toHaveProp('numberOfLines', 1);
  });
});
