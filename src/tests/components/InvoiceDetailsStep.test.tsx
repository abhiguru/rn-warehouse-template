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
import { Platform } from 'react-native';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { loadInvoiceFormData, getNextInvoiceNumber } from '@/features/invoice/services/invoiceFormService';
import { updateDiscount, updateEditedItem, updateHeader } from '@/store/slices/invoiceFormSlice';
import {
  fillNewInvoice,
  grnFormAnswer,
  IDS,
  invoiceLine,
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));

// Stand-ins for the three parts the step opens. Each draws what the test looks at and calls the step's real props.
// The date picker draws one button that confirms 6 October 2026.
jest.mock('react-native-paper-dates', () => ({
  DatePickerModal: (props: { onConfirm: (picked: { date: Date }) => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Choose 6 October 2026" onPress={() => props.onConfirm({ date: new Date(2026, 9, 6) })}>
        <Text>Choose 6 October 2026</Text>
      </Pressable>
    );
  },
}));
// The GRN picker says whether it is open, which GRN is current and which is pinned, and has a button for each way a
// GRN can be handed to the step: the other GRN, the invoice's own GRN again, its saved GRN, a row tap (select, then
// close), and the sheet finishing its closing (iOS).
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({
  GRNAutocomplete: (props: {
    isVisible: boolean;
    currentValue?: unknown;
    pinnedGrn?: unknown;
    onSelect: (grn: unknown) => void;
    onClose: () => void;
    onDismissed?: () => void;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    const { IDS: ids, invoiceableGrn } = require('@/tests/helpers/invoiceFixtures');
    const stable = (value: unknown) => JSON.stringify(value, value ? Object.keys(value as object).sort() : undefined);
    const button = (name: string, onPress: () => void) => (
      <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPress}>
        <Text>{name}</Text>
      </Pressable>
    );
    return (
      <View>
        {props.isVisible ? <Text>Picker is open</Text> : null}
        <View accessible accessibilityLabel={`Picker current: ${stable(props.currentValue)}`} />
        <View accessible accessibilityLabel={`Picker pinned: ${stable(props.pinnedGrn)}`} />
        {button('Pick the other GRN', () => props.onSelect(invoiceableGrn()))}
        {button('Pick the invoice GRN again', () => props.onSelect(invoiceableGrn({ id: ids.grn, gr_no: 'A0010' })))}
        {button('Pick the saved GRN', () => props.onSelect({ id: ids.grn, gr_no: 'A0010', customer_name: 'Example Traders' }))}
        {button('Tap the other GRN row', () => { props.onSelect(invoiceableGrn()); props.onClose(); })}
        {button('Picker finished closing', () => props.onDismissed?.())}
      </View>
    );
  },
}));
// An open dialog is an alert with its title, its message, and its buttons; every dialog, open or not, has a button that
// stands for the sheet finishing its closing (iOS).
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: {
    visible: boolean;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => unknown;
    onCancel?: () => void;
    onDismissed?: () => void;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        {props.visible ? (
          <View accessible accessibilityRole="alert">
            <Text>{props.title}</Text>
            <Text>{props.message}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={props.confirmText ?? 'Confirm'} onPress={props.onConfirm}>
              <Text>{props.confirmText ?? 'Confirm'}</Text>
            </Pressable>
            {props.onCancel ? (
              <Pressable accessibilityRole="button" accessibilityLabel={props.cancelText ?? 'Cancel'} onPress={props.onCancel}>
                <Text>{props.cancelText ?? 'Cancel'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Dialog finished closing" onPress={() => props.onDismissed?.()}>
          <Text>Dialog finished closing</Text>
        </Pressable>
      </View>
    );
  },
}));

const FIELD_KEYS = /\b(inv_no|inv_date|inv_fin_year|gr_id|gr_no|customer_id|customer_name|one_time_charge)\b/;
const stable = (value: object) => JSON.stringify(value, Object.keys(value).sort());

const user = () => userEvent.setup({ delay: 0 });
const open_ = async (mode: 'create' | 'edit') => { await render(mode === 'edit' ? <InvoiceEditStep1 /> : <InvoiceFormStep1 />); };
const numberField = () => screen.getByLabelText('Invoice number');
const button = (name: string) => screen.getByRole('button', { name });
const tap = async (name: string) => { await user().press(button(name)); };
const shown = () => screen.queryAllByRole('alert');
/** The open dialog's title and message, and the name of a button in it. */
const dialog = () => {
  const own = within(shown()[0]);
  return { title: own.getAllByText(/^/)[0], message: own.getAllByText(/^/)[1], own };
};
const pickerOpen = () => screen.queryByText('Picker is open', { includeHiddenElements: true });
const pressNext = async () => { await tap('Next'); };
// The words on the screen only. A check that a text is NOT there passes `hidden` to see mounted-but-hidden Texts too.
const words = (hidden = false) =>
  screen
    .queryAllByText(/^/, { includeHiddenElements: hidden })
    .map((node) => [node.props.children].flat(Infinity).filter((part) => typeof part === 'string').join(''))
    .join('\n');
const state = () => mockStore.getState().invoiceForm;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore = makeInvoiceStore();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(getNextInvoiceNumber).mockResolvedValue({ success: true, data: { next_invoice_number: 55, financial_year: '2026-27' } } as never);
});
afterEach(() => {
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
    await open_(mode);

    await pressNext();

    expect(words()).toContain("An invoice can't be dated in the future");
    expect(showAlert).toHaveBeenCalledWith('Check the invoice', expect.stringContaining("An invoice can't be dated in the future"));
    expect(router.navigate).not.toHaveBeenCalled();

    await tap('Choose 6 October 2026');

    expect(words(true)).not.toContain("An invoice can't be dated in the future");
    expect(state().header.inv_date).toBe('2026-10-06');
  });

  it('shows the number message when the field is left, and takes it away when the number is changed', async () => {
    open(mode);
    await open_(mode);
    // A number above the ceiling: pasted in a new invoice, typed over a saved number in an edit.
    if (mode === 'create') {
      await act(async () => { mockStore.dispatch(updateHeader({ inv_no: 100000000, inv_no_typed: true })); });
    } else {
      await fireEvent.changeText(numberField(), '100000000');
    }
    expect(words(true)).not.toContain('between 1 and 99999999');

    await fireEvent(numberField(), 'blur');

    expect(words()).toContain('Invoice number must be between 1 and 99999999');

    await fireEvent.changeText(numberField(), '55');

    expect(words(true)).not.toContain('between 1 and 99999999');
    expect(state().header.inv_no).toBe(55);
  });

  it('shows the message under the field and still goes on once it is corrected', async () => {
    open(mode, { inv_date: '2099-01-01' });
    await open_(mode);
    await pressNext();
    await tap('Choose 6 October 2026');
    jest.mocked(showAlert).mockClear();

    await pressNext();

    expect(showAlert).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(mode === 'edit' ? '/invoice-edit/inv-42/step2' : '/invoice-form/step2');
  });

  it('never shows a raw field key in the messages', async () => {
    open(mode, { inv_date: '2099-01-01', customer_id: 'not-a-uuid', customer_name: '', gr_no: '' });
    await open_(mode);

    await pressNext();

    const [title, message] = jest.mocked(showAlert).mock.calls[0];
    expect(`${title}\n${message}`).not.toMatch(FIELD_KEYS);
    expect(words(true)).not.toMatch(FIELD_KEYS);
    expect(String(message).split('\n').length).toBeGreaterThan(1);
  });
});

describe('the GRN number', () => {
  it.each(['create', 'edit'] as const)('wraps on more than one line when it is long, %s', async (mode) => {
    open(mode, { gr_no: 'A00100200300400500600700800900' });
    await open_(mode);

    const value = screen.getByTestId('invoice-grn-value');

    expect(value.props.numberOfLines).toBeUndefined();
    expect(value).toHaveTextContent(/A00100200300400500600700800900/);
  });
});

describe('choosing another GRN in an edit', () => {
  const choose = async () => { await tap('Pick the other GRN'); };

  it('asks first, and Cancel keeps the GRN, the lines and the rates as they were', async () => {
    open('edit');
    await open_('edit');
    const before = { header: state().header, items: state().items };

    await choose();

    expect(shown()).toHaveLength(1);
    expect(dialog().title).toHaveTextContent('Change the GRN?');
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    await user().press(dialog().own.getByRole('button', { name: 'Cancel' }));

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    expect(state().header).toBe(before.header);
    expect(state().items).toBe(before.items);
  });

  it('loads the new GRN\'s lines once the question is answered with Change GRN, and warns that the GRN changed', async () => {
    open('edit');
    await open_('edit');
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn, charge: 9 }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );
    await choose();

    await user().press(dialog().own.getByRole('button', { name: 'Change GRN' }));

    await waitFor(() => expect(state().header.gr_no).toBe('A0011'));
    expect(loadInvoiceFormData).toHaveBeenCalledWith(IDS.otherGrn, 'inv-42');
    expect(state().header).toMatchObject({ gr_id: IDS.otherGrn, gr_no: 'A0011', inv_no: 42 });
    expect(state().items.map((line) => line.charge)).toEqual([9]);
    expect(words()).toContain('GRN changed. The items now come from the new GRN.');
  });

  it('keeps the previous GRN and its lines when the new GRN cannot be loaded, and names both GRNs', async () => {
    open('edit');
    await open_('edit');
    jest.mocked(loadInvoiceFormData).mockResolvedValue({ success: false, message: 'Server said no' } as never);
    const before = { header: state().header, items: state().items };
    await choose();

    await user().press(dialog().own.getByRole('button', { name: 'Change GRN' }));

    await waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect(state().header).toBe(before.header);
    expect(state().items).toBe(before.items);
    expect(state().header.gr_no).toBe('A0010');
    const [title, message] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe("Couldn't load the GRN");
    expect(message).toContain('A0011');
    expect(message).toContain('A0010');
    expect(words(true)).not.toContain('GRN changed.');
  });

  it('does nothing when the invoice\'s own GRN is chosen again', async () => {
    open('edit');
    await open_('edit');

    await tap('Pick the invoice GRN again');

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
  });

  it('gives the picker the invoice\'s own GRN to list, and the form\'s GRN as the current one', async () => {
    open('edit');
    await open_('edit');

    expect(screen.getByLabelText(`Picker current: ${stable({ id: IDS.grn })}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Picker pinned: ${stable({ id: IDS.grn, gr_no: 'A0010', customer_name: 'Example Traders' })}`)).toBeOnTheScreen();
  });
});

describe('choosing another GRN in a new invoice', () => {
  const choose = async () => { await tap('Pick the other GRN'); };

  it('loads it at once when nothing was typed on the lines', async () => {
    open('create');
    await open_('create');
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );

    await choose();

    await waitFor(() => expect(state().header.gr_no).toBe('A0011'));
    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).toHaveBeenCalledWith(IDS.otherGrn, undefined);
  });

  it('asks first when rates were typed on the lines, and Cancel keeps them', async () => {
    open('create');
    await open_('create');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'temp_0', values: { charge: 9 } })); });
    const lines = state().items;
    const typed = state().editedItems;
    expect(Object.keys(typed)).toHaveLength(1);

    await choose();
    expect(shown()).toHaveLength(1);
    await user().press(dialog().own.getByRole('button', { name: 'Cancel' }));

    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    expect(state().items).toBe(lines);
    expect(state().editedItems).toBe(typed);
  });

  it('resets the discount and both reasons with the lines when the change is confirmed, and keeps all of it when cancelled', async () => {
    open('create');
    await open_('create');
    await act(async () => {
      mockStore.dispatch(updateDiscount(499.86));
      mockStore.dispatch(updateHeader({ discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' }));
    });
    expect(state().header).toMatchObject({ discount: 499.86, discount_reason: 'Damaged bags' });

    // Cancel: everything is kept.
    await tap('Pick the other GRN');
    expect(shown()).toHaveLength(1);
    await user().press(dialog().own.getByRole('button', { name: 'Cancel' }));
    expect(state().header).toMatchObject({ gr_no: 'A0010', discount: 499.86, discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' });

    // Confirm: the new GRN's invoice starts clean.
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );
    await tap('Pick the other GRN');
    await user().press(dialog().own.getByRole('button', { name: 'Change GRN' }));

    await waitFor(() => expect(state().header.gr_no).toBe('A0011'));
    expect(state().header.discount).toBe(0);
    expect(state().header.discount_reason ?? '').toBe('');
    expect(state().header.zero_charge_reason ?? '').toBe('');
    expect(state().header.total).toBe(state().items.reduce((sum, line) => sum + line.item_total, 0));
  });

  it('keeps the discount and reasons when the load fails', async () => {
    open('create');
    await open_('create');
    await act(async () => {
      mockStore.dispatch(updateDiscount(10));
      mockStore.dispatch(updateHeader({ discount_reason: 'Damaged bags' }));
      mockStore.dispatch(updateHeader({ zero_charge_reason: 'Sample lot' }));
    });
    jest.mocked(loadInvoiceFormData).mockResolvedValue({ success: false, message: 'Server said no' } as never);

    await tap('Pick the other GRN');
    await user().press(dialog().own.getByRole('button', { name: 'Change GRN' }));

    await waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect(state().header).toMatchObject({ gr_no: 'A0010', discount: 10, discount_reason: 'Damaged bags', zero_charge_reason: 'Sample lot' });
  });

  it('keeps the previous GRN when the load fails, and names both', async () => {
    open('create');
    await open_('create');
    jest.mocked(loadInvoiceFormData).mockResolvedValue({ success: false, message: 'Server said no' } as never);

    await choose();

    await waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect(state().header.gr_no).toBe('A0010');
    expect(state().items).toHaveLength(1);
    expect(jest.mocked(showAlert).mock.calls[0][1]).toEqual(expect.stringContaining('A0011'));
    expect(jest.mocked(showAlert).mock.calls[0][1]).toEqual(expect.stringContaining('A0010'));
  });
});

describe('a new invoice with no GRN yet', () => {
  it('offers to select a GRN when Next is pressed, instead of a field message', async () => {
    await open_('create');

    await pressNext();

    expect(shown()).toHaveLength(1);
    expect(dialog().title).toHaveTextContent('No items to invoice');
    expect(dialog().own.getByRole('button', { name: 'Select GRN' })).toBeOnTheScreen();
    expect(showAlert).not.toHaveBeenCalled();
  });
});

describe('the dialogs hand over only after the first has closed (iOS)', () => {
  /** What the picker does when a row is tapped: select, then close. */
  const pick = async () => { await tap('Tap the other GRN row'); };
  // The sheet finishing its closing: every ConfirmDialog says so (a closed one has nothing to hand over).
  const dialogsFinishClosing = async () => {
    for (const finished of screen.getAllByRole('button', { name: 'Dialog finished closing' })) await user().press(finished);
  };

  it('shows "Change the GRN?" only after the picker has finished closing', async () => {
    open('edit');
    await open_('edit');
    await tap('Search GRNs');
    expect(screen.getByText('Picker is open')).toBeOnTheScreen();

    await pick();

    expect(pickerOpen()).not.toBeOnTheScreen();
    // The sheet is hidden but still closing: a question opened now would be dropped by iOS.
    expect(shown()).toHaveLength(0);
    await tap('Picker finished closing');
    expect(shown()).toHaveLength(1);
    expect(dialog().title).toHaveTextContent('Change the GRN?');
  });

  it('opens the picker from "Select GRN" only after that dialog has finished closing', async () => {
    await open_('create');
    await pressNext();
    expect(dialog().title).toHaveTextContent('No items to invoice');

    await user().press(dialog().own.getByRole('button', { name: 'Select GRN' }));

    expect(shown()).toHaveLength(0);
    expect(pickerOpen()).not.toBeOnTheScreen();
    await dialogsFinishClosing();
    expect(screen.getByText('Picker is open')).toBeOnTheScreen();
  });

  describe('on Android, where no dismissal event comes', () => {
    const original = Platform.OS;
    beforeEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' }));
    afterEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original }));

    it('asks "Change the GRN?" as soon as the picker is hidden', async () => {
      open('edit');
      await open_('edit');
      await tap('Search GRNs');

      await pick();

      expect(shown()).toHaveLength(1);
      expect(dialog().title).toHaveTextContent('Change the GRN?');
    });

    it('opens the picker as soon as "Select GRN" is answered', async () => {
      await open_('create');
      await pressNext();

      await user().press(dialog().own.getByRole('button', { name: 'Select GRN' }));

      expect(screen.getByText('Picker is open')).toBeOnTheScreen();
    });
  });
});

describe('choosing the GRN that is chosen already (R2-07)', () => {
  it('does nothing in a new invoice: no question, no load, the typed rates stay', async () => {
    open('create');
    await open_('create');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: 'temp_0', values: { charge: 9 } })); });
    const lines = state().items;
    const typed = state().editedItems;

    await tap('Pick the invoice GRN again');

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    expect(state().items).toBe(lines);
    expect(state().editedItems).toBe(typed);
  });
});

describe('a confirmed GRN change in an edit clears the discount and its reason (owner decision R2-06)', () => {
  it('says so in the question, and clears them when Change GRN is answered', async () => {
    open('edit', { discount: 500, discount_reason: 'Damaged bags' });
    await open_('edit');
    expect(state().header).toMatchObject({ discount: 500, discount_reason: 'Damaged bags' });
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn, charge: 9 }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );

    await tap('Pick the other GRN');

    expect(dialog().message).toHaveTextContent(/The discount and its reason will be cleared\./);
    await user().press(dialog().own.getByRole('button', { name: 'Change GRN' }));

    await waitFor(() => expect(state().header.gr_id).toBe(IDS.otherGrn));
    expect(state().header).toMatchObject({ gr_id: IDS.otherGrn, discount: 0 });
    expect(state().header.discount_reason ?? '').toBe('');
  });

  it('keeps the discount and its reason on Cancel and when the load fails', async () => {
    open('edit', { discount: 500, discount_reason: 'Damaged bags' });
    await open_('edit');
    await tap('Pick the other GRN');
    await user().press(dialog().own.getByRole('button', { name: 'Cancel' }));
    expect(state().header).toMatchObject({ discount: 500, discount_reason: 'Damaged bags' });

    jest.mocked(loadInvoiceFormData).mockResolvedValue({ success: false, message: 'Server said no' } as never);
    await tap('Pick the other GRN');
    await user().press(dialog().own.getByRole('button', { name: 'Change GRN' }));
    await waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect(state().header).toMatchObject({ gr_no: 'A0010', discount: 500, discount_reason: 'Damaged bags' });
  });
});

describe('going back to the invoice\'s saved GRN after a change (R2-08)', () => {
  const change = async () => {
    jest.mocked(loadInvoiceFormData).mockResolvedValue(
      grnFormAnswer([invoiceLine({ grn_id: IDS.otherGrn, charge: 9 }, 4)], { gr_id: IDS.otherGrn, gr_no: 'A0011' }) as never
    );
    await tap('Pick the other GRN');
    await user().press(dialog().own.getByRole('button', { name: 'Change GRN' }));
    await waitFor(() => expect(state().header.gr_id).toBe(IDS.otherGrn));
  };

  it('still offers the saved GRN in the picker once the invoice moved to another', async () => {
    open('edit', { discount: 500, discount_reason: 'Damaged bags' });
    await open_('edit');
    await change();

    expect(screen.getByLabelText(`Picker pinned: ${stable({ id: IDS.grn, gr_no: 'A0010', customer_name: 'Example Traders' })}`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Picker current: ${stable({ id: IDS.otherGrn })}`)).toBeOnTheScreen();
  });

  it('puts back the saved lines, discount and reason when it is chosen, without loading anything', async () => {
    open('edit', { discount: 500, discount_reason: 'Damaged bags' });
    await open_('edit');
    const savedLines = state().items;
    await change();
    jest.mocked(loadInvoiceFormData).mockClear();

    await tap('Pick the saved GRN');

    expect(shown()).toHaveLength(0);
    expect(loadInvoiceFormData).not.toHaveBeenCalled();
    expect(state().header).toMatchObject({ gr_id: IDS.grn, gr_no: 'A0010', discount: 500, discount_reason: 'Damaged bags' });
    expect(state().items.map((line) => line.temp_id)).toEqual(savedLines.map((line) => line.temp_id));
    expect(words(true)).not.toContain('GRN changed.');
  });

  it('asks first when rates were typed on the other GRN\'s lines, and Cancel keeps them', async () => {
    open('edit');
    await open_('edit');
    await change();
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: state().items[0].temp_id, values: { charge: 3 } })); });

    await tap('Pick the saved GRN');

    expect(dialog().title).toHaveTextContent('Go back to the saved GRN?');
    await user().press(dialog().own.getByRole('button', { name: 'Cancel' }));
    expect(state().header.gr_id).toBe(IDS.otherGrn);

    await tap('Pick the saved GRN');
    await user().press(dialog().own.getByRole('button', { name: /^(?!Cancel$).+/ }));
    await waitFor(() => expect(state().header.gr_id).toBe(IDS.grn));
  });
});

describe('the number could not be got (R3b-10)', () => {
  it('shows Try again next to the number field when the request failed, and asks again from it', async () => {
    jest.mocked(getNextInvoiceNumber).mockRejectedValueOnce(new Error('offline'));
    await open_('create');
    const retry = (hidden = false) => screen.queryAllByTestId('invoice-number-retry', { includeHiddenElements: hidden });
    expect(retry()).toHaveLength(1);
    expect(words()).toContain('Try again');
    expect(state().numberStatus).toBe('failed');

    jest.mocked(getNextInvoiceNumber).mockResolvedValue({ success: true, data: { next_invoice_number: 77, financial_year: '2026-27' } } as never);
    await user().press(retry()[0]);

    await waitFor(() => expect(state().header.inv_no).toBe(77));
    expect(retry(true)).toHaveLength(0);
  });

  it('shows no Try again while the number loads, nor when the number is there', async () => {
    await open_('create');
    expect(screen.queryAllByTestId('invoice-number-retry', { includeHiddenElements: true })).toHaveLength(0);
  });
});
