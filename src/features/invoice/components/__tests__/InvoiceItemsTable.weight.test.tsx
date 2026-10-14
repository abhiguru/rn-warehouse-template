/**
 * The weight on a group of the invoice items table is the lot's own: the weight
 * of one bag, box or crate (generate_invoice_data_for_grn_with_pricing and
 * get_invoice_detail send goodsreceived_trl.weight). It picks the price band, so
 * it stays on the group's header, worded "50 kg each" in the chip and in what a
 * screen reader says; a lot without a weight shows and reads none.
 * Names and numbers are fictional.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { InvoiceItemsTable } from '../InvoiceItemsTable';
import { groupInvoiceItems } from '@/features/invoice/utils/groupInvoiceItems';
import type { InvoiceItemData } from '@/types/invoice.types';

// One object for every render: the table reads the group rates from it, and a new object each
// time would be new rates each time.
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

/** A line of 4 bags dispatched from a lot of 200 bags; `weight` is the lot's, for one bag. */
const line = (id: string, over: Partial<InvoiceItemData> = {}): InvoiceItemData => ({
  temp_id: id, disp_trl_id: `d-${id}`, grn_item_id: 'gi', item_id: 'item', item_name: 'Fictional potatoes', qty: 4,
  grn_original_qty: 200, package_mark: 'FIX', rack: 'A1', weight: 50, dispatch_id: `disp-${id}`, dispatch_no: `I000${id}`,
  dispatch_date: '2026-10-01', grn_id: 'g', grn_no: 'FX1', grn_date: '2026-04-01', duration: 1, no_of_days: 30,
  charge: 5, labour_rate: 2, tax: 5, amount: 20, labour_amount: 8, tax_amount: 1.4, item_total: 29.4,
  ...over,
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(tree => tree.unmount()));
  setLanguage('en');
});

async function render(items: InvoiceItemData[], onEditPricing?: jest.Mock) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<InvoiceItemsTable items={items} onItemUpdate={jest.fn()} onBulkEdit={jest.fn()} onEditPricing={onEditPricing} />);
  });
  mounted.push(tree);
  const texts = () => tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
  return {
    tree,
    texts,
    /** What a screen reader says for the group's header (the button that opens its lines). */
    spoken: () =>
      tree.root.findAll(
        node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button' && String(node.props.accessibilityLabel ?? '').startsWith('Fictional potatoes, ')
      )[0].props.accessibilityLabel as string,
    weightIcons: () => tree.root.findAll(node => (node.type as unknown) === 'Icon' && node.props.name === 'weight-kilogram'),
    weightWords: () => texts().filter(text => /kg|each|કિલો|દરેક/.test(text)),
  };
}

describe('the invoice items table, the weight of a group', () => {
  it('the group keeps the lot\'s weight for one bag under a name that says so', () => {
    const [group] = groupInvoiceItems([line('1'), line('2')]);
    expect(group.weight_each).toBe(50);
    // Two lines of 4 bags: the dispatched quantity adds up, the weight does not.
    expect(group.total_dispatched).toBe(8);
    expect(group).not.toHaveProperty('total_weight');
  });

  it('reads "50 kg each" in the chip and in the spoken label, never a bare "50 kg"', async () => {
    const screen = await render([line('1'), line('2')]);
    expect(screen.weightWords()).toEqual(['50 kg each']);
    expect(screen.weightIcons()).toHaveLength(1);
    expect(screen.spoken()).toBe('Fictional potatoes, mark FIX, 50 kg each, GRN quantity 200, dispatched 8, total ₹58.80');
  });

  it('reads "દરેક ૫૦ કિલો" in Gujarati, in the chip and in the spoken label', async () => {
    setLanguage('gu');
    const screen = await render([line('1')]);
    expect(screen.weightWords()).toEqual(['દરેક ૫૦ કિલો']);
    expect(screen.spoken()).toContain('માર્કો FIX, દરેક ૫૦ કિલો, આવક પાવતીના નંગ ૨૦૦');
  });

  it.each([[0], [null], [undefined]])('a lot with weight %s shows no weight chip and reads no weight, with no gap where it was', async weight => {
    const screen = await render([line('1', { weight: weight as never })]);
    expect(screen.texts()).toEqual(expect.arrayContaining(['Fictional potatoes', 'FIX', 'GRN qty 200', 'Dispatched 4']));
    expect(screen.weightWords()).toEqual([]);
    expect(screen.weightIcons()).toEqual([]);
    expect(screen.spoken()).toBe('Fictional potatoes, mark FIX, GRN quantity 200, dispatched 4, total ₹29.40');
    expect(screen.spoken()).not.toMatch(/, ,|0 kg/);
  });

  it('the pencil still opens the price of that weight: the number that picks the price band', async () => {
    const onEditPricing = jest.fn();
    const screen = await render([line('1', { weight: 37 })], onEditPricing);
    const pencil = screen.tree.root.findAll(
      node => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === 'Edit pricing for Fictional potatoes'
    )[0];
    await act(async () => { pencil.props.onPress(); });
    expect(onEditPricing).toHaveBeenCalledWith({ item_id: 'item', item_name: 'Fictional potatoes', weight: 37, charge: 5, labour_rate: 2, tax: 5 });
    expect(screen.weightWords()).toEqual(['37 kg each']);
  });
});
