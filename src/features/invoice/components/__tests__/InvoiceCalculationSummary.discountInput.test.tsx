/**
 * Typing in the discount field of the invoice's summary.
 */
import React from 'react';
import { Platform, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import type { InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/fiori', () => ({ InlineValidation: 'InlineValidation' }));

const item: InvoiceItemData = {
  temp_id: 't1', disp_trl_id: 'd1', grn_item_id: 'gi', item_id: 'item', item_name: 'Fictional potatoes', qty: 100,
  grn_original_qty: 100, package_mark: 'FIX', rack: 'A1', weight: 50, dispatch_id: 'd', dispatch_no: 'I0001',
  dispatch_date: '2026-10-01', grn_id: 'g', grn_no: 'FX1', grn_date: '2026-04-01', duration: 1, no_of_days: 30,
  charge: 5, labour_rate: 2, tax: 5, amount: 500, labour_amount: 200, tax_amount: 35, item_total: 735,
};

const header: InvoiceHeaderData = {
  inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 1, customer_id: 'c', customer_name: 'Fictional Customer',
  gr_id: 'g', gr_no: 'FX1', one_time_charge: false, discount: 400, discount_reason: 'Damaged bags',
  labour: 200, tax_amount: 35, total: 335,
};

const inputLabelled = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label)!;
const shownErrors = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType('InlineValidation' as unknown as React.ElementType)
    .filter((node) => node.props.visible !== false && node.props.message)
    .map((node) => node.props.message);
const type = async (tree: ReactTestRenderer, label: string, text: string) => {
  await act(async () => { inputLabelled(tree, label).props.onChangeText(text); });
};

afterEach(() => {
  setLanguage('en');
});

describe('the discount field', () => {
  const FIELD = 'Invoice discount';
  // Storage 500 + labour 200 + tax 35: the amount before discount is 735.
  const render = async (onDiscountChange = jest.fn(), onDiscountErrorChange = jest.fn()) => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <InvoiceCalculationSummary
          header={header}
          items={[item]}
          onDiscountChange={onDiscountChange}
          onDiscountErrorChange={onDiscountErrorChange}
        />
      );
    });
    return { tree, onDiscountChange, onDiscountErrorChange };
  };

  it('refuses a discount above the invoice amount and says the save is blocked', async () => {
    const { tree, onDiscountChange, onDiscountErrorChange } = await render();

    await type(tree, FIELD, '5000');

    expect(onDiscountChange).not.toHaveBeenCalled();
    expect(shownErrors(tree)).toHaveLength(1);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(shownErrors(tree)[0]);
  });

  it('keeps refused text and its message once the field is left; the invoice keeps its discount', async () => {
    const { tree, onDiscountChange, onDiscountErrorChange } = await render();
    await type(tree, FIELD, '5000');
    expect(inputLabelled(tree, FIELD).props.value).toBe('5000');
    const message = shownErrors(tree)[0];

    await act(async () => { inputLabelled(tree, FIELD).props.onBlur(); });

    expect(inputLabelled(tree, FIELD).props.value).toBe('5000');
    expect(shownErrors(tree)).toEqual([message]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(message);
    expect(onDiscountChange).not.toHaveBeenCalled();
  });

  it('refuses a discount that takes the total to ₹0 under Discount, before any question', async () => {
    const { tree, onDiscountChange, onDiscountErrorChange } = await render();

    await type(tree, FIELD, '735');

    expect(onDiscountChange).not.toHaveBeenCalled();
    expect(shownErrors(tree)).toEqual([t('invoice.summary.discountTotalZero')]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(t('invoice.summary.discountTotalZero'));
  });

  it('shows a finished number with two decimals once the field is left', async () => {
    const { tree } = await render();
    await type(tree, FIELD, '12.5');

    await act(async () => { inputLabelled(tree, FIELD).props.onBlur(); });

    expect(inputLabelled(tree, FIELD).props.value).toBe('12.50');
    expect(shownErrors(tree)).toEqual([]);
  });

  it('does not read "1,500" as a discount of 1', async () => {
    const { tree, onDiscountChange, onDiscountErrorChange } = await render();

    await type(tree, FIELD, '1,500');

    expect(onDiscountChange).not.toHaveBeenCalled();
    expect(shownErrors(tree)).toEqual([t('invoice.summary.discountNotNumber')]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(t('invoice.summary.discountNotNumber'));
  });

  it('keeps a decimal and a surcharge as typed', async () => {
    const { tree, onDiscountChange } = await render();

    await type(tree, FIELD, '250.');
    expect(inputLabelled(tree, FIELD).props.value).toBe('250.');
    await type(tree, FIELD, '250.5');
    expect(onDiscountChange).toHaveBeenLastCalledWith(250.5);
    await type(tree, FIELD, '-40');
    expect(onDiscountChange).toHaveBeenLastCalledWith(-40);
  });

  it('opens a number keyboard that still has the minus sign on Android', async () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      const { tree } = await render();
      expect(inputLabelled(tree, FIELD).props.keyboardType).toBe('numeric');
    } finally {
      Platform.OS = original;
    }
  });
});
