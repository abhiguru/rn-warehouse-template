/**
 * Invoice edit, review step: the reason for a zero charge (owner decision 3 of
 * 2026-10-11). Staff need one whenever a line has a charge of 0. The stored
 * reason is sent back with every update until the person changes it: the
 * server asks staff for it each time, and reads an empty one from an
 * administrator or supervisor as "remove the reason".
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: 'InvoiceCalculationSummary' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: 'InvoiceSuccessDialog' }));
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
async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceEditStep3 />); });
  return tree;
}
const summary = (tree: ReactTestRenderer) => tree.root.findByType('InvoiceCalculationSummary' as unknown as React.ElementType);
// The dialogs that are open (the stand-in keeps the props of ConfirmDialog).
const shown = (tree: ReactTestRenderer) =>
  tree.root.findAllByType('ConfirmDialog' as unknown as React.ElementType).filter((dialog) => dialog.props.visible);
const pressUpdate = async (tree: ReactTestRenderer) => {
  const button = tree.root.find(
    (node) => node.props.accessibilityLabel === t('invoice.review.updateInvoice') && typeof node.props.onPress === 'function'
  );
  await act(async () => { await button.props.onPress(); });
};
/** Press Update and answer its question with "Update invoice"; the header that went to the server. */
const update = async (tree: ReactTestRenderer) => {
  await pressUpdate(tree);
  const dialog = shown(tree)[0];
  expect(dialog.props.title).toBe(t('invoice.review.updateTitle', { number: '42' }));
  await act(async () => { await dialog.props.onConfirm(); });
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
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);

    const sent = await update(tree);

    expect(sent.zero_charge_reason).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });

  it('are stopped when the invoice was stored without a reason', async () => {
    loadInvoice(undefined);
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(true);

    await pressUpdate(tree);

    expect(shown(tree)).toHaveLength(1);
    expect(shown(tree)[0].props.title).toBe('Enter a reason for the zero charge');
    expect(shown(tree)[0].props.message).toBe('An item has a charge of 0. Enter the reason before updating the invoice.');
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('send the stored reason again when another line became free, and can replace it', async () => {
    loadInvoice('Sample lot');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: `edit_${PAID}_0`, values: { charge: 0 } })); });
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);
    expect(mockStore.getState().invoiceForm.header.zero_charge_reason).toBe('Sample lot');

    await act(async () => { summary(tree).props.onZeroChargeReasonChange('Agreed with the owner'); });
    const sent = await update(tree);

    expect(sent.zero_charge_reason).toBe('Agreed with the owner');
    await act(async () => { tree.unmount(); });
  });

  it('are stopped after erasing the stored reason', async () => {
    loadInvoice('Sample lot');
    const tree = await render();
    await act(async () => { summary(tree).props.onZeroChargeReasonChange(''); });

    await pressUpdate(tree);

    expect(shown(tree)[0].props.title).toBe('Enter a reason for the zero charge');
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('need no reason once every line has a charge, and none is sent', async () => {
    loadInvoice('Sample lot');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: `edit_${FREE}_0`, values: { charge: 3 } })); });
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);

    const sent = await update(tree);

    expect(sent).not.toHaveProperty('zero_charge_reason');
    await act(async () => { tree.unmount(); });
  });
});

describe.each(['admin', 'supervisor'])('%s updating an invoice that has a zero-charge line', (role) => {
  it('may leave the reason empty; null is sent', async () => {
    mockRole = role;
    loadInvoice(undefined);
    const tree = await render();
    expect(summary(tree).props.zeroChargeReasonRequired).toBe(false);

    const sent = await update(tree);

    expect(sent).toHaveProperty('zero_charge_reason', null);
    await act(async () => { tree.unmount(); });
  });

  it('send the stored reason back when they change nothing, so it is not removed by accident', async () => {
    mockRole = role;
    loadInvoice('Sample lot');
    const tree = await render();

    const sent = await update(tree);

    expect(sent.zero_charge_reason).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });

  it('remove the stored reason by erasing it', async () => {
    mockRole = role;
    loadInvoice('Sample lot');
    const tree = await render();
    await act(async () => { summary(tree).props.onZeroChargeReasonChange(''); });

    const sent = await update(tree);

    expect(sent).toHaveProperty('zero_charge_reason', null);
    await act(async () => { tree.unmount(); });
  });

  it('may write one, and it is sent', async () => {
    mockRole = role;
    loadInvoice(undefined);
    const tree = await render();
    await act(async () => { summary(tree).props.onZeroChargeReasonChange('Sample lot'); });

    const sent = await update(tree);

    expect(sent.zero_charge_reason).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });
});

describe.each(['staff', 'admin', 'supervisor'])('the question before the update, for %s', (role) => {
  const question = async (tree: ReactTestRenderer) => {
    await pressUpdate(tree);
    expect(shown(tree)).toHaveLength(1);
    const dialog = shown(tree)[0];
    expect(dialog.props.title).toBe('Update invoice 42?');
    expect([dialog.props.cancelText, dialog.props.confirmText]).toEqual(['Cancel', 'Update invoice']);
    return dialog.props.message as string;
  };

  it('says that 1 item has a charge of 0', async () => {
    mockRole = role;
    loadInvoice('Sample lot');
    const tree = await render();

    const message = await question(tree);

    expect(message.split('\n').slice(-2)).toEqual(['', '1 item has a charge of 0.']);
    expect(message.startsWith('Example Traders\nTotal ')).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('counts the lines, and says nothing once every line has a charge', async () => {
    mockRole = role;
    loadInvoice('Sample lot');
    await act(async () => { mockStore.dispatch(updateEditedItem({ temp_id: `edit_${PAID}_0`, values: { charge: 0 } })); });
    let tree = await render();
    expect((await question(tree)).split('\n').at(-1)).toBe('2 items have a charge of 0.');
    await act(async () => { tree.unmount(); });

    await act(async () => {
      mockStore.dispatch(updateEditedItem({ temp_id: `edit_${PAID}_0`, values: { charge: 5 } }));
      mockStore.dispatch(updateEditedItem({ temp_id: `edit_${FREE}_0`, values: { charge: 3 } }));
    });
    tree = await render();
    expect(await question(tree)).not.toContain('charge of 0');
    await act(async () => { tree.unmount(); });
  });
});

// The items step before it: a group rate is one field. Changing the group tax
// used to give the average charge of the group (2.5) to both lines, so no line
// was free any more and the update went out without the reason.
describe('changing a group rate on the items step of such an invoice', () => {
  const groupField = (tree: ReactTestRenderer, label: string) =>
    tree.root.findAllByType(TextInput).find((node) => node.props.testID === label)!;
  const lines = () => mockStore.getState().invoiceForm.items.map((item) => [item.charge, item.labour_rate, item.tax]);

  it('the group tax leaves the free line free, and the update carries the charges and the reason as stored', async () => {
    loadInvoice('Sample lot');
    let itemsStep!: ReactTestRenderer;
    await act(async () => { itemsStep = create(<InvoiceEditStep2 />); });
    // A free and a paid line: the group's charge shows their average (owner, 2026-10-19), which is never written to the lines.
    expect(groupField(itemsStep, 'group|i1:::M1|charge').props).toMatchObject({ value: '2.50', placeholder: '2.50' });

    await act(async () => { groupField(itemsStep, 'group|i1:::M1|tax').props.onChangeText('12'); });

    expect(lines()).toEqual([[0, 2, 12], [5, 2, 12]]);
    expect(groupField(itemsStep, 'group|i1:::M1|charge').props).toMatchObject({ value: '2.50', placeholder: '2.50' });
    await act(async () => { itemsStep.unmount(); });

    const tree = await render();
    const sent = await update(tree);
    expect(sent.zero_charge_reason).toBe('Sample lot');
    const sentLines = rpc.mock.calls.find(([name]) => name === 'update_invoice')![1].p_invoice_items;
    expect(sentLines.map((sentLine: { charge: number; tax: number }) => [sentLine.charge, sentLine.tax])).toEqual([[0, 12], [5, 12]]);
    await act(async () => { tree.unmount(); });
  });

  it('a group charge makes every line of the group paid, and no reason is sent with the update', async () => {
    loadInvoice('Sample lot');
    let itemsStep!: ReactTestRenderer;
    await act(async () => { itemsStep = create(<InvoiceEditStep2 />); });

    await act(async () => { groupField(itemsStep, 'group|i1:::M1|charge').props.onChangeText('4'); });

    expect(lines()).toEqual([[4, 2, 5], [4, 2, 5]]);
    await act(async () => { itemsStep.unmount(); });

    // No line is free, so the summary shows no reason field (it shows it for a line with a charge of 0 only).
    const tree = await render();
    expect(summary(tree).props.items.map((item: InvoiceItemData) => item.charge)).toEqual([4, 4]);
    const sent = await update(tree);
    expect('zero_charge_reason' in sent).toBe(false);
    // The text is still in the form, should a line be made free again before saving.
    expect(mockStore.getState().invoiceForm.header.zero_charge_reason).toBe('Sample lot');
    await act(async () => { tree.unmount(); });
  });
});
