import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  MemoizedInvoiceItem,
  invoiceItemPropsAreEqual,
  type MemoizedInvoiceItemProps,
} from '../list-items/MemoizedInvoiceItem';
import type { Invoice } from '@/services/invoice-service';
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
  const label = () => screen.getByRole('button').props.accessibilityLabel as string;

  it('shows a Cancelled tag and speaks it', async () => {
    await render(<MemoizedInvoiceItem {...props({ cancelled_at: '2026-10-05T10:00:00Z' })} />);
    expect(screen.getByText('Cancelled')).toBeOnTheScreen();
    expect(label()).toContain('Cancelled');
  });

  it('shows no tag for a live invoice, and re-renders when it becomes cancelled', async () => {
    await render(<MemoizedInvoiceItem {...props({})} />);
    expect(screen.queryByText('Cancelled')).not.toBeOnTheScreen();
    expect(label()).not.toContain('Cancelled');
    expect(invoiceItemPropsAreEqual(props(), props({ cancelled_at: '2026-10-05T10:00:00Z' }))).toBe(false);
  });
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))(
  'invoice cell in %s %s',
  (brand, mode) => {
    it('renders the card on surface.card with the discount in positive text', async () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      await render(<MemoizedInvoiceItem invoice={{ ...invoice, discount: 250, labour: 20 }} onPress={onPress} />);
      // The amounts bar is hidden from a screen reader (the card's label says it), but it is drawn.
      const shown = { includeHiddenElements: true };
      expect(screen.getByText('−₹250', shown)).toHaveStyle({ color: t.status.positive.text });
      expect(screen.getByText('₹1,000.00', shown)).toHaveStyle({ color: t.text.primary });
      expect(screen.getByRole('button').props.accessibilityLabel).toContain('Invoice FXI0001');
    });
  }
);

describe('the four places of the amounts bar (WH-59)', () => {
  const element = (over: Partial<Invoice> = {}) => <MemoizedInvoiceItem invoice={{ ...invoice, ...over } as Invoice} onPress={onPress} />;
  const textOf = (node: { props: { children?: unknown } }) => [node.props.children].flat(Infinity).join('');
  // The amounts bar is hidden from a screen reader (the card's label says it), but it is drawn.
  const shown = { includeHiddenElements: true };
  const texts = () => screen.getAllByText(/./, shown).map(textOf);
  const label = () => screen.getByRole('button').props.accessibilityLabel as string;
  const PLACES = ['Before tax', 'Tax', 'Labour', 'Discount'];
  /** The bar's places: each [value, label], in the order they are drawn. */
  const rows = () => {
    const names = ['Before tax', 'Tax', 'Labour', 'Discount', 'Surcharge'];
    const all = texts();
    return all.flatMap((text, i) => (names.includes(text) ? [[all[i - 1], text] as const] : []));
  };
  afterEach(() => { mockWidth = 392; mockFontScale = 1; });

  it('has Before tax, Tax, Labour and Discount in that order, in whole rupees, with a dash for a place with nothing', async () => {
    await render(element({ total: 1050, tax_amount: 50, labour: 0, discount: 0 }));
    expect(rows()).toEqual([['₹1,000', 'Before tax'], ['₹50', 'Tax'], ['–', 'Labour'], ['–', 'Discount']]);
    // The total keeps its two decimals.
    expect(texts()).toContain('₹1,050.00');
  });

  it('shows every place, in the same order, when everything has an amount', async () => {
    await render(element({ total: 1020, tax_amount: 50, labour: 20, discount: 250 }));
    expect(rows().map(([, name]) => name)).toEqual(['Before tax', 'Tax', 'Labour', 'Discount']);
    expect(rows()[3]).toEqual(['−₹250', 'Discount']);
  });

  it('a surcharge invoice says Surcharge with a plus in the last place, and has no Discount', async () => {
    await render(element({ total: 1100, tax_amount: 50, labour: 0, discount: -100 }));
    expect(rows().map(([, name]) => name)).toEqual(['Before tax', 'Tax', 'Labour', 'Surcharge']);
    expect(rows()[3]).toEqual(['+₹100', 'Surcharge']);
  });

  it('reads every amount aloud as the exact figure, and a place with nothing says nothing (no dash)', async () => {
    await render(element({ total: 1050, tax_amount: 50, labour: 0, discount: 0 }));
    const spoken = label();
    expect(spoken).toContain('Before tax ₹1,000.00');
    expect(spoken).toContain('Tax ₹50.00');
    expect(spoken).not.toContain('Labour');
    expect(spoken).not.toContain('Discount');
    expect(spoken).not.toContain('–');
  });

  it('draws the date as day, short month and year', async () => {
    await render(element());
    expect(screen.getByText('1 Oct 26')).toBeOnTheScreen();
  });

  it('is four across at 392 dp and normal text, and 2 x 2 at a large text size, on every card alike', async () => {
    // The rows are plain host views with no role or label, so they are found by walking the drawn tree:
    // the row views (flexDirection row) that hold some of the four place names, and how many each holds.
    type HostNode = NonNullable<typeof screen.root>;
    const placeCountsOfRows = () => {
      const counts: number[] = [];
      const placesIn = (node: HostNode): number => {
        let n = (node.type as unknown) === 'Text' && PLACES.includes(textOf(node)) ? 1 : 0;
        for (const child of node.children) if (typeof child !== 'string') n += placesIn(child as HostNode);
        return n;
      };
      const walk = (node: HostNode) => {
        if (typeof node.type === 'string' && node.props.style && StyleSheet.flatten(node.props.style).flexDirection === 'row') {
          const n = placesIn(node);
          if (n > 0 && n < 5) counts.push(n);
        }
        for (const child of node.children) if (typeof child !== 'string') walk(child as HostNode);
      };
      walk(screen.root as HostNode);
      return counts;
    };
    await render(element());
    expect(placeCountsOfRows().filter(n => n === 4).length).toBeGreaterThan(0);

    mockFontScale = 2;
    await screen.rerender(element({ total: 1020, tax_amount: 50, labour: 20, discount: 250 }));
    expect(placeCountsOfRows().filter(n => n === 4)).toHaveLength(0);
    expect(placeCountsOfRows().filter(n => n === 2)).toHaveLength(2);
    await screen.rerender(element({ total: 1000, tax_amount: 0, labour: 0, discount: 0 }));
    expect(placeCountsOfRows().filter(n => n === 4)).toHaveLength(0);
    expect(placeCountsOfRows().filter(n => n === 2)).toHaveLength(2);
  });
});
