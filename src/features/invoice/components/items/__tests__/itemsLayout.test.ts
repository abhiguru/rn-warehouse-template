import { CELL_CHROME, groupIsCards, itemsLayout, sameLayout, type ItemsFigures, type ItemsHeadings, type ItemsLayout } from '../itemsLayout';
import type { TableLayout } from '@/components/common/DetailTable';
import { setLanguage } from '@/i18n/language';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const table = (width: number, scale = 1): TableLayout => ({
  stacked: scale >= 1.5,
  wide: width >= 600,
  scale,
  width,
  numberWidth: (base) => Math.ceil(base * scale),
});
const headings: ItemsHeadings = { qty: 'Qty', charge: 'Charge (₹)', labour: 'Labour (₹)', tax: 'Tax (%)', amount: 'Amount' };
const figures = (over: Partial<ItemsFigures> = {}): ItemsFigures => ({
  qty: ['120', '9,999'],
  charge: ['5.00', '999.99'],
  labour: ['2.00'],
  tax: ['5'],
  amount: ['₹735.00', '₹99,999.00'],
  ...over,
});

afterEach(() => setLanguage('en'));

describe('itemsLayout', () => {
  it('draws a table in Gujarati digits for ordinary amounts (₹735, ₹1,500) at 398 to 405 dp and font scale 1.0 (no wider Amount column than its figures need)', () => {
    setLanguage('gu');
    const gujarati = figures({ qty: ['૧૨૦'], charge: ['૫.૦૦', '૧૨.૫૦'], labour: ['૨.૦૦'], tax: ['૫'], amount: ['₹૭૩૫.૦૦', '₹૧,૫૦૦.૦૦'] });
    for (let width = 398; width <= 405; width += 1) {
      expect([width, itemsLayout(table(width), 1, gujarati, headings).cards]).toEqual([width, false]);
    }
  });

  it('draws the table at 411 dp and font scale 1.0, also for ₹99,999.00 and 9,999 bags', () => {
    const layout = itemsLayout(table(411), 1, figures(), headings);
    expect(layout.cards).toBe(false);
    expect(layout.widths.qty).toBeGreaterThanOrEqual(44);
    expect(layout.widths.charge).toBeGreaterThanOrEqual(64 + CELL_CHROME);
    expect(layout.widths.amount).toBeGreaterThan(80);
  });

  it('leaves the first column at least a quarter of the row', () => {
    const { widths, row } = itemsLayout(table(411), 1, figures(), headings);
    const first = row - (widths.qty + widths.charge + widths.amount + 3 * 8);
    expect(first).toBeGreaterThanOrEqual(row * 0.25);
  });

  it('switches to cards at font scale 1.3, and not at 1.29', () => {
    expect(itemsLayout(table(411, 1.3), 1.3, figures(), headings).cards).toBe(true);
    expect(itemsLayout(table(800, 1.3), 1.3, figures(), headings).cards).toBe(true);
    expect(itemsLayout(table(800, 1.29), 1.29, figures(), headings).cards).toBe(false);
  });

  it('switches to cards when the columns crowd the first one (320 dp)', () => {
    expect(itemsLayout(table(320), 1, figures(), headings).cards).toBe(true);
  });

  it('grows the amount column with the widest amount', () => {
    const small = itemsLayout(table(800), 1, figures({ amount: ['₹735.00'] }), headings).widths.amount;
    const big = itemsLayout(table(800), 1, figures({ amount: ['₹99,99,999.00'] }), headings).widths.amount;
    expect(big).toBeGreaterThan(small);
  });

  it('puts Labour and Tax in columns only where they fit: not at 411 dp, yes at 800 dp', () => {
    expect(itemsLayout(table(411), 1, figures(), headings).rateColumns).toBe(false);
    expect(itemsLayout(table(800), 1, figures(), headings).rateColumns).toBe(true);
  });

  it('groupIsCards: a group that needs rate columns that do not fit is cards, though the step is a table', () => {
    const narrow = itemsLayout(table(411), 1, figures(), headings);
    expect(groupIsCards(narrow, false)).toBe(false);
    expect(groupIsCards(narrow, true)).toBe(true);
    const wide = itemsLayout(table(800), 1, figures(), headings);
    expect(groupIsCards(wide, true)).toBe(false);
  });
});

const layout = (overrides: Partial<ItemsLayout> = {}): ItemsLayout => ({
  widths: { qty: 44, charge: 92, labour: 80, tax: 68, amount: 88 },
  row: 340,
  cards: false,
  rateColumns: true,
  ...overrides,
});

describe('sameLayout', () => {
  it('is true for equal figures in a new object, so the earlier object can be kept', () => {
    expect(sameLayout(layout(), layout({ widths: { ...layout().widths } }))).toBe(true);
  });
  it.each([
    ['a wider column', { widths: { ...layout().widths, amount: 96 } }],
    ['the mode', { cards: true }],
    ['the rate columns', { rateColumns: false }],
    ['the row width', { row: 300 }],
  ])('is false for %s', (_name, change) => {
    expect(sameLayout(layout(), layout(change as Partial<ItemsLayout>))).toBe(false);
  });
});
