/**
 * Invoice Review step, CHARGES (the summary as the body of the section): rounding that keeps the typed discount, a
 * refused discount that never changes the total, the final-amount dialog, one Total row, reasons red only after a
 * refused save, and the "How the total is calculated" dialog. A wrapper holds the discount as the form does.
 */
import React, { useState } from 'react';
import { AccessibilityInfo, Dimensions, findNodeHandle, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { getTokens, touchTarget } from '@/theme/tokens';
import { roundMoney } from '@/utils/invoiceCalculations';
import { InvoiceCalculationSummary } from '@/features/invoice/components/InvoiceCalculationSummary';
import { invoiceLine } from '@/tests/helpers/invoiceFixtures';
import type { InvoiceHeaderData } from '@/types/invoice.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/ConfirmInputDialog', () => ({ ConfirmInputDialog: 'ConfirmInputDialog' }));
jest.mock('@/components/fiori', () => ({ InlineValidation: 'InlineValidation' }));
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({ ...jest.requireActual('react-native/Libraries/ReactNative/RendererProxy'), findNodeHandle: jest.fn() }));

// Base (storage + labour + tax) is ₹10,90,822.79.
const line = { ...invoiceLine(), amount: 1000000.79, labour_amount: 60000, tax_amount: 30822, item_total: 1090822.79 };
const baseHeader: InvoiceHeaderData = {
  inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 42, customer_id: 'c', customer_name: 'Example Traders',
  gr_id: 'g', gr_no: 'A0010', one_time_charge: false, discount: 0, labour: 60000, tax_amount: 30822, total: 1090823,
};

let tree: ReactTestRenderer;
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

const render = async (props: React.ComponentProps<typeof Harness> = {}) => { await act(async () => { tree = create(<Harness {...props} />); }); };
const field = () => tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Invoice discount')!;
const byId = (id: string) => tree.root.find((node) => node.props.testID === id && (typeof node.type === 'string' || typeof node.props.onPress === 'function'));
const type = async (text: string) => { await act(async () => { field().props.onChangeText(text); }); };
const focus = async () => { await act(async () => { field().props.onFocus(); }); };
const blur = async () => { await act(async () => { field().props.onBlur(); }); };
const press = async (id: string) => { await act(async () => { byId(id).props.onPress(); }); };
const texts = () => tree.root.findAllByType(Text).map((node) => String(node.props.children));
const totalText = () => (byId('invoice-summary-total').props.accessibilityLabel as string).replace('Estimated total, ', '');
const dialog = (name: string) => tree.root.findAllByType(name as unknown as React.ElementType)[0];

beforeEach(() => { changes.length = 0; errors.length = 0; });
afterEach(async () => { await act(async () => { tree.unmount(); }); });

describe('rounding keeps the typed discount', () => {
  it('rounds up the total after a typed discount of 100: the discount becomes 99.79, the total ₹10,90,723.00', async () => {
    await render();
    await focus();
    await type('100');
    expect(totalText()).toBe('₹10,90,723.00');
    expect(texts()).toContain('₹0.21');

    await press('invoice-summary-round-up');

    expect(field().props.value).toBe('99.79');
    expect(changes[changes.length - 1]).toBe(99.79);
    expect(totalText()).toBe('₹10,90,723.00');
    expect(texts().filter((text) => text === '₹0.00').length).toBeGreaterThanOrEqual(1);
  });

  it('rounds down after a typed discount of 100: the discount becomes 100.79, the total ₹10,90,722.00', async () => {
    await render();
    await focus();
    await type('100');
    await press('invoice-summary-round-down');
    expect(field().props.value).toBe('100.79');
    expect(totalText()).toBe('₹10,90,722.00');
  });

  it('with no discount typed, round down makes the discount the paise: 0.79', async () => {
    await render();
    await press('invoice-summary-round-down');
    expect(field().props.value).toBe('0.79');
    expect(totalText()).toBe('₹10,90,822.00');
  });

  it('with no discount typed, round up makes a surcharge of the rest to the rupee: -0.21', async () => {
    await render();
    await press('invoice-summary-round-up');
    expect(field().props.value).toBe('-0.21');
    expect(totalText()).toBe('₹10,90,823.00');
  });
});

describe('a refused discount never changes the total (P1-5)', () => {
  it('keeps the total of the moment the field was entered, key by key', async () => {
    await render({ discount: 250 });
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
    await render({ discount: 250 });
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
    await render({ discount: 250 });
    await focus();
    await type('');
    expect(field().props.value).toBe('');
    expect(changes[changes.length - 1]).toBe(0);

    for (const key of keys) {
      await type(key);
      // The field shows exactly what was typed: the old discount never writes over it.
      expect(field().props.value).toBe(key);
    }

    expect(changes[changes.length - 1]).toBe(discount);
    expect(errors[errors.length - 1]).toBeNull();
    await blur();
    expect(field().props.value).toBe(discount.toFixed(2));
  });

  it('also keeps "-" and "." typed one after the other after backspacing from the full text', async () => {
    await render({ discount: 250 });
    await focus();
    for (const text of ['250.0', '250.', '250', '25', '2', '']) await type(text);
    await type('-');
    expect(field().props.value).toBe('-');
    await type('-2');
    expect(field().props.value).toBe('-2');
    expect(changes[changes.length - 1]).toBe(-2);
  });
});

describe('the discount limits (R3b-06)', () => {
  it('refuses a discount beyond 999,999.99 at once, with the message, although the invoice amount is larger', async () => {
    await render();
    await focus();
    await type('1000000');

    expect(errors[errors.length - 1]).toBe("The discount can't be more than ₹9,99,999.99.");
    expect(totalText()).toBe('₹10,90,823.00');
    expect(changes).not.toContain(1000000);
  });

  it('accepts 999,999.99', async () => {
    await render();
    await focus();
    await type('999999.99');
    expect(errors[errors.length - 1]).toBeNull();
    expect(changes[changes.length - 1]).toBe(999999.99);
  });

  it('refuses a surcharge beyond 999,999.99 at once', async () => {
    await render();
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
    await render();
    await focus();
    await type(typed);
    await blur();
    expect(field().props.value).toBe(shown);
  });

  it('is empty when cleared, and shows the discount the invoice has after refused text', async () => {
    await render({ discount: 250 });
    expect(field().props.value).toBe('250.00');
    await focus();
    await type('');
    await blur();
    expect(field().props.value).toBe('');
    await focus();
    await type('99999999999');
    await blur();
    expect(field().props.value).toBe('');
  });

  it('is at full width and at least touchTarget tall', async () => {
    await render();
    const wrapper = tree.root.findAllByType(TextInput)[0].parent!.parent!;
    const style = StyleSheet.flatten(wrapper.props.style);
    expect(style.alignSelf).toBe('stretch');
    expect(style.minHeight).toBeGreaterThanOrEqual(touchTarget);
  });
});

describe('Set the final amount', () => {
  it('is a tertiary button that opens the dialog, and the summary draws no filled button of its own', async () => {
    await render();
    const fill = getTokens('orange', 'light').brand.fill;
    const filled = () => tree.root.findAllByType(Pressable).filter((node) => {
      const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
      return StyleSheet.flatten(style)?.backgroundColor === fill;
    });
    expect(filled()).toHaveLength(0);
    expect(dialog('ConfirmInputDialog').props.visible).toBe(false);

    await press('invoice-summary-final-amount');
    expect(dialog('ConfirmInputDialog').props.visible).toBe(true);
    expect(dialog('ConfirmInputDialog').props.title).toBe('Set the final amount');
    expect(filled()).toHaveLength(0);
  });

  it('sets the discount from the amount before discount', async () => {
    await render();
    await press('invoice-summary-final-amount');
    await act(async () => { dialog('ConfirmInputDialog').props.field.onChangeText('1000000'); });
    await act(async () => { dialog('ConfirmInputDialog').props.onConfirm(); });
    expect(field().props.value).toBe('90822.79');
    expect(totalText()).toBe('₹10,00,000.00');
    expect(dialog('ConfirmInputDialog').props.visible).toBe(false);
  });

  it('refuses an empty amount inside the dialog, which stays open, and Cancel changes nothing', async () => {
    await render({ discount: 250 });
    await press('invoice-summary-final-amount');
    await act(async () => { dialog('ConfirmInputDialog').props.onConfirm(); });
    expect(dialog('ConfirmInputDialog').props.visible).toBe(true);
    expect(dialog('ConfirmInputDialog').props.field.error).toBe('Enter a final amount greater than zero.');
    await act(async () => { dialog('ConfirmInputDialog').props.onCancel(); });
    expect(dialog('ConfirmInputDialog').props.visible).toBe(false);
    expect(field().props.value).toBe('250.00');
  });
});

describe('Set the final amount reads what is typed (R3b-07)', () => {
  const apply = async (text: string) => {
    await press('invoice-summary-final-amount');
    await act(async () => { dialog('ConfirmInputDialog').props.field.onChangeText(text); });
    await act(async () => { dialog('ConfirmInputDialog').props.onConfirm(); });
  };

  it.each(['1,500', '12abc', '1500.555', '-5'])('refuses "%s" with a message and keeps the dialog and the discount', async (text) => {
    await render({ discount: 250 });

    await apply(text);

    expect(dialog('ConfirmInputDialog').props.visible).toBe(true);
    expect(dialog('ConfirmInputDialog').props.field.error).toBe('Enter the final amount as a number, for example 1500.50.');
    expect(field().props.value).toBe('250.00');
    expect(totalText()).not.toBe('₹1.00');
  });

  it('reads Gujarati digits as the same number', async () => {
    await render();
    await apply('૧૦૦૦૦૦૦');
    expect(field().props.value).toBe('90822.79');
    expect(totalText()).toBe('₹10,00,000.00');
  });

  it('refuses a final amount whose discount the save would refuse', async () => {
    await render();
    await apply('50000');

    expect(dialog('ConfirmInputDialog').props.visible).toBe(true);
    expect(dialog('ConfirmInputDialog').props.field.error).toBe("The final amount can't be less than ₹90,822.80.");
    expect(field().props.value).toBe('');
  });
});

describe('the rows stack label over value from font scale 1.5 (R3b-04)', () => {
  const before = Dimensions.get('window');
  afterEach(async () => { await act(async () => { Dimensions.set({ window: before }); }); });
  const setWindow = (width: number, fontScale: number) => act(() => Dimensions.set({ window: { width, height: 850, scale: 2.75, fontScale } }));
  const rowViews = () =>
    tree.root.findAll((node) => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string' && /, ₹[\d,.]+$/.test(node.props.accessibilityLabel) && !('onPress' in node.props));
  const direction = (node: ReturnType<typeof rowViews>[number]) => StyleSheet.flatten(node.props.style).flexDirection;

  it('keeps label and value side by side at the normal text size', async () => {
    await setWindow(411, 1);
    await render({ discount: 100 });
    expect(rowViews().map((row) => row.props.accessibilityLabel)).toEqual(expect.arrayContaining([expect.stringMatching(/^Estimated total, /)]));
    rowViews().forEach((row) => expect(direction(row)).toBe('row'));
  });

  it.each([[411, 2], [320, 2], [320, 1.5]])('stacks every row, the Total included, at %i dp and font scale %s with a ₹10 lakh total', async (width, scale) => {
    await setWindow(width, scale);
    await render({ discount: 100 });

    const rows = rowViews();
    // Subtotal, Labour, Tax, Rounding and the Total.
    expect(rows.length).toBe(5);
    expect(totalText()).toBe('₹10,90,723.00');
    rows.forEach((row) => {
      expect(direction(row)).toBe('column');
      const [label, value] = row.findAllByType(Text);
      // The value gets the whole row, left aligned under its label; neither is cut or shrunk.
      expect(StyleSheet.flatten(value.props.style).textAlign).toBe('left');
      [label, value].forEach((text) => {
        expect(text.props.numberOfLines).toBeUndefined();
        expect(text.props.adjustsFontSizeToFit).toBeFalsy();
      });
    });
  });
});

describe('focus after a refused save (R3b-11)', () => {
  const focused: string[] = [];
  beforeEach(() => {
    focused.length = 0;
    jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
    jest.mocked(findNodeHandle).mockReturnValue(7);
  });
  afterEach(() => jest.restoreAllMocks());
  // The jest TextInput is a component with its own focus(); record the calls of each field by its test id.
  const watchFocus = () => {
    tree.root.findAllByType(TextInput).forEach((input) => {
      const id = String(input.props.testID);
      (input.instance as { focus: () => void }).focus = () => { focused.push(id); };
    });
  };
  const renderWithRefs = async (props: React.ComponentProps<typeof Harness>) => {
    await render(props);
    watchFocus();
  };

  it('moves focus to the reason when a reason is still needed, and announces it', async () => {
    await renderWithRefs({ discount: 100, reasonRequired: true, showErrors: true, focusRequest: 0 });
    expect(focused).toEqual([]);

    await act(async () => { tree.update(<Harness discount={100} reasonRequired showErrors focusRequest={1} />); });

    expect(focused).toEqual(['invoice-summary-discount-reason']);
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the discount field first when its text was refused', async () => {
    await renderWithRefs({ discount: 100, reasonRequired: true, focusRequest: 0 });
    await focus();
    await type('99999999');
    expect(errors[errors.length - 1]).not.toBeNull();

    await act(async () => { tree.update(<Harness discount={100} reasonRequired showErrors focusRequest={1} />); });

    expect(focused).toEqual(['invoice-summary-discount']);
  });

  it('does not move focus when nothing needs fixing, and not again for the same request', async () => {
    await renderWithRefs({ discount: 100, focusRequest: 0 });
    await act(async () => { tree.update(<Harness discount={100} focusRequest={1} />); });
    expect(focused).toEqual([]);
  });
});

describe('the rest of CHARGES', () => {
  it('has exactly one Total row', async () => {
    await render({ discount: 100 });
    expect(texts().filter((text) => text === 'Estimated total')).toHaveLength(1);
    expect(tree.root.findAll((node) => node.props.testID === 'invoice-summary-total' && typeof node.type === 'string')).toHaveLength(1);
  });

  it('draws the reasons red only after a refused save', async () => {
    await render({ discount: 100, reasonRequired: true });
    const border = () => StyleSheet.flatten(tree.root.findAll((node) => node.props.testID === 'invoice-summary-discount-reason' && typeof node.type === 'string')[0].props.style);
    const negative = getTokens('orange', 'light').status.negative.border;
    expect(border().borderColor).not.toBe(negative);
    expect(tree.root.findAllByType('InlineValidation' as unknown as React.ElementType).some((node) => node.props.visible && node.props.message === 'Enter a reason.')).toBe(false);
    await act(async () => { tree.unmount(); });

    await render({ discount: 100, reasonRequired: true, showErrors: true });
    expect(border().borderColor).toBe(negative);
    expect(border().borderWidth).toBe(2);
    expect(tree.root.findAllByType('InlineValidation' as unknown as React.ElementType).some((node) => node.props.visible === true && node.props.message === 'Enter a reason.')).toBe(true);
  });

  it('keeps the sums off the screen and explains them in the "How the total is calculated" dialog', async () => {
    await render({ discount: 100 });
    expect(texts().some((text) => text.includes('(storage) +'))).toBe(false);
    expect(dialog('ConfirmDialog').props.visible).toBe(false);

    await press('invoice-summary-how');

    const how = dialog('ConfirmDialog');
    expect(how.props.visible).toBe(true);
    expect(how.props.title).toBe('How the total is calculated');
    expect(how.props.message).toContain('₹10,00,000.79 (storage) + ₹60,000.00 (labour) + ₹30,822.00 (tax)');
    expect(how.props.message).toContain('−₹100.00 (discount)');
    expect(how.props.message).toContain('= ₹10,90,723.00');
  });
});
