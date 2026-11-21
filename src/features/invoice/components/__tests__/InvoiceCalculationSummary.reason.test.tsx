import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import type { InvoiceHeaderData } from '@/types/invoice.types';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/fiori', () => ({ KeyValueCell: () => null, InlineValidation: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const header = (discount: number, discount_reason = ''): InvoiceHeaderData => ({
  inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 1, customer_id: 'c', customer_name: 'Fictional Customer',
  gr_id: 'g', gr_no: 'FX1', one_time_charge: false, discount, discount_reason, labour: 0, tax_amount: 0, total: 735,
});

it('asks for a discount reason only when there is a discount, and marks it required for staff', async () => {
  const onReason = jest.fn();
  const { rerender } = await render(
    <InvoiceCalculationSummary header={header(0)} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={onReason} />,
  );
  expect(screen.queryByLabelText('Discount reason')).not.toBeOnTheScreen();

  await rerender(
    <InvoiceCalculationSummary header={header(235)} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={onReason} reasonRequired />,
  );
  expect(screen.getByText('Discount reason (required)')).toBeOnTheScreen();
  await userEvent.paste(screen.getByLabelText('Discount reason'), 'Damaged bags');
  expect(onReason).toHaveBeenCalledWith('Damaged bags');

  await rerender(
    <InvoiceCalculationSummary header={header(235, 'Damaged bags')} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={onReason} />,
  );
  expect(screen.getByText('Discount reason')).toBeOnTheScreen();
  expect(screen.getByLabelText('Discount reason')).toHaveDisplayValue('Damaged bags');
});

it('keeps the reason field when the discount of a saved invoice is removed', async () => {
  // Saved with a discount of 100; staff set it to 0, which the server also counts as a change.
  const removed: InvoiceHeaderData = { ...header(0), saved_discount: 100, saved_discount_reason: 'Damaged bags' };
  await render(
    <InvoiceCalculationSummary header={removed} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={jest.fn()} reasonRequired />,
  );

  expect(screen.getByLabelText('Discount reason')).toHaveDisplayValue('');
});
