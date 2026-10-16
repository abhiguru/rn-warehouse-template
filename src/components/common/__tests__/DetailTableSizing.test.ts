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
    // "10,82,348" in weight 600 at 1.3: (7 × 0.6 + 2 × 0.28) em × 15 × 1.3 = 92.8, plus 2.
    expect(numberColumnWidth(layout(1.3), 60, ['9,87,654'], ['10,82,348'])).toBe(95);
    // "₹1,23,74,33,725.76" at 1.3: (0.62 + 12 × 0.57 + 5 × 0.28) em × 15 × 1.3 = 172.8, plus 2.
    expect(numberColumnWidth(layout(1.3), 88, ['₹1,23,74,33,725.76'])).toBe(175);
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
    // ₹1,26,80,21,275.58 (182 dp, bold) and 10,82,348 bags (95 dp): 353 − 32 − 103 − 190 = 28 is left.
    expect(crowded(row, [95, 182])).toBe(true);
  });

  it('keeps at least FIRST_COLUMN_EM of text width at large text, where a quarter of the row is only a few letters', () => {
    expect(FIRST_COLUMN_EM).toBe(5);
    const nested = nestedRowWidth({ width: 411 }); // 335 dp
    // ₹61,91,75,500.00 at 2.0 (242 dp) leaves 85 dp: over a quarter (84) but under 5 em (150 dp).
    expect(crowded(nested, [242], 0)).toBe(false);
    expect(crowded(nested, [242], 0, 2)).toBe(true);
    // At 1.3 the quarter decides for an ordinary invoice: 112 dp is left, the least is 98.
    expect(crowded(rowWidth({ width: 411 }), [78, 115], undefined, 1.3)).toBe(false);
  });

  it('measures a table inside an open row on its own, narrower row and without a chevron', () => {
    expect(nestedRowWidth({ width: 411 })).toBe(rowWidth({ width: 411 }) - 2 - 16);
    expect(crowded(nestedRowWidth({ width: 411 }), [78, 114], 0)).toBe(false);
    // ₹61,91,75,500.00 (159 dp) and 5,00,000 bags (80 dp): 335 − 88 − 167 = 80, under 84.
    expect(crowded(nestedRowWidth({ width: 411 }), [80, 159], 0)).toBe(true);
  });
});

describe('nb', () => {
  const NBSP = ' ';

  it('keeps a number with the word after it and a label with the amount after it', () => {
    expect(nb('50 kg each')).toBe(`50${NBSP}kg each`);
    expect(nb('626 days · 21 months')).toBe(`626${NBSP}days${NBSP}· 21${NBSP}months`);
    expect(nb('Rate ₹49.95 · Labour ₹0.50 · Tax 18%')).toBe(`Rate${NBSP}₹49.95${NBSP}· Labour${NBSP}₹0.50${NBSP}· Tax${NBSP}18%`);
  });

  it('leaves the break after "·", never before it, so a mark and a weight can still part', () => {
    expect(nb('BQ-1 · 50 kg each')).toBe(`BQ-1${NBSP}· 50${NBSP}kg each`);
  });

  it('does the same with Gujarati digits', () => {
    expect(nb('દરેક ૫૦ કિલો')).toBe(`દરેક${NBSP}૫૦${NBSP}કિલો`);
  });
});
