/**
 * Invoice Review step (InvoiceReviewStep.save): after Save / Update, in both modes (the shared step, the real
 * hook, a real invoice-form slice).
 *
 * - The question before the save is busy while the save runs, and a second
 *   press of its button sends nothing more.
 * - Print: a cancel returns to the invoice dialog; a success is a toast on the
 *   screen the form returns to; a failure is an alert and the dialog stays.
 * - Sharing: a failure is drawn inside the invoice dialog, not on a screen under
 *   it.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { printInvoiceRange } from '@/services/print-service';
import { generateInvoicePDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { checkGrnStillInvoiceable, createInvoice, updateInvoice } from '@/features/invoice/services/invoiceFormService';
import { fillNewInvoice, makeInvoiceStore, openForEdit, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { updateHeader } from '@/store/slices/invoiceFormSlice';
import { calculateInvoiceBreakdown } from '@/utils/invoiceCalculations';
import InvoiceFormStep3 from '../../../../../app/invoice-form/step3';
import InvoiceEditStep3 from '../../../../../app/invoice-edit/[id]/step3';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getNextInvoiceNumber: jest.fn(),
  loadInvoiceFormData: jest.fn(),
  loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: () => null }));
// The three dialogs are stand-ins that draw what the step hands them and call the step's own props: the open question
// (its title, message and one button per action; `busy` is the confirm button's busy state), the invoice dialog (its
// buttons and the reason a share or print failed) and the print question (its answer, then its dismissal, as the real
// one does). The button of the confirm is left pressable while busy, so a second press reaches the step's own guard.
// A Modal's native "finished closing" event (iOS) has no button: the stand-ins keep it, and finishClosing() sends it.
const mockClosed: Record<string, (() => void) | undefined> = {};
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; message: string; confirmText?: string; cancelText?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void; onDismissed?: () => void }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    mockClosed[`confirm:${props.title}`] = props.onDismissed;
    if (!props.visible) return null;
    return createElement(
      View,
      { accessible: true, accessibilityRole: 'alert', accessibilityLabel: props.title },
      createElement(Text, null, props.title),
      createElement(Text, null, props.message),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: props.confirmText, accessibilityState: { busy: Boolean(props.busy) }, onPress: props.onConfirm }, createElement(Text, null, props.confirmText)),
      props.cancelText ? createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: props.cancelText, onPress: props.onCancel }, createElement(Text, null, props.cancelText)) : null
    );
  },
}));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({
  InvoiceSuccessDialog: (props: { isVisible: boolean; isShareLoading?: boolean; shareError?: string | null; onPrint?: () => void; onSharePDF?: () => void; onDismissed?: () => void }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    mockClosed.success = props.onDismissed;
    if (!props.isVisible) return null;
    return createElement(
      View,
      null,
      createElement(Text, null, 'Invoice dialog'),
      props.shareError ? createElement(Text, null, props.shareError) : null,
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Print', onPress: props.onPrint }),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Share PDF', accessibilityState: { busy: Boolean(props.isShareLoading) }, onPress: props.onSharePDF })
    );
  },
}));
jest.mock('@/components/PrintRangeDialog', () => ({
  PrintRangeDialog: (props: { visible: boolean; onDismiss: () => void; onDismissed?: () => void; onConfirm: (start: string, end: string) => Promise<void | string> }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    mockClosed.print = props.onDismissed;
    if (!props.visible) return null;
    const print = (start: string, end: string) => async () => {
      const note = await props.onConfirm(start, end);
      // The real question dismisses itself after it was answered, unless the answer is a note to show.
      if (!(typeof note === 'string' && note !== '')) props.onDismiss();
    };
    return createElement(
      View,
      null,
      createElement(Text, null, 'Print question'),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Print 42', onPress: print('42', '42') }),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Print 40 to 42', onPress: print('40', '42') }),
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Cancel print', onPress: props.onDismiss })
    );
  },
}));
// A Snackbar of react-native-paper would be drawn as text here: the step draws none.
jest.mock('react-native-paper', () => ({
  Snackbar: () => require('react').createElement(require('react-native').Text, null, 'Snackbar'),
}));

/** A promise the test settles when it wants. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** The questions that are open (the save question, or a refusal): each is an alert. */
const questions = () => screen.queryAllByRole('alert');
/** The question has finished closing (iOS `onDismissed`): what waited for it is drawn now. */
const dismissConfirm = async () => {
  await act(async () => { Object.entries(mockClosed).filter(([name]) => name.startsWith('confirm:')).forEach(([, done]) => done?.()); });
};
/** A Modal has finished closing (iOS `onDismiss`): what waited for it is drawn now. */
const finishClosing = async (name: 'success' | 'print') => {
  await act(async () => { mockClosed[name]?.(); });
};
const invoiceDialog = () => screen.queryByText('Invoice dialog');
const printQuestion = () => screen.queryByText('Print question');

const MODES = [
  ['create', 'Create invoice', '/(tabs)/invoices', InvoiceFormStep3],
  ['edit', 'Save invoice', '/invoice-details/inv-42', InvoiceEditStep3],
] as const;

describe.each(MODES)('the %s Review step after the save', (mode, saveLabel, leaveTo, Step) => {
  let user: ReturnType<typeof userEvent.setup>;
  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(mockClosed).forEach((name) => { delete mockClosed[name]; });
    jest.useFakeTimers();
    user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
    mockStore = makeInvoiceStore();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    if (mode === 'edit') {
      openForEdit(mockStore);
    } else {
      fillNewInvoice(mockStore);
      mockStore.dispatch(updateHeader({ inv_no: 42, inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no_typed: true }));
    }
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
    jest.mocked(createInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 735 } } as never);
    jest.mocked(updateInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 735 } } as never);
    jest.mocked(printInvoiceRange).mockResolvedValue({ success: true } as never);
    await render(<Step />);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const send = (mode === 'edit' ? updateInvoice : createInvoice) as jest.Mock;
  /** The bottom bar's button (the question's own button carries the same label, so this is for when no question is open). */
  const pressSave = async () => {
    await user.press(screen.getByRole('button', { name: saveLabel }));
  };
  /** The confirm button of the open question. */
  const confirmButton = () => within(screen.getByRole('alert')).getByRole('button', { name: saveLabel });
  const pressConfirm = async () => {
    await user.press(confirmButton());
  };
  /** Saves and answers the question; the invoice dialog is then open. */
  const save = async () => {
    await pressSave();
    await pressConfirm();
    expect(questions()).toHaveLength(0);
    await dismissConfirm();
    expect(await screen.findByText('Invoice dialog')).toBeOnTheScreen();
  };
  /** The invoice dialog's Print, answered at the print question. */
  const openPrintQuestion = async () => {
    await user.press(screen.getByRole('button', { name: 'Print' }));
    await finishClosing('success');
    expect(await screen.findByText('Print question')).toBeOnTheScreen();
  };

  it('keeps the question open and busy while the save runs, and a second press sends nothing more', async () => {
    const sending = deferred<unknown>();
    send.mockReturnValue(sending.promise as never);
    await pressSave();
    expect(confirmButton().props.accessibilityState).toEqual({ busy: false });

    await pressConfirm();
    expect(confirmButton().props.accessibilityState).toEqual({ busy: true });
    await pressConfirm();
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => { sending.resolve({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 735 } }); });
    expect(questions()).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(1);
    await dismissConfirm();
    expect(questions()).toHaveLength(0);
    expect(await screen.findByText('Invoice dialog')).toBeOnTheScreen();
  });

  it('opens the invoice dialog only after the question has finished closing', async () => {
    await pressSave();
    await pressConfirm();
    // The question is hidden, but still closing: a second Modal now would never show on iOS.
    expect(questions()).toHaveLength(0);
    expect(invoiceDialog()).not.toBeOnTheScreen();

    await dismissConfirm();
    expect(await screen.findByText('Invoice dialog')).toBeOnTheScreen();
  });

  it('closes the question when the server refuses, and says why in an alert', async () => {
    send.mockResolvedValue({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'No number left' } as never);
    await pressSave();

    await pressConfirm();
    expect(questions()).toHaveLength(0);
    // The alert waits until the question has finished closing, as the invoice dialog does.
    expect(showAlert).not.toHaveBeenCalled();
    await dismissConfirm();

    expect(questions()).toHaveLength(0);
    expect(invoiceDialog()).not.toBeOnTheScreen();
    expect(showAlert).toHaveBeenCalledWith(expect.any(String), 'No number left');
  });

  it('refuses a discount that takes the total to zero before the question (D8): the sentence, no question, nothing sent', async () => {
    const { invoiceForm } = mockStore.getState();
    const base = calculateInvoiceBreakdown(invoiceForm.items, invoiceForm.header).base;
    await act(async () => { mockStore.dispatch(updateHeader({ discount: base })); });
    await pressSave();

    // The only dialog is the refusal with the D8 sentence, not the question of the save.
    const open = questions();
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveAccessibleName('Check the discount');
    expect(within(open[0]).getByText(/A discount can't take the total to ₹0\./)).toBeOnTheScreen();
    expect(send).not.toHaveBeenCalled();
  });

  it('Cancel in the print question returns to the invoice dialog', async () => {
    await save();
    await user.press(screen.getByRole('button', { name: 'Print' }));
    expect(invoiceDialog()).not.toBeOnTheScreen();
    // The invoice dialog is still closing: the print question waits for it (iOS drops a Modal opened over a closing one).
    expect(printQuestion()).not.toBeOnTheScreen();
    await finishClosing('success');
    expect(await screen.findByText('Print question')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Cancel print' }));

    expect(printQuestion()).not.toBeOnTheScreen();
    expect(invoiceDialog()).not.toBeOnTheScreen();
    await finishClosing('print');
    expect(await screen.findByText('Invoice dialog')).toBeOnTheScreen();
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a printed invoice leaves the form with a toast, and the question closing after the answer does not bring the dialog back', async () => {
    await save();
    await openPrintQuestion();

    // The question answers, then dismisses itself, as the real one does.
    await user.press(screen.getByRole('button', { name: 'Print 42' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Invoice 42 sent to the printer.'));
    expect(printInvoiceRange).toHaveBeenCalledWith('42', '42', 2026);
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith(leaveTo);
    expect(invoiceDialog()).not.toBeOnTheScreen();
  });

  it('a range sent to the printer says so in the toast', async () => {
    await save();
    await openPrintQuestion();

    await user.press(screen.getByRole('button', { name: 'Print 40 to 42' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Invoices 40 to 42 sent to the printer.'));
  });

  it.each([
    ['fails', { success: false }, 'Couldn\'t print the invoice. Check the printer and try again.'],
    ['is not confirmed by the printer', { success: false, unconfirmed: true }, 'The printer did not confirm the job. Check the printer before printing again.'],
  ])('a print that %s is told inside the invoice dialog, which returns once the print question has closed', async (_what, result, message) => {
    jest.mocked(printInvoiceRange).mockResolvedValue(result as never);
    await save();
    await openPrintQuestion();

    await user.press(screen.getByRole('button', { name: 'Print 42' }));

    // No second Modal (an alert) opens at the same time as the invoice dialog; the reason is drawn inside the dialog.
    await waitFor(() => expect(printQuestion()).not.toBeOnTheScreen());
    expect(invoiceDialog()).not.toBeOnTheScreen();
    expect(showAlert).not.toHaveBeenCalled();
    await finishClosing('print');
    expect(await screen.findByText('Invoice dialog')).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('a failure to make the PDF is shown inside the invoice dialog', async () => {
    jest.mocked(generateInvoicePDF).mockResolvedValue({ success: false } as never);
    await save();
    expect(screen.queryByText(/Try again\./)).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Share PDF' }));

    expect(await screen.findByText("Couldn't create the PDF. Try again.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Share PDF' }).props.accessibilityState).toEqual({ busy: false });
    expect(showToast).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a failure to share the PDF is shown inside the dialog, and the next try takes it away', async () => {
    jest.mocked(generateInvoicePDF).mockResolvedValue({ success: true, pdfUrl: 'https://example.test/i.pdf' } as never);
    jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: false } as never);
    jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: true } as never);
    await save();

    await user.press(screen.getByRole('button', { name: 'Share PDF' }));
    expect(await screen.findByText("Couldn't share the PDF. Try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Share PDF' }));
    await waitFor(() => expect(screen.queryByText("Couldn't share the PDF. Try again.")).not.toBeOnTheScreen());
    expect(downloadAndSharePDF).toHaveBeenCalledTimes(2);
  });

  it('a share that throws is shown inside the dialog too', async () => {
    jest.mocked(generateInvoicePDF).mockRejectedValue(new Error('Network request failed'));
    await save();

    await user.press(screen.getByRole('button', { name: 'Share PDF' }));

    expect(await screen.findByText("Couldn't share the PDF. Try again.")).toBeOnTheScreen();
  });

  describe('on Android, where no dismissal event comes', () => {
    const original = Platform.OS;
    beforeEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' }));
    afterEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original }));

    it('opens the invoice dialog as soon as the question is hidden', async () => {
      await pressSave();
      await pressConfirm();

      // No onDismissed was called by hand.
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('Invoice dialog')).toBeOnTheScreen();
    });

    it('tells a refusal in an alert as soon as the question is hidden', async () => {
      send.mockResolvedValue({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'No number left' } as never);
      await pressSave();

      await pressConfirm();

      await waitFor(() => expect(showAlert).toHaveBeenCalledWith(expect.any(String), 'No number left'));
      expect(invoiceDialog()).not.toBeOnTheScreen();
    });

    it('goes from the invoice dialog to the print question, and back on Cancel, with no dismissal events', async () => {
      await pressSave();
      await pressConfirm();
      await user.press(await screen.findByRole('button', { name: 'Print' }));
      expect(invoiceDialog()).not.toBeOnTheScreen();
      expect(await screen.findByText('Print question')).toBeOnTheScreen();

      await user.press(screen.getByRole('button', { name: 'Cancel print' }));

      expect(printQuestion()).not.toBeOnTheScreen();
      expect(await screen.findByText('Invoice dialog')).toBeOnTheScreen();
    });
  });

  it.each([
    ['the server refuses', 'Server says no', () => send.mockResolvedValue({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'Server says no' } as never)],
    ['the request throws', 'Check your connection and try again.', () => send.mockRejectedValue(new Error('Network request failed'))],
  ])('holds the alert of a save that fails because %s until the question has closed', async (_what, message, arrange) => {
    arrange();
    await pressSave();
    await pressConfirm();
    expect(questions()).toHaveLength(0);
    expect(showAlert).not.toHaveBeenCalled();

    await dismissConfirm();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][1]).toEqual(expect.stringContaining(message.slice(0, 12)));
    expect(questions()).toHaveLength(0);
  });

  it('holds the alert of "the GRN can no longer be invoiced" until the question has closed (a new invoice only)', async () => {
    if (mode === 'edit') return; // an invoice that exists never asks the GRN question
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: false, message: 'Already invoiced' } as never);
    await pressSave();
    await pressConfirm();
    expect(questions()).toHaveLength(0);
    expect(showAlert).not.toHaveBeenCalled();

    await dismissConfirm();

    expect(showAlert).toHaveBeenCalledWith(expect.any(String), 'Already invoiced');
    expect(send).not.toHaveBeenCalled();
  });

  it('a failed save reads "Couldn\'t update the invoice" in an edit and "Couldn\'t save the invoice" in a new invoice', async () => {
    send.mockResolvedValue({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'Server says no' } as never);
    await pressSave();
    await pressConfirm();
    expect(questions()).toHaveLength(0);
    await dismissConfirm();

    expect(showAlert).toHaveBeenCalledWith(mode === 'edit' ? "Couldn't update the invoice" : "Couldn't save the invoice", 'Server says no');
  });

  it('draws no Snackbar of its own', async () => {
    await save();

    expect(screen.queryByText('Snackbar')).not.toBeOnTheScreen();
    const source = require('fs').readFileSync(require('path').join(__dirname, '../InvoiceReviewStep.tsx'), 'utf8');
    expect(source).not.toMatch(/react-native-paper|Snackbar/);
  });
});
