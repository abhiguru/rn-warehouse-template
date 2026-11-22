/**
 * Dispatch list table at large text. The open card's lines are a nested DataTable (style guide 13.7):
 * at font scale 1 the columns are Item, Kg each, GRN, Qty; "Kg each" moves under the item when the
 * figures would crowd it (9,999 bags at font scale 1.3 on a 392 dp phone) and at font scale 2.
 * No figure splits or is cut with "…".
 */
import React from 'react';
import { fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { MemoizedDispatchItem } from '@/components/list-items/MemoizedDispatchItem';
import { StyleSheet } from 'react-native';
import { crowded, lastColumnAlone, nb, nestedRowWidth, numberColumnWidth } from '@/components/common/DetailTable';
import { DISPATCH_LINES_FIRST_COLUMN, KG_WIDTH } from '@/components/list-items/MemoizedDispatchItem';
import { space, typography } from '@/theme/tokens';
import { setLanguage } from '@/i18n';
import type { Dispatch } from '@/services/dispatch-service';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

type Host = ReturnType<typeof screen.getByTestId>;
const textOf = (node: Host) =>
  [node.props.children].flat(Infinity).filter((child) => typeof child === 'string' || typeof child === 'number').join('');
/** The Text elements inside a container, in order. A text with a highlighted part holds a nested Text, which no text query returns beside it, so the rendered tree is walked. */
const textsIn = (container: Host) => container.queryAll((node) => (node.type as unknown) === 'Text') as Host[];
const withText = (container: Host, text: string) => textsIn(container).filter((node) => textOf(node) === text);
const boldIn = (container: Host) => textsIn(container).filter((node) => StyleSheet.flatten(node.props.style)?.fontWeight === '700');

async function openCard(qty: number, extra: Record<string, unknown> = {}, words?: string[]) {
  await render(<MemoizedDispatchItem dispatch={dispatchOf(qty, extra)} onPress={jest.fn()} expanded words={words} />);
  const grid = screen.getByTestId('dispatch-lines-d1');
  const row = within(grid).getByTestId('d1-item-g1-0');
  const inRow = new Set(textsIn(row));
  return {
    grid,
    header: textsIn(grid).filter((node) => !inRow.has(node)).map(textOf),
    cells: textsIn(row).map(textOf),
    row,
  };
}

afterEach(() => {
  setLanguage('en');
  mockFontScale = 1;
  mockWidth = 392;
});

describe('Dispatch list table at large text', () => {
  it('has Item, Kg each, GRN and Qty at font scale 1 (411 dp: on 392 dp the drawn margin stacks them, R6-2)', async () => {
    mockWidth = 411;
    const { header, cells } = await openCard(5);
    expect(header).toEqual(['Item', 'Kg each', 'GRN/Received', 'Qty']);
    expect(cells).toEqual(['Potato', '50', 'RV15001/5', '5']);
  });

  it('moves "Kg each" and the GRN text under the item at font scale 2, leaving Item and Qty', async () => {
    mockFontScale = 2;
    const { header, cells } = await openCard(5);
    expect(header).toEqual(['Item', 'Qty']);
    expect(cells).toEqual(['Potato', nb('50 kg each'), 'RV15001/5', '5']);
  });

  it('keeps 9,999 bags whole on one line at font scale 1.3, with "Kg each" and the GRN text under the item', async () => {
    mockFontScale = 1.3;
    const { grid, header, cells } = await openCard(9999);
    expect(header).toEqual(['Item', 'Qty']);
    expect(cells).toEqual(['Potato', nb('50 kg each'), 'RV15001/9,999', '9,999']);
    const qty = withText(grid, '9,999');
    expect(qty).toHaveLength(1);
    expect(qty[0].props.numberOfLines).toBe(1);
    expect(qty[0].props.ellipsizeMode).toBeUndefined();
    // The GRN text under the item is in a column that is not sized for it: it may wrap, never end in "…" (R6-1).
    const grn = withText(grid, 'RV15001/9,999');
    expect(grn).toHaveLength(1);
    expect(grn[0].props.numberOfLines).toBeUndefined();
    expect(grn[0].props.adjustsFontSizeToFit).toBeUndefined();
  });

  it('left-aligns the GRN text, as Dispatch -> Items does', async () => {
    const { grid } = await openCard(5);
    const [cell] = withText(grid, 'RV15001/5');
    expect(StyleSheet.flatten(cell.props.style).textAlign).toBeUndefined();
  });

  it('highlights only the searched mark when stacked, not the weight line (search "50")', async () => {
    mockFontScale = 2;
    const { grid } = await openCard(5, { package_mark: 'A50', gr_no: 'RV1' }, ['50']);
    const bold = boldIn(grid).map(textOf);
    expect(bold).toEqual(['50']);
    expect(boldIn(grid).filter((node) => textOf(node).includes('kg each'))).toEqual([]);
    expect(textsIn(grid).map(textOf)).toContain('A');
  });

  it('is read as one element per line, with the weight of one bag', async () => {
    const { row } = await openCard(9999);
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe('Potato, 50 kg each, GRN RV15001, 9,999 dispatched');
  });
});

/** The widths of the figure columns drawn in the row, and the width left for the item. */
function drawn(row: Host, width: number) {
  // The widths are styles of plain views with no text or role, so only the rendered tree shows them.
  const widths = row
    .queryAll((node) => typeof node.type === 'string' && typeof StyleSheet.flatten(node.props.style)?.width === 'number')
    .map((node) => StyleSheet.flatten(node.props.style).width as number);
  const gaps = widths.length * space.sm;
  return { widths, item: nestedRowWidth({ width }) - widths.reduce((sum, w) => sum + w, 0) - gaps };
}

describe('Dispatch list table: the item column keeps its room', () => {
  const emOf = (scale: number) => DISPATCH_LINES_FIRST_COLUMN.em * (typography.subhead.fontSize ?? 15) * scale;

  for (const language of ['en', 'gu'] as const) {
    for (const width of [360, 392, 411]) {
      for (const scale of [1, 1.3, 1.5, 2]) {
        for (const qty of [5, 9999]) {
          it(`${language}, ${width} dp, font scale ${scale}, ${qty} bags: at least 3 em and 20 % for the item, or no column beside it`, async () => {
            setLanguage(language);
            mockWidth = width;
            mockFontScale = scale;
            const { row, header } = await openCard(qty);
            const { widths, item } = drawn(row, width);
            // The item column as drawn (the figure columns carry the margin the layout counts).
            if (widths.length > 0) {
              expect(item).toBeGreaterThanOrEqual(emOf(scale));
              expect(item).toBeGreaterThanOrEqual(nestedRowWidth({ width }) * DISPATCH_LINES_FIRST_COLUMN.share);
            }
            // The same layout, worked out here from the sizing functions.
            const grn = `RV15001/${qty === 9999 ? '9,999' : qty}`;
            const size = { scale, numberWidth: (b: number) => Math.ceil(b * scale) };
            const kgW = numberColumnWidth(size, KG_WIDTH, [language === 'gu' ? '૫૦' : '50']) + space.xs;
            const grnW = numberColumnWidth(size, 56, [grn]) + space.xs;
            const qtyW = numberColumnWidth(size, 36, [qty === 9999 ? '9,999' : String(qty)]) + space.xs;
            const nested = nestedRowWidth({ width });
            const full = scale < 1.5 && !crowded(nested, [kgW, grnW, qtyW], 0, scale, DISPATCH_LINES_FIRST_COLUMN);
            const under = !full && lastColumnAlone(nested, qtyW, scale, DISPATCH_LINES_FIRST_COLUMN);
            expect(header[0]).toBe(language === 'gu' ? 'આઇટમ' : 'Item');
            expect(header).toHaveLength(full ? 4 : 2);
            expect(widths).toEqual(full ? [kgW, grnW, qtyW] : under ? [] : [qtyW]);
          });
        }
      }
    }
  }

  it('shows the whole layout for ordinary data at font scale 1 on 411 dp and stacks 9,999 bags at 2.0 on 360 dp', async () => {
    mockWidth = 411;
    expect((await openCard(5)).header).toEqual(['Item', 'Kg each', 'GRN/Received', 'Qty']);
    await screen.unmount();
    mockFontScale = 2;
    mockWidth = 360;
    expect((await openCard(9999)).header).toEqual(['Item', 'Qty']);
  });

  it('puts Qty on its own line under the item when it would still crowd it (99,99,999 bags at 2.0 on 360 dp)', async () => {
    mockFontScale = 2;
    mockWidth = 360;
    const { row, header, cells } = await openCard(9999999);
    // A one-column row: the heading stays over the end of the row, the figure is under the item.
    expect(header).toEqual(['Item', 'Qty']);
    expect(drawn(row, 360).widths).toEqual([]);
    expect(drawn(row, 360).item).toBeGreaterThanOrEqual(DISPATCH_LINES_FIRST_COLUMN.em * 15 * 2);
    expect(cells).toEqual(['Potato', nb('50 kg each'), 'RV15001/99,99,999', '99,99,999']);
  });

  it('narrows "Kg each" to its figures: no wider than needed at font scale 1, growing with the text', async () => {
    mockWidth = 411;
    const { row } = await openCard(5);
    expect(drawn(row, 411).widths[0]).toBeLessThan(72);
    const scale = 1.3;
    expect(numberColumnWidth({ scale, numberWidth: (b) => Math.ceil(b * scale) }, KG_WIDTH, ['50'])).toBeGreaterThanOrEqual(Math.ceil(KG_WIDTH * scale));
  });
});

describe('Dispatch list table: four columns on an ordinary phone (390 dp)', () => {
  for (const scale of [1, 1.15, 1.3]) {
    it(`keeps Item, Kg each, GRN/Received and Qty at font scale ${scale}`, async () => {
      mockWidth = 390;
      mockFontScale = scale;
      expect((await openCard(5)).header).toEqual(['Item', 'Kg each', 'GRN/Received', 'Qty']);
    });
  }

  it('keeps four columns at font scale 1.3 on 411 dp too, and stacks 9,999 bags there', async () => {
    mockWidth = 411;
    mockFontScale = 1.3;
    expect((await openCard(5)).header).toEqual(['Item', 'Kg each', 'GRN/Received', 'Qty']);
    await screen.unmount();
    expect((await openCard(9999)).header).toEqual(['Item', 'Qty']);
  });

  it('stacks Kg each and the GRN text under the item from font scale 1.5', async () => {
    mockWidth = 390;
    mockFontScale = 1.5;
    expect((await openCard(5)).header).toEqual(['Item', 'Qty']);
  });

  it('writes the heading in Gujarati as આવક પાવતી/આવક', async () => {
    setLanguage('gu');
    mockWidth = 390;
    expect((await openCard(5)).header).toContain('આવક પાવતી/આવક');
  });

  it('puts the package mark first and the rack under it', async () => {
    mockWidth = 390;
    const { cells } = await openCard(5, { package_mark: 'PM', rack: 'B-14' });
    expect(cells.slice(0, 3)).toEqual(['Potato', 'PM', '(B-14)']);
  });
});

describe('Dispatch list table: the GRN cell opens the GRN', () => {
  const open = async (extra: Record<string, unknown>, onViewGRN?: (id: string) => void) => {
    mockWidth = 411;
    await render(<MemoizedDispatchItem dispatch={dispatchOf(5, extra)} onPress={jest.fn()} expanded onViewGRN={onViewGRN} />);
  };
  // The link is hidden from screen readers on purpose (they get the row's "Open GRN" action), so it is found with hidden elements.
  const link = () => screen.queryAllByTestId(/^dispatch-line-grn-/, { includeHiddenElements: true });

  it('is a tap that opens the GRN by its id, and offers "Open GRN" to a screen reader', async () => {
    const onViewGRN = jest.fn();
    await open({ grn_id: 'grn-77' }, onViewGRN);
    expect(link()).toHaveLength(1);
    await userEvent.press(link()[0]);
    expect(onViewGRN).toHaveBeenCalledWith('grn-77');
    const row = screen.getByTestId('d1-item-g1-0');
    expect(row.props.accessibilityActions).toEqual([{ name: 'openGrn', label: 'Open GRN RV15001' }]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'openGrn' } });
    expect(onViewGRN).toHaveBeenCalledTimes(2);
  });

  it('is plain text for a line without a GRN id (an older backend) or without a way to open it', async () => {
    await open({ grn_id: undefined }, jest.fn());
    expect(link()).toHaveLength(0);
    await screen.unmount();
    await open({ grn_id: 'grn-77' }, undefined);
    expect(link()).toHaveLength(0);
  });
});

describe('Dispatch card lines: figures and long marks (phone run GL, 2026-10-18)', () => {
  const MARK = 'BL/STRETCH-LOT-0004/LONG-PACKAGE-MARK-FOR-WRAP-TEST/ABCDEFG1234';

  it('draws the figures without adjustsFontSizeToFit', async () => {
    const { grid } = await openCard(9999);
    const figures = textsIn(grid).filter((node) => ['50', 'RV15001/9,999', '9,999'].includes(textOf(node)));
    expect(figures.length).toBeGreaterThanOrEqual(2);
    for (const figure of figures) {
      // The GRN text under the item may wrap (R6-1); every other figure is on one line.
      if (!textOf(figure).includes('/')) expect(figure.props.numberOfLines).toBe(1);
      expect(figure.props.adjustsFontSizeToFit).toBeUndefined();
    }
  });

  it('does not cut the GRN text of a wide identifier under the item (R6-1): "WMWM8881/9,999" at 392 dp, font scale 2', async () => {
    mockFontScale = 2;
    const { grid } = await openCard(9999, { gr_no: 'WMWM8881' });
    const grn = withText(grid, 'WMWM8881/9,999');
    expect(grn).toHaveLength(1);
    expect(grn[0].props.numberOfLines).toBeUndefined();
    expect(grn[0].props.ellipsizeMode).toBeUndefined();
  });

  it('draws no figure or identifier Text of either layout with adjustsFontSizeToFit (R6-8)', async () => {
    // Four columns (411 dp, font scale 1): Kg each, GRN and Qty are cells.
    mockWidth = 411;
    const four = await openCard(5);
    expect(four.header).toEqual(['Item', 'Kg each', 'GRN/Received', 'Qty']);
    for (const value of ['50', 'RV15001/5', '5']) {
      const found = withText(four.grid, value);
      expect(found).toHaveLength(1);
      expect(found[0].props.numberOfLines).toBe(1);
      expect(found[0].props.adjustsFontSizeToFit).toBeUndefined();
    }
    await screen.unmount();
    // Stacked (360 dp, font scale 2, 99,99,999 bags): the GRN text and the quantity are under the item.
    mockWidth = 360;
    mockFontScale = 2;
    const under = await openCard(9999999);
    const texts = textsIn(under.grid).filter((node) => ['RV15001/99,99,999', '99,99,999'].includes(textOf(node)));
    expect(texts.map(textOf)).toEqual(['RV15001/99,99,999', '99,99,999']);
    for (const text of texts) expect(text.props.adjustsFontSizeToFit).toBeUndefined();
    expect(texts[1].props.numberOfLines).toBe(1);
  });

  it('bolds only the searched GR number, in the column and under the item (R6-5)', async () => {
    for (const [width, scale] of [[411, 1], [392, 2]]) {
      mockWidth = width;
      mockFontScale = scale;
      const { grid } = await openCard(5, { gr_no: 'RV15001' }, ['15001']);
      const bold = boldIn(grid).map(textOf);
      expect(bold).toEqual(['15001']);
      // The quantity after "/" is not part of the searched text.
      expect(textsIn(grid).map(textOf)).toContain('RV');
      await screen.unmount();
      const quantityOnly = await openCard(5, { gr_no: 'RV15001', grn_qty: 77 }, ['77']);
      expect(boldIn(quantityOnly.grid)).toEqual([]);
      await screen.unmount();
    }
  });

  for (const scale of [1, 2]) {
    it(`cuts a 60-character mark on one line at font scale ${scale}, the weight on its own line, and says the mark in full aloud`, async () => {
      mockFontScale = scale;
      expect(MARK.length).toBeGreaterThanOrEqual(60);
      const { grid, row } = await openCard(5, { package_mark: MARK });
      const mark = textsIn(grid).filter((node) => node.props.numberOfLines === 1 && node.props.ellipsizeMode === 'tail' && textOf(node) === nb(MARK));
      expect(mark.length).toBeGreaterThanOrEqual(1);
      if (scale === 2) {
        const weight = withText(grid, nb('50 kg each'));
        expect(weight).toHaveLength(1);
        expect(weight[0].props.ellipsizeMode).toBeUndefined();
      }
      // The row's spoken label has the whole mark (R6-4), as the GRN card's does.
      expect(row.props.accessibilityLabel).toBe(`Potato, ${MARK}, 50 kg each, GRN RV15001, 5 dispatched`);
    });
  }
});

describe('Dispatch list card total', () => {
  const totalOf = async (extra: Record<string, unknown>) => {
    await render(<MemoizedDispatchItem dispatch={dispatchOf(5, extra)} onPress={jest.fn()} />);
    return textsIn(screen.root as Host).map(textOf);
  };

  it('counts in boxes when every line is a Box lot, in bags otherwise', async () => {
    expect(await totalOf({ packaging: 'Box' })).toContain('5 boxes');
    await screen.unmount();
    expect(await totalOf({})).toContain('5 bags');
  });
});

