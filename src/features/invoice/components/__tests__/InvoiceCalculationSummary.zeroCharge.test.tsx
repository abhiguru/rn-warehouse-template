/**
 * The "Reason for zero charge" field of the invoice summary (owner decision 3
 * of 2026-10-11). It is built like the discount reason field beside it.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import type { InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';
import { getTokens } from '@/theme/tokens';
import { setLanguage } from '@/i18n/language';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/fiori', () => ({ KeyValueCell: () => null, InlineValidation: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

const header = (overrides: Partial<InvoiceHeaderData> = {}): InvoiceHeaderData => ({
  inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 1, customer_id: 'c', customer_name: 'Fictional Customer',
  gr_id: 'g', gr_no: 'FX1', one_time_charge: false, discount: 0, labour: 200, tax_amount: 10, total: 210,
  ...overrides,
});
const line = (id: string, charge: number) =>
  ({ temp_id: id, disp_trl_id: id, qty: 100, charge, labour_rate: 2, tax: 5, duration: 1, amount: charge * 100, labour_amount: 200, tax_amount: 10, item_total: 210 }) as InvoiceItemData;
const FREE = line('free', 0);
const PAID = line('paid', 5);

type Props = Partial<React.ComponentProps<typeof InvoiceCalculationSummary>>;
const summary = (props: Props) => (
  <InvoiceCalculationSummary header={header()} items={[FREE, PAID]} onDiscountChange={jest.fn()} onZeroChargeReasonChange={jest.fn()} {...props} />
);
const renderSummary = (props: Props) => render(summary(props));
const REASON = 'Reason for zero charge';

afterEach(() => setLanguage('en'));

describe('the reason field for a zero charge', () => {
  it('is not shown when no line has a charge of 0', async () => {
    await renderSummary({ items: [PAID], zeroChargeReasonRequired: true });

    expect(screen.queryByLabelText(REASON)).not.toBeOnTheScreen();
    expect(screen.queryByText(/zero charge/i)).not.toBeOnTheScreen();
  });

  it('is shown for a charge that rounds to 0 (the server would ask for the reason), not for one that rounds to 0.01', async () => {
    const { rerender } = await renderSummary({ items: [line('almost', 0.004), PAID] });
    expect(screen.getByLabelText(REASON)).toBeOnTheScreen();

    await rerender(summary({ items: [line('paisa', 0.005), PAID] }));
    expect(screen.queryByLabelText(REASON)).not.toBeOnTheScreen();
  });

  it('is not shown where the step does not handle it', async () => {
    await renderSummary({ onZeroChargeReasonChange: undefined });

    expect(screen.queryByLabelText(REASON)).not.toBeOnTheScreen();
  });

  it('is shown when one line has a charge of 0, built like the discount reason field', async () => {
    await renderSummary({});
    const input = screen.getByLabelText(REASON);
    expect(screen.getByText('Reason for zero charge')).toBeOnTheScreen();
    expect(screen.queryByText('Reason for zero charge (required)')).not.toBeOnTheScreen();
    expect(input).toHaveProp('placeholder', 'Why is the charge 0?');
    expect(input).toHaveProp('maxLength', 500);
    expect(input).toHaveProp('multiline', true);
    expect(input).toHaveDisplayValue('');
    expect(StyleSheet.flatten(input.props.style).borderColor).toBe(getTokens('orange', 'light').border.field);
  });

  it('is asked for, not red, before a save was refused', async () => {
    await renderSummary({ zeroChargeReasonRequired: true });

    expect(screen.getByText('Reason for zero charge (required)')).toBeOnTheScreen();
    const style = StyleSheet.flatten(screen.getByLabelText(REASON).props.style);
    expect(style.borderColor).toBe(getTokens('orange', 'light').border.field);
    expect(style.borderWidth).toBe(1);
  });

  it('is marked required, with a red border, for staff who have not written one, once a save was refused', async () => {
    await renderSummary({ zeroChargeReasonRequired: true, showErrors: true });

    expect(screen.getByText('Reason for zero charge (required)')).toBeOnTheScreen();
    expect(screen.queryByText('Reason for zero charge')).not.toBeOnTheScreen();
    const style = StyleSheet.flatten(screen.getByLabelText(REASON).props.style);
    expect(style.borderColor).toBe(getTokens('orange', 'light').status.negative.border);
    expect(style.borderWidth).toBe(2);
  });

  it('passes on what is typed and shows what the form holds', async () => {
    const onReason = jest.fn();
    const user = userEvent.setup({ delay: 0 });
    const { rerender } = await renderSummary({ onZeroChargeReasonChange: onReason });

    await user.paste(screen.getByLabelText(REASON), 'Sample lot');
    expect(onReason).toHaveBeenCalledWith('Sample lot');

    await rerender(summary({ header: header({ zero_charge_reason: 'Sample lot' }), onZeroChargeReasonChange: onReason }));
    expect(screen.getByLabelText(REASON)).toHaveDisplayValue('Sample lot');
  });

  it('keeps showing the stored reason of an invoice being edited when other lines become free', async () => {
    const stored = header({ zero_charge_reason: 'Sample lot' });
    const { rerender } = await renderSummary({ header: stored });
    expect(screen.getByLabelText(REASON)).toHaveDisplayValue('Sample lot');

    await rerender(summary({ header: stored, items: [line('free', 3), line('paid', 0)] }));
    expect(screen.getByLabelText(REASON)).toHaveDisplayValue('Sample lot');
  });

  it('stands beside the discount reason, each with its own text', async () => {
    await renderSummary({
      header: header({ discount: 50, discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' }),
      onDiscountReasonChange: jest.fn(),
    });

    expect(screen.getByLabelText('Discount reason')).toHaveDisplayValue('Damaged bags');
    expect(screen.getByLabelText(REASON)).toHaveDisplayValue('Sample lot');
  });

  it('is in Gujarati when the app is', async () => {
    setLanguage('gu');
    await renderSummary({ zeroChargeReasonRequired: true });

    expect(screen.getByText('શૂન્ય ભાડાનું કારણ (જરૂરી)')).toBeOnTheScreen();
    expect(screen.getByLabelText('શૂન્ય ભાડાનું કારણ')).toHaveProp('placeholder', 'ભાડાનો દર ૦ શા માટે છે?');
  });
});
