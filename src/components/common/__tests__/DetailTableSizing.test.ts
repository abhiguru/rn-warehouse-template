/**
 * Column sizing of the object-page tables: number columns as wide as their widest value, the
 * 30 % rule that stacks the middle columns, and the no-break spaces that keep a number with its unit.
 */
import { setLanguage } from '@/i18n';
import { FIRST_COLUMN_SHARE, crowded, nb, nestedRowWidth, numberColumnWidth, rowWidth } from '../DetailTable';

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
    // "10,82,348" in weight 600 at 1.3: 9 × 15 × 0.62 × 1.3 = 108.8, plus 2.
    expect(numberColumnWidth(layout(1.3), 60, ['9,87,654'], ['10,82,348'])).toBe(111);
    // "₹1,23,74,33,725.76" in the regular weight at 1.3: 18 × 15 × 0.58 × 1.3 = 203.6, plus 2.
    expect(numberColumnWidth(layout(1.3), 88, ['₹1,23,74,33,725.76'])).toBe(206);
  });

  it('allows a little more for Gujarati digits', () => {
    const english = numberColumnWidth(layout(1.3), 60, ['૧,૧૦,૦૨૧']);
    setLanguage('gu');
    expect(numberColumnWidth(layout(1.3), 60, ['૧,૧૦,૦૨૧'])).toBeGreaterThan(english);
  });
});

describe('crowded', () => {
  it('stacks only when the first column would keep less than 30 % of the row', () => {
    expect(FIRST_COLUMN_SHARE).toBe(0.3);
    const row = rowWidth({ width: 411 }); // 353 dp
    // An ordinary invoice at 1.3: bags 78, amount 114, after the chevron: 353 − 32 − 86 − 122 = 113 (32 %).
    expect(crowded(row, [78, 114])).toBe(false);
    // ₹1,23,74,33,725.76 and 9,87,654 bags: almost nothing is left.
    expect(crowded(row, [93, 206])).toBe(true);
  });

  it('measures a table inside an open row on its own, narrower row and without a chevron', () => {
    expect(nestedRowWidth({ width: 411 })).toBe(rowWidth({ width: 411 }) - 2 - 16);
    expect(crowded(nestedRowWidth({ width: 411 }), [78, 114], 0)).toBe(false);
    expect(crowded(nestedRowWidth({ width: 411 }), [93, 186], 0)).toBe(true);
  });
});

describe('nb', () => {
  const NBSP = ' ';

  it('keeps a number with the word after it and a label with the amount after it', () => {
    expect(nb('50 kg each')).toBe(`50${NBSP}kg each`);
    expect(nb('626 days · 21 months')).toBe(`626${NBSP}days · 21${NBSP}months`);
    expect(nb('Rate ₹49.95 · Labour ₹0.50 · Tax 18%')).toBe(`Rate${NBSP}₹49.95 · Labour${NBSP}₹0.50 · Tax${NBSP}18%`);
  });

  it('leaves the breaks around "·", so a mark and a weight can still part', () => {
    expect(nb('BQ-1 · 50 kg each')).toBe(`BQ-1 · 50${NBSP}kg each`);
  });

  it('does the same with Gujarati digits', () => {
    expect(nb('દરેક ૫૦ કિલો')).toBe(`દરેક${NBSP}૫૦${NBSP}કિલો`);
  });
});
