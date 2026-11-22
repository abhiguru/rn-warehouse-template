/**
 * New invoice, review step: a line with a charge of 0 needs a reason from
 * staff before the invoice is saved; administrators and supervisors may leave
 * it empty (owner decision 3 of 2026-10-11).
 */
import React from 'react';
import { render, screen, userEvent, within } from '@testing-library/react-native';
import InvoiceFormStep3 from '../../../app/invoice-form/step3';

let mockRole = 'staff';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } } }),
}));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));

const mockSubmitForm = jest.fn();
const mockUpdateHeaderField = jest.fn();
const line = (id: string, charge: number) => ({
  temp_id: id, disp_trl_id: id, item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1', qty: 100, grn_original_qty: 100,
  charge, labour_rate: 2, tax: 5, duration: 1, amount: charge * 100, labour_amount: 200, tax_amount: 10, item_total: charge * 100 + 210,
});
let mockItems = [line('free', 0), line('paid', 5)];
let mockReason: Record<string, unknown> = {};
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: {
      inv_date: '2026-10-09', inv_fin_year: '2026-27', inv_no: 12, customer_id: 'c1', customer_name: 'Example Traders',
      gr_id: 'g1', gr_no: 'A0010', one_time_charge: false, discount: 0, labour: 400, tax_amount: 45, total: 945,
      ...mockReason,
    },
    items: mockItems,
    isSaving: false,
    updateDiscountAmount: jest.fn(),
    updateHeaderField: mockUpdateHeaderField,
    navigateToStep: jest.fn(),
    submitForm: mockSubmitForm,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
// Stand-ins. An open dialog is an alert: its title, its message one line per Text (so the line breaks can be checked
// exactly), and its confirm button, which calls the real onConfirm. The summary says whether a zero-charge reason is
// required and draws a button that writes one through the page's real onZeroChargeReasonChange.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message?: string; confirmText?: string; onConfirm: () => unknown }) => {
    const { Pressable, Text, View } = require('react-native');
    return props.visible ? (
      <View accessible accessibilityRole="alert">
        <Text>{props.title}</Text>
        {(props.message ?? '').split('\n').map((messageLine, index) => (
          <Text key={index}>{messageLine}</Text>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel={props.confirmText} onPress={props.onConfirm}>
          <Text>{props.confirmText}</Text>
        </Pressable>
      </View>
    ) : null;
  },
}));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({
  InvoiceCalculationSummary: (props: { zeroChargeReasonRequired: boolean; onZeroChargeReasonChange?: (reason: string) => void }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Text>{`Zero-charge reason required: ${String(props.zeroChargeReasonRequired)}`}</Text>
        {typeof props.onZeroChargeReasonChange === 'function' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Write the zero-charge reason" onPress={() => props.onZeroChargeReasonChange?.('Sample lot')}>
            <Text>Write the zero-charge reason</Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
}));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const user = () => userEvent.setup({ delay: 0 });
const open = async () => { await render(<InvoiceFormStep3 />); };
const shown = () => screen.queryAllByRole('alert');
/** The open dialog's title, its message lines joined by line breaks, and its confirm button's name. */
const dialog = () => {
  const own = within(shown()[0]).queryAllByText(/^/).map((node) => [node.props.children].flat().join(''));
  return { title: own[0], message: own.slice(1, -1).join('\n'), confirmText: own[own.length - 1] };
};
const reasonRequired = (value: boolean) => expect(screen.getByText(`Zero-charge reason required: ${value}`)).toBeOnTheScreen();
// The page's own Save is the first button of that name (a dialog's confirm of the same name is drawn after it).
const pressSave = async () => { await user().press(screen.getAllByRole('button', { name: 'Create invoice' })[0]); };
const pressConfirm = async () => { await user().press(within(shown()[0]).getByRole('button')); };

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'staff';
  mockItems = [line('free', 0), line('paid', 5)];
  mockReason = {};
  mockSubmitForm.mockResolvedValue({ success: false });
});

describe('staff saving a new invoice with a zero-charge line', () => {
  it('are stopped without a reason, and told what to enter', async () => {
    await open();
    reasonRequired(true);

    await pressSave();

    expect(shown()).toHaveLength(1);
    expect(dialog().title).toBe('Enter a reason for the zero charge');
    expect(dialog().message).toBe('An item has a charge of 0. Enter the reason before submitting the invoice.');
    // The dialog only informs: closing it does not save.
    expect(dialog().confirmText).toBe('Close');
    await pressConfirm();
    expect(mockSubmitForm).not.toHaveBeenCalled();
  });

  it('are stopped when the reason is only spaces', async () => {
    mockReason = { zero_charge_reason: '   ' };
    await open();

    await pressSave();

    expect(dialog().title).toBe('Enter a reason for the zero charge');
    expect(mockSubmitForm).not.toHaveBeenCalled();
  });

  it('go on to the save question once a reason is written', async () => {
    mockReason = { zero_charge_reason: 'Sample lot' };
    await open();
    reasonRequired(false);

    await pressSave();

    expect(shown()).toHaveLength(1);
    expect(dialog().confirmText).toBe('Create invoice');
    await pressConfirm();
    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
  });

  it('write the reason into the form through the summary field', async () => {
    await open();

    await user().press(screen.getByRole('button', { name: 'Write the zero-charge reason' }));

    expect(mockUpdateHeaderField).toHaveBeenCalledWith('zero_charge_reason', 'Sample lot');
  });

  it('are asked for the discount reason first when both are missing', async () => {
    mockReason = { discount: 50 };
    await open();

    await pressSave();

    expect(dialog().title).toBe('Enter a discount reason');
    expect(mockSubmitForm).not.toHaveBeenCalled();
  });
});

describe.each(['admin', 'supervisor'])('%s saving a new invoice with a zero-charge line', (role) => {
  it('may leave the reason empty', async () => {
    mockRole = role;
    await open();
    reasonRequired(false);
    // The field is still offered.
    expect(screen.getByRole('button', { name: 'Write the zero-charge reason' })).toBeOnTheScreen();

    await pressSave();

    expect(shown()).toHaveLength(1);
    expect(dialog().confirmText).toBe('Create invoice');
    await pressConfirm();
    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
  });
});

// Every role is told before saving that something on the invoice is free. An
// item without a price in the price list arrives with a charge of 0 as well,
// and administrators and supervisors, who need no reason, would otherwise save
// it without a word about it.
describe.each(['staff', 'admin', 'supervisor'])('the question before a new invoice is saved, for %s', (role) => {
  const confirm = async () => {
    mockRole = role;
    mockReason = { zero_charge_reason: role === 'staff' ? 'Sample lot' : '' };
    await open();
    await pressSave();
    expect(shown()).toHaveLength(1);
    expect(dialog().confirmText).toBe('Create invoice');
    return { message: dialog().message };
  };

  it('says that 1 item has a charge of 0, after the customer and the total', async () => {
    const { message } = await confirm();

    expect(message).toBe(
      'Example Traders\nTotal ₹945.00\nIf the server works out a different total, nothing is saved and the new total is shown.\n\n1 item has a charge of 0.'
    );
  });

  it('counts the lines: "3 items have a charge of 0."', async () => {
    mockItems = [line('a', 0), line('b', 0), line('c', 5), line('d', 0)];
    const { message } = await confirm();

    expect(message.split('\n').at(-1)).toBe('3 items have a charge of 0.');
  });

  it('says nothing of it when every line has a charge', async () => {
    mockItems = [line('a', 4), line('b', 5)];
    const { message } = await confirm();

    expect(message).toBe('Example Traders\nTotal ₹945.00\nIf the server works out a different total, nothing is saved and the new total is shown.');
  });

  it('still offers the reason field, required for staff only', async () => {
    await confirm();

    expect(screen.getByRole('button', { name: 'Write the zero-charge reason' })).toBeOnTheScreen();
  });
});

describe('an invoice without a zero-charge line', () => {
  it('asks staff for no reason', async () => {
    mockItems = [line('a', 4), line('b', 5)];
    await open();
    reasonRequired(false);

    await pressSave();

    expect(dialog().confirmText).toBe('Create invoice');
  });
});
