import { invoiceItemPropsAreEqual, type MemoizedInvoiceItemProps } from '../list-items/MemoizedInvoiceItem';
import type { Invoice } from '@/services/invoice-service';

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

it('re-renders when the customer name, GRN number, callback, print flag or theme changed', () => {
  expect(invoiceItemPropsAreEqual(props(), props({ customer: { name: 'Other Customer' } } as Partial<Invoice>))).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), props({ grn: { gr_no: 'FXG002' } } as Partial<Invoice>))).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), { ...props(), onPress: jest.fn() })).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), { ...props(), canPrint: false })).toBe(false);
  expect(invoiceItemPropsAreEqual(props(), { ...props(), colors: {} as MemoizedInvoiceItemProps['colors'] })).toBe(false);
});
