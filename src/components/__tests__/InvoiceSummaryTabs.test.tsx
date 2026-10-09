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

  it('GRN tab shows Indian-grouped amounts in primary text on the base background', () => {
    const tree = render(
      <GRNInvoicesTab invoiceSummary={{ total_invoices: 2, total_amount: 123456.5, total_with_tax: 129629.33, invoice_numbers: ['11', '12'] }} />,
      brand, mode
    );
    const amount = textNodes(tree).find(n => joined(n) === '₹1,23,456.50');
    expect(amount).toBeDefined();
    expect(StyleSheet.flatten(amount!.props.style).color).toBe(t.text.primary);
    expect(textNodes(tree).some(n => joined(n) === 'Invoice 11')).toBe(true);
    expect(StyleSheet.flatten(tree.root.findAll(n => n.props.contentContainerStyle)[0].props.style).backgroundColor)
      .toBe(t.background.base);
    act(() => tree.unmount());
  });

  it('dispatch tab shows the empty state', () => {
    const tree = render(<DispatchInvoicesTab invoiceSummary={{ total_invoices: 0, total_amount: 0 }} />, brand, mode);
    const title = textNodes(tree).find(n => joined(n) === 'No invoices yet');
    expect(title).toBeDefined();
    expect(title!.props.accessibilityRole).toBe('header');
    act(() => tree.unmount());
  });

  it('dispatch tab lists invoices with the total', () => {
    const tree = render(
      <DispatchInvoicesTab invoiceSummary={{ total_invoices: 1, total_amount: 1906, invoice_numbers: [42] }} />,
      brand, mode
    );
    expect(textNodes(tree).some(n => joined(n) === '₹1,906.00')).toBe(true);
    expect(textNodes(tree).some(n => joined(n) === 'Invoice 42')).toBe(true);
    act(() => tree.unmount());
  });
});
