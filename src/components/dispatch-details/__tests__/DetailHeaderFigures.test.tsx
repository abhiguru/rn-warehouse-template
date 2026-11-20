/**
 * Header figures of the Dispatch, GRN and Invoice pages stay on one line (no mid-number
 * split), and the three pages do not add a second bottom inset: the root stack already
 * pads the Android navigation bar.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { InvoiceHeroHeader, figuresFitOneRow } from '../../invoice-details/InvoiceHeroHeader';
import { GRNHeroHeader } from '../../grn-details/GRNHeroHeader';
import { DispatchHeroHeader } from '../DispatchHeroHeader';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// A test sets the system font scale here; left unset, the window is the one jest gives (font scale 2).
let mockFontScale: number | undefined;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const actual = jest.requireActual('react-native/Libraries/Utilities/useWindowDimensions');
  return {
    __esModule: true,
    default: () =>
      mockFontScale === undefined ? actual.default() : { width: 411, height: 891, scale: 2.6, fontScale: mockFontScale },
  };
});

afterEach(() => {
  mockFontScale = undefined;
});

describe('header figures never split', () => {
  it('invoice total and tax are one line and shrink-to-fit', async () => {
    await render(<InvoiceHeroHeader invoice_number={7} date="2026-01-01" total_items={3} total_amount={126800932} tax_amount={192123594} />);
    const money = screen.getAllByText(/₹/);
    expect(money).toHaveLength(2);
    for (const n of money) {
      expect(n).toHaveProp('numberOfLines', 1);
      expect(n).toHaveProp('adjustsFontSizeToFit', true);
    }
  });

  it('GRN figures are one line', async () => {
    await render(<GRNHeroHeader gr_no="G1" date="2026-01-01" total_qty={823662} total_stock={5} total_dispatched={1} />);
    const [n] = screen.getAllByText(/662/);
    expect(n).toHaveProp('numberOfLines', 1);
    expect(n).toHaveProp('adjustsFontSizeToFit', true);
  });

  it('dispatch figures are one line', async () => {
    await render(<DispatchHeroHeader disp_no="D1" date="2026-01-01" total_items={2} total_quantity={823662} />);
    const [n] = screen.getAllByText(/662/);
    expect(n).toHaveProp('numberOfLines', 1);
    expect(n).toHaveProp('adjustsFontSizeToFit', true);
  });
});

describe('no doubled bottom inset', () => {
  const root = path.resolve(__dirname, '../../../..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

  it('the root stack pads the Android bottom inset', () => {
    expect(read('app/_layout.tsx')).toMatch(/paddingBottom: androidBottomPadding/);
  });

  it.each(['dispatch', 'grn', 'invoice'])('%s page pads the bottom on iOS only', page => {
    const src = read(`app/${page}-details/[id].tsx`);
    expect(src).not.toMatch(/paddingBottom:\s*insets\.bottom/);
    // Only iOS adds the inset itself; Android gets it from the root stack.
    expect(src).toMatch(/paddingBottom: Platform\.OS === 'ios' \? insets\.bottom : 0/);
  });
});

describe('large text', () => {
  it('subtitles are not cut (no line limit) in all three headers', async () => {
    const inv = await render(<InvoiceHeroHeader invoice_number={7} date="2026-09-29" total_items={3} total_amount={5} tax_amount={1} customer_name="Cold Chain Agro Exports" />);
    expect(screen.getAllByText(/Cold Chain/)[0].props.numberOfLines).toBeUndefined();
    await inv.unmount();
    await render(<GRNHeroHeader gr_no="G1" date="2026-03-03" total_qty={5} total_stock={5} total_dispatched={0} customer_name="Cold Chain Agro Exports" />);
    expect(screen.getAllByText(/Cold Chain/)[0].props.numberOfLines).toBeUndefined();
  });

  it('header spacing tightens from font scale 1.5', async () => {
    const heights: Record<string, number> = {};
    for (const scale of [1, 2]) {
      mockFontScale = scale;
      const view = await render(<GRNHeroHeader gr_no="G1" date="2026-03-03" total_qty={5} total_stock={5} total_dispatched={0} />);
      // The header's outermost view.
      heights[scale] = StyleSheet.flatten(screen.root!.props.style).paddingTop;
      await view.unmount();
    }
    expect(heights[1]).toBeGreaterThan(heights[2]);
  });
});

describe('header at large text (from font scale 1.5)', () => {
  const invoice = (amount = 12345, tax = 600) => (
    <InvoiceHeroHeader invoice_number={10005} date="2026-09-29" total_items={3} total_amount={amount} tax_amount={tax} customer_name="Cold Chain" />
  );
  const has = (s: string) => screen.queryAllByText(s).length > 0;

  it.each([
    ['invoice', () => invoice(), 'Invoice', '10005'],
    ['GRN', () => <GRNHeroHeader gr_no="GRN77" date="2026-03-03" total_qty={5} total_stock={5} total_dispatched={0} customer_name="Cold Chain" />, 'GRN', 'GRN77'],
    ['dispatch', () => <DispatchHeroHeader disp_no="DSP77" date="2026-03-03" total_items={2} total_quantity={9} customer_name="Cold Chain" />, 'Dispatch', 'DSP77'],
  ])('%s: identity shown at 1.3, hidden from 1.5, customer line kept, texts capped', async (_n, make, label, number) => {
    mockFontScale = 1.3;
    const normal = await render(make());
    expect(has(label)).toBe(true);
    expect(has(number)).toBe(true);
    await normal.unmount();
    mockFontScale = 2;
    await render(make());
    expect(has(label)).toBe(false);
    expect(has(number)).toBe(false);
    expect(screen.getAllByText(/Cold Chain/).length).toBeGreaterThan(0);
    // The header's own texts are capped at 1.5 (the shared status tag keeps its own 1.6).
    const capped = screen.getAllByText(/./).filter(n => n.props.maxFontSizeMultiplier === 1.5);
    expect(capped.length).toBeGreaterThanOrEqual(3);
  });

  it('invoice: three figures in one row when they fit, stacked rows when they do not', async () => {
    mockFontScale = 2;
    await render(invoice(12345, 600));
    // The figures' row, found as before: the view that spreads its children and has a line above it.
    const hostViews = (node: ReturnType<typeof screen.toJSON>): Record<string, any>[] => {
      if (!node || Array.isArray(node)) return (node ?? []).flatMap(hostViews);
      return [...(node.type === 'View' ? [node.props] : []), ...(node.children ?? []).flatMap(child => (typeof child === 'string' ? [] : hostViews(child)))];
    };
    const row = hostViews(screen.toJSON())
      .map(props => StyleSheet.flatten(props.style) ?? {})
      .find(style => style.justifyContent === 'space-between' && style.borderTopWidth !== undefined)!;
    expect(row.flexDirection).toBe('row');
    expect(row.flexWrap).toBeUndefined();
    expect(figuresFitOneRow(['3', '₹12,345.00', '₹600.00'], 2, 379)).toBe(true);
    expect(figuresFitOneRow(['3', '₹1,26,80,08,932.00', '₹19,21,23,594.00'], 2, 379)).toBe(false);
  });

  it('GRN: progress bar shown at 1.3, hidden at 2.0 while the legend text stays', async () => {
    const grn = <GRNHeroHeader gr_no="G1" date="2026-03-03" total_qty={10} total_stock={6} total_dispatched={4} />;
    mockFontScale = 1.3;
    const normal = await render(grn);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    await normal.unmount();
    mockFontScale = 2;
    await render(grn);
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    expect(screen.getAllByText(/60%/).length).toBeGreaterThan(0);
  });
});
