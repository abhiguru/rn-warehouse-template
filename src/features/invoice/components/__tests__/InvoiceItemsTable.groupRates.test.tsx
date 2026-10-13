/**
 * The group rate fields of the invoice items table when the lines of a group
 * do not all have the same rate (a stored invoice with a free line beside a
 * paid one, or lines priced one by one).
 *
 * A group field shows the rate its lines share, or nothing with the
 * placeholder "Mixed" when they differ; it never shows an average. Typing in
 * one group field passes on that field alone.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { InvoiceItemsTable } from '../InvoiceItemsTable';
import type { InvoiceItemData } from '@/types/invoice.types';

const mockInvoiceForm: { bulkPricing: Record<string, Partial<{ charge: number; labour_rate: number; tax: number }>> } = { bulkPricing: {} };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, invoiceForm: mockInvoiceForm }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/fiori', () => ({ InlineValidation: 'InlineValidation' }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));

const line = (id: string, rates: Partial<InvoiceItemData>): InvoiceItemData => ({
  temp_id: id, disp_trl_id: `d-${id}`, grn_item_id: 'gi', item_id: 'item', item_name: 'Fictional potatoes', qty: 100,
  grn_original_qty: 200, package_mark: 'FIX', rack: 'A1', weight: 50, dispatch_id: `disp-${id}`, dispatch_no: `I000${id}`,
  dispatch_date: '2026-10-01', grn_id: 'g', grn_no: 'FX1', grn_date: '2026-04-01', duration: 1, no_of_days: 30,
  charge: 5, labour_rate: 2, tax: 5, amount: 500, labour_amount: 200, tax_amount: 35, item_total: 735,
  ...rates,
});
const GROUP = 'item:::FIX';
const CHARGE = 'Storage charge for Fictional potatoes';
const LABOUR = 'Labour rate for Fictional potatoes';
const TAX = 'Tax percent for Fictional potatoes';
/** A free line beside a paid one; labour and tax are the same on both. */
const FREE_AND_PAID = [line('1', { charge: 0, amount: 0 }), line('2', {})];

const field = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label)!;
async function render(items: InvoiceItemData[], onBulkEdit = jest.fn()) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceItemsTable items={items} onItemUpdate={jest.fn()} onBulkEdit={onBulkEdit} />);
  });
  return { tree, onBulkEdit };
}
const type = async (tree: ReactTestRenderer, label: string, text: string) => {
  await act(async () => { field(tree, label).props.onChangeText(text); });
};

afterEach(() => {
  setLanguage('en');
  mockInvoiceForm.bulkPricing = {};
});

describe('a group whose lines differ', () => {
  it('shows "Mixed" for the rate that differs, not an average, and the shared rate for the others', async () => {
    const { tree } = await render(FREE_AND_PAID);

    // The average of 0 and 5 would be 2.50.
    expect(field(tree, CHARGE).props).toMatchObject({ value: '', placeholder: 'Mixed' });
    expect(field(tree, LABOUR).props).toMatchObject({ value: '2.00', placeholder: '0' });
    expect(field(tree, TAX).props).toMatchObject({ value: '5', placeholder: '0' });
  });

  it('shows "Mixed" for each rate that differs', async () => {
    const { tree } = await render([line('1', { labour_rate: 2, tax: 5 }), line('2', { labour_rate: 3, tax: 12 })]);

    expect(field(tree, CHARGE).props).toMatchObject({ value: '5.00', placeholder: '0' });
    expect(field(tree, LABOUR).props).toMatchObject({ value: '', placeholder: 'Mixed' });
    expect(field(tree, TAX).props).toMatchObject({ value: '', placeholder: 'Mixed' });
  });

  it('says it in Gujarati', async () => {
    setLanguage('gu');
    const { tree } = await render(FREE_AND_PAID);

    expect(field(tree, 'Fictional potatoes માટે ભાડાનો દર').props).toMatchObject({ value: '', placeholder: 'જુદા જુદા' });
  });

  it('typing the group tax passes on the tax alone: no charge, no labour rate', async () => {
    const { tree, onBulkEdit } = await render(FREE_AND_PAID);

    await type(tree, TAX, '12');

    expect(onBulkEdit).toHaveBeenCalledTimes(1);
    expect(onBulkEdit).toHaveBeenCalledWith(GROUP, { tax: 12 });
    // The charge field still says the lines differ.
    expect(field(tree, CHARGE).props).toMatchObject({ value: '', placeholder: 'Mixed' });
  });

  it('typing the group charge passes on the charge alone, and the field then shows what was typed', async () => {
    const { tree, onBulkEdit } = await render(FREE_AND_PAID);

    await type(tree, CHARGE, '6');
    expect(onBulkEdit).toHaveBeenCalledWith(GROUP, { charge: 6 });

    // The form applies it: both lines now have the charge 6.
    mockInvoiceForm.bulkPricing = { [GROUP]: { charge: 6 } };
    await act(async () => {
      tree.update(<InvoiceItemsTable items={[line('1', { charge: 6, amount: 600 }), line('2', { charge: 6, amount: 600 })]} onItemUpdate={jest.fn()} onBulkEdit={onBulkEdit} />);
    });
    expect(field(tree, CHARGE).props).toMatchObject({ value: '6', placeholder: '0' });
  });

  it('keeps showing a group rate the user applied when one line was given its own rate afterwards', async () => {
    mockInvoiceForm.bulkPricing = { [GROUP]: { charge: 6 } };
    const { tree } = await render([line('1', { charge: 0, amount: 0 }), line('2', { charge: 6, amount: 600 })]);

    expect(field(tree, CHARGE).props).toMatchObject({ value: '6', placeholder: '0' });
  });
});

describe('a group whose lines agree', () => {
  it('shows the shared rates as before', async () => {
    const { tree } = await render([line('1', {}), line('2', { duration: 2, amount: 1000 })]);

    expect(field(tree, CHARGE).props).toMatchObject({ value: '5.00', placeholder: '0' });
    expect(field(tree, LABOUR).props).toMatchObject({ value: '2.00', placeholder: '0' });
    expect(field(tree, TAX).props).toMatchObject({ value: '5', placeholder: '0' });
  });

  it('shows an empty field with the placeholder 0 when every line is free: that is not "Mixed"', async () => {
    const { tree } = await render([line('1', { charge: 0, amount: 0 }), line('2', { charge: 0, amount: 0 })]);

    expect(field(tree, CHARGE).props).toMatchObject({ value: '', placeholder: '0' });
  });
});
