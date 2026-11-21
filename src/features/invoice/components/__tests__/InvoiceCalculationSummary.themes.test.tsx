import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import type { InvoiceHeaderData } from '@/types/invoice.types';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// A stand-in that draws the dialog's message (the sum is in it), so the test reads what the person would be shown.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: ({ message }: { message?: string }) => require('react').createElement(require('react-native').Text, null, message),
}));
jest.mock('@/components/ConfirmInputDialog', () => ({ ConfirmInputDialog: () => null }));
jest.mock('@/components/fiori', () => ({ InlineValidation: () => null }));

const MODES: Mode[] = ['light', 'dark'];

const header: InvoiceHeaderData = {
  inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 1, customer_id: 'c', customer_name: 'Fictional Customer',
  gr_id: 'g', gr_no: 'FX1', one_time_charge: false, discount: 250, discount_reason: 'Damaged bags',
  labour: 1200, tax_amount: 0, total: 123456.5,
};

describe('InvoiceCalculationSummary themes', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('draws no card or title of its own, with Indian-formatted amounts in tabular figures', async () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      await render(
        <InvoiceCalculationSummary header={header} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={jest.fn()} />
      );
      // The Review step's section is the card; the summary is its body.
      expect(StyleSheet.flatten(screen.getByTestId('invoice-summary').props.style).backgroundColor).toBeUndefined();
      // The old check looked at every node, so hidden ones are counted too.
      expect(screen.queryAllByRole('header')).toHaveLength(0);

      const total = screen.getByText('₹1,23,456.50');
      expect(total).toHaveStyle({ fontVariant: ['tabular-nums'] });
      expect(total).toHaveStyle({ color: t.text.primary });
      // One Total row.
      expect(screen.getAllByText('₹1,23,456.50')).toHaveLength(1);
    });
  });
});

describe('InvoiceCalculationSummary formula', () => {
  it('keeps the minus before a zero discount, so the formula reads as a sum', async () => {
    mockState = { theme: { preference: MODES[0], brand: BRANDS[0] } };
    await render(
      <InvoiceCalculationSummary header={{ ...header, discount: 0, discount_reason: '' }} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={jest.fn()} />
    );
    // The sum is in the "How the total is calculated" dialog.
    expect(screen.getByText(/−₹0\.00 \(discount\)/)).toBeOnTheScreen();
    expect(screen.queryByText(/ ₹0\.00 \(discount\)/)).not.toBeOnTheScreen();
  });
});
