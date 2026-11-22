/**
 * Invoice edit, review step: the reason for a zero charge (owner decision 3 of
 * 2026-10-11). Staff need one whenever a line has a charge of 0. The stored
 * reason is sent back with every update until the person changes it: the
 * server asks staff for it each time, and reads an empty one from an
 * administrator or supervisor as "remove the reason".
 */
import React from 'react';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { makeInvoiceStore, openForEdit, invoiceLine, IDS } from '@/tests/helpers/invoiceFixtures';
import { updateEditedItem } from '@/store/slices/invoiceFormSlice';
import { t } from '@/i18n';
import type { InvoiceItemData } from '@/types/invoice.types';
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import InvoiceEditStep2 from '../../../app/invoice-edit/[id]/step2';
import InvoiceEditStep3 from '../../../app/invoice-edit/[id]/step3';

let mockRole = 'staff';
const mockStore = makeInvoiceStore({ role: 'staff' });
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismiss: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: 'KeyboardAwareScrollView',
  // The items step's table is a keyboard-aware FlashList.
  listenToKeyboardEvents: () => (component: unknown) => component,
}));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
// Stand-ins that draw what the test looks at and call the step's real props. An open dialog is an alert: its title, its
// message one line per Text (so the line breaks can be checked exactly) and its buttons.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message?: string; confirmText?: string; cancelText?: string; onConfirm: () => unknown; onCancel?: () => void }) => {
    const { Pressable, Text, View } = require('react-native');
    return props.visible ? (
      <View accessible accessibilityRole="alert">
        <Text testID="dialog-title">{props.title}</Text>
        {(props.message ?? '').split('\n').map((messageLine, index) => (
          <Text key={index} testID="dialog-message-line">{messageLine}</Text>
        ))}
        {props.onCancel ? (
          <Pressable accessibilityRole="button" accessibilityLabel={props.cancelText ?? 'Cancel'} onPress={props.onCancel}>
            <Text>{props.cancelText ?? 'Cancel'}</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={props.confirmText ?? 'Confirm'} onPress={props.onConfirm}>
          <Text>{props.confirmText ?? 'Confirm'}</Text>
        </Pressable>
      </View>
    ) : null;
  },
}));
// The summary says whether a reason is required, the charge of each line it was given, and draws buttons that write a
// reason (or erase it) through the step's real onZeroChargeReasonChange.
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({
  InvoiceCalculationSummary: (props: { zeroChargeReasonRequired: boolean; items: { charge: number }[]; onZeroChargeReasonChange: (reason: string) => void }) => {
    const { Pressable, Text, View } = require('react-native');
    const button = (name: string, reason: string) => (
      <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => props.onZeroChargeReasonChange(reason)}>
        <Text>{name}</Text>
      </Pressable>
    );
    return (
      <View>
        <Text>{`Zero-charge reason required: ${String(props.zeroChargeReasonRequired)}`}</Text>
        <Text>{`Summary charges: ${props.items.map((item) => item.charge).join(', ')}`}</Text>
        {button('Write the reason: Agreed with the owner', 'Agreed with the owner')}
        {button('Write the reason: Sample lot', 'Sample lot')}
        {button('Erase the reason', '')}
      </View>
    );
  },
}));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
// The real service, so that the request the server would get can be read.
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

const FREE = 'aaaaaaaa-2222-4333-8444-555555555555';
const PAID = 'bbbbbbbb-2222-4333-8444-555555555555';
const line = (dispatchLine: string, charge: number): InvoiceItemData =>
  invoiceLine({ temp_id: `edit_${dispatchLine}_0`, disp_trl_id: dispatchLine, charge }, dispatchLine === FREE ? 0 : 1);

/** An invoice saved with one free and one paid line. */
function loadInvoice(storedReason: string | undefined) {
  openForEdit(mockStore, [line(FREE, 0), line(PAID, 5)], {
    zero_charge_reason: storedReason,
    labour: 400,
    tax_amount: 45,
    total: 945,
  });
}

let rpc: jest.Mock;
const user = () => userEvent.setup({ delay: 0 });
async function open() {
  await render(<InvoiceEditStep3 />);
}
const reasonRequired = (value: boolean) => expect(screen.getByText(`Zero-charge reason required: ${value}`)).toBeOnTheScreen();
const writeReason = async (name: string) => { await user().press(screen.getByRole('button', { name })); };
const shown = () => screen.queryAllByRole('alert');
/** The open dialog: its title, its message line by line, and its buttons. */
const dialog = () => {
  const own = within(shown()[0]);
  return {
    own,
    title: own.getByTestId('dialog-title').props.children as string,
    lines: own.getAllByTestId('dialog-message-line').map((node) => node.props.children as string),
  };
};
const pressUpdate = async () => {
  await user().press(screen.getAllByLabelText(t('invoice.review.saveInvoice'))[0]);
};
/** Press Update and answer its question with "Save invoice"; the header that went to the server. */
const update = async () => {
  await pressUpdate();
  expect(dialog().title).toBe(t('invoice.review.updateTitle', { number: '42' }));
  await user().press(dialog().own.getByRole('button', { name: 'Save invoice' }));
  await waitFor(() => expect(rpc.mock.calls.some(([name]) => name === 'update_invoice')).toBe(true));
  return rpc.mock.calls.find(([name]) => name === 'update_invoice')![1].p_invoice_data;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'staff';
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  rpc = jest.fn(async (name: string) =>
    name === 'update_invoice'
      ? { data: { success: true, invoice_id: 'inv-42', invoice_number: 42 }, error: null }
      : { data: { success: true, invoice: { id: 'inv-42', total: 945 }, items: [] }, error: null });
  (getAuthenticatedClient as jest.Mock).mockResolvedValue({ rpc });
});
afterEach(() => jest.restoreAllMocks());

describe('staff updating an invoice that has a zero-charge line', () => {
  it('send the stored reason again when nothing about the free lines changed', async () => {
    loadInvoice('Sample lot');
    await open();
    reasonRequired(false);

    const sent = await update();

    expect(sent.zero_charge_reason).toBe('Sample lot');
  });

  it('are stopped when the invoice was stored without a reason', async () => {
    loadInvoice(undefined);
    await open();
    reasonRequired(true);

    await pressUpdate();

    expect(shown()).toHaveLength(1);
    expect(dialog().title).toBe('Enter a reason for the zero charge');
    expect(dialog().lines).toEqual(['An item has a charge of 0. Enter the reason before updating the invoice.']);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('send the stored reason again when another line became free, and can replace it', async () => {
    loadInvoice('Sample lot');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: `edit_${PAID}_0`, values: { charge: 0 } })); });
    await open();
    reasonRequired(false);
    expect(mockStore.getState().invoiceForm.header.zero_charge_reason).toBe('Sample lot');

    await writeReason('Write the reason: Agreed with the owner');
    const sent = await update();

    expect(sent.zero_charge_reason).toBe('Agreed with the owner');
  });

  it('are stopped after erasing the stored reason', async () => {
    loadInvoice('Sample lot');
    await open();
    await writeReason('Erase the reason');

    await pressUpdate();

    expect(dialog().title).toBe('Enter a reason for the zero charge');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('need no reason once every line has a charge, and none is sent', async () => {
    loadInvoice('Sample lot');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: `edit_${FREE}_0`, values: { charge: 3 } })); });
    await open();
    reasonRequired(false);

    const sent = await update();

    expect(sent).not.toHaveProperty('zero_charge_reason');
  });
});

describe.each(['admin', 'supervisor'])('%s updating an invoice that has a zero-charge line', (role) => {
  it('may leave the reason empty; null is sent', async () => {
    mockRole = role;
    loadInvoice(undefined);
    await open();
    reasonRequired(false);

    const sent = await update();

    expect(sent).toHaveProperty('zero_charge_reason', null);
  });

  it('send the stored reason back when they change nothing, so it is not removed by accident', async () => {
    mockRole = role;
    loadInvoice('Sample lot');
    await open();

    const sent = await update();

    expect(sent.zero_charge_reason).toBe('Sample lot');
  });

  it('remove the stored reason by erasing it', async () => {
    mockRole = role;
    loadInvoice('Sample lot');
    await open();
    await writeReason('Erase the reason');

    const sent = await update();

    expect(sent).toHaveProperty('zero_charge_reason', null);
  });

  it('may write one, and it is sent', async () => {
    mockRole = role;
    loadInvoice(undefined);
    await open();
    await writeReason('Write the reason: Sample lot');

    const sent = await update();

    expect(sent.zero_charge_reason).toBe('Sample lot');
  });
});

describe.each(['staff', 'admin', 'supervisor'])('the question before the update, for %s', (role) => {
  const question = async () => {
    await pressUpdate();
    expect(shown()).toHaveLength(1);
    expect(dialog().title).toBe('Save changes to invoice 42?');
    expect(dialog().own.getByRole('button', { name: 'Cancel' })).toBeOnTheScreen();
    expect(dialog().own.getByRole('button', { name: 'Save invoice' })).toBeOnTheScreen();
    return dialog().lines.join('\n');
  };

  it('says that 1 item has a charge of 0', async () => {
    mockRole = role;
    loadInvoice('Sample lot');
    await open();

    const message = await question();

    expect(message.split('\n').slice(-2)).toEqual(['', '1 item has a charge of 0.']);
    expect(message.startsWith('Example Traders\nTotal ')).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('counts the lines, and says nothing once every line has a charge', async () => {
    mockRole = role;
    loadInvoice('Sample lot');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: `edit_${PAID}_0`, values: { charge: 0 } })); });
    await open();
    expect((await question()).split('\n').at(-1)).toBe('2 items have a charge of 0.');
    await screen.unmount();

    await act(async () => {
      mockStore.dispatch(updateEditedItem({ temp_id: `edit_${PAID}_0`, values: { charge: 5 } }));
      mockStore.dispatch(updateEditedItem({ temp_id: `edit_${FREE}_0`, values: { charge: 3 } }));
    });
    await open();
    expect(await question()).not.toContain('charge of 0');
  });
});

// The items step before it: a group rate is one field. Changing the group tax
// used to give the average charge of the group (2.5) to both lines, so no line
// was free any more and the update went out without the reason.
describe('changing a group rate on the items step of such an invoice', () => {
  const groupField = (label: string) => screen.getByTestId(label);
  const lines = () => mockStore.getState().invoiceForm.items.map((item) => [item.charge, item.labour_rate, item.tax]);

  it('the group tax leaves the free line free, and the update carries the charges and the reason as stored', async () => {
    loadInvoice('Sample lot');
    await render(<InvoiceEditStep2 />);
    // A free and a paid line: the group's charge shows their average (owner, 2026-10-19), which is never written to the lines.
    expect(groupField('group|i1:::M1|charge')).toHaveDisplayValue('2.50');
    expect(groupField('group|i1:::M1|charge')).toHaveProp('placeholder', '2.50');

    await fireEvent.changeText(groupField('group|i1:::M1|tax'), '12');

    expect(lines()).toEqual([[0, 2, 12], [5, 2, 12]]);
    expect(groupField('group|i1:::M1|charge')).toHaveDisplayValue('2.50');
    expect(groupField('group|i1:::M1|charge')).toHaveProp('placeholder', '2.50');
    await screen.unmount();

    await open();
    const sent = await update();
    expect(sent.zero_charge_reason).toBe('Sample lot');
    const sentLines = rpc.mock.calls.find(([name]) => name === 'update_invoice')![1].p_invoice_items;
    expect(sentLines.map((sentLine: { charge: number; tax: number }) => [sentLine.charge, sentLine.tax])).toEqual([[0, 12], [5, 12]]);
  });

  it('a group charge makes every line of the group paid, and no reason is sent with the update', async () => {
    loadInvoice('Sample lot');
    await render(<InvoiceEditStep2 />);

    await fireEvent.changeText(groupField('group|i1:::M1|charge'), '4');

    expect(lines()).toEqual([[4, 2, 5], [4, 2, 5]]);
    await screen.unmount();

    // No line is free, so the summary shows no reason field (it shows it for a line with a charge of 0 only).
    await open();
    expect(screen.getByText('Summary charges: 4, 4')).toBeOnTheScreen();
    const sent = await update();
    expect('zero_charge_reason' in sent).toBe(false);
    // The text is still in the form, should a line be made free again before saving.
    expect(mockStore.getState().invoiceForm.header.zero_charge_reason).toBe('Sample lot');
  });
});
