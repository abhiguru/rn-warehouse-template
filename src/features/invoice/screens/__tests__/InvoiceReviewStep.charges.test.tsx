/**
 * Invoice Review step, CHARGES (the summary as the body of the section): rounding that keeps the typed discount, a
 * refused discount that never changes the total, the final-amount dialog, one Total row, reasons red only after a
 * refused save, and the "How the total is calculated" dialog. A wrapper holds the discount as the form does.
 */
import React, { useState } from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet, TextInput } from 'react-native';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { getTokens, touchTarget } from '@/theme/tokens';
import { roundMoney } from '@/utils/invoiceCalculations';
import { InvoiceCalculationSummary } from '@/features/invoice/components/InvoiceCalculationSummary';
import { invoiceLine } from '@/tests/helpers/invoiceFixtures';
import { t } from '@/i18n';
import type { InvoiceHeaderData } from '@/types/invoice.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

// Base (storage + labour + tax) is ₹10,90,822.79.
const line = { ...invoiceLine(), amount: 1000000.79, labour_amount: 60000, tax_amount: 30822, item_total: 1090822.79 };
const baseHeader: InvoiceHeaderData = {
  inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 42, customer_id: 'c', customer_name: 'Example Traders',
  gr_id: 'g', gr_no: 'A0010', one_time_charge: false, discount: 0, labour: 60000, tax_amount: 30822, total: 1090823,
};

const changes: number[] = [];
const errors: Array<string | null> = [];

/** Holds the discount like the form does, and the total the server would estimate (the sum, then rounded up). */
function Harness({ showErrors = false, reasonRequired = false, discount = 0, focusRequest = 0 }: { showErrors?: boolean; reasonRequired?: boolean; discount?: number; focusRequest?: number }) {
  const [value, setValue] = useState(discount);
  const base = roundMoney(baseHeader.labour + baseHeader.tax_amount + line.amount);
  const header = { ...baseHeader, discount: value, discount_reason: '', total: Math.ceil(roundMoney(base - value)) };
  return (
    <InvoiceCalculationSummary
      header={header}
      items={[line]}
      onDiscountChange={(next) => { changes.push(next); setValue(next); }}
      onDiscountErrorChange={(error) => errors.push(error)}
      onDiscountReasonChange={() => {}}
      reasonRequired={reasonRequired}
      showErrors={showErrors}
      focusRequest={focusRequest}
    />
  );
}

const show = (props: React.ComponentProps<typeof Harness> = {}) => render(<Harness {...props} />);
const user = () => userEvent.setup({ delay: 0 });
const field = () => screen.getByLabelText(t('invoice.summary.discountA11y'));
// Text is put into a field as a whole (the old test called onChangeText with each text), key by key where a test says so.
const type = (text: string) => fireEvent.changeText(field(), text);
const focus = () => fireEvent(field(), 'focus', {});
const blur = () => fireEvent(field(), 'blur', {});
const button = (name: string) => screen.getByRole('button', { name });
const roundDown = () => button(t('invoice.summary.roundDownA11y'));
const roundUp = () => button(t('invoice.summary.roundUpA11y'));
const finalAmountButton = () => button(t('invoice.summary.calculatorA11y'));
const totalText = () => (screen.getByLabelText(/^Estimated total, /).props.accessibilityLabel as string).replace('Estimated total, ', '');
const finalDialogTitle = () => screen.queryByRole('header', { name: t('invoice.summary.calculatorTitle') });
const finalAmountField = () => screen.getByLabelText(t('invoice.summary.finalAmountA11y'));

beforeEach(() => { changes.length = 0; errors.length = 0; });

describe('rounding keeps the typed discount', () => {
  it('rounds up the total after a typed discount of 100: the discount becomes 99.79, the total ₹10,90,723.00', async () => {
    await show();
    await focus();
    await type('100');
    expect(totalText()).toBe('₹10,90,723.00');
    expect(screen.getByText('₹0.21')).toBeOnTheScreen();

    await user().press(roundUp());

    expect(field()).toHaveDisplayValue('99.79');
    expect(changes[changes.length - 1]).toBe(99.79);
    expect(totalText()).toBe('₹10,90,723.00');
    expect(screen.getAllByText('₹0.00').length).toBeGreaterThanOrEqual(1);
  });

  it('rounds down after a typed discount of 100: the discount becomes 100.79, the total ₹10,90,722.00', async () => {
    await show();
    await focus();
    await type('100');
    await user().press(roundDown());
    expect(field()).toHaveDisplayValue('100.79');
    expect(totalText()).toBe('₹10,90,722.00');
  });

  it('with no discount typed, round down makes the discount the paise: 0.79', async () => {
    await show();
    await user().press(roundDown());
    expect(field()).toHaveDisplayValue('0.79');
    expect(totalText()).toBe('₹10,90,822.00');
  });

  it('with no discount typed, round up makes a surcharge of the rest to the rupee: -0.21', async () => {
    await show();
    await user().press(roundUp());
    expect(field()).toHaveDisplayValue('-0.21');
    expect(totalText()).toBe('₹10,90,823.00');
  });
});

describe('a refused discount never changes the total (P1-5)', () => {
  it('keeps the total of the moment the field was entered, key by key', async () => {
    await show({ discount: 250 });
    const entered = totalText();
    await focus();
    const typed = ['9', '99', '999', '9999', '99999', '999999', '9999999', '99999999'];
    const seen: string[] = [];
    for (const text of typed) {
      await type(text);
      seen.push(totalText());
    }
    // 9, 99, 999, 9999 ... up to the amount are fine; past ₹10,90,822.79 the discount is refused.
    expect(seen[0]).toBe('₹10,90,814.00'); // 1090822.79 - 9, ceil
    expect(seen[5]).not.toBe(entered); // 999999 is inside the amount: committed
    expect(seen[6]).toBe(entered);
    expect(seen[7]).toBe(entered);
    expect(changes[changes.length - 1]).toBe(250);
    expect(errors[errors.length - 1]).toMatch(/can't be more than/);
  });

  it('keeps it for text that is not a number, and for an unfinished minus', async () => {
    await show({ discount: 250 });
    const entered = totalText();
    await focus();
    await type('1,5');
    expect(totalText()).toBe(entered);
    await type('-');
    expect(totalText()).toBe(entered);
    await type('-5');
    expect(totalText()).toBe('₹10,90,828.00');
  });
});

describe('typing a surcharge or a paise discount after a clear (R3b-03)', () => {
  it.each([
    ['-50', ['-', '-5', '-50'], -50],
    ['.75', ['.', '.7', '.75'], 0.75],
  ])('keeps "%s" as typed, key by key, after the field was cleared', async (_what, keys, discount) => {
    await show({ discount: 250 });
    await focus();
    await type('');
    expect(field()).toHaveDisplayValue('');
    expect(changes[changes.length - 1]).toBe(0);

    for (const key of keys) {
      await type(key);
      // The field shows exactly what was typed: the old discount never writes over it.
      expect(field()).toHaveDisplayValue(key);
    }

    expect(changes[changes.length - 1]).toBe(discount);
    expect(errors[errors.length - 1]).toBeNull();
    await blur();
    expect(field()).toHaveDisplayValue(discount.toFixed(2));
  });

  it('also keeps "-" and "." typed one after the other after backspacing from the full text', async () => {
    await show({ discount: 250 });
    await focus();
    for (const text of ['250.0', '250.', '250', '25', '2', '']) await type(text);
    await type('-');
    expect(field()).toHaveDisplayValue('-');
    await type('-2');
    expect(field()).toHaveDisplayValue('-2');
    expect(changes[changes.length - 1]).toBe(-2);
  });
});

describe('the discount limits (R3b-06)', () => {
  it('refuses a discount beyond 999,999.99 at once, with the message, although the invoice amount is larger', async () => {
    await show();
    await focus();
    await type('1000000');

    expect(errors[errors.length - 1]).toBe("The discount can't be more than ₹9,99,999.99.");
    expect(totalText()).toBe('₹10,90,823.00');
    expect(changes).not.toContain(1000000);
  });

  it('accepts 999,999.99', async () => {
    await show();
    await focus();
    await type('999999.99');
    expect(errors[errors.length - 1]).toBeNull();
    expect(changes[changes.length - 1]).toBe(999999.99);
  });

  it('refuses a surcharge beyond 999,999.99 at once', async () => {
    await show();
    await focus();
    await type('-1000000');

    expect(errors[errors.length - 1]).toBe("The extra charge can't be more than ₹9,99,999.99.");
    expect(changes).not.toContain(-1000000);
    await type('-999999.99');
    expect(errors[errors.length - 1]).toBeNull();
    expect(changes[changes.length - 1]).toBe(-999999.99);
  });
});

describe('the discount text (P1-6)', () => {
  it.each([['12.', '12.00'], ['100', '100.00'], ['5.5', '5.50']])('"%s" becomes "%s" when the field is left', async (typed, shown) => {
    await show();
    await focus();
    await type(typed);
    await blur();
    expect(field()).toHaveDisplayValue(shown);
  });

  it('is empty when cleared, and keeps refused text with its message after the field is left', async () => {
    await show({ discount: 250 });
    expect(field()).toHaveDisplayValue('250.00');
    await focus();
    await type('');
    await blur();
    expect(field()).toHaveDisplayValue('');
    await focus();
    await type('99999999999');
    await blur();
    // Refused text stays as typed (style guide 13.7); the Review refuses Save until it is fixed.
    expect(field()).toHaveDisplayValue('99999999999');
  });

  it('is at full width and at least touchTarget tall', async () => {
    await show();
    // The box around the input has no role or text of its own: it is the input's parent.
    const wrapper = field().parent!;
    const style = StyleSheet.flatten(wrapper.props.style);
    expect(style.alignSelf).toBe('stretch');
    expect(style.minHeight).toBeGreaterThanOrEqual(touchTarget);
  });
});

describe('Set the final amount', () => {
  it('is a tertiary button that opens the dialog, and the summary draws no filled button of its own', async () => {
    await show();
    const fill = getTokens('orange', 'light').brand.fill;
    // Every button of the summary (the dialog's Apply is a filled button of the dialog, not of the summary).
    const filledIn = (buttons: ReturnType<typeof screen.getAllByRole>) =>
      buttons.filter((node) => StyleSheet.flatten(node.props.style)?.backgroundColor === fill);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(3);
    expect(filledIn(screen.getAllByRole('button'))).toHaveLength(0);
    expect(finalDialogTitle()).not.toBeOnTheScreen();

    await user().press(finalAmountButton());
    expect(finalDialogTitle()).toBeOnTheScreen();
    // The dialog draws inside the summary; its Apply is the dialog's own filled button.
    const summary = within(screen.getByTestId('invoice-summary'));
    const summaryButtons = summary.getAllByRole('button').filter((node) => !['Apply', 'Cancel'].includes(node.props.accessibilityLabel));
    expect(summaryButtons.length).toBeGreaterThan(3);
    expect(filledIn(summaryButtons)).toHaveLength(0);
  });

  it('sets the discount from the amount before discount', async () => {
    await show();
    await user().press(finalAmountButton());
    await fireEvent.changeText(finalAmountField(), '1000000');
    await user().press(button('Apply'));
    expect(field()).toHaveDisplayValue('90822.79');
    expect(totalText()).toBe('₹10,00,000.00');
    expect(finalDialogTitle()).not.toBeOnTheScreen();
  });

  it('refuses an empty amount inside the dialog, which stays open, and Cancel changes nothing', async () => {
    await show({ discount: 250 });
    await user().press(finalAmountButton());
    await user().press(button('Apply'));
    expect(finalDialogTitle()).toBeOnTheScreen();
    expect(screen.getByText('Enter a final amount greater than zero.')).toBeOnTheScreen();
    await user().press(button('Cancel'));
    expect(finalDialogTitle()).not.toBeOnTheScreen();
    expect(field()).toHaveDisplayValue('250.00');
  });
});

describe('Set the final amount reads what is typed (R3b-07)', () => {
  const apply = async (text: string) => {
    await user().press(finalAmountButton());
    await fireEvent.changeText(finalAmountField(), text);
    await user().press(button('Apply'));
  };

  it.each(['1,500', '12abc', '1500.555', '-5'])('refuses "%s" with a message and keeps the dialog and the discount', async (text) => {
    await show({ discount: 250 });

    await apply(text);

    expect(finalDialogTitle()).toBeOnTheScreen();
    expect(screen.getByText('Enter the final amount as a number, for example 1500.50.')).toBeOnTheScreen();
    expect(field()).toHaveDisplayValue('250.00');
    expect(totalText()).not.toBe('₹1.00');
  });

  it('reads Gujarati digits as the same number', async () => {
    await show();
    await apply('૧૦૦૦૦૦૦');
    expect(field()).toHaveDisplayValue('90822.79');
    expect(totalText()).toBe('₹10,00,000.00');
  });

  it('refuses a final amount whose discount the save would refuse', async () => {
    await show();
    await apply('50000');

    expect(finalDialogTitle()).toBeOnTheScreen();
    expect(screen.getByText("The final amount can't be less than ₹90,822.80.")).toBeOnTheScreen();
    expect(field()).toHaveDisplayValue('');
  });
});

describe('the rows stack label over value from font scale 1.5 (R3b-04)', () => {
  const before = Dimensions.get('window');
  afterEach(async () => { await act(async () => { Dimensions.set({ window: before }); }); });
  const setWindow = (width: number, fontScale: number) => act(() => { Dimensions.set({ window: { width, height: 850, scale: 2.75, fontScale } }); });
  // A row is an accessible View that speaks "label, ₹amount"; it has no role, so it is found by that spoken label.
  const rowViews = () => screen.getAllByLabelText(/, ₹[\d,.]+$/);

  it('keeps label and value side by side at the normal text size', async () => {
    await setWindow(411, 1);
    await show({ discount: 100 });
    expect(screen.getByLabelText(/^Estimated total, /)).toBeOnTheScreen();
    rowViews().forEach((row) => expect(row).toHaveStyle({ flexDirection: 'row' }));
  });

  it.each([[411, 2], [320, 2], [320, 1.5]])('stacks every row, the Total included, at %i dp and font scale %s with a ₹10 lakh total', async (width, scale) => {
    await setWindow(width, scale);
    await show({ discount: 100 });

    const rows = rowViews();
    // Subtotal, Labour, Tax, Rounding and the Total.
    expect(rows.length).toBe(5);
    expect(totalText()).toBe('₹10,90,723.00');
    rows.forEach((row) => {
      expect(row).toHaveStyle({ flexDirection: 'column' });
      const [label, value] = within(row).getAllByText(/[\s\S]*/);
      // The value gets the whole row, left aligned under its label; neither is cut or shrunk.
      expect(value).toHaveStyle({ textAlign: 'left' });
      [label, value].forEach((text) => {
        expect(text.props.numberOfLines).toBeUndefined();
        expect(text.props.adjustsFontSizeToFit).toBeFalsy();
      });
    });
  });
});

describe('focus after a refused save (R3b-11)', () => {
  // TextInput's jest stand-in shares one jest.fn for `focus` across its instances; `this` says which field was called.
  const focusMock = () => (TextInput.prototype as unknown as { focus: jest.Mock }).focus;
  const focusedFields = () => focusMock().mock.contexts.map((input: { props: { testID?: string } }) => String(input.props.testID));
  beforeEach(() => {
    focusMock().mockClear();
    jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('moves focus to the reason when a reason is still needed, and announces it', async () => {
    const { rerender } = await show({ discount: 100, reasonRequired: true, showErrors: true, focusRequest: 0 });
    expect(focusedFields()).toEqual([]);

    await rerender(<Harness discount={100} reasonRequired showErrors focusRequest={1} />);

    expect(focusedFields()).toEqual(['invoice-summary-discount-reason']);
    expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  it('moves focus to the discount field first when its text was refused', async () => {
    const { rerender } = await show({ discount: 100, reasonRequired: true, focusRequest: 0 });
    await focus();
    await type('99999999');
    expect(errors[errors.length - 1]).not.toBeNull();

    await rerender(<Harness discount={100} reasonRequired showErrors focusRequest={1} />);

    expect(focusedFields()).toEqual(['invoice-summary-discount']);
  });

  it('does not move focus when nothing needs fixing, and not again for the same request', async () => {
    const { rerender } = await show({ discount: 100, focusRequest: 0 });
    await rerender(<Harness discount={100} focusRequest={1} />);
    expect(focusedFields()).toEqual([]);
  });
});

describe('the rest of CHARGES', () => {
  it('has exactly one Total row', async () => {
    await show({ discount: 100 });
    expect(screen.getAllByText('Estimated total')).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Estimated total, /)).toHaveLength(1);
  });

  it('draws the reasons red only after a refused save', async () => {
    const { rerender } = await show({ discount: 100, reasonRequired: true });
    const border = () => StyleSheet.flatten(screen.getByLabelText(t('invoice.label.discountReason')).props.style);
    const negative = getTokens('orange', 'light').status.negative.border;
    expect(border().borderColor).not.toBe(negative);
    expect(screen.queryByText('Enter a reason.')).not.toBeOnTheScreen();

    await rerender(<Harness discount={100} reasonRequired showErrors />);
    expect(border().borderColor).toBe(negative);
    expect(border().borderWidth).toBe(2);
    expect(screen.getByText('Enter a reason.')).toBeOnTheScreen();
  });

  it('keeps the sums off the screen and explains them in the "How the total is calculated" dialog', async () => {
    await show({ discount: 100 });
    expect(screen.queryByText(/\(storage\) \+/)).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'How the total is calculated' })).not.toBeOnTheScreen();

    await user().press(button('How the total is calculated'));

    expect(screen.getByRole('header', { name: 'How the total is calculated' })).toBeOnTheScreen();
    const how = screen.getByText(/\(storage\) \+/);
    expect(how).toHaveTextContent('₹10,00,000.79 (storage) + ₹60,000.00 (labour) + ₹30,822.00 (tax)', { exact: false });
    expect(how).toHaveTextContent('−₹100.00 (discount)', { exact: false });
    expect(how).toHaveTextContent('= ₹10,90,723.00', { exact: false });
  });
});
