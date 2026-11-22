/**
 * Invoice edit, review step: what is saved and what the person is shown.
 */
import React from 'react';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { updateInvoice } from '@/features/invoice/services/invoiceFormService';
import { showAlert } from '@/utils/alert';
import { t } from '@/i18n';
import { makeInvoiceStore, openForEdit, invoiceLine } from '@/tests/helpers/invoiceFixtures';
import InvoiceEditStep3 from '../../../app/invoice-edit/[id]/step3';

const mockStore = makeInvoiceStore({ role: 'staff' });
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismiss: jest.fn(), dismissTo: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
// Stand-ins that draw what the test looks at and call the step's real props. An open dialog is an alert with its title,
// its message and its confirm button; every dialog also has a button for the sheet finishing its closing (iOS).
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message?: string; confirmText?: string; onConfirm: () => unknown; onDismissed?: () => void }) => {
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
          </View>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Dialog finished closing" onPress={() => props.onDismissed?.()}>
          <Text>Dialog finished closing</Text>
        </Pressable>
      </View>
    );
  },
}));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
// The summary draws buttons that report the discount field's state to the step, as the real field does.
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({
  InvoiceCalculationSummary: (props: { onDiscountErrorChange: (error: string | null) => void }) => {
    const { Pressable, Text, View } = require('react-native');
    const { t: translate } = require('@/i18n');
    const button = (name: string, error: string | null) => (
      <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={() => props.onDiscountErrorChange(error)}>
        <Text>{name}</Text>
      </Pressable>
    );
    return (
      <View>
        {button('The discount field rejects 5000', translate('invoice.summary.discountTooLarge', { amount: '₹735.00' }))}
        {button('The discount field holds x', 'x')}
        {button('The discount field is accepted', null)}
      </View>
    );
  },
}));
// The success dialog says whether it is open, and draws the figures it was given.
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({
  InvoiceSuccessDialog: (props: { isVisible: boolean; isEditMode?: boolean; invoiceData?: { invoice_no?: unknown; total?: unknown; estimated_total?: unknown } }) => {
    const { Text, View } = require('react-native');
    return props.isVisible ? (
      <View>
        <Text>Success dialog is open</Text>
        <Text>{`Edit mode: ${String(props.isEditMode)}`}</Text>
        <Text>{`Invoice number: ${String(props.invoiceData?.invoice_no)}`}</Text>
        <Text>{`Total: ${String(props.invoiceData?.total)}`}</Text>
        <Text>{`Estimated total: ${String(props.invoiceData?.estimated_total)}`}</Text>
      </View>
    ) : null;
  },
}));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  ...jest.requireActual('@/features/invoice/services/invoiceFormService'),
  updateInvoice: jest.fn(),
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

const line = invoiceLine({ qty: 100 }, 0);

function loadInvoice() {
  openForEdit(mockStore, [line], {
    discount: 400,
    discount_reason: 'Damaged bags',
    labour: 200,
    tax_amount: 35,
    total: 335,
  });
}

const user = () => userEvent.setup({ delay: 0 });
async function open() {
  await render(<InvoiceEditStep3 />);
}
const shown = () => screen.queryAllByRole('alert');
/** The open dialog's title and message texts, and its buttons. */
const dialog = () => {
  const own = within(shown()[0]);
  const texts = own.getAllByText(/^/);
  return { own, title: texts[0], message: texts[1] };
};
const pressUpdate = async () => {
  await user().press(screen.getAllByLabelText(t('invoice.review.saveInvoice'))[0]);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  loadInvoice();
});
afterEach(() => jest.restoreAllMocks());

describe('a discount the field did not accept', () => {
  it('holds the update and says which discount the invoice still has', async () => {
    await open();
    // Staff typed 5000 over an invoice of 735: the field keeps the text, the invoice keeps 400.
    const rejected = t('invoice.summary.discountTooLarge', { amount: '₹735.00' });
    await user().press(screen.getByRole('button', { name: 'The discount field rejects 5000' }));

    await pressUpdate();

    expect(shown()).toHaveLength(1);
    expect(dialog().title).toHaveTextContent(t('invoice.review.discountCheckTitle'));
    expect(dialog().message.props.children).toContain(rejected);
    expect(dialog().message.props.children).toContain('₹400.00');
    // The dialog only informs: its one button closes it and nothing is saved.
    await user().press(dialog().own.getByRole('button', { name: t('common.close') }));
    expect(updateInvoice).not.toHaveBeenCalled();
  });

  it('lets the update go on to its confirmation once the field is corrected', async () => {
    await open();
    await user().press(screen.getByRole('button', { name: 'The discount field holds x' }));
    await user().press(screen.getByRole('button', { name: 'The discount field is accepted' }));

    await pressUpdate();

    expect(shown()).toHaveLength(1);
    expect(dialog().title).toHaveTextContent(t('invoice.review.updateTitle', { number: '42' }));
    expect(showAlert).not.toHaveBeenCalled();
  });
});

describe('the total of an updated invoice', () => {
  const confirmUpdate = async () => {
    await pressUpdate();
    const confirm = dialog().own.getByRole('button', { name: t('invoice.review.saveInvoice') });
    const message = dialog().message.props.children as string;
    await user().press(confirm);
    await waitFor(() => expect(updateInvoice).toHaveBeenCalledTimes(1));
    // The invoice dialog opens once the question has finished closing.
    for (const finished of screen.getAllByRole('button', { name: 'Dialog finished closing' })) await user().press(finished);
    return message;
  };

  it('models an old server that counts periods differently: the success dialog shows the total the server stored', async () => {
    // The form holds 335 (735 less the discount of 400). The server counts 1.5 periods and stores 598.
    jest.mocked(updateInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 598 } });
    await open();

    const message = await confirmUpdate();

    expect(message).toContain('Total ₹335.00');
    expect(await screen.findByText('Success dialog is open')).toBeOnTheScreen();
    expect(screen.getByText('Edit mode: true')).toBeOnTheScreen();
    expect(screen.getByText('Invoice number: 42')).toBeOnTheScreen();
    expect(screen.getByText('Total: 598')).toBeOnTheScreen();
    expect(screen.getByText('Estimated total: 335')).toBeOnTheScreen();
    // The question is closed once the save is over.
    expect(screen.queryAllByRole('alert', { includeHiddenElements: true })).toHaveLength(0);
  });

  it('is left unknown when the server total could not be read back', async () => {
    jest.mocked(updateInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: null } });
    await open();

    await confirmUpdate();

    expect(await screen.findByText('Total: null')).toBeOnTheScreen();
    expect(screen.getByText('Estimated total: 335')).toBeOnTheScreen();
  });
});
