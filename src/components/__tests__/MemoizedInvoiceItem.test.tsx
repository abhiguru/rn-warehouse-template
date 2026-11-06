import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import {
  MemoizedInvoiceItem,
  invoiceItemPropsAreEqual,
  type MemoizedInvoiceItemProps,
} from '../list-items/MemoizedInvoiceItem';
import type { Invoice } from '@/services/invoice-service';
import { StatusTag } from '@/components/ui/StatusTag';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// The bar draws four across or 2 x 2 by the window width and text size (WH-59): 392 dp and normal text unless a test sets them.
let mockWidth = 392;
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const invoice = {
  invoice_id: 'fictional-invoice',
  invoice_number: 'FXI0001',
  invoice_date: '2026-10-01',
  total: 1000,
  tax_amount: 50,
  labour: 0,
  discount: 0,
  financial_year: 2026,
  is_auto_generated: false,
  customer: { name: 'Fictional Customer' },
  grn: { gr_no: 'FXG001' },
} as unknown as Invoice;

// The item no longer takes `colors`; the props still carry the empty object they always had.
type PropsAsTested = MemoizedInvoiceItemProps & { colors: Record<string, never> };
const colors: PropsAsTested['colors'] = {};
const onPress = jest.fn();
const props = (overrides: Partial<Invoice> = {}): PropsAsTested => ({
  invoice: { ...invoice, ...overrides },
  onPress,
  canPrint: true,
  colors,
});

it('treats an unchanged invoice as equal even when the object identity differs', () => {
  expect(invoiceItemPropsAreEqual(props(), props())).toBe(true);
});

it('re-renders when only the invoice date changed', () => {
  expect(invoiceItemPropsAreEqual(props(), props({ invoice_date: '2026-10-02' }))).toBe(false);
});

it.each<[keyof Invoice, unknown]>([
  ['invoice_number', 'FXI0002'],
  ['total', 1001],
  ['tax_amount', 51],
  ['labour', 10],
  ['discount', 5],
  ['financial_year', 2027],
  ['is_auto_generated', true],
])('re-renders when %s changed', (field, value) => {
  expect(invoiceItemPropsAreEqual(props(), props({ [field]: value } as Partial<Invoice>))).toBe(false);
});

it('re-renders when the customer name, GRN number, callback or print flag changed', () => {
  expect(invoiceItemPropsAreEqual(props(), props({ customer: { name: 'Other Customer' } } as Partial<Invoice>))).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), props({ grn: { gr_no: 'FXG002' } } as Partial<Invoice>))).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), { ...props(), onPress: jest.fn() })).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), { ...props(), canPrint: false })).toBe(false);
});

describe('a cancelled invoice', () => {
  const render = (overrides: Partial<Invoice>) => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<MemoizedInvoiceItem {...props(overrides)} />); });
    return tree;
  };
  const labelOf = (tree: ReactTestRenderer) => tree.root.findAll(n => n.props.accessibilityRole === 'button')[0].props.accessibilityLabel as string;

  it('shows a Cancelled tag and speaks it', () => {
    const tree = render({ cancelled_at: '2026-10-05T10:00:00Z' });
    expect(tree.root.findAllByType(StatusTag).map(tag => tag.props.label)).toContain('Cancelled');
    expect(labelOf(tree)).toContain('Cancelled');
    act(() => tree.unmount());
  });

  it('shows no tag for a live invoice, and re-renders when it becomes cancelled', () => {
    const tree = render({});
    expect(tree.root.findAllByType(StatusTag).map(tag => tag.props.label)).not.toContain('Cancelled');
    expect(invoiceItemPropsAreEqual(props(), props({ cancelled_at: '2026-10-05T10:00:00Z' }))).toBe(false);
    act(() => tree.unmount());
  });
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))(
  'invoice cell in %s %s',
  (brand, mode) => {
    it('renders the card on surface.card with the discount in positive text', () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      let tree!: ReactTestRenderer;
      act(() => {
        tree = create(
          <MemoizedInvoiceItem invoice={{ ...invoice, discount: 250, labour: 20 }} onPress={onPress} />
        );
      });
      const texts = tree.root.findAll(n => (n.type as unknown) === 'Text');
      const discount = texts.find(n => [].concat(n.props.children).join('') === '−₹250');
      expect(discount).toBeDefined();
      expect(StyleSheet.flatten(discount!.props.style).color).toBe(t.status.positive.text);
      const total = texts.find(n => [].concat(n.props.children).join('') === '₹1,000.00');
      expect(StyleSheet.flatten(total!.props.style).color).toBe(t.text.primary);
      const pressable = tree.root.findAll(n => n.props.accessibilityRole === 'button')[0];
      expect(pressable.props.accessibilityLabel).toContain('Invoice FXI0001');
      act(() => tree.unmount());
    });
  }
);

describe('the four places of the amounts bar (WH-59)', () => {
  const mount = (over: Partial<Invoice> = {}) => {
    let tree!: ReactTestRenderer;
    act(() => { tree = create(<MemoizedInvoiceItem invoice={{ ...invoice, ...over } as Invoice} onPress={onPress} />); });
    return tree;
  };
  const textOf = (node: { props: { children?: unknown } }) => [node.props.children].flat(Infinity).join('');
  const texts = (tree: ReactTestRenderer) => tree.root.findAll(n => (n.type as unknown) === 'Text').map(textOf);
  const label = (tree: ReactTestRenderer) => tree.root.findAll(n => n.props.accessibilityRole === 'button')[0].props.accessibilityLabel as string;
  /** The bar's rows: each the list of [value, label] of its places. */
  const rows = (tree: ReactTestRenderer) => {
    const names = ['Subtotal', 'Tax', 'Labour', 'Discount', 'Surcharge'];
    const all = texts(tree);
    const places = all.flatMap((text, i) => (names.includes(text) ? [[all[i - 1], text] as const] : []));
    return places;
  };
  afterEach(() => { mockWidth = 392; mockFontScale = 1; });

  it('has Subtotal, Tax, Labour and Discount in that order, in whole rupees, with a dash for a place with nothing', () => {
    const tree = mount({ total: 1050, tax_amount: 50, labour: 0, discount: 0 });
    expect(rows(tree)).toEqual([['₹1,000', 'Subtotal'], ['₹50', 'Tax'], ['–', 'Labour'], ['–', 'Discount']]);
    // The total keeps its two decimals.
    expect(texts(tree)).toContain('₹1,050.00');
    act(() => tree.unmount());
  });

  it('shows every place, in the same order, when everything has an amount', () => {
    const tree = mount({ total: 1020, tax_amount: 50, labour: 20, discount: 250 });
    expect(rows(tree).map(([, name]) => name)).toEqual(['Subtotal', 'Tax', 'Labour', 'Discount']);
    expect(rows(tree)[3]).toEqual(['−₹250', 'Discount']);
    act(() => tree.unmount());
  });

  it('a surcharge invoice says Surcharge with a plus in the last place, and has no Discount', () => {
    const tree = mount({ total: 1100, tax_amount: 50, labour: 0, discount: -100 });
    expect(rows(tree).map(([, name]) => name)).toEqual(['Subtotal', 'Tax', 'Labour', 'Surcharge']);
    expect(rows(tree)[3]).toEqual(['+₹100', 'Surcharge']);
    act(() => tree.unmount());
  });

  it('reads every amount aloud as the exact figure, and a place with nothing says nothing (no dash)', () => {
    const tree = mount({ total: 1050, tax_amount: 50, labour: 0, discount: 0 });
    const spoken = label(tree);
    expect(spoken).toContain('Subtotal ₹1,000.00');
    expect(spoken).toContain('Tax ₹50.00');
    expect(spoken).not.toContain('Labour');
    expect(spoken).not.toContain('Discount');
    expect(spoken).not.toContain('–');
    act(() => tree.unmount());
  });

  it('draws the date as day, short month and year', () => {
    const tree = mount();
    expect(texts(tree)).toContain('1 Oct 26');
    act(() => tree.unmount());
  });

  it('is four across at 392 dp and normal text, and 2 x 2 at a large text size, on every card alike', () => {
    const rowsOf = (tree: ReactTestRenderer) => tree.root.findAll(n => typeof n.type === 'string' && n.props.style && StyleSheet.flatten(n.props.style).flexDirection === 'row' && n.findAll(c => (c.type as unknown) === 'Text' && ['Subtotal', 'Tax', 'Labour', 'Discount'].includes(textOf(c))).length > 0 && n.findAll(c => (c.type as unknown) === 'Text' && ['Subtotal', 'Tax', 'Labour', 'Discount'].includes(textOf(c))).length < 5);
    const placesIn = (node: ReactTestRenderer['root']) => node.findAll(c => (c.type as unknown) === 'Text' && ['Subtotal', 'Tax', 'Labour', 'Discount'].includes(textOf(c))).length;
    const one = mount();
    const normal = rowsOf(one).filter(r => placesIn(r) === 4);
    expect(normal.length).toBeGreaterThan(0);
    act(() => one.unmount());

    mockFontScale = 2;
    const large = mount({ total: 1020, tax_amount: 50, labour: 20, discount: 250 });
    const empty = mount({ total: 1000, tax_amount: 0, labour: 0, discount: 0 });
    for (const tree of [large, empty]) {
      const bars = rowsOf(tree);
      expect(bars.filter(r => placesIn(r) === 4)).toHaveLength(0);
      expect(bars.filter(r => placesIn(r) === 2).length).toBe(2);
    }
    act(() => { large.unmount(); empty.unmount(); });
  });
});
