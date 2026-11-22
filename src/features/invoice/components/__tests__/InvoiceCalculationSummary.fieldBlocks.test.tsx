/**
 * WH-228: Invoice step 3. Discount, Discount reason and Reason for zero charge each sit in a view marked
 * FIELD_BLOCK_ID that holds the field's message lines (the wizard bar keeps that block above itself).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import type { InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';
import { t as tr } from '@/i18n';
import { blockOf, inputsIn, wordsIn } from '@/tests/helpers/fieldBlock';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
// The message line as its words, so that where it sits in the tree can be read.
jest.mock('@/components/fiori', () => ({
  KeyValueCell: () => null,
  InlineValidation: ({ message, visible }: { message: string; visible: boolean }) =>
    visible ? require('react').createElement(require('react-native').Text, null, message) : null,
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const header = (over: Partial<InvoiceHeaderData> = {}): InvoiceHeaderData => ({
  inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 1, customer_id: 'c', customer_name: 'Fictional Customer',
  gr_id: 'g', gr_no: 'FX1', one_time_charge: false, discount: 0, labour: 200, tax_amount: 10, total: 210, ...over,
});
const FREE = { temp_id: 'f', disp_trl_id: 'f', qty: 100, charge: 0, labour_rate: 2, tax: 5, duration: 1, amount: 0, labour_amount: 200, tax_amount: 10, item_total: 210 } as InvoiceItemData;

const mount = async (props: Partial<React.ComponentProps<typeof InvoiceCalculationSummary>>) => {
  await render(
    <InvoiceCalculationSummary
      header={header()}
      items={[FREE]}
      onDiscountChange={jest.fn()}
      onDiscountReasonChange={jest.fn()}
      onZeroChargeReasonChange={jest.fn()}
      {...props}
    />
  );
};
const input = (key: string) => screen.getByTestId(key);

describe('Invoice step 3 field blocks', () => {
  it('Discount: the block holds the box and its error line, and no other field', async () => {
    const onError = jest.fn();
    await mount({ onDiscountErrorChange: onError });
    await fireEvent.changeText(input('invoice-summary-discount'), 'abc');
    const block = blockOf(input('invoice-summary-discount'));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    // The message the field raised for this text is inside the block.
    const message = onError.mock.calls.map((call) => call[0]).filter(Boolean).pop() as string;
    expect(message).toBeTruthy();
    expect(wordsIn(block!)).toContain(message);
  });

  it('Discount reason: the block holds the field and its "reason missing" line', async () => {
    await mount({ header: header({ discount: 235 }), reasonRequired: true, showErrors: true });
    const block = blockOf(input('invoice-summary-discount-reason'));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    expect(wordsIn(block!)).toContain(tr('invoice.summary.reasonMissing'));
  });

  it('Discount reason: the "reason locked" line of a saved discount is inside the block', async () => {
    await mount({ header: header({ discount: 100, saved_discount: 100, saved_discount_reason: 'Damaged bags' }) });
    const block = blockOf(input('invoice-summary-discount-reason'));
    expect(block).not.toBeNull();
    expect(wordsIn(block!)).toContain(tr('invoice.summary.discountReasonLocked'));
  });

  it('Reason for zero charge: the block holds the field and its "reason missing" line', async () => {
    await mount({ zeroChargeReasonRequired: true, showErrors: true });
    const block = blockOf(input('invoice-summary-zero-reason'));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    expect(wordsIn(block!)).toContain(tr('invoice.summary.reasonMissing'));
  });

  it('the three fields have three different blocks', async () => {
    await mount({ header: header({ discount: 235 }), reasonRequired: true, zeroChargeReasonRequired: true });
    const blocks = ['invoice-summary-discount', 'invoice-summary-discount-reason', 'invoice-summary-zero-reason'].map((k) => blockOf(input(k)));
    expect(blocks.every((b) => b !== null)).toBe(true);
    expect(new Set(blocks).size).toBe(3);
  });
});
