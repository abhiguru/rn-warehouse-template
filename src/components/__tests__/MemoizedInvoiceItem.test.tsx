import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import {
  MemoizedInvoiceItem,
  invoiceItemPropsAreEqual,
  type MemoizedInvoiceItemProps,
} from '../list-items/MemoizedInvoiceItem';
import type { Invoice } from '@/services/invoice-service';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

const invoice = {
  invoice_id: 'fictional-invoice',
  invoice_number: 'FXI0001',
  invoice_date: '2026-10-01',
  total: 1000,
  tax_amount: 50,
  labour: 0,
  discount: 0,
  financial_year: 2026,
  is_auto_generated: false,
  customer: { name: 'Fictional Customer' },
  grn: { gr_no: 'FXG001' },
} as unknown as Invoice;

const colors = {} as MemoizedInvoiceItemProps['colors'];
const onPress = jest.fn();
const props = (overrides: Partial<Invoice> = {}): MemoizedInvoiceItemProps => ({
  invoice: { ...invoice, ...overrides },
  onPress,
  canPrint: true,
  colors,
});

it('treats an unchanged invoice as equal even when the object identity differs', () => {
  expect(invoiceItemPropsAreEqual(props(), props())).toBe(true);
});

it('re-renders when only the invoice date changed', () => {
  expect(invoiceItemPropsAreEqual(props(), props({ invoice_date: '2026-10-02' }))).toBe(false);
});

it.each<[keyof Invoice, unknown]>([
  ['invoice_number', 'FXI0002'],
  ['total', 1001],
  ['tax_amount', 51],
  ['labour', 10],
  ['discount', 5],
  ['financial_year', 2027],
  ['is_auto_generated', true],
])('re-renders when %s changed', (field, value) => {
  expect(invoiceItemPropsAreEqual(props(), props({ [field]: value } as Partial<Invoice>))).toBe(false);
});

it('re-renders when the customer name, GRN number, callback or print flag changed', () => {
  expect(invoiceItemPropsAreEqual(props(), props({ customer: { name: 'Other Customer' } } as Partial<Invoice>))).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), props({ grn: { gr_no: 'FXG002' } } as Partial<Invoice>))).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), { ...props(), onPress: jest.fn() })).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), { ...props(), canPrint: false })).toBe(false);
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))(
  'invoice cell in %s %s',
  (brand, mode) => {
    it('renders the card on surface.card with the discount in positive text', () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      let tree!: ReactTestRenderer;
      act(() => {
        tree = create(
          <MemoizedInvoiceItem invoice={{ ...invoice, discount: 250, labour: 20 }} onPress={onPress} />
        );
      });
      const texts = tree.root.findAll(n => (n.type as unknown) === 'Text');
      const discount = texts.find(n => [].concat(n.props.children).join('') === '−₹250.00');
      expect(discount).toBeDefined();
      expect(StyleSheet.flatten(discount!.props.style).color).toBe(t.status.positive.text);
      const total = texts.find(n => [].concat(n.props.children).join('') === '₹1,000.00');
      expect(StyleSheet.flatten(total!.props.style).color).toBe(t.text.primary);
      const pressable = tree.root.findAll(n => n.props.accessibilityRole === 'button')[0];
      expect(pressable.props.accessibilityLabel).toContain('Invoice FXI0001');
      act(() => tree.unmount());
    });
  }
);
