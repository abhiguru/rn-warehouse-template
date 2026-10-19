/**
 * Dispatch list table at large text. The open card's lines are a nested DataTable (style guide 13.7):
 * at font scale 1 the columns are Item, Kg each, GRN, Qty; "Kg each" moves under the item when the
 * figures would crowd it (9,999 bags at font scale 1.3 on a 392 dp phone) and at font scale 2.
 * No figure splits or is cut with "…".
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { MemoizedDispatchItem } from '@/components/list-items/MemoizedDispatchItem';
import { StyleSheet } from 'react-native';
import { FIRST_COLUMN_EM, FIRST_COLUMN_SHARE, crowded, lastColumnAlone, nb, nestedRowWidth, numberColumnWidth } from '@/components/common/DetailTable';
import { KG_WIDTH } from '@/components/list-items/MemoizedDispatchItem';
import { space, typography } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import type { Dispatch } from '@/services/dispatch-service';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
let mockFontScale = 1;
let mockWidth = 392;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 780, scale: 3, fontScale: mockFontScale }),
}));

const dispatchOf = (qty: number, extra: Record<string, unknown> = {}): Dispatch =>
  ({
    dispatch_id: 'd1',
    disp_no: '42',
    disp_date: '2026-10-09',
    customer_name: 'Fictional Orchard',
    total_qty: qty,
    total_items: 1,
    registration: null,
    items: [{ grn_item_id: 'g1', item_name: 'Potato', rack: null, package_mark: null, weight: 50, gr_no: 'RV15001', grn_qty: qty, disp_qty: qty, ...extra }],
  }) as unknown as Dispatch;

const isText = (node: ReactTestInstance) => (node.type as unknown) === 'Text';
const textOf = (node: ReactTestInstance) =>
  [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join('');

let tree: ReactTestRenderer | undefined;
function openCard(qty: number, extra: Record<string, unknown> = {}, words?: string[]) {
  act(() => {
    tree = create(<MemoizedDispatchItem dispatch={dispatchOf(qty, extra)} onPress={jest.fn()} expanded words={words} />);
  });
  const grid = tree!.root.find((node) => typeof node.type === 'string' && node.props.testID === 'dispatch-lines-d1');
  const row = grid.find((node) => typeof node.type === 'string' && node.props.testID === 'd1-item-g1-0');
  const inRow = new Set(row.findAll(isText));
  return {
    grid,
    header: grid.findAll(isText).filter((node) => !inRow.has(node)).map(textOf),
    cells: row.findAll(isText).map(textOf),
    row,
  };
}

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  setLanguage('en');
  mockFontScale = 1;
  mockWidth = 392;
});

describe('Dispatch list table at large text', () => {
  it('has Item, Kg each, GRN and Qty at font scale 1 (411 dp: on 392 dp the drawn margin stacks them, R6-2)', () => {
    mockWidth = 411;
    const { header, cells } = openCard(5);
    expect(header).toEqual(['Item', 'Kg each', 'GRN', 'Qty']);
    expect(cells).toEqual(['Potato', '50', 'RV15001/5', '5']);
  });

  it('moves "Kg each" and the GRN text under the item at font scale 2, leaving Item and Qty', () => {
    mockFontScale = 2;
    const { header, cells } = openCard(5);
    expect(header).toEqual(['Item', 'Qty']);
    expect(cells).toEqual(['Potato', nb('50 kg each'), 'RV15001/5', '5']);
  });

  it('keeps 9,999 bags whole on one line at font scale 1.3, with "Kg each" and the GRN text under the item', () => {
    mockFontScale = 1.3;
    const { grid, header, cells } = openCard(9999);
    expect(header).toEqual(['Item', 'Qty']);
    expect(cells).toEqual(['Potato', nb('50 kg each'), 'RV15001/9,999', '9,999']);
    const qty = grid.findAll((node) => isText(node) && textOf(node) === '9,999');
    expect(qty).toHaveLength(1);
    expect(qty[0].props.numberOfLines).toBe(1);
    expect(qty[0].props.ellipsizeMode).toBeUndefined();
    // The GRN text under the item is in a column that is not sized for it: it may wrap, never end in "…" (R6-1).
    const grn = grid.findAll((node) => isText(node) && textOf(node) === 'RV15001/9,999');
    expect(grn).toHaveLength(1);
    expect(grn[0].props.numberOfLines).toBeUndefined();
    expect(grn[0].props.adjustsFontSizeToFit).toBeUndefined();
  });

  it('left-aligns the GRN text, as Dispatch -> Items does', () => {
    const { grid } = openCard(5);
    const cell = grid.find((node) => isText(node) && textOf(node) === 'RV15001/5');
    expect(StyleSheet.flatten(cell.props.style).textAlign).toBeUndefined();
  });

  it('highlights only the searched mark when stacked, not the weight line (search "50")', () => {
    mockFontScale = 2;
    const { grid } = openCard(5, { package_mark: 'A50', gr_no: 'RV1' }, ['50']);
    const bold = grid.findAll((node) => isText(node) && StyleSheet.flatten(node.props.style)?.fontWeight === '700').map(textOf);
    expect(bold).toEqual(['50']);
    expect(grid.findAll((node) => isText(node) && textOf(node).includes('kg each') && StyleSheet.flatten(node.props.style)?.fontWeight === '700')).toEqual([]);
    expect(grid.findAll(isText).map(textOf)).toContain('A');
  });

  it('is read as one element per line, with the weight of one bag', () => {
    const { row } = openCard(9999);
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe('Potato, 50 kg each, GRN RV15001, 9,999 dispatched');
  });
});

/** The widths of the figure columns drawn in the row, and the width left for the item. */
function drawn(row: ReactTestInstance, width: number) {
  const widths = row
    .findAll((node) => typeof node.type === 'string' && typeof StyleSheet.flatten(node.props.style)?.width === 'number')
    .map((node) => StyleSheet.flatten(node.props.style).width as number);
  const gaps = widths.length * space.sm;
  return { widths, item: nestedRowWidth({ width }) - widths.reduce((sum, w) => sum + w, 0) - gaps };
}

describe('Dispatch list table: the item column keeps its room', () => {
  const emOf = (scale: number) => FIRST_COLUMN_EM * (typography.subhead.fontSize ?? 15) * scale;

  for (const language of ['en', 'gu'] as const) {
    for (const width of [360, 392, 411]) {
      for (const scale of [1, 1.3, 1.5, 2]) {
        for (const qty of [5, 9999]) {
          it(`${language}, ${width} dp, font scale ${scale}, ${qty} bags: at least 5 em and 25 % for the item, or no column beside it`, () => {
            setLanguage(language);
            mockWidth = width;
            mockFontScale = scale;
            const { row, header } = openCard(qty);
            const { widths, item } = drawn(row, width);
            // The item column as drawn (the figure columns carry the margin the layout counts).
            if (widths.length > 0) {
              expect(item).toBeGreaterThanOrEqual(emOf(scale));
              expect(item).toBeGreaterThanOrEqual(nestedRowWidth({ width }) * FIRST_COLUMN_SHARE);
            }
            // The same layout, worked out here from the sizing functions.
            const grn = `RV15001/${qty === 9999 ? '9,999' : qty}`;
            const size = { scale, numberWidth: (b: number) => Math.ceil(b * scale) };
            const kgW = numberColumnWidth(size, KG_WIDTH, [language === 'gu' ? '૫૦' : '50']) + space.xs;
            const grnW = numberColumnWidth(size, 72, [grn]) + space.xs;
            const qtyW = numberColumnWidth(size, 48, [qty === 9999 ? '9,999' : String(qty)]) + space.xs;
            const nested = nestedRowWidth({ width });
            const full = scale < 1.5 && !crowded(nested, [kgW, grnW, qtyW], 0, scale);
            const under = !full && lastColumnAlone(nested, qtyW, scale);
            expect(header[0]).toBe(language === 'gu' ? 'આઇટમ' : 'Item');
            expect(header).toHaveLength(full ? 4 : 2);
            expect(widths).toEqual(full ? [kgW, grnW, qtyW] : under ? [] : [qtyW]);
          });
        }
      }
    }
  }

  it('shows the whole layout for ordinary data at font scale 1 on 411 dp and stacks 9,999 bags at 2.0 on 360 dp', () => {
    mockWidth = 411;
    expect(openCard(5).header).toEqual(['Item', 'Kg each', 'GRN', 'Qty']);
    act(() => tree?.unmount());
    mockFontScale = 2;
    mockWidth = 360;
    expect(openCard(9999).header).toEqual(['Item', 'Qty']);
  });

  it('puts Qty on its own line under the item when it would still crowd it (99,99,999 bags at 2.0 on 360 dp)', () => {
    mockFontScale = 2;
    mockWidth = 360;
    const { row, header, cells } = openCard(9999999);
    // A one-column row: the heading stays over the end of the row, the figure is under the item.
    expect(header).toEqual(['Item', 'Qty']);
    expect(drawn(row, 360).widths).toEqual([]);
    expect(drawn(row, 360).item).toBeGreaterThanOrEqual(FIRST_COLUMN_EM * 15 * 2);
    expect(cells).toEqual(['Potato', nb('50 kg each'), 'RV15001/99,99,999', '99,99,999']);
  });

  it('gives "Kg each" 72 dp at font scale 1, room for the Gujarati heading on one line (e8d3fe9)', () => {
    setLanguage('gu');
    for (const width of [411]) {
      mockWidth = width;
      const { row, header } = openCard(5);
      expect(header[1]).toBe('દરેકના kg');
      expect(drawn(row, width).widths[0]).toBeGreaterThanOrEqual(72);
      act(() => tree?.unmount());
    }
    // At 1.3 the phone stacks the column away; its width still grows with the text.
    const scale = 1.3;
    expect(numberColumnWidth({ scale, numberWidth: (b) => Math.ceil(b * scale) }, KG_WIDTH, ['૫૦'])).toBeGreaterThanOrEqual(Math.ceil(72 * scale));
  });
});

describe('Dispatch card lines: figures and long marks (phone run GL, 2026-10-18)', () => {
  const MARK = 'BL/STRETCH-LOT-0004/LONG-PACKAGE-MARK-FOR-WRAP-TEST/ABCDEFG1234';

  it('draws the figures without adjustsFontSizeToFit', () => {
    const { grid } = openCard(9999);
    const figures = grid.findAll((node) => isText(node) && ['50', 'RV15001/9,999', '9,999'].includes(textOf(node)));
    expect(figures.length).toBeGreaterThanOrEqual(2);
    for (const figure of figures) {
      // The GRN text under the item may wrap (R6-1); every other figure is on one line.
      if (!textOf(figure).includes('/')) expect(figure.props.numberOfLines).toBe(1);
      expect(figure.props.adjustsFontSizeToFit).toBeUndefined();
    }
  });

  it('does not cut the GRN text of a wide identifier under the item (R6-1): "WMWM8881/9,999" at 392 dp, font scale 2', () => {
    mockFontScale = 2;
    const { grid } = openCard(9999, { gr_no: 'WMWM8881' });
    const grn = grid.findAll((node) => isText(node) && textOf(node) === 'WMWM8881/9,999');
    expect(grn).toHaveLength(1);
    expect(grn[0].props.numberOfLines).toBeUndefined();
    expect(grn[0].props.ellipsizeMode).toBeUndefined();
  });

  it('draws no figure or identifier Text of either layout with adjustsFontSizeToFit (R6-8)', () => {
    // Four columns (411 dp, font scale 1): Kg each, GRN and Qty are cells.
    mockWidth = 411;
    const four = openCard(5);
    expect(four.header).toEqual(['Item', 'Kg each', 'GRN', 'Qty']);
    for (const value of ['50', 'RV15001/5', '5']) {
      const found = four.grid.findAll((node) => isText(node) && textOf(node) === value);
      expect(found).toHaveLength(1);
      expect(found[0].props.numberOfLines).toBe(1);
      expect(found[0].props.adjustsFontSizeToFit).toBeUndefined();
    }
    act(() => tree?.unmount());
    // Stacked (360 dp, font scale 2, 99,99,999 bags): the GRN text and the quantity are under the item.
    mockWidth = 360;
    mockFontScale = 2;
    const under = openCard(9999999);
    const texts = under.grid.findAll((node) => isText(node) && ['RV15001/99,99,999', '99,99,999'].includes(textOf(node)));
    expect(texts.map(textOf)).toEqual(['RV15001/99,99,999', '99,99,999']);
    for (const text of texts) expect(text.props.adjustsFontSizeToFit).toBeUndefined();
    expect(texts[1].props.numberOfLines).toBe(1);
  });

  it('bolds only the searched GR number, in the column and under the item (R6-5)', () => {
    for (const [width, scale] of [[411, 1], [392, 2]]) {
      mockWidth = width;
      mockFontScale = scale;
      const { grid } = openCard(5, { gr_no: 'RV15001' }, ['15001']);
      const bold = grid.findAll((node) => isText(node) && StyleSheet.flatten(node.props.style)?.fontWeight === '700').map(textOf);
      expect(bold).toEqual(['15001']);
      // The quantity after "/" is not part of the searched text.
      expect(grid.findAll(isText).map(textOf)).toContain('RV');
      act(() => tree?.unmount());
      const quantityOnly = openCard(5, { gr_no: 'RV15001', grn_qty: 77 }, ['77']);
      expect(quantityOnly.grid.findAll((node) => isText(node) && StyleSheet.flatten(node.props.style)?.fontWeight === '700')).toEqual([]);
      act(() => tree?.unmount());
    }
  });

  for (const scale of [1, 2]) {
    it(`cuts a 60-character mark on one line at font scale ${scale}, the weight on its own line, and says the mark in full aloud`, () => {
      mockFontScale = scale;
      expect(MARK.length).toBeGreaterThanOrEqual(60);
      const { grid, row } = openCard(5, { package_mark: MARK });
      const mark = grid.findAll((node) => isText(node) && node.props.numberOfLines === 1 && node.props.ellipsizeMode === 'tail' && textOf(node) === nb(MARK));
      expect(mark.length).toBeGreaterThanOrEqual(1);
      if (scale === 2) {
        const weight = grid.findAll((node) => isText(node) && textOf(node) === nb('50 kg each'));
        expect(weight).toHaveLength(1);
        expect(weight[0].props.ellipsizeMode).toBeUndefined();
      }
      // The row's spoken label has the whole mark (R6-4), as the GRN card's does.
      expect(row.props.accessibilityLabel).toBe(`Potato, ${MARK}, 50 kg each, GRN RV15001, 5 dispatched`);
    });
  }
});
