/**
 * The shared Details step (step 1), in both modes, on the real hook and a real
 * invoice-form slice.
 *
 * - The message of a field shows when the field is left and when Next is
 *   pressed, and goes when the field changes.
 * - Choosing another GRN asks first when something would be lost (always in an
 *   edit); Cancel keeps everything; a load that fails keeps the previous GRN and
 *   its lines and names both GRNs.
 * - No message shows a raw field key; a long GRN number wraps.
 */
import React from 'react';
import { Platform, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { loadInvoiceFormData, getNextInvoiceNumber } from '@/features/invoice/services/invoiceFormService';
import { updateDiscount, updateEditedItem, updateHeader } from '@/store/slices/invoiceFormSlice';
import {
  fillNewInvoice,
  grnFormAnswer,
  IDS,
  invoiceLine,
  invoiceableGrn,
  makeInvoiceStore,
  openForEdit,
  type InvoiceStore,
} from '@/tests/helpers/invoiceFixtures';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';
import InvoiceEditStep1 from '../../../app/invoice-edit/[id]/step1';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getNextInvoiceNumber: jest.fn(),
  loadInvoiceFormData: jest.fn(),
  loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: 'DatePickerModal' }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: 'GRNAutocomplete' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));

const OTHER = invoiceableGrn();
const FIELD_KEYS = /\b(inv_no|inv_date|inv_fin_year|gr_id|gr_no|customer_id|customer_name|one_time_charge)\b/;

let tree: ReactTestRenderer;
const as = (name: string) => name as unknown as React.ElementType;
const render = async (mode: 'create' | 'edit') => {
  await act(async () => { tree = create(mode === 'edit' ? <InvoiceEditStep1 /> : <InvoiceFormStep1 />); });
};
const numberField = () => tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'Invoice number')!;
const picker = () => tree.root.findByType(as('GRNAutocomplete'));
const datePicker = () => tree.root.findByType(as('DatePickerModal'));
const shown = () => tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible);
const screenText = () => JSON.stringify(tree.toJSON());
const pressNext = async () => {
  const next = tree.root.find((node) => node.props.accessibilityLabel === 'Next: items' && typeof node.props.onPress === 'function');
  await act(async () => { await next.props.onPress(); });
};
// The words on the screen only (the stand-ins keep the props they were given in the tree).
const words = () =>
  tree.root
    .findAll((node) => (node.type as unknown) === ('Text' as unknown))
    .map((node) => [node.props.children].flat(Infinity).filter((part) => typeof part === 'string').join(''))
    .join('\n');
const state = () => mockStore.getState().invoiceForm;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore = makeInvoiceStore();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(getNextInvoiceNumber).mockResolvedValue({ success: true, data: { next_invoice_number: 55, financial_year: '2026-27' } } as never);
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

/** A form with a GRN and one line, in the mode, as the person left it. */
const open = (mode: 'create' | 'edit', header: Record<string, unknown> = {}, items = [invoiceLine()]) => {
  if (mode === 'edit') {
    openForEdit(mockStore, items, header);
  } else {
    fillNewInvoice(mockStore, items);
    mockStore.dispatch(updateHeader({ inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no: 42, inv_no_typed: true, ...header }));
  }
};

describe.each(['create', 'edit'] as const)('the messages of the fields, %s', (mode) => {
  it('shows the date message on Next, and takes it away when the date is changed', async () => {
    open(mode, { inv_date: '2099-01-01' });
    await render(mode);

    await pressNext();

    expect(screenText()).toContain('Cannot select a future date');
    expect(showAlert).toHaveBeenCalledWith('Check the invoice', expect.stringContaining('Cannot select a future date'));
    expect(router.navigate).not.toHaveBeenCalled();

    await act(async () => { datePicker().props.onConfirm({ date: new Date(2026, 9, 6) }); });

    expect(screenText()).not.toContain('Cannot select a future date');
    expect(state().header.inv_date).toBe('2026-10-06');
  });

  it('shows the number message when the field is left, and takes it away when the number is changed', async () => {
    open(mode);
    await render(mode);
    // A number above the ceiling: pasted in a new invoice, typed over a saved number in an edit.
    if (mode === 'create') {
      await act(async () => { mockStore.dispatch(updateHeader({ inv_no: 100000000, inv_no_typed: true })); });
    } else {
      await act(async () => { numberField().props.onChangeText('100000000'); });
    }
    expect(screenText()).not.toContain('between 1 and 99999999');

    await act(async () => { await numberField().props.onBlur(); });

    expect(screenText()).toContain('Invoice number must be between 1 and 99999999');

    await act(async () => { numberField().props.onChangeText('55'); });

    expect(screenText()).not.toContain('between 1 and 99999999');
    expect(state().header.inv_no).toBe(55);
  });

  it('shows the message under the field and still goes on once it is corrected', async () => {
    open(mode, { inv_date: '2099-01-01' });
    await render(mode);
    await pressNext();
    await act(async () => { datePicker().props.onConfirm({ date: new Date(2026, 9, 6) }); });
    jest.mocked(showAlert).mockClear();

    await pressNext();

    expect(showAlert).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(mode === 'edit' ? '/invoice-edit/inv-42/step2' : '/invoice-form/step2');
  });

  it('never shows a raw field key in the messages', async () => {
    open(mode, { inv_date: '2099-01-01', customer_id: 'not-a-uuid', customer_name: '', gr_no: '' });
    await render(mode);

    await pressNext();

    const [title, message] = jest.mocked(showAlert).mock.calls[0];
    expect(`${title}\n${message}`).not.toMatch(FIELD_KEYS);
    expect(words()).not.toMatch(FIELD_KEYS);
    expect(String(message).split('\n').length).toBeGreaterThan(1);
  });
});

describe('the GRN number', () => {
  it.each(['create', 'edit'] as const)('wraps on more than one line when it is long, %s', async (mode) => {
    open(mode, { gr_no: 'A00100200300400500600700800900' });
    await render(mode);

    const value = tree.root.find((node) => node.props.testID === 'invoice-grn-value' && (node.type as unknown) === 'Text');

    expect(value.props.numberOfLines).toBeUndefined();
    expect(JSON.stringify(value.props.children)).toContain('A00100200300400500600700800900');
  });
});

describe('choosing another GRN in an edit', () => {
  const choose = async () => { await act(async () => { picker().props.onSelect(OTHER); }); };

  it('asks first, and Cancel keeps the GRN, the lines and the rates as they were', async () => {
    open('edit');
    await render('edit');
    const before = { header: state().header, items: state().items };

    await choose();

    expect(shown()).toHaveLength(1);
    expect(shown()[0].props.title).toBe('Change the GRN?');
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    await act(async () => { shown()[0].props.onCancel(); });

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    expect(state().header).toBe(before.header);
    expect(state().items).toBe(before.items);
  });

  it('loads the new GRN\'s lines once the question is answered with Change GRN, and warns that the GRN changed', async () => {
    open('edit');
    await render('edit');
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn, charge: 9 }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );
    await choose();

    await act(async () => { await shown()[0].props.onConfirm(); });

    expect(loadInvoiceFormData).toHaveBeenCalledWith(IDS.otherGrn);
    expect(state().header).toMatchObject({ gr_id: IDS.otherGrn, gr_no: 'A0011', inv_no: 42 });
    expect(state().items.map((line) => line.charge)).toEqual([9]);
    expect(screenText()).toContain('GRN changed. The items now come from the new GRN.');
  });

  it('keeps the previous GRN and its lines when the new GRN cannot be loaded, and names both GRNs', async () => {
    open('edit');
    await render('edit');
    jest.mocked(loadInvoiceFormData).mockResolvedValue({ success: false, message: 'Server said no' } as never);
    const before = { header: state().header, items: state().items };
    await choose();

    await act(async () => { await shown()[0].props.onConfirm(); });

    expect(state().header).toBe(before.header);
    expect(state().items).toBe(before.items);
    expect(state().header.gr_no).toBe('A0010');
    const [title, message] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe("Couldn't load the GRN");
    expect(message).toContain('A0011');
    expect(message).toContain('A0010');
    expect(screenText()).not.toContain('GRN changed.');
  });

  it('does nothing when the invoice\'s own GRN is chosen again', async () => {
    open('edit');
    await render('edit');

    await act(async () => { picker().props.onSelect(invoiceableGrn({ id: IDS.grn, gr_no: 'A0010' })); });

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
  });

  it('gives the picker the invoice\'s own GRN to list, and the form\'s GRN as the current one', async () => {
    open('edit');
    await render('edit');

    expect(picker().props.currentValue).toEqual({ id: IDS.grn });
    expect(picker().props.pinnedGrn).toEqual({ id: IDS.grn, gr_no: 'A0010', customer_name: 'Example Traders' });
  });
});

describe('choosing another GRN in a new invoice', () => {
  const choose = async () => { await act(async () => { picker().props.onSelect(OTHER); }); };

  it('loads it at once when nothing was typed on the lines', async () => {
    open('create');
    await render('create');
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );

    await choose();

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).toHaveBeenCalledWith(IDS.otherGrn);
    expect(state().header.gr_no).toBe('A0011');
  });

  it('asks first when rates were typed on the lines, and Cancel keeps them', async () => {
    open('create');
    await render('create');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'temp_0', values: { charge: 9 } })); });
    const lines = state().items;
    const typed = state().editedItems;
    expect(Object.keys(typed)).toHaveLength(1);

    await choose();
    expect(shown()).toHaveLength(1);
    await act(async () => { shown()[0].props.onCancel(); });

    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    expect(state().items).toBe(lines);
    expect(state().editedItems).toBe(typed);
  });

  it('resets the discount and both reasons with the lines when the change is confirmed, and keeps all of it when cancelled', async () => {
    open('create');
    await render('create');
    await act(async () => {
      mockStore.dispatch(updateDiscount(499.86));
      mockStore.dispatch(updateHeader({ discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' }));
    });
    expect(state().header).toMatchObject({ discount: 499.86, discount_reason: 'Damaged bags' });

    // Cancel: everything is kept.
    await act(async () => { picker().props.onSelect(OTHER); });
    expect(shown()).toHaveLength(1);
    await act(async () => { shown()[0].props.onCancel(); });
    expect(state().header).toMatchObject({ gr_no: 'A0010', discount: 499.86, discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' });

    // Confirm: the new GRN's invoice starts clean.
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );
    await act(async () => { picker().props.onSelect(OTHER); });
    await act(async () => { await shown()[0].props.onConfirm(); });

    expect(state().header.gr_no).toBe('A0011');
    expect(state().header.discount).toBe(0);
    expect(state().header.discount_reason ?? '').toBe('');
    expect(state().header.zero_charge_reason ?? '').toBe('');
    expect(state().header.total).toBe(state().items.reduce((sum, line) => sum + line.item_total, 0));
  });

  it('keeps the discount and reasons when the load fails', async () => {
    open('create');
    await render('create');
    await act(async () => {
      mockStore.dispatch(updateDiscount(10));
      mockStore.dispatch(updateHeader({ discount_reason: 'Damaged bags' }));
      mockStore.dispatch(updateHeader({ zero_charge_reason: 'Sample lot' }));
    });
    jest.mocked(loadInvoiceFormData).mockResolvedValue({ success: false, message: 'Server said no' } as never);

    await act(async () => { picker().props.onSelect(OTHER); });
    await act(async () => { await shown()[0].props.onConfirm(); });

    expect(state().header).toMatchObject({ gr_no: 'A0010', discount: 10, discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' });
  });

  it('keeps the previous GRN when the load fails, and names both', async () => {
    open('create');
    await render('create');
    jest.mocked(loadInvoiceFormData).mockResolvedValue({ success: false, message: 'Server said no' } as never);

    await choose();

    expect(state().header.gr_no).toBe('A0010');
    expect(state().items).toHaveLength(1);
    expect(jest.mocked(showAlert).mock.calls[0][1]).toEqual(expect.stringContaining('A0011'));
    expect(jest.mocked(showAlert).mock.calls[0][1]).toEqual(expect.stringContaining('A0010'));
  });
});

describe('a new invoice with no GRN yet', () => {
  it('offers to select a GRN when Next is pressed, instead of a field message', async () => {
    await render('create');

    await pressNext();

    expect(shown()).toHaveLength(1);
    expect(shown()[0].props.title).toBe('No items to invoice');
    expect(shown()[0].props.confirmText).toBe('Select GRN');
    expect(showAlert).not.toHaveBeenCalled();
  });
});

describe('the dialogs hand over only after the first has closed (iOS)', () => {
  const press = async (label: string) => {
    const node = tree.root.find((candidate) => candidate.props.accessibilityLabel === label && typeof candidate.props.onPress === 'function');
    await act(async () => { node.props.onPress(); });
  };
  /** What the picker does when a row is tapped: select, then close. */
  const pick = async (grn = OTHER) => {
    await act(async () => { picker().props.onSelect(grn); picker().props.onClose(); });
  };

  it('shows "Change the GRN?" only after the picker has finished closing', async () => {
    open('edit');
    await render('edit');
    await press('Search GRNs');
    expect(picker().props.isVisible).toBe(true);

    await pick();

    expect(picker().props.isVisible).toBe(false);
    // The sheet is hidden but still closing: a question opened now would be dropped by iOS.
    expect(shown()).toHaveLength(0);
    await act(async () => { picker().props.onDismissed(); });
    expect(shown()).toHaveLength(1);
    expect(shown()[0].props.title).toBe('Change the GRN?');
  });

  it('opens the picker from "Select GRN" only after that dialog has finished closing', async () => {
    await render('create');
    await pressNext();
    expect(shown()[0].props.title).toBe('No items to invoice');

    await act(async () => { shown()[0].props.onConfirm(); });

    expect(shown()).toHaveLength(0);
    expect(picker().props.isVisible).toBe(false);
    await act(async () => { tree.root.findAllByType(as('ConfirmDialog')).forEach((dialog) => dialog.props.onDismissed?.()); });
    expect(picker().props.isVisible).toBe(true);
  });

  describe('on Android, where no dismissal event comes', () => {
    const original = Platform.OS;
    beforeEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' }));
    afterEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original }));

    it('asks "Change the GRN?" as soon as the picker is hidden', async () => {
      open('edit');
      await render('edit');
      await press('Search GRNs');

      await pick();

      expect(shown()).toHaveLength(1);
      expect(shown()[0].props.title).toBe('Change the GRN?');
    });

    it('opens the picker as soon as "Select GRN" is answered', async () => {
      await render('create');
      await pressNext();

      await act(async () => { shown()[0].props.onConfirm(); });

      expect(picker().props.isVisible).toBe(true);
    });
  });
});

describe('choosing the GRN that is chosen already (R2-07)', () => {
  it('does nothing in a new invoice: no question, no load, the typed rates stay', async () => {
    open('create');
    await render('create');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'temp_0', values: { charge: 9 } })); });
    const lines = state().items;
    const typed = state().editedItems;

    await act(async () => { picker().props.onSelect(invoiceableGrn({ id: IDS.grn, gr_no: 'A0010' })); });

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    expect(state().items).toBe(lines);
    expect(state().editedItems).toBe(typed);
  });
});

describe('a confirmed GRN change in an edit clears the discount and its reason (owner decision R2-06)', () => {
  it('says so in the question, and clears them when Change GRN is answered', async () => {
    open('edit', { discount: 500, discount_reason: 'Damaged bags' });
    await render('edit');
    expect(state().header).toMatchObject({ discount: 500, discount_reason: 'Damaged bags' });
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn, charge: 9 }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );

    await act(async () => { picker().props.onSelect(OTHER); });

    expect(shown()[0].props.message).toContain('The discount and its reason will be cleared.');
    await act(async () => { await shown()[0].props.onConfirm(); });

    expect(state().header).toMatchObject({ gr_id: IDS.otherGrn, discount: 0 });
    expect(state().header.discount_reason ?? '').toBe('');
  });

  it('keeps the discount and its reason on Cancel and when the load fails', async () => {
    open('edit', { discount: 500, discount_reason: 'Damaged bags' });
    await render('edit');
    await act(async () => { picker().props.onSelect(OTHER); });
    await act(async () => { shown()[0].props.onCancel(); });
    expect(state().header).toMatchObject({ discount: 500, discount_reason: 'Damaged bags' });

    jest.mocked(loadInvoiceFormData).mockResolvedValue({ success: false, message: 'Server said no' } as never);
    await act(async () => { picker().props.onSelect(OTHER); });
    await act(async () => { await shown()[0].props.onConfirm(); });
    expect(state().header).toMatchObject({ gr_no: 'A0010', discount: 500, discount_reason: 'Damaged bags' });
  });
});

describe('going back to the invoice\'s saved GRN after a change (R2-08)', () => {
  const change = async () => {
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn, charge: 9 }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );
    await act(async () => { picker().props.onSelect(OTHER); });
    await act(async () => { await shown()[0].props.onConfirm(); });
    expect(state().header.gr_id).toBe(IDS.otherGrn);
  };

  it('still offers the saved GRN in the picker once the invoice moved to another', async () => {
    open('edit', { discount: 500, discount_reason: 'Damaged bags' });
    await render('edit');
    await change();

    expect(picker().props.pinnedGrn).toEqual({ id: IDS.grn, gr_no: 'A0010', customer_name: 'Example Traders' });
    expect(picker().props.currentValue).toEqual({ id: IDS.otherGrn });
  });

  it('puts back the saved lines, discount and reason when it is chosen, without loading anything', async () => {
    open('edit', { discount: 500, discount_reason: 'Damaged bags' });
    await render('edit');
    const savedLines = state().items;
    await change();
    jest.mocked(loadInvoiceFormData).mockClear();

    await act(async () => { picker().props.onSelect({ id: IDS.grn, gr_no: 'A0010', customer_name: 'Example Traders' }); });

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    expect(state().header).toMatchObject({ gr_id: IDS.grn, gr_no: 'A0010', discount: 500, discount_reason: 'Damaged bags' });
    expect(state().items.map((line) => line.temp_id)).toEqual(savedLines.map((line) => line.temp_id));
    expect(screenText()).not.toContain('GRN changed.');
  });

  it('asks first when rates were typed on the other GRN\'s lines, and Cancel keeps them', async () => {
    open('edit');
    await render('edit');
    await change();
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: state().items[0].temp_id, values: { charge: 3 } })); });

    await act(async () => { picker().props.onSelect({ id: IDS.grn, gr_no: 'A0010', customer_name: 'Example Traders' }); });

    expect(shown()[0].props.title).toBe('Go back to the saved GRN?');
    await act(async () => { shown()[0].props.onCancel(); });
    expect(state().header.gr_id).toBe(IDS.otherGrn);

    await act(async () => { picker().props.onSelect({ id: IDS.grn, gr_no: 'A0010', customer_name: 'Example Traders' }); });
    await act(async () => { await shown()[0].props.onConfirm(); });
    expect(state().header.gr_id).toBe(IDS.grn);
  });
});

describe('the number could not be got (R3b-10)', () => {
  it('shows Try again next to the number field when the request failed, and asks again from it', async () => {
    jest.mocked(getNextInvoiceNumber).mockRejectedValueOnce(new Error('offline'));
    await render('create');
    const retry = () => tree.root.findAll((node) => node.props.testID === 'invoice-number-retry' && typeof node.props.onPress === 'function');
    expect(retry()).toHaveLength(1);
    expect(words()).toContain('Try again');
    expect(state().numberStatus).toBe('failed');

    jest.mocked(getNextInvoiceNumber).mockResolvedValue({ success: true, data: { next_invoice_number: 77, financial_year: '2026-27' } } as never);
    await act(async () => { retry()[0].props.onPress(); });

    expect(state().header.inv_no).toBe(77);
    expect(retry()).toHaveLength(0);
  });

  it('shows no Try again while the number loads, nor when the number is there', async () => {
    await render('create');
    expect(tree.root.findAll((node) => node.props.testID === 'invoice-number-retry')).toHaveLength(0);
  });
});
