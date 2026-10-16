/**
 * Column sizing of the object-page tables: number columns as wide as their widest value, the
 * 25 % rule that stacks the middle columns, and the no-break spaces that keep a number with its unit.
 */
import { setLanguage } from '@/i18n';
import { FIRST_COLUMN_EM, FIRST_COLUMN_SHARE, crowded, nb, nestedRowWidth, numberColumnWidth, rowWidth } from '../DetailTable';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const layout = (scale: number) => ({ scale, numberWidth: (base: number) => Math.ceil(base * scale) });

afterEach(() => setLanguage('en'));

describe('numberColumnWidth', () => {
  it('keeps the width at font scale 1, grown with the text, for short values', () => {
    expect(numberColumnWidth(layout(1), 60, ['5', '25'], ['30'])).toBe(60);
    expect(numberColumnWidth(layout(1.3), 60, ['5', '25'], ['30'])).toBe(78);
  });

  it('widens for the widest value, the bold total counting a little wider', () => {
    // The design edge (owner, 2026-10-16): 9,999 bags and ₹99,999.00, totals included. Both fit the
    // columns' own widths at 1.3: "9,999" in weight 600 needs 52 dp of 78; "₹99,999.00" needs
    // (0.62 + 7 × 0.6 + 2 × 0.28) em × 15 × 1.3 = 104.9, plus 2, of 110.
    expect(numberColumnWidth(layout(1.3), 60, ['9,998'], ['9,999'])).toBe(78);
    expect(numberColumnWidth(layout(1.3), 84, ['₹99,999.00'], ['₹99,999.00'])).toBe(110);
    // Beyond the design range a column widens: "₹99,99,999.00" at 1.3, (0.62 + 9 × 0.57 + 3 × 0.28) em
    // × 15 × 1.3 = 128.5, plus 2; in weight 600 (0.62 + 9 × 0.6 + 3 × 0.28) em = 133.8, plus 2.
    expect(numberColumnWidth(layout(1.3), 84, ['₹99,99,999.00'])).toBe(131);
    expect(numberColumnWidth(layout(1.3), 84, ['₹63,30,843.08'], ['₹99,99,999.00'])).toBe(136);
    // A lakh total keeps the width the column has anyway: "₹56,761.00" needs 107 dp of the 115.
    expect(numberColumnWidth(layout(1.3), 88, [], ['₹56,761.00'])).toBe(115);
  });

  it('allows a little more for Gujarati digits', () => {
    const english = numberColumnWidth(layout(1.3), 60, ['૧,૧૦,૦૨૧']);
    setLanguage('gu');
    expect(numberColumnWidth(layout(1.3), 60, ['૧,૧૦,૦૨૧'])).toBeGreaterThan(english);
  });
});

describe('crowded', () => {
  it('stacks only when the first column would keep less than 25 % of the row', () => {
    expect(FIRST_COLUMN_SHARE).toBe(0.25);
    const row = rowWidth({ width: 411 }); // 353 dp
    // A lakh invoice at 1.3: bags 78, amount 124, after the chevron: 353 − 32 − 86 − 132 = 103 (29 %).
    expect(crowded(row, [78, 124])).toBe(false);
    // The design edge at 1.3, bags 78 and amount 110: 353 − 32 − 86 − 118 = 117 is left: three columns.
    expect(crowded(row, [78, 110], undefined, 1.3)).toBe(false);
    // Beyond it, ₹99,99,999.00 (136 dp, bold): 91 is left, over a quarter (88) at font scale 1 but
    // under 5 em at 1.3 (98): it stacks at 1.3.
    expect(crowded(row, [78, 136])).toBe(false);
    expect(crowded(row, [78, 136], undefined, 1.3)).toBe(true);
  });

  it('keeps at least FIRST_COLUMN_EM of text width at large text, where a quarter of the row is only a few letters', () => {
    expect(FIRST_COLUMN_EM).toBe(5);
    const nested = nestedRowWidth({ width: 411 }); // 335 dp
    // ₹35,48,260.00 at 2.0 (200 dp) leaves 127 dp: over a quarter (84) but under 5 em (150 dp).
    expect(crowded(nested, [200], 0)).toBe(false);
    expect(crowded(nested, [200], 0, 2)).toBe(true);
    // At 1.3 the quarter decides for an ordinary invoice: 112 dp is left, the least is 98.
    expect(crowded(rowWidth({ width: 411 }), [78, 115], undefined, 1.3)).toBe(false);
  });

  it('measures a table inside an open row on its own, narrower row and without a chevron', () => {
    expect(nestedRowWidth({ width: 411 })).toBe(rowWidth({ width: 411 }) - 2 - 16);
    expect(crowded(nestedRowWidth({ width: 411 }), [78, 114], 0)).toBe(false);
    // A line near the largest total, ₹35,48,260.00 (131 dp) and 20,000 bags (78 dp): 335 − 86 − 139 = 110.
    expect(crowded(nestedRowWidth({ width: 411 }), [78, 131], 0, 1.3)).toBe(false);
  });
});

describe('nb', () => {
  const NBSP = ' ';

  it('keeps a number with the word after it and a label with the amount after it', () => {
    expect(nb('50 kg each')).toBe(`50${NBSP}kg${NBSP}each`);
    expect(nb('626 days · 21 months')).toBe(`626${NBSP}days${NBSP}· 21${NBSP}months`);
    expect(nb('Rate ₹49.95 · Labour ₹0.50 · Tax 18%')).toBe(`Rate${NBSP}₹49.95${NBSP}· Labour${NBSP}₹0.50${NBSP}· Tax${NBSP}18%`);
  });

  it('leaves the break after "·", never before it, so a mark and a weight can still part', () => {
    expect(nb('BQ-1 · 50 kg each')).toBe(`BQ-1${NBSP}· 50${NBSP}kg${NBSP}each`);
  });

  it('does the same with Gujarati digits', () => {
    expect(nb('દરેક ૫૦ કિલો')).toBe(`દરેક${NBSP}૫૦${NBSP}કિલો`);
  });
});
