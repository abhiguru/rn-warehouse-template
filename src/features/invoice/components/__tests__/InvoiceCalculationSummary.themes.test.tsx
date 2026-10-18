import React from 'react';
import { Text, View } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import type { InvoiceHeaderData } from '@/types/invoice.types';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/ConfirmInputDialog', () => ({ ConfirmInputDialog: () => null }));
jest.mock('@/components/fiori', () => ({ InlineValidation: () => null }));

const MODES: Mode[] = ['light', 'dark'];

const header: InvoiceHeaderData = {
  inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 1, customer_id: 'c', customer_name: 'Fictional Customer',
  gr_id: 'g', gr_no: 'FX1', one_time_charge: false, discount: 250, discount_reason: 'Damaged bags',
  labour: 1200, tax_amount: 0, total: 123456.5,
};

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('InvoiceCalculationSummary themes', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('draws no card or title of its own, with Indian-formatted amounts in tabular figures', () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      let tree!: ReactTestRenderer;
      act(() => {
        tree = create(
          <InvoiceCalculationSummary header={header} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={jest.fn()} />
        );
      });
      // The Review step's section is the card; the summary is its body.
      const root = tree.root.findByProps({ testID: 'invoice-summary' });
      expect(flatten(root.props.style).backgroundColor).toBeUndefined();
      expect(tree.root.findAllByProps({ accessibilityRole: 'header' })).toHaveLength(0);

      const texts = tree.root.findAllByType(Text);
      const total = texts.find(n => n.props.children === '₹1,23,456.50');
      expect(total).toBeDefined();
      expect(flatten(total!.props.style).fontVariant).toEqual(['tabular-nums']);
      expect(flatten(total!.props.style).color).toBe(t.text.primary);
      // One Total row.
      expect(texts.filter(n => n.props.children === '₹1,23,456.50')).toHaveLength(1);
      act(() => tree.unmount());
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
    // The sum is in the "How the total is calculated" dialog.
    const message = tree.root.findByType('ConfirmDialog' as unknown as React.ElementType).props.message as string;
    expect(message).toContain('−₹0.00 (discount)');
    expect(message).not.toContain(' ₹0.00 (discount)');
    act(() => tree.unmount());
  });
});
