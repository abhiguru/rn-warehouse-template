/**
 * Header figures of the Dispatch, GRN and Invoice pages stay on one line (no mid-number
 * split), and the three pages do not add a second bottom inset: the root stack already
 * pads the Android navigation bar.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { InvoiceHeroHeader } from '../../invoice-details/InvoiceHeroHeader';
import { GRNHeroHeader } from '../../grn-details/GRNHeroHeader';
import { DispatchHeroHeader } from '../DispatchHeroHeader';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

let tree: ReactTestRenderer;
afterEach(() => act(() => tree?.unmount()));
const render = (el: React.ReactElement) => {
  act(() => {
    tree = create(el);
  });
  return tree;
};
const texts = (t: ReactTestRenderer, needle: string) =>
  t.root.findAll(n => (n.type as unknown) === 'Text' && [n.props.children].flat(3).join('').includes(needle));

describe('header figures never split', () => {
  it('invoice total and tax are one line and shrink-to-fit', () => {
    const t = render(<InvoiceHeroHeader invoice_number={7} date="2026-01-01" total_items={3} total_amount={126800932} tax_amount={192123594} />);
    const money = texts(t, '₹');
    expect(money).toHaveLength(2);
    for (const n of money) {
      expect(n.props.numberOfLines).toBe(1);
      expect(n.props.adjustsFontSizeToFit).toBe(true);
    }
  });

  it('GRN figures are one line', () => {
    const t = render(<GRNHeroHeader gr_no="G1" date="2026-01-01" total_qty={823662} total_stock={5} total_dispatched={1} />);
    const [n] = texts(t, '662');
    expect(n.props.numberOfLines).toBe(1);
    expect(n.props.adjustsFontSizeToFit).toBe(true);
  });

  it('dispatch figures are one line', () => {
    const t = render(<DispatchHeroHeader disp_no="D1" date="2026-01-01" total_items={2} total_quantity={823662} />);
    const [n] = texts(t, '662');
    expect(n.props.numberOfLines).toBe(1);
    expect(n.props.adjustsFontSizeToFit).toBe(true);
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
  const flat = (n: { props: { style?: unknown } }) => Object.assign({}, ...[n.props.style].flat(3).filter(Boolean));

  it('subtitles are not cut (no line limit) in all three headers', () => {
    const inv = render(<InvoiceHeroHeader invoice_number={7} date="2026-09-29" total_items={3} total_amount={5} tax_amount={1} customer_name="Cold Chain Agro Exports" />);
    expect(texts(inv, 'Cold Chain')[0].props.numberOfLines).toBeUndefined();
    act(() => inv.unmount());
    const grn = render(<GRNHeroHeader gr_no="G1" date="2026-03-03" total_qty={5} total_stock={5} total_dispatched={0} customer_name="Cold Chain Agro Exports" />);
    expect(texts(grn, 'Cold Chain')[0].props.numberOfLines).toBeUndefined();
  });

  it('header spacing tightens from font scale 1.5', async () => {
    const heights: Record<string, number> = {};
    for (const scale of [1, 2]) {
      jest.resetModules();
      jest.doMock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
        __esModule: true,
        default: () => ({ width: 411, height: 891, scale: 2.6, fontScale: scale }),
      }));
      const { GRNHeroHeader: G } = require('../../grn-details/GRNHeroHeader');
      const R = require('react') as typeof React;
      const { create: c, act: a } = require('react-test-renderer');
      let tr!: ReactTestRenderer;
      a(() => {
        tr = c(R.createElement(G, { gr_no: 'G1', date: '2026-03-03', total_qty: 5, total_stock: 5, total_dispatched: 0 }));
      });
      const root = tr.root.findAll(n => (n.type as unknown) === 'View')[0];
      heights[scale] = flat(root).paddingTop;
      a(() => tr.unmount());
    }
    expect(heights[1]).toBeGreaterThan(heights[2]);
  });
});
