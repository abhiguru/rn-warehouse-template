import React from 'react';
import { Text, View } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import { InvoiceItemCard } from '../InvoiceItemCard';
import { InvoiceItemsTable } from '../InvoiceItemsTable';
import type { InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
// Stable reference: the items table re-initialises its inputs whenever this changes.
const mockInvoiceForm = { bulkPricing: {} };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ ...mockState, invoiceForm: mockInvoiceForm }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/fiori', () => ({ InlineValidation: () => null }));

const MODES: Mode[] = ['light', 'dark'];

const header: InvoiceHeaderData = {
  inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 1, customer_id: 'c', customer_name: 'Fictional Customer',
  gr_id: 'g', gr_no: 'FX1', one_time_charge: false, discount: 250, discount_reason: 'Damaged bags',
  labour: 1200, tax_amount: 0, total: 123456.5,
};

const item: InvoiceItemData = {
  temp_id: 't1', disp_trl_id: 'd1', grn_item_id: 'gi', item_id: 'item', item_name: 'Fictional potatoes', qty: 120,
  grn_original_qty: 200, package_mark: 'FIX', rack: 'A1', weight: 50, dispatch_id: 'd', dispatch_no: 'DV0001',
  dispatch_date: '2026-10-01', grn_id: 'g', grn_no: 'FX1', grn_date: '2026-04-01', duration: 2, no_of_days: 45,
  charge: 10, labour_rate: 2, tax: 0, amount: 2400, labour_amount: 240, tax_amount: 0, item_total: 2640,
};

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('InvoiceCalculationSummary themes', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders on the card surface with Indian-formatted amounts and a green discount', () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      let tree!: ReactTestRenderer;
      act(() => {
        tree = create(
          <InvoiceCalculationSummary header={header} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={jest.fn()} />
        );
      });
      const root = tree.root.findAllByType(View)[0];
      expect(flatten(root.props.style).backgroundColor).toBe(t.surface.card);

      const texts = tree.root.findAllByType(Text);
      const total = texts.find(n => n.props.children === '₹1,23,456.50');
      expect(total).toBeDefined();
      expect(flatten(total!.props.style).fontVariant).toEqual(['tabular-nums']);

      const discount = texts.find(n => n.props.children === '−₹250.00 (discount)');
      expect(discount).toBeDefined();
      expect(flatten(discount!.props.style).color).toBe(t.status.positive.text);
      act(() => tree.unmount());
    });

    it('renders the item card and the items table with tokens', () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      let card!: ReactTestRenderer;
      let table!: ReactTestRenderer;
      act(() => {
        card = create(<InvoiceItemCard item={item} onUpdate={jest.fn()} overriddenFields={['charge']} />);
        table = create(<InvoiceItemsTable items={[item]} onItemUpdate={jest.fn()} onBulkEdit={jest.fn()} onEditPricing={jest.fn()} />);
      });
      expect(flatten(card.root.findAllByType(View)[0].props.style).backgroundColor).toBe(t.surface.card);
      const totals = table.root.findAllByType(Text).filter(n => n.props.children === '₹2,640.00');
      expect(totals.length).toBeGreaterThan(0);
      act(() => { card.unmount(); table.unmount(); });
    });
  });
});

describe('InvoiceCalculationSummary formula', () => {
  it('keeps the minus before a zero discount, so the formula reads as a sum', () => {
    mockState = { theme: { preference: MODES[0], brand: BRANDS[0] } };
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <InvoiceCalculationSummary header={{ ...header, discount: 0, discount_reason: '' }} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={jest.fn()} />
      );
    });
    const texts = tree.root.findAllByType(Text).map(n => n.props.children);
    expect(texts).toContain('−₹0.00 (discount)');
    expect(texts).not.toContain('₹0.00 (discount)');
    act(() => tree.unmount());
  });
});
