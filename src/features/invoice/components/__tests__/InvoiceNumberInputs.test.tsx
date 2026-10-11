/**
 * Typing in the invoice's number fields: line rates in the items table and the
 * item card, the group rates, and the discount.
 */
import React from 'react';
import { Platform, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import { InvoiceCalculationSummary } from '../InvoiceCalculationSummary';
import { InvoiceItemCard } from '../InvoiceItemCard';
import { InvoiceItemsTable } from '../InvoiceItemsTable';
import type { InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';

// Stable reference: the items table re-initialises its inputs whenever this changes.
const mockInvoiceForm: { bulkPricing: Record<string, { charge: number; labour_rate: number; tax: number }> } = { bulkPricing: {} };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, invoiceForm: mockInvoiceForm }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/fiori', () => ({ InlineValidation: 'InlineValidation' }));

const item: InvoiceItemData = {
  temp_id: 't1', disp_trl_id: 'd1', grn_item_id: 'gi', item_id: 'item', item_name: 'Fictional potatoes', qty: 100,
  grn_original_qty: 100, package_mark: 'FIX', rack: 'A1', weight: 50, dispatch_id: 'd', dispatch_no: 'I0001',
  dispatch_date: '2026-10-01', grn_id: 'g', grn_no: 'FX1', grn_date: '2026-04-01', duration: 1, no_of_days: 30,
  charge: 5, labour_rate: 2, tax: 5, amount: 500, labour_amount: 200, tax_amount: 35, item_total: 735,
};
const GROUP = 'item:::FIX';

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
/** Everything that can be pressed, outermost first. */
const pressables = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => typeof node.type !== 'string' && typeof node.props.onPress === 'function');
const type = async (tree: ReactTestRenderer, label: string, text: string) => {
  await act(async () => { inputLabelled(tree, label).props.onChangeText(text); });
};

afterEach(() => {
  setLanguage('en');
  mockInvoiceForm.bulkPricing = {};
});

describe('a rate cell in the items table', () => {
  const CELL = 'Charge, dispatch I0001';

  async function openChargeCell(onItemUpdate = jest.fn(), onInputErrorChange = jest.fn()) {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <InvoiceItemsTable items={[item]} onItemUpdate={onItemUpdate} onBulkEdit={jest.fn()} onInputErrorChange={onInputErrorChange} />
      );
    });
    // Expand the group, then tap the charge cell of the one dispatch line.
    await act(async () => { pressables(tree).find((node) => node.props.accessibilityState?.expanded === false)!.props.onPress(); });
    await act(async () => {
      pressables(tree).find((node) => String(node.props.accessibilityLabel ?? '').startsWith(CELL))!.props.onPress();
    });
    return { tree, onItemUpdate, onInputErrorChange };
  }

  it('keeps the decimal point between key presses', async () => {
    const { tree, onItemUpdate } = await openChargeCell();

    await type(tree, CELL, '5.');
    expect(inputLabelled(tree, CELL).props.value).toBe('5.');
    await type(tree, CELL, '5.5');

    expect(inputLabelled(tree, CELL).props.value).toBe('5.5');
    expect(onItemUpdate).toHaveBeenLastCalledWith('t1', 'charge', 5.5);
    expect(inputLabelled(tree, CELL).props.keyboardType).toBe('decimal-pad');
  });

  it('lets a rate be typed from zero', async () => {
    const { tree, onItemUpdate } = await openChargeCell();

    await type(tree, CELL, '0');
    expect(inputLabelled(tree, CELL).props.value).toBe('0');
    await type(tree, CELL, '0.5');

    expect(inputLabelled(tree, CELL).props.value).toBe('0.5');
    expect(onItemUpdate).toHaveBeenLastCalledWith('t1', 'charge', 0.5);
  });

  it.each([
    ['1,500', 'invoice.validation.rateNotNumber'],
    ['-5', 'invoice.validation.chargeRange'],
    ['1000000', 'invoice.validation.chargeRange'],
  ] as const)('reports "%s" and does not store it', async (typed, key) => {
    const { tree, onItemUpdate, onInputErrorChange } = await openChargeCell();

    await type(tree, CELL, typed);

    expect(onItemUpdate).not.toHaveBeenCalled();
    expect(shownErrors(tree)).toContain(t(key));
    expect(onInputErrorChange).toHaveBeenLastCalledWith(true);
  });

  it('shows the stored rate again once the cell is left, and reports no error', async () => {
    const { tree, onInputErrorChange } = await openChargeCell();
    await type(tree, CELL, '1,500');

    await act(async () => { inputLabelled(tree, CELL).props.onBlur(); });

    expect(shownErrors(tree)).toEqual([]);
    expect(onInputErrorChange).toHaveBeenLastCalledWith(false);
  });

  // RF-6: the cell is replaced by text in the same commit, so its input gets no blur.
  it('withdraws its error when another cell is opened while it still holds refused text', async () => {
    const { tree, onInputErrorChange } = await openChargeCell();
    await type(tree, CELL, '1,500');
    expect(onInputErrorChange).toHaveBeenLastCalledWith(true);

    const otherCell = pressables(tree).find((node) => {
      const label = String(node.props.accessibilityLabel ?? '');
      return label.includes('dispatch I0001') && !label.startsWith('Charge') && node.props.accessibilityHint === t('invoice.table.editsValueHint');
    })!;
    await act(async () => { otherCell.props.onPress(); });

    // The charge cell is text again, shows the stored rate, and nothing is in error.
    expect(tree.root.findAllByType(TextInput).filter((node) => node.props.accessibilityLabel === CELL)).toHaveLength(0);
    expect(shownErrors(tree)).toEqual([]);
    expect(onInputErrorChange).toHaveBeenLastCalledWith(false);
  });

  it('withdraws its error when its group is collapsed', async () => {
    const { tree, onInputErrorChange } = await openChargeCell();
    await type(tree, CELL, '-5');
    await act(async () => { pressables(tree).find((node) => node.props.accessibilityState?.expanded === true)!.props.onPress(); });
    expect(onInputErrorChange).toHaveBeenLastCalledWith(false);
  });

  it('reads Gujarati digits and shows them in Gujarati', async () => {
    setLanguage('gu');
    let tree!: ReactTestRenderer;
    const onItemUpdate = jest.fn();
    await act(async () => {
      tree = create(<InvoiceItemsTable items={[item]} onItemUpdate={onItemUpdate} onBulkEdit={jest.fn()} />);
    });
    await act(async () => { pressables(tree).find((node) => node.props.accessibilityState?.expanded === false)!.props.onPress(); });
    await act(async () => {
      pressables(tree).find((node) => String(node.props.accessibilityHint ?? '') === t('invoice.table.editsValueHint'))!.props.onPress();
    });
    const cell = () => tree.root.findAllByType(TextInput).find((node) => node.props.autoFocus)!;

    await act(async () => { cell().props.onChangeText('૫.૫'); });

    expect(cell().props.value).toBe('૫.૫');
    expect(onItemUpdate).toHaveBeenLastCalledWith('t1', 'charge', 5.5);
  });
});

describe('the group rates in the items table', () => {
  const GROUP_CHARGE = 'Storage charge for Fictional potatoes';

  it('keep the decimal point when the applied rate comes back from the form state', async () => {
    const onBulkEdit = jest.fn();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<InvoiceItemsTable items={[item]} onItemUpdate={jest.fn()} onBulkEdit={onBulkEdit} />);
    });

    await type(tree, GROUP_CHARGE, '6.');
    expect(onBulkEdit).toHaveBeenLastCalledWith(GROUP, { charge: 6, labour_rate: 2, tax: 5 });
    // The form state now holds the applied group rates, and the lines follow them.
    mockInvoiceForm.bulkPricing = { [GROUP]: { charge: 6, labour_rate: 2, tax: 5 } };
    await act(async () => {
      tree.update(<InvoiceItemsTable items={[{ ...item, charge: 6, amount: 600 }]} onItemUpdate={jest.fn()} onBulkEdit={onBulkEdit} />);
    });

    expect(inputLabelled(tree, GROUP_CHARGE).props.value).toBe('6.');
  });

  // RF-8: the group tax started as the weighted tax rounded to a whole number.
  it('start with the tax as stored, so changing the charge does not round the tax of every line', async () => {
    const onBulkEdit = jest.fn();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<InvoiceItemsTable items={[{ ...item, tax: 2.5 }]} onItemUpdate={jest.fn()} onBulkEdit={onBulkEdit} />);
    });
    const groupTax = tree.root.findAllByType(TextInput).find((node) => node.props.value === '2.5');
    expect(groupTax).toBeDefined();

    await type(tree, GROUP_CHARGE, '6');
    expect(onBulkEdit).toHaveBeenLastCalledWith(GROUP, { charge: 6, labour_rate: 2, tax: 2.5 });
  });

  it('show a whole-number tax without decimals, as before', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<InvoiceItemsTable items={[{ ...item, tax: 18 }]} onItemUpdate={jest.fn()} onBulkEdit={jest.fn()} />);
    });
    expect(tree.root.findAllByType(TextInput).some((node) => node.props.value === '18')).toBe(true);
  });

  it.each(['1,500', '-5', '1000000'])('report "%s" and do not apply it', async (typed) => {
    const onBulkEdit = jest.fn();
    const onInputErrorChange = jest.fn();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<InvoiceItemsTable items={[item]} onItemUpdate={jest.fn()} onBulkEdit={onBulkEdit} onInputErrorChange={onInputErrorChange} />);
    });

    await type(tree, GROUP_CHARGE, typed);

    expect(onBulkEdit).not.toHaveBeenCalled();
    expect(shownErrors(tree)).toHaveLength(1);
    expect(onInputErrorChange).toHaveBeenLastCalledWith(true);

    await act(async () => { inputLabelled(tree, GROUP_CHARGE).props.onBlur(); });
    expect(inputLabelled(tree, GROUP_CHARGE).props.value).toBe('5.00');
    expect(shownErrors(tree)).toEqual([]);
    expect(onInputErrorChange).toHaveBeenLastCalledWith(false);
  });
});

describe('a rate field on the item card', () => {
  const FIELD = 'Storage charge per unit per month';

  async function openCard(onUpdate = jest.fn()) {
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<InvoiceItemCard item={item} onUpdate={onUpdate} />); });
    await act(async () => { pressables(tree)[0].props.onPress(); });
    return { tree, onUpdate };
  }

  it('keeps the decimal point and stores the finished number', async () => {
    const { tree, onUpdate } = await openCard();

    await type(tree, FIELD, '5.');
    expect(inputLabelled(tree, FIELD).props.value).toBe('5.');
    await type(tree, FIELD, '5.5');

    expect(onUpdate).toHaveBeenLastCalledWith('t1', 'charge', 5.5);
  });

  it('reports a number outside the range under the field and does not store it', async () => {
    const { tree, onUpdate } = await openCard();

    await type(tree, 'Tax percent', '101');

    expect(onUpdate).not.toHaveBeenCalled();
    expect(shownErrors(tree)).toEqual([t('invoice.validation.taxRange')]);
  });
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

  it('shows the discount the invoice really has once the field is left', async () => {
    const { tree, onDiscountErrorChange } = await render();
    await type(tree, FIELD, '5000');
    expect(inputLabelled(tree, FIELD).props.value).toBe('5000');

    await act(async () => { inputLabelled(tree, FIELD).props.onBlur(); });

    expect(inputLabelled(tree, FIELD).props.value).toBe('400');
    expect(shownErrors(tree)).toEqual([]);
    expect(onDiscountErrorChange).toHaveBeenLastCalledWith(null);
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
