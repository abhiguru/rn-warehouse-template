/**
 * Typing in the discount field of the invoice's summary.
 */
import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
// A stand-in that draws the message of the error line while it is visible.
jest.mock('@/components/fiori', () => ({
  InlineValidation: ({ message, visible }: { message?: string; visible?: boolean }) =>
    visible !== false && message ? require('react').createElement(require('react-native').Text, { accessibilityRole: 'alert' }, message) : null,
}));

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

const input = (label: string) => screen.getByLabelText(label);
// The stand-in for InlineValidation draws the message as an alert while it is visible, so the test reads what the
// person would be shown (a message that is hidden or empty is not drawn).
const shownErrors = () => screen.queryAllByRole('alert').map((node) => node.props.children as string);
// A whole value arrives in one change; typing it key by key would pass through other, valid numbers, and userEvent.paste
// also leaves the field (the blur then formats "250." as "250.00").
const type = async (label: string, text: string) => {
  await fireEvent.changeText(input(label), text);
};
const leave = async (label: string) => {
  await fireEvent(input(label), 'blur', {});
};

afterEach(() => {
  setLanguage('en');
  jest.restoreAllMocks();
});

describe('the discount field', () => {
  const FIELD = 'Invoice discount';
  // Storage 500 + labour 200 + tax 35: the amount before discount is 735.
  const show = async (onDiscountChange = jest.fn(), onDiscountErrorChange = jest.fn()) => {
    await render(
      <InvoiceCalculationSummary
        header={header}
        items={[item]}
        onDiscountChange={onDiscountChange}
        onDiscountErrorChange={onDiscountErrorChange}
      />
    );
    return { onDiscountChange, onDiscountErrorChange };
  };

  it('refuses a discount above the invoice amount and says the save is blocked', async () => {
    const { onDiscountChange, onDiscountErrorChange } = await show();

    await type(FIELD, '5000');

    expect(onDiscountChange).not.toHaveBeenCalled();
    expect(shownErrors()).toHaveLength(1);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(shownErrors()[0]);
  });

  it('keeps refused text and its message once the field is left; the invoice keeps its discount', async () => {
    const { onDiscountChange, onDiscountErrorChange } = await show();
    await type(FIELD, '5000');
    expect(input(FIELD)).toHaveDisplayValue('5000');
    const message = shownErrors()[0];

    await leave(FIELD);

    expect(input(FIELD)).toHaveDisplayValue('5000');
    expect(shownErrors()).toEqual([message]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(message);
    expect(onDiscountChange).not.toHaveBeenCalled();
  });

  it('refuses a discount that takes the total to ₹0 under Discount, before any question', async () => {
    const { onDiscountChange, onDiscountErrorChange } = await show();

    await type(FIELD, '735');

    expect(onDiscountChange).not.toHaveBeenCalled();
    expect(shownErrors()).toEqual([t('invoice.summary.discountTotalZero')]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(t('invoice.summary.discountTotalZero'));
  });

  it('shows a finished number with two decimals once the field is left', async () => {
    await show();
    await type(FIELD, '12.5');

    await leave(FIELD);

    expect(input(FIELD)).toHaveDisplayValue('12.50');
    expect(shownErrors()).toEqual([]);
  });

  it('does not read "1,500" as a discount of 1', async () => {
    const { onDiscountChange, onDiscountErrorChange } = await show();

    await type(FIELD, '1,500');

    expect(onDiscountChange).not.toHaveBeenCalled();
    expect(shownErrors()).toEqual([t('invoice.summary.discountNotNumber')]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(t('invoice.summary.discountNotNumber'));
  });

  it('keeps a decimal and a surcharge as typed', async () => {
    const { onDiscountChange } = await show();

    await type(FIELD, '250.');
    expect(input(FIELD)).toHaveDisplayValue('250.');
    await type(FIELD, '250.5');
    expect(onDiscountChange).toHaveBeenLastCalledWith(250.5);
    await type(FIELD, '-40');
    expect(onDiscountChange).toHaveBeenLastCalledWith(-40);
  });

  it('opens a number keyboard that still has the minus sign on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await show();
    expect(input(FIELD)).toHaveProp('keyboardType', 'numeric');
  });
});

describe('the discount the invoice already has, when the amount before discount changes (D8)', () => {
  // Storage 500 + labour 200 + tax 35 = 735; a discount of 500 is allowed.
  const withDiscount: InvoiceHeaderData = { ...header, discount: 500 };
  const element = (h: InvoiceHeaderData, onDiscountErrorChange: (message: string | null) => void, key?: string) => (
    <InvoiceCalculationSummary key={key} header={h} items={[item]} onDiscountChange={jest.fn()} onDiscountErrorChange={onDiscountErrorChange} />
  );
  const mount = async (onDiscountErrorChange = jest.fn()) => {
    await render(element(withDiscount, onDiscountErrorChange));
    return { onDiscountErrorChange };
  };

  it('shows the D8 sentence at once when lowering labour and tax takes the total to zero, and tells the form', async () => {
    const { onDiscountErrorChange } = await mount();
    expect(shownErrors()).toEqual([]);

    await screen.rerender(element({ ...withDiscount, labour: 0, tax_amount: 0 }, onDiscountErrorChange));

    expect(shownErrors()).toEqual([t('invoice.summary.discountTotalZero')]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(t('invoice.summary.discountTotalZero'));
  });

  it('shows the D8 sentence at once when the summary opens with a discount equal to the amount', async () => {
    const { onDiscountErrorChange } = await mount();
    // A new key draws the summary afresh, as if it were opened with this discount.
    await screen.rerender(element({ ...withDiscount, discount: 735 }, onDiscountErrorChange, 'opened'));

    expect(shownErrors()).toEqual([t('invoice.summary.discountTotalZero')]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(t('invoice.summary.discountTotalZero'));
  });

  it('clears the message when the amount goes back up', async () => {
    const { onDiscountErrorChange } = await mount();
    await screen.rerender(element({ ...withDiscount, labour: 0, tax_amount: 0 }, onDiscountErrorChange));
    await screen.rerender(element(withDiscount, onDiscountErrorChange));

    expect(shownErrors()).toEqual([]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(null);
  });

  it('says the discount is too large when the new amount is below it', async () => {
    const { onDiscountErrorChange } = await mount();
    await screen.rerender(element({ ...withDiscount, discount: 600, labour: 0, tax_amount: 0 }, onDiscountErrorChange));

    expect(shownErrors()).toHaveLength(1);
    expect(shownErrors()[0]).not.toBe(t('invoice.summary.discountTotalZero'));
  });
});
