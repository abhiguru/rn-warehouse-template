/** Invoice items table: money rates with two decimals, and a Total column wide enough for its widest value. */
import React from 'react';
import { StyleSheet, Text, Dimensions } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import { InvoiceItemsTable, formatRate, invoiceTableColumnWidths, invoiceTotalColumnWidth } from '../InvoiceItemsTable';
import type { InvoiceItemData } from '@/types/invoice.types';

const mockInvoiceForm = { bulkPricing: {} };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, invoiceForm: mockInvoiceForm }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/fiori', () => ({ InlineValidation: 'InlineValidation' }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));

const line = (over: Partial<InvoiceItemData> = {}): InvoiceItemData => ({
  temp_id: '1', disp_trl_id: 'd-1', grn_item_id: 'gi', item_id: 'item', item_name: 'Fictional potatoes', qty: 4,
  grn_original_qty: 200, package_mark: 'K-1', rack: 'A1', weight: 50, dispatch_id: 'disp-1',
  dispatch_no: 'I0001', dispatch_date: '2026-10-01', grn_id: 'g', grn_no: 'FX1', grn_date: '2026-04-01', duration: 1, no_of_days: 30,
  charge: 5, labour_rate: 0.5, tax: 5, amount: 20, labour_amount: 8, tax_amount: 1.4, item_total: 29.4, ...over,
});

let tree: ReactTestRenderer | undefined;
afterEach(() => { act(() => tree?.unmount()); tree = undefined; setLanguage('en'); });

async function renderOpen(items: InvoiceItemData[]) {
  await act(async () => { tree = create(<InvoiceItemsTable items={items} onItemUpdate={jest.fn()} onBulkEdit={jest.fn()} />); });
  const header = tree!.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityState?.expanded === false)[0];
  await act(async () => header.props.onPress());
  return tree!;
}
const cellTexts = (t: ReactTestRenderer) => t.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));

describe('formatRate', () => {
  it.each([[0.5, '0.50'], [5, '5.00'], [1250, '1,250.00'], [12.345, '12.35']])('%s shows as %s', (value, text) => {
    expect(formatRate(value)).toBe(text);
  });
});

describe('Labour and Charge cells', () => {
  it('show 0.50 and 5.00, not 0.5 and 5', async () => {
    const t = await renderOpen([line()]);
    const texts = cellTexts(t);
    expect(texts).toContain('0.50');
    expect(texts).toContain('5.00');
    expect(texts).not.toContain('0.5');
  });
});

describe('Total column width', () => {
  it('keeps the designed width for small totals', () => {
    expect(invoiceTotalColumnWidth(1, ['₹29.40'])).toBe(invoiceTableColumnWidths(1).total);
  });
  it('grows for a lakh-sized total, more for a longer one, and with the font size', () => {
    const designed = invoiceTableColumnWidths(1).total;
    const lakh = invoiceTotalColumnWidth(1, [formatInvoiceAmount(12345678.9)]);
    expect(lakh).toBeGreaterThan(designed);
    expect(invoiceTotalColumnWidth(1, [formatInvoiceAmount(1234567890.12)])).toBeGreaterThan(lakh);
    expect(invoiceTotalColumnWidth(1.3, [formatInvoiceAmount(12345678.9)])).toBeGreaterThan(lakh);
  });
  it('is the width of the table cell for the widest line', async () => {
    const big = line({ temp_id: '2', item_total: 12345678.9 });
    const t = await renderOpen([line(), big]);
    const cell = t.root.findAll(n => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.width === invoiceTotalColumnWidth(Dimensions.get('window').fontScale, [formatInvoiceAmount(29.4), formatInvoiceAmount(12345678.9)]));
    expect(cell.length).toBeGreaterThan(0);
    expect(cell.length).toBeGreaterThanOrEqual(3); // header, 2 lines
    expect(invoiceTotalColumnWidth(1, [formatInvoiceAmount(12345678.9)])).toBeGreaterThan(invoiceTableColumnWidths(1).total);
  });
});
