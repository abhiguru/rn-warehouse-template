import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import type { InvoiceHeaderData } from '@/types/invoice.types';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/fiori', () => ({ KeyValueCell: () => null, InlineValidation: () => null }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ isDarkMode: false, colors: { ...require('@/theme').default.colors } }),
}));

const header = (discount: number, discount_reason = ''): InvoiceHeaderData => ({
  inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 1, customer_id: 'c', customer_name: 'Fictional Customer',
  gr_id: 'g', gr_no: 'FX1', one_time_charge: false, discount, discount_reason, labour: 0, tax_amount: 0, total: 735,
});

const reasonInput = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Discount reason');
const labels = (tree: ReturnType<typeof create>) =>
  tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));

it('asks for a discount reason only when there is a discount, and marks it required for staff', async () => {
  const onReason = jest.fn();
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<InvoiceCalculationSummary header={header(0)} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={onReason} />);
  });
  expect(reasonInput(tree)).toBeUndefined();

  await act(async () => {
    tree.update(<InvoiceCalculationSummary header={header(235)} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={onReason} reasonRequired />);
  });
  expect(labels(tree)).toContain('Discount reason (required)');
  await act(async () => { reasonInput(tree)!.props.onChangeText('Damaged bags'); });
  expect(onReason).toHaveBeenCalledWith('Damaged bags');

  await act(async () => {
    tree.update(<InvoiceCalculationSummary header={header(235, 'Damaged bags')} items={[]} onDiscountChange={jest.fn()} onDiscountReasonChange={onReason} />);
  });
  expect(labels(tree)).toContain('Discount reason');
  expect(reasonInput(tree)!.props.value).toBe('Damaged bags');
  await act(async () => { tree.unmount(); });
});
