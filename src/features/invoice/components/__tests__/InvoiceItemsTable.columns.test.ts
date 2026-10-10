import { setLanguage } from '@/i18n';
import { invoiceTableColumnWidths } from '../InvoiceItemsTable';

jest.mock('@/store/hooks', () => ({ useAppDispatch: () => jest.fn(), useAppSelector: jest.fn() }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

describe('invoiceTableColumnWidths', () => {
  afterEach(() => setLanguage('en'));

  it('keeps the designed widths at the normal font size', () => {
    setLanguage('en');
    expect(invoiceTableColumnWidths(1)).toEqual({
      dispatch: 104,
      qty: 80,
      duration: 76,
      charge: 88,
      labour: 88,
      tax: 64,
      total: 120,
    });
  });

  it('grows the text space, not the padding, with the font size', () => {
    setLanguage('en');
    const widths = invoiceTableColumnWidths(1.3);
    // 24 padding + 64 text space * 1.3
    expect(widths.charge).toBe(107);
    expect(widths.total).toBe(149);
  });

  it('gives the Gujarati duration column more room', () => {
    setLanguage('gu');
    expect(invoiceTableColumnWidths(1).duration).toBe(96);
    expect(invoiceTableColumnWidths(1.3).duration).toBe(118);
    expect(invoiceTableColumnWidths(1).charge).toBe(88);
  });

  it('never shrinks below the design and stops growing at twice the size', () => {
    setLanguage('en');
    expect(invoiceTableColumnWidths(0.85).charge).toBe(88);
    expect(invoiceTableColumnWidths(3).charge).toBe(invoiceTableColumnWidths(2).charge);
  });
});
