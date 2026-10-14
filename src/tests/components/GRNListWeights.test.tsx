/**
 * Weights on the GRN list (owner's decision of 2026-10-14). A lot stores one
 * weight, that of one bag, box or crate. The card used to multiply it by the
 * bags and print the result under the stock tag ("5,000 kg"): that total is
 * gone. The expanded table keeps the weight of one package under "Kg each".
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import GRNListFiori from '@/components/GRNListFiori';
import { makeGRNListStyles } from '@/components/GRNListFiori.styles';
import { getThemedStyles } from '@/hooks/useTheme';
import { getTokens } from '@/theme/tokens';
import { getAllGRNItems } from '@/services/grn-service';
import { setLanguage, t } from '@/i18n';
import { formatCount } from '@/utils/formatters';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
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
jest.mock('react-native-paper', () => ({ Snackbar: () => null }));
// Reduced motion: the loading skeleton's spring would otherwise go on running after the test is over.
jest.mock('react-native-reanimated', () => ({ __esModule: true, ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/PrintJobsBottomSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/grn-service', () => ({ getAllGRNItems: jest.fn(), getAssignedCustomerGRNItems: jest.fn() }));
jest.mock('@/features/filters/configs', () => ({
  FILTER_CONFIGS: { 'grn-list': {} },
  GRN_FILTERS: { listKey: 'grn-list', search: { placeholder: 'Search GRNs' } },
}));
jest.mock('@/features/filters/filterModel', () => ({ readSearch: () => ({ text: '' }) }));
jest.mock('@/features/filters/components/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('@/features/filters/components/ListSearchField', () => ({ ListSearchField: () => null }));
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
// One object for every read: the list loads again whenever the profile it reads is a new one.
const mockState = {
  theme: { preference: 'light', brand: 'orange' },
  auth: { userProfile: { id: 'profile-fictional', role: 'admin', assignedCustomerIds: [] } },
};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const row = (id: string, item_name: string, qty: number, weight: number | null) => ({
  id,
  grn_id: 'grn-fictional-1',
  gr_no: 'RV15001',
  date: '2026-10-01',
  customer_id: 'customer-fictional-1',
  customer_name: 'Fictional Orchard',
  supervisor_name: null,
  registration: null,
  item_name,
  packaging: 'Bag',
  qty,
  stock: qty,
  weight,
  rack: null,
  package_mark: null,
});

const mounted: ReactTestRenderer[] = [];
async function renderList(rows: ReturnType<typeof row>[]) {
  jest.mocked(getAllGRNItems).mockResolvedValue({
    success: true,
    message: '',
    data: { items: rows, pagination: { total_count: rows.length, limit: 20, offset: 0, has_more: false } },
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
});

const isText = (node: ReactTestInstance) => (node.type as unknown) === 'Text';
const textOf = (node: ReactTestInstance) =>
  [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join('');
const texts = (tree: ReactTestRenderer) => tree.root.findAll(isText).map(textOf);
const labels = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string')
    .map((node) => node.props.accessibilityLabel as string);
const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
/** Opens the item table of the one card on screen with the card's own button. */
const expand = (tree: ReactTestRenderer, items: number) =>
  act(() => pressable(tree, t('lists.grn.showDetailsOf', { items: formatCount(items, 'item') })).props.onPress({ stopPropagation: jest.fn() }));
/** The view a drawn node sits in. */
const hostParent = (node: ReactTestInstance) => {
  let parent = node.parent;
  while (parent && typeof parent.type !== 'string') parent = parent.parent;
  return parent!;
};
/** The stack at the end of the card: the stock, its label, the status tag, and whatever else is drawn under them. */
const attributeStack = (tree: ReactTestRenderer) =>
  hostParent(tree.root.findAll(isText).find((node) => textOf(node) === 'in stock')!).findAll(isText).map(textOf);
/** The table's header and its rows, cell by cell. */
const table = (tree: ReactTestRenderer) => {
  const header = tree.root.find((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'header' && node.findAll(isText).length === 4);
  const section = hostParent(header);
  const rows = section.findAll((node) => typeof node.type === 'string' && node.props.accessible === true && node !== header && hostParent(node) === section);
  return { header: header.findAll(isText).map(textOf), rows: rows.map((line) => line.findAll(isText).map(textOf)), spoken: rows.map((line) => line.props.accessibilityLabel as string) };
};

describe('GRN list card', () => {
  it('shows no total weight for 100 bags at 50 kg, on the card or aloud', async () => {
    const tree = await renderList([row('line-1', 'Potato', 100, 50)]);

    const all = texts(tree);
    expect(all).toContain('GRN RV15001');
    // The stock, its label and the status tag; "5,000 kg" used to be the fourth line.
    expect(attributeStack(tree)).toEqual(['100', 'in stock', 'In stock']);
    expect(all).not.toContain('5,000 kg');
    expect(all.filter((text) => /kg|kilo/i.test(text))).toEqual([]);
    expect(labels(tree).find((label) => label.startsWith('GRN RV15001'))).toBe(
      'GRN RV15001, Fictional Orchard, 1 Oct, 1 item, 100 in stock, In stock'
    );
  });

  it('heads the weight column "Kg each" over the weight of one package', async () => {
    const tree = await renderList([row('line-1', 'Potato', 100, 50)]);
    expect(texts(tree)).not.toContain('Kg each');

    expand(tree, 1);

    const { header, rows, spoken } = table(tree);
    expect(header).toEqual(['Item', 'Bags', 'Kg each', 'Stock']);
    expect(rows).toEqual([['Potato', '100', '50', '100']]);
    expect(spoken).toEqual(['Potato, 100 bags, 50 kg each, 100 in stock, In stock']);
    // Still no total with the table open: the header is the only text that names kilograms.
    expect(attributeStack(tree)).toEqual(['100', 'in stock', 'In stock']);
    expect(texts(tree).filter((text) => /kg|kilo/i.test(text))).toEqual(['Kg each']);
  });

  it('shows a dash, and says no weight, for a lot saved without one', async () => {
    const tree = await renderList([
      row('line-1', 'Potato', 100, 50),
      row('line-2', 'Onion', 40, 0),
      row('line-3', 'Garlic', 10, null),
    ]);

    expand(tree, 3);

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

    expand(tree, 1);

    const { header, rows, spoken } = table(tree);
    expect(header[2]).toBe('દરેકના kg');
    expect(rows[0][2]).toBe('૫૦');
    expect(spoken[0]).toContain('દરેક ૫૦ કિલો');
  });
});

describe('GRN list table columns', () => {
  it('gives "Kg each" a column of 72, wider than the 56 that held "Kg"', () => {
    const styles = getThemedStyles(makeGRNListStyles, getTokens('orange', 'light'));
    expect(StyleSheet.flatten(styles.colWeight)).toEqual(expect.objectContaining({ width: 72, textAlign: 'right' }));
    // The total that sat under the stock tag has no style left to draw it with.
    expect(styles).not.toHaveProperty('weightText');
  });
});
