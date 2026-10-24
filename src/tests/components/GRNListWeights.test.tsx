/**
 * Weights on the GRN list (owner's decision of 2026-10-14). A lot stores one
 * weight, that of one bag, box or crate. The card used to multiply it by the
 * bags and print the result under the stock tag ("5,000 kg"): that total is
 * gone. The open card's table (a nested DataTable since 2026-10-18) keeps the
 * weight of one package under "Kg each", and moves it under the item at large text.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import GRNListFiori from '@/components/GRNListFiori';
import { StyleSheet } from 'react-native';
import { FIRST_COLUMN_EM, crowded, lastColumnAlone, nb, nestedRowWidth, numberColumnWidth } from '@/components/common/DetailTable';
import { space, typography } from '@/theme/tokens';
import { getAllGRNItems } from '@/services/grn-service';
import { setLanguage } from '@/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
// Every row is drawn, as the list draws the rows on screen.
jest.mock('@shopify/flash-list', () => {
  const mockReact = require('react');
  return {
    FlashList: ({ data, renderItem }: { data: { key: string }[]; renderItem: (info: { item: unknown }) => unknown }) =>
      mockReact.createElement(
        mockReact.Fragment,
        null,
        data.map((item) => mockReact.createElement(mockReact.Fragment, { key: item.key }, renderItem({ item })))
      ),
  };
});
// Reduced motion: the loading skeleton's pulse would otherwise go on running after the test is over.
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/grn-service', () => ({
  getAllGRNItems: jest.fn(),
  getAssignedCustomerGRNItems: jest.fn(),
  withReceiptPages: (request: { p_filters?: object }) => ({ ...request, p_filters: { ...request.p_filters, page_by: 'receipt' } }),
  countReceipts: (items: { grn_id?: string; id: string }[]) => new Set(items.map((item) => item.grn_id || item.id)).size,
}));
jest.mock('@/features/filters/configs', () => ({ GRN_FILTERS: { listKey: 'grn-list' } }));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
jest.mock('@/features/filters/components/FilteredListHeader', () => ({
  FilteredListHeader: () => null,
  filteredEmptyProps: () => ({ activeFilterCount: 0 }),
}));
const mockFilters = {
  request: { p_sort_by: 'gr_no', p_sort_order: 'desc' },
  sort: { field: 'gr_no', order: 'desc' },
  search: '',
  values: {},
  hasAny: false,
  setSearch: jest.fn(),
  apply: jest.fn(),
  clear: jest.fn(),
};
jest.mock('@/features/filters/useListFilters', () => ({ useListFilters: () => mockFilters }));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
// One object for every read: the list loads again whenever the profile it reads is a new one.
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'admin', assignedCustomerIds: [] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
let mockFontScale = 1;
let mockWidth = 392;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const GRN = 'grn-fictional-1';
const row = (id: string, item_name: string, qty: number, weight: number | null, stock = qty) => ({
  id: GRN,
  grn_id: GRN,
  grn_item_id: id,
  gr_no: 'RV15001',
  date: '2026-10-01',
  customer_id: 'customer-fictional-1',
  customer_name: 'Fictional Orchard',
  supervisor_name: null,
  registration: null,
  item_name,
  packaging: 'Bag',
  qty,
  stock,
  weight,
  rack: null,
  package_mark: null,
});

const mounted: ReactTestRenderer[] = [];
async function renderList(rows: ReturnType<typeof row>[]) {
  jest.mocked(getAllGRNItems).mockResolvedValue({
    success: true,
    message: '',
    data: { items: rows, pagination: { total_count: 1, limit: 20, offset: 0, has_more: false, unit: 'receipt' } },
  } as never);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GRNListFiori />);
  });
  mounted.push(tree);
  return tree;
}

afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
  setLanguage('en');
  mockFontScale = 1;
  mockWidth = 392;
});

const isText = (node: ReactTestInstance) => (node.type as unknown) === 'Text';
const textOf = (node: ReactTestInstance) =>
  [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join('');
const texts = (tree: ReactTestRenderer) => tree.root.findAll(isText).map(textOf);
const host = (tree: ReactTestRenderer, testID: string) =>
  tree.root.find((node) => typeof node.type === 'string' && node.props.testID === testID);
/** Opens the card's table with its own button. */
const expand = (tree: ReactTestRenderer) =>
  act(() => tree.root.find((node) => node.props.testID === `grn-card-toggle-${GRN}` && typeof node.props.onPress === 'function').props.onPress());
/** The stack at the end of the card: what is left of what was received, and the status tag. */
const attributeStack = (tree: ReactTestRenderer) => host(tree, `grn-card-stock-${GRN}`).findAll(isText).map(textOf);
/** The table's heading and its rows, cell by cell, with what each row says aloud. */
const table = (tree: ReactTestRenderer) => {
  const grid = host(tree, `grn-lines-${GRN}`);
  const rows = grid.findAll((node) => typeof node.type === 'string' && String(node.props.testID ?? '').startsWith('grn-line-'));
  const inRow = new Set(rows.flatMap((line) => line.findAll(isText)));
  return {
    header: grid.findAll(isText).filter((node) => !inRow.has(node)).map(textOf),
    rows: rows.map((line) => line.findAll(isText).map(textOf)),
    spoken: rows.map((line) => line.props.accessibilityLabel as string),
  };
};

describe('GRN list card', () => {
  it('shows no total weight for 100 bags at 50 kg, on the card or aloud', async () => {
    const tree = await renderList([row('line-1', 'Potato', 100, 50, 80)]);

    const all = texts(tree);
    expect(all).toContain('GRN RV15001');
    // What is left of what was received, then the status tag; "5,000 kg" used to be under them.
    expect(attributeStack(tree)).toEqual([`80 of ${nb('100 bags')}`, 'In stock']);
    expect(all).not.toContain('5,000 kg');
    expect(all.filter((text) => /kg|kilo/i.test(text))).toEqual([]);
    expect(host(tree, `grn-card-${GRN}`).props.accessibilityLabel).toBe(
      `GRN RV15001, Fictional Orchard, 1 Oct, 1 item, 80 of ${nb('100 bags')}, In stock`
    );
  });

  it('heads the weight column "Kg each" over the weight of one package', async () => {
    const tree = await renderList([row('line-1', 'Potato', 100, 50)]);
    expect(texts(tree)).not.toContain('Kg each');

    await expand(tree);

    const { header, rows, spoken } = table(tree);
    expect(header).toEqual(['Item', 'Bags', 'Kg each', 'Stock']);
    expect(rows).toEqual([['Potato', '100', '50', '100']]);
    expect(spoken).toEqual(['Potato, 100 bags, 50 kg each, 100 in stock, In stock']);
    // Still no total with the table open: the heading is the only text that names kilograms.
    expect(attributeStack(tree)).toEqual([`100 of ${nb('100 bags')}`, 'In stock']);
    expect(texts(tree).filter((text) => /kg|kilo/i.test(text))).toEqual(['Kg each']);
  });

  it('shows a dash, and says no weight, for a lot saved without one', async () => {
    const tree = await renderList([
      row('line-1', 'Potato', 100, 50),
      row('line-2', 'Onion', 40, 0),
      row('line-3', 'Garlic', 10, null),
    ]);

    await expand(tree);

    const { rows, spoken } = table(tree);
    expect(rows).toEqual([
      ['Potato', '100', '50', '100'],
      ['Onion', '40', '—', '40'],
      ['Garlic', '10', '—', '10'],
    ]);
    expect(spoken).toEqual([
      'Potato, 100 bags, 50 kg each, 100 in stock, In stock',
      'Onion, 40 bags, 40 in stock, In stock',
      'Garlic, 10 bags, 10 in stock, In stock',
    ]);
  });

  it('says "દરેકના kg" and "દરેક ૫૦ કિલો" in Gujarati', async () => {
    setLanguage('gu');
    const tree = await renderList([row('line-1', 'Potato', 100, 50)]);

    await expand(tree);

    const { header, rows, spoken } = table(tree);
    expect(header[2]).toBe('દરેકના kg');
    expect(rows[0][2]).toBe('૫૦');
    expect(spoken[0]).toContain('દરેક ૫૦ કિલો');
  });
});

describe('GRN list table at large text', () => {
  // At 2.0 on 392 dp, Bags (96) and Stock (104) would leave the item 100 dp, under the 150 dp (5 em) it keeps:
  // Bags moves under the item as well (style guide 13.7), leaving Item | Stock.
  it('moves "Kg each" and the bags under the item at font scale 2, leaving Item and Stock', async () => {
    mockFontScale = 2;
    const tree = await renderList([row('line-1', 'Potato', 100, 50)]);

    await expand(tree);

    const { header, rows } = table(tree);
    expect(header).toEqual(['Item', 'Stock']);
    expect(rows).toEqual([['Potato', nb('50 kg each'), nb('100 bags'), '100']]);
  });

  it('keeps 9,999 bags whole on one line at font scale 1.3, and names a line that is not in stock', async () => {
    // On a 392 dp phone the three figures would crowd the item at the design edge, so "Kg each" moves under it.
    mockFontScale = 1.3;
    const tree = await renderList([row('line-1', 'Potato', 9999, 50, 0)]);

    await expand(tree);

    const grid = host(tree, `grn-lines-${GRN}`);
    const figures = grid.findAll((node) => isText(node) && textOf(node) === '9,999');
    expect(figures).toHaveLength(1);
    expect(figures[0].props.numberOfLines).toBe(1);
    // The status is a word under the item, never a figure cut with "…".
    expect(table(tree).header).toEqual(['Item', 'Bags', 'Stock']);
    expect(table(tree).rows[0]).toEqual(['Potato', nb('50 kg each'), 'Fully dispatched', '9,999', '0']);
  });
});

/** The widths of the figure columns drawn in the first row, and the width left for the item. */
const drawn = (tree: ReactTestRenderer, width: number) => {
  const line = host(tree, `grn-lines-${GRN}`).find((node) => typeof node.type === 'string' && String(node.props.testID ?? '').startsWith('grn-line-'));
  const widths = line
    .findAll((node) => typeof node.type === 'string' && typeof StyleSheet.flatten(node.props.style)?.width === 'number')
    .map((node) => StyleSheet.flatten(node.props.style).width as number);
  return { widths, item: nestedRowWidth({ width }) - widths.reduce((sum, w) => sum + w, 0) - widths.length * space.sm };
};

describe('GRN list table: the item column keeps its room', () => {
  for (const width of [360, 392]) {
    for (const scale of [1, 1.3, 1.5, 2]) {
      for (const qty of [100, 9999]) {
        it(`${width} dp, font scale ${scale}, ${qty} bags: at least 5 em for the item, or no column beside it`, async () => {
          mockWidth = width;
          mockFontScale = scale;
          const tree = await renderList([row('line-1', 'Potato', qty, 50)]);
          await expand(tree);
          const { header } = table(tree);
          const { widths, item } = drawn(tree, width);
          if (widths.length > 0) expect(item).toBeGreaterThanOrEqual(FIRST_COLUMN_EM * (typography.subhead.fontSize ?? 15) * scale);

          // The same layout, worked out here from the sizing functions.
          const screen = { scale, numberWidth: (b: number) => Math.ceil(b * scale) };
          const figure = qty === 9999 ? '9,999' : String(qty);
          const bagsW = numberColumnWidth(screen, 48, [figure]) + space.xs;
          const kgW = numberColumnWidth(screen, 72, ['50']) + space.xs;
          const stockW = numberColumnWidth(screen, 52, [figure]) + space.xs;
          const nested = nestedRowWidth({ width });
          const kgUnder = scale >= 1.5 || crowded(nested, [bagsW, kgW, stockW], 0, scale);
          const bagsUnder = kgUnder && crowded(nested, [bagsW, stockW], 0, scale);
          const stockUnder = bagsUnder && lastColumnAlone(nested, stockW, scale);
          expect(header).toEqual(['Item', ...(bagsUnder ? [] : ['Bags']), ...(kgUnder ? [] : ['Kg each']), 'Stock']);
          // Drawn `space.xs` wider than the estimate (included in bagsW etc.), so a figure is never cut.
          expect(widths).toEqual([...(bagsUnder ? [] : [bagsW]), ...(kgUnder ? [] : [kgW]), ...(stockUnder ? [] : [stockW])]);
        });
      }
    }
  }

  it('keeps all four columns for ordinary data at font scale 1 on 392 dp', async () => {
    const tree = await renderList([row('line-1', 'Potato', 100, 50)]);
    await expand(tree);
    expect(table(tree).header).toEqual(['Item', 'Bags', 'Kg each', 'Stock']);
  });

  it('puts the stock on its own line under the item when it would still crowd it (99,99,999 bags at 2.0 on 360 dp)', async () => {
    mockWidth = 360;
    mockFontScale = 2;
    const tree = await renderList([row('line-1', 'Potato', 9999999, 50)]);
    await expand(tree);
    const { header, rows } = table(tree);
    expect(header).toEqual(['Item', 'Stock']);
    expect(drawn(tree, 360).widths).toEqual([]);
    expect(rows).toEqual([['Potato', nb('50 kg each'), nb('99,99,999 bags'), '99,99,999']]);
  });

  it('gives "Kg each" 72 dp at font scale 1, room for the Gujarati heading on one line (e8d3fe9)', async () => {
    setLanguage('gu');
    const tree = await renderList([row('line-1', 'Potato', 100, 50)]);
    await expand(tree);
    expect(table(tree).header[2]).toBe('દરેકના kg');
    expect(drawn(tree, 392).widths[1]).toBeGreaterThanOrEqual(72);
  });
});

describe('GRN card figures, marks and stock text (phone run GL, 2026-10-18)', () => {
  const MARK = 'BL/STRETCH-LOT-0004/LONG-PACKAGE-MARK-FOR-WRAP-TEST/ABCDEFG1234';
  const withMark = () => ({ ...row('line-1', 'Saffron', 21, 1, 21), package_mark: MARK }) as unknown as ReturnType<typeof row>;

  it('draws the figures without adjustsFontSizeToFit (Android auto-size drew them tiny)', async () => {
    const tree = await renderList([withMark(), row('line-2', 'Potato', 9999, 50, 9999)]);
    await expand(tree);
    const grid = host(tree, `grn-lines-${GRN}`);
    const figures = grid.findAll((node) => isText(node) && ['21', '1', '9,999', '50'].includes(textOf(node)));
    expect(figures.length).toBeGreaterThanOrEqual(6);
    for (const figure of figures) {
      expect(figure.props.numberOfLines).toBe(1);
      expect(figure.props.adjustsFontSizeToFit).toBeUndefined();
    }
  });

  it('draws every figure Text of the stacked line, under the item as well, without adjustsFontSizeToFit (R6-8)', async () => {
    mockWidth = 360;
    mockFontScale = 2;
    const tree = await renderList([row('line-1', 'Potato', 9999999, 50, 9999999)]);
    await expand(tree);
    const grid = host(tree, `grn-lines-${GRN}`);
    const figures = grid.findAll((node) => isText(node) && textOf(node).startsWith('99,99,999'));
    // The bags under the item ("99,99,999 bags") and the stock ("99,99,999").
    expect(figures.map(textOf)).toEqual([nb('99,99,999 bags'), '99,99,999']);
    for (const figure of figures) {
      expect(figure.props.numberOfLines).toBe(1);
      expect(figure.props.adjustsFontSizeToFit).toBeUndefined();
    }
  });

  it('cuts a 60-character mark on one line with the tail cut, and says it in full aloud', async () => {
    expect(MARK.length).toBeGreaterThanOrEqual(60);
    const tree = await renderList([withMark()]);
    await expand(tree);
    const grid = host(tree, `grn-lines-${GRN}`);
    const mark = grid.findAll((node) => isText(node) && textOf(node) === nb(MARK));
    expect(mark).toHaveLength(1);
    expect(mark[0].props.numberOfLines).toBe(1);
    expect(mark[0].props.ellipsizeMode).toBe('tail');
    expect(table(tree).spoken[0]).toContain(MARK);
  });

  it('keeps "9,999 bags" together in the card stock text: a wrap falls after "of"', async () => {
    const tree = await renderList([row('line-1', 'Potato', 9999, 50, 2621)]);
    const stock = attributeStack(tree)[0];
    expect(stock).toBe(`2,621 of 9,999\u00a0bags`);
    expect(stock).toContain('9,999\u00a0bags');
  });
});
