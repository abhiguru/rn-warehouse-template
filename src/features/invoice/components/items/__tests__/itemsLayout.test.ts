import {
  CELL_CHROME,
  COL_GAP,
  LINE_COLUMN_IDS,
  MONTHS_PAD,
  itemsLayout,
  sameLayout,
  sharedSideBySide,
  type ItemsFigures,
  type ItemsHeadings,
  type ItemsLayout,
} from '../itemsLayout';
import { numberColumnWidth, type TableLayout } from '@/components/common/DetailTable';
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
const headings: ItemsHeadings = {
  dispatch: 'Dispatch',
  date: 'Date',
  duration: 'Months',
  days: 'Days',
  qty: 'Qty',
  charge: 'Charge (₹)',
  labour: 'Labour (₹)',
  tax: 'Tax (%)',
  amount: 'Amount',
};
const figures = (over: Partial<ItemsFigures> = {}): ItemsFigures => ({
  dispatch: ['I0001', 'I0002'],
  date: ['01/10/26'],
  duration: ['1', '1.6'],
  days: ['30', '365'],
  qty: ['120', '9,999'],
  charge: ['5.00', '999.99'],
  labour: ['2.00'],
  tax: ['5'],
  amount: ['₹735.00', '₹99,999.00'],
  ...over,
});

afterEach(() => setLanguage('en'));

describe('itemsLayout', () => {
  it.each([[320, 1], [411, 1], [411, 1.3], [411, 2], [800, 1], [1200, 1]])('is never cards because of the width or the text size (%i dp, font scale %s)', (width, scale) => {
    expect(itemsLayout(table(width, scale), figures(), headings).cards).toBe(false);
  });

  it('has a column for every id but Labour in a one-time GRN, and the scrolling part is their widths together', () => {
    const { lines } = itemsLayout(table(411), figures(), headings);
    const scrolling = LINE_COLUMN_IDS.filter((id) => id !== 'dispatch');
    expect(lines.content).toBe(scrolling.reduce((sum, id) => sum + lines.widths[id], 0));
    const oneTime = itemsLayout(table(411), figures(), headings, true).lines;
    expect(oneTime.content).toBe(lines.content - lines.widths.labour_rate);
  });

  it('sizes every column for its widest text or its heading, with the gap before it', () => {
    const { widths } = itemsLayout(table(411), figures(), headings).lines;
    LINE_COLUMN_IDS.filter((id) => id !== 'dispatch' && id !== 'duration').forEach((id) => {
      expect(widths[id]).toBeGreaterThan(COL_GAP);
    });
    // Charge holds a cell (ring and padding) around the widest figure 999.99
    expect(widths.charge).toBeGreaterThanOrEqual(numberColumnWidth(table(411), 64, ['5.00', '999.99']) + CELL_CHROME + COL_GAP);
    // Months is only as wide as its widest figure and the cell padding: its heading does not size it
    expect(widths.duration).toBe(numberColumnWidth(table(411), 32, ['1', '1.6']) + MONTHS_PAD + COL_GAP);
    const longHeading = itemsLayout(table(411), figures(), { ...headings, duration: 'Months of storage' }).lines.widths;
    expect(longHeading.duration).toBe(widths.duration);
  });

  it('draws the table in Gujarati digits for ordinary amounts without a wider Amount column than their figures need', () => {
    const english = itemsLayout(table(411), figures({ amount: ['₹735.00', '₹1,500.00'] }), headings).lines.widths.amount;
    setLanguage('gu');
    const gujarati = itemsLayout(table(411), figures({ amount: ['₹૭૩૫.૦૦', '₹૧,૫૦૦.૦૦'] }), headings).lines.widths.amount;
    expect(Math.abs(gujarati - english)).toBeLessThanOrEqual(16);
  });

  it('grows the amount column with the widest amount', () => {
    const small = itemsLayout(table(800), figures({ amount: ['₹735.00'] }), headings).lines.widths.amount;
    const big = itemsLayout(table(800), figures({ amount: ['₹99,99,999.00'] }), headings).lines.widths.amount;
    expect(big).toBeGreaterThan(small);
  });

  it('widens the Labour box for a stored figure above 999.99, and Dispatch for a longer number', () => {
    const base = itemsLayout(table(411), figures(), headings).lines.widths;
    expect(itemsLayout(table(411), figures({ labour: ['12000.00'] }), headings).lines.widths.labour_rate).toBeGreaterThan(base.labour_rate);
    expect(itemsLayout(table(411), figures({ dispatch: ['I0001', 'IND-2026-000123'] }), headings).lines.widths.dispatch).toBeGreaterThan(base.dispatch);
  });

  it('says the table scrolls sideways when its columns are wider than the screen: at 320 and 411 dp, not at 1200 dp', () => {
    expect(itemsLayout(table(320), figures(), headings).lines.sideways).toBe(true);
    expect(itemsLayout(table(411), figures(), headings).lines.sideways).toBe(true);
    expect(itemsLayout(table(1200), figures(), headings).lines.sideways).toBe(false);
    const { lines, row } = itemsLayout(table(411), figures(), headings);
    expect(lines.viewport).toBeGreaterThan(0);
    expect(lines.viewport).toBeLessThan(row);
  });

  it('sizes a line card\'s inputs for 9999.99 and for a wider stored figure', () => {
    const { lineInputs } = itemsLayout(table(411), figures({ charge: ['5.00'], labour: ['2.00'] }), headings);
    const wider = itemsLayout(table(411), figures({ charge: ['12000.00'], labour: ['12000.00'] }), headings).lineInputs;
    expect(wider.charge).toBeGreaterThan(lineInputs.charge);
    expect(wider.labour_rate).toBeGreaterThan(lineInputs.labour_rate);
  });

  it('lays the shared fields side by side at 411 dp and stacks them from font scale 1.5', () => {
    expect(sharedSideBySide(itemsLayout(table(411), figures(), headings), 3)).toBe(true);
    expect(sharedSideBySide(itemsLayout(table(411, 1.5), figures(), headings), 3)).toBe(false);
    expect(sharedSideBySide(itemsLayout(table(411), figures(), headings), 0)).toBe(false);
  });
});

const layout = (overrides: Partial<ItemsLayout> = {}): ItemsLayout => {
  const base = itemsLayout(table(411), figures(), headings);
  return { ...base, lines: { ...base.lines, widths: { ...base.lines.widths } }, ...overrides };
};

describe('sameLayout', () => {
  it('is true for equal figures in a new object, so the earlier object can be kept', () => {
    expect(sameLayout(layout(), layout())).toBe(true);
  });
  it.each([
    ['a wider column', () => { const l = layout(); l.lines.widths.amount += 8; return l; }],
    ['the mode', () => layout({ cards: true })],
    ['the row width', () => layout({ row: 300 })],
    ['the shared column', () => layout({ sharedColumn: 1 })],
    ['stacked shared fields', () => layout({ sharedStacked: true })],
    ['a line card input', () => layout({ lineInputs: { charge: 1, labour_rate: 1 } })],
  ])('is false for %s', (_name, change) => {
    expect(sameLayout(layout(), change())).toBe(false);
  });
});
