/**
 * The "Reason for zero charge" field of the invoice summary (owner decision 3
 * of 2026-10-11). It is built like the discount reason field beside it.
 */
import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
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
async function render(props: Props) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <InvoiceCalculationSummary header={header()} items={[FREE, PAID]} onDiscountChange={jest.fn()} onZeroChargeReasonChange={jest.fn()} {...props} />
    );
  });
  return tree;
}
const reasonInput = (tree: ReturnType<typeof create>, label = 'Reason for zero charge') =>
  tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label);
const labels = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));

afterEach(() => setLanguage('en'));

describe('the reason field for a zero charge', () => {
  it('is not shown when no line has a charge of 0', async () => {
    const tree = await render({ items: [PAID], zeroChargeReasonRequired: true });

    expect(reasonInput(tree)).toBeUndefined();
    expect(labels(tree).join('|')).not.toMatch(/zero charge/i);
    await act(async () => { tree.unmount(); });
  });

  it('is shown for a charge that rounds to 0 (the server would ask for the reason), not for one that rounds to 0.01', async () => {
    let tree = await render({ items: [line('almost', 0.004), PAID] });
    expect(reasonInput(tree)).toBeDefined();
    await act(async () => { tree.unmount(); });

    tree = await render({ items: [line('paisa', 0.005), PAID] });
    expect(reasonInput(tree)).toBeUndefined();
    await act(async () => { tree.unmount(); });
  });

  it('is not shown where the step does not handle it', async () => {
    const tree = await render({ onZeroChargeReasonChange: undefined });

    expect(reasonInput(tree)).toBeUndefined();
    await act(async () => { tree.unmount(); });
  });

  it('is shown when one line has a charge of 0, built like the discount reason field', async () => {
    const tree = await render({});

    const input = reasonInput(tree)!;
    expect(labels(tree)).toContain('Reason for zero charge');
    expect(labels(tree)).not.toContain('Reason for zero charge (required)');
    expect(input.props.placeholder).toBe('Why is the charge 0?');
    expect(input.props.maxLength).toBe(500);
    expect(input.props.multiline).toBe(true);
    expect(input.props.value).toBe('');
    expect(StyleSheet.flatten(input.props.style).borderColor).toBe(getTokens('orange', 'light').border.field);
    await act(async () => { tree.unmount(); });
  });

  it('is asked for, not red, before a save was refused', async () => {
    const tree = await render({ zeroChargeReasonRequired: true });

    expect(labels(tree)).toContain('Reason for zero charge (required)');
    const style = StyleSheet.flatten(reasonInput(tree)!.props.style);
    expect(style.borderColor).toBe(getTokens('orange', 'light').border.field);
    expect(style.borderWidth).toBe(1);
    await act(async () => { tree.unmount(); });
  });

  it('is marked required, with a red border, for staff who have not written one, once a save was refused', async () => {
    const tree = await render({ zeroChargeReasonRequired: true, showErrors: true });

    expect(labels(tree)).toContain('Reason for zero charge (required)');
    expect(labels(tree)).not.toContain('Reason for zero charge');
    const style = StyleSheet.flatten(reasonInput(tree)!.props.style);
    expect(style.borderColor).toBe(getTokens('orange', 'light').status.negative.border);
    expect(style.borderWidth).toBe(2);
    await act(async () => { tree.unmount(); });
  });

  it('passes on what is typed and shows what the form holds', async () => {
    const onReason = jest.fn();
    const tree = await render({ onZeroChargeReasonChange: onReason });

    await act(async () => { reasonInput(tree)!.props.onChangeText('Sample lot'); });
    expect(onReason).toHaveBeenCalledWith('Sample lot');

    await act(async () => {
      tree.update(
        <InvoiceCalculationSummary
          header={header({ zero_charge_reason: 'Sample lot' })}
          items={[FREE, PAID]}
          onDiscountChange={jest.fn()}
          onZeroChargeReasonChange={onReason}
        />
      );
    });
    expect(reasonInput(tree)!.props.value).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });

  it('keeps showing the stored reason of an invoice being edited when other lines become free', async () => {
    const stored = header({ zero_charge_reason: 'Sample lot' });
    const tree = await render({ header: stored });
    expect(reasonInput(tree)!.props.value).toBe('Sample lot');

    await act(async () => {
      tree.update(
        <InvoiceCalculationSummary header={stored} items={[line('free', 3), line('paid', 0)]} onDiscountChange={jest.fn()} onZeroChargeReasonChange={jest.fn()} />
      );
    });
    expect(reasonInput(tree)!.props.value).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });

  it('stands beside the discount reason, each with its own text', async () => {
    const tree = await render({
      header: header({ discount: 50, discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' }),
      onDiscountReasonChange: jest.fn(),
    });

    expect(reasonInput(tree, 'Discount reason')!.props.value).toBe('Damaged bags');
    expect(reasonInput(tree)!.props.value).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });

  it('is in Gujarati when the app is', async () => {
    setLanguage('gu');
    const tree = await render({ zeroChargeReasonRequired: true });

    expect(labels(tree)).toContain('શૂન્ય ભાડાનું કારણ (જરૂરી)');
    expect(reasonInput(tree, 'શૂન્ય ભાડાનું કારણ')!.props.placeholder).toBe('ભાડાનો દર ૦ શા માટે છે?');
    await act(async () => { tree.unmount(); });
  });
});
