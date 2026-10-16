import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { GRNInvoicesTab } from '../grn-details/GRNInvoicesTab';
import { DispatchInvoicesTab } from '../dispatch-details/DispatchInvoicesTab';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

function render(element: React.ReactElement, brand: string, mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => { tree = create(element); });
  return tree;
}

function textNodes(tree: ReactTestRenderer) {
  return tree.root.findAll(n => (n.type as unknown) === 'Text');
}

function joined(node: { props: { children?: unknown } }) {
  return ([] as unknown[]).concat(node.props.children).join('');
}

describe.each(THEMES)('invoice summary tabs in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('GRN tab lists its invoices with two-decimal totals in primary text on the base background', () => {
    const tree = render(
      <GRNInvoicesTab
        invoices={{
          detailed: true,
          count: 2,
          total: 123456.5,
          rows: [
            { key: 'a', invoice_id: 'a', invoice_no: 11, invoice_date: '2026-10-01', total: 100000 },
            { key: 'b', invoice_id: 'b', invoice_no: 12, invoice_date: '2026-10-02', total: 23456.5 },
          ],
        }}
      />,
      brand, mode
    );
    const amount = textNodes(tree).filter(n => joined(n) === '₹1,23,456.50');
    expect(amount).toHaveLength(1);
    expect(StyleSheet.flatten(amount[0].props.style).color).toBe(t.text.primary);
    expect(textNodes(tree).some(n => joined(n) === '11')).toBe(true);
    expect(textNodes(tree).some(n => joined(n) === 'Each amount is the invoice total, with tax and less any discount.')).toBe(true);
    expect(StyleSheet.flatten(tree.root.findAll(n => n.props.contentContainerStyle)[0].props.style).backgroundColor)
      .toBe(t.background.base);
    act(() => tree.unmount());
  });

  it('GRN tab shows a spinner while its rows are read, and the empty line with none', () => {
    const loading = render(
      <GRNInvoicesTab invoices={{ detailed: false, count: 1, total: 5, rows: [] }} loading />,
      brand, mode
    );
    expect(textNodes(loading).some(n => joined(n) === 'Loading invoices…')).toBe(true);
    act(() => loading.unmount());
    const empty = render(<GRNInvoicesTab invoices={{ detailed: false, count: 0, total: 0, rows: [] }} />, brand, mode);
    expect(textNodes(empty).some(n => joined(n) === 'No invoices for this GRN.')).toBe(true);
    act(() => empty.unmount());
  });

  it('dispatch tab shows the empty state', () => {
    const tree = render(<DispatchInvoicesTab invoices={{ detailed: false, count: 0, total: 0, rows: [] }} />, brand, mode);
    const title = textNodes(tree).find(n => joined(n) === 'No invoices linked to this dispatch.');
    expect(title).toBeDefined();
    expect(title!.props.accessibilityRole).toBe('header');
    act(() => tree.unmount());
  });

  it('dispatch tab lists invoices with two-decimal amounts and the total in primary text', () => {
    const tree = render(
      <DispatchInvoicesTab
        invoices={{ detailed: true, count: 1, total: 1906, rows: [{ key: 'v1', invoice_id: 'v1', invoice_no: 42, invoice_date: '2026-10-09', total: 1906 }] }}
      />,
      brand, mode
    );
    const amounts = textNodes(tree).filter(n => joined(n) === '₹1,906.00');
    expect(amounts).toHaveLength(2);
    expect(StyleSheet.flatten(amounts[1].props.style).color).toBe(t.text.primary);
    expect(textNodes(tree).some(n => joined(n) === '42')).toBe(true);
    act(() => tree.unmount());
  });
});
