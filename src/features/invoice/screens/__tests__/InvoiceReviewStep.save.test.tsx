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
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { printInvoiceRange } from '@/services/print-service';
import { generateInvoicePDF } from '@/services/pdf-service';
import { downloadAndSharePDF } from '@/utils/shareDocument';
import { checkGrnStillInvoiceable, createInvoice, updateInvoice } from '@/features/invoice/services/invoiceFormService';
import { fillNewInvoice, makeInvoiceStore, openForEdit, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { updateHeader } from '@/store/slices/invoiceFormSlice';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: () => null }));
// Stand-ins that keep their props, so the test can read what they show and answer them.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: 'InvoiceSuccessDialog' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));

const as = (name: string) => name as unknown as React.ElementType;
let tree: ReactTestRenderer;

/** A promise the test settles when it wants. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const confirm = () => tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible)[0];
const success = () => tree.root.findByType(as('InvoiceSuccessDialog'));
/** The question has finished closing (iOS `onDismissed`): what waited for it is drawn now. */
const dismissConfirm = async () => {
  await act(async () => { tree.root.findAllByType(as('ConfirmDialog')).forEach((dialog) => dialog.props.onDismissed?.()); });
};
const printDialog = () => tree.root.findByType(as('PrintRangeDialog'));
/** A Modal has finished closing (iOS `onDismiss`): what waited for it is drawn now. */
const finishClosing = async (name: 'InvoiceSuccessDialog' | 'PrintRangeDialog') => {
  await act(async () => { tree.root.findByType(as(name)).props.onDismissed?.(); });
};

const MODES = [
  ['create', 'Save invoice', '/(tabs)/invoices', InvoiceFormStep3],
  ['edit', 'Update invoice', '/invoice-details/inv-42', InvoiceEditStep3],
] as const;

describe.each(MODES)('the %s Review step after the save', (mode, saveLabel, leaveTo, Step) => {
  beforeEach(async () => {
    jest.clearAllMocks();
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
    await act(async () => { tree = create(<Step />); });
  });
  afterEach(async () => {
    await act(async () => { tree.unmount(); });
    jest.restoreAllMocks();
  });

  const send = (mode === 'edit' ? updateInvoice : createInvoice) as jest.Mock;
  const pressSave = async () => {
    const button = tree.root.find((node) => node.props.accessibilityLabel === saveLabel && typeof node.props.onPress === 'function');
    await act(async () => { button.props.onPress(); });
  };
  /** Saves and answers the question; the invoice dialog is then open. */
  const save = async () => {
    await pressSave();
    await act(async () => { await confirm().props.onConfirm(); });
    await dismissConfirm();
    expect(success().props.isVisible).toBe(true);
  };

  it('keeps the question open and busy while the save runs, and a second press sends nothing more', async () => {
    const sending = deferred<unknown>();
    send.mockReturnValue(sending.promise as never);
    await pressSave();
    expect(confirm().props.busy).toBe(false);

    let first!: Promise<void>;
    await act(async () => { first = confirm().props.onConfirm(); });
    expect(confirm().props.busy).toBe(true);
    await act(async () => { await confirm().props.onConfirm(); });
    expect(send).toHaveBeenCalledTimes(1);

    await act(async () => { sending.resolve({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 735 } }); await first; });
    expect(send).toHaveBeenCalledTimes(1);
    await dismissConfirm();
    expect(tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible)).toHaveLength(0);
    expect(success().props.isVisible).toBe(true);
  });

  it('opens the invoice dialog only after the question has finished closing', async () => {
    await pressSave();
    await act(async () => { await confirm().props.onConfirm(); });
    // The question is hidden, but still closing: a second Modal now would never show on iOS.
    expect(tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible)).toHaveLength(0);
    expect(success().props.isVisible).toBe(false);

    await dismissConfirm();
    expect(success().props.isVisible).toBe(true);
  });

  it('closes the question when the server refuses, and says why in an alert', async () => {
    send.mockResolvedValue({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'No number left' } as never);
    await pressSave();

    await act(async () => { await confirm().props.onConfirm(); });
    // The alert waits until the question has finished closing, as the invoice dialog does.
    expect(showAlert).not.toHaveBeenCalled();
    await dismissConfirm();

    expect(tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible)).toHaveLength(0);
    expect(success().props.isVisible).toBe(false);
    expect(showAlert).toHaveBeenCalledWith(expect.any(String), 'No number left');
  });

  it('Cancel in the print question returns to the invoice dialog', async () => {
    await save();
    await act(async () => { success().props.onPrint(); });
    expect(success().props.isVisible).toBe(false);
    // The invoice dialog is still closing: the print question waits for it (iOS drops a Modal opened over a closing one).
    expect(printDialog().props.visible).toBe(false);
    await finishClosing('InvoiceSuccessDialog');
    expect(printDialog().props.visible).toBe(true);

    await act(async () => { printDialog().props.onDismiss(); });

    expect(printDialog().props.visible).toBe(false);
    expect(success().props.isVisible).toBe(false);
    await finishClosing('PrintRangeDialog');
    expect(success().props.isVisible).toBe(true);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a printed invoice leaves the form with a toast, and the question closing after the answer does not bring the dialog back', async () => {
    await save();
    await act(async () => { success().props.onPrint(); });
    await finishClosing('InvoiceSuccessDialog');

    await act(async () => {
      await printDialog().props.onConfirm('42', '42');
      // The question calls this after it was answered.
      printDialog().props.onDismiss();
    });

    expect(printInvoiceRange).toHaveBeenCalledWith('42', '42', 2026);
    expect(showToast).toHaveBeenCalledWith('Invoice 42 sent to the printer.');
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith(leaveTo);
    expect(success().props.isVisible).toBe(false);
  });

  it('a range sent to the printer says so in the toast', async () => {
    await save();
    await act(async () => { success().props.onPrint(); });
    await finishClosing('InvoiceSuccessDialog');

    await act(async () => { await printDialog().props.onConfirm('40', '42'); });

    expect(showToast).toHaveBeenCalledWith('Invoices 40 to 42 sent to the printer.');
  });

  it.each([
    ['fails', { success: false }, 'Couldn\'t print the invoice. Check the printer and try again.'],
    ['is not confirmed by the printer', { success: false, unconfirmed: true }, 'The printer did not confirm the job. Check the printer before printing again.'],
  ])('a print that %s is told inside the invoice dialog, which returns once the print question has closed', async (_what, result, message) => {
    jest.mocked(printInvoiceRange).mockResolvedValue(result as never);
    await save();
    await act(async () => { success().props.onPrint(); });
    await finishClosing('InvoiceSuccessDialog');

    await act(async () => {
      await printDialog().props.onConfirm('42', '42');
      printDialog().props.onDismiss();
    });

    // No second Modal (an alert) opens at the same time as the invoice dialog; the reason is drawn inside the dialog.
    expect(success().props.isVisible).toBe(false);
    expect(showAlert).not.toHaveBeenCalled();
    await finishClosing('PrintRangeDialog');
    expect(success().props.isVisible).toBe(true);
    expect(success().props.shareError).toBe(message);
    expect(showAlert).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('a failure to make the PDF is shown inside the invoice dialog', async () => {
    jest.mocked(generateInvoicePDF).mockResolvedValue({ success: false } as never);
    await save();
    expect(success().props.shareError).toBeNull();

    await act(async () => { await success().props.onSharePDF(); });

    expect(success().props.shareError).toBe("Couldn't create the PDF. Try again.");
    expect(success().props.isShareLoading).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a failure to share the PDF is shown inside the dialog, and the next try takes it away', async () => {
    jest.mocked(generateInvoicePDF).mockResolvedValue({ success: true, pdfUrl: 'https://example.test/i.pdf' } as never);
    jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: false } as never);
    jest.mocked(downloadAndSharePDF).mockResolvedValueOnce({ success: true } as never);
    await save();

    await act(async () => { await success().props.onSharePDF(); });
    expect(success().props.shareError).toBe("Couldn't share the PDF. Try again.");

    await act(async () => { await success().props.onSharePDF(); });
    expect(success().props.shareError).toBeNull();
  });

  it('a share that throws is shown inside the dialog too', async () => {
    jest.mocked(generateInvoicePDF).mockRejectedValue(new Error('Network request failed'));
    await save();

    await act(async () => { await success().props.onSharePDF(); });

    expect(success().props.shareError).toBe("Couldn't share the PDF. Try again.");
  });

  describe('on Android, where no dismissal event comes', () => {
    const original = Platform.OS;
    beforeEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' }));
    afterEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original }));

    it('opens the invoice dialog as soon as the question is hidden', async () => {
      await pressSave();
      await act(async () => { await confirm().props.onConfirm(); });

      // No onDismissed was called by hand.
      expect(success().props.isVisible).toBe(true);
    });

    it('tells a refusal in an alert as soon as the question is hidden', async () => {
      send.mockResolvedValue({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'No number left' } as never);
      await pressSave();

      await act(async () => { await confirm().props.onConfirm(); });

      expect(success().props.isVisible).toBe(false);
      expect(showAlert).toHaveBeenCalledWith(expect.any(String), 'No number left');
    });

    it('goes from the invoice dialog to the print question, and back on Cancel, with no dismissal events', async () => {
      await pressSave();
      await act(async () => { await confirm().props.onConfirm(); });
      await act(async () => { success().props.onPrint(); });
      expect(success().props.isVisible).toBe(false);
      expect(printDialog().props.visible).toBe(true);

      await act(async () => { printDialog().props.onDismiss(); });

      expect(printDialog().props.visible).toBe(false);
      expect(success().props.isVisible).toBe(true);
    });
  });

  it.each([
    ['the server refuses', 'Server says no', () => send.mockResolvedValue({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'Server says no' } as never)],
    ['the request throws', 'Check your connection and try again.', () => send.mockRejectedValue(new Error('Network request failed'))],
  ])('holds the alert of a save that fails because %s until the question has closed', async (_what, message, arrange) => {
    arrange();
    await pressSave();
    await act(async () => { await confirm().props.onConfirm(); });
    expect(showAlert).not.toHaveBeenCalled();

    await dismissConfirm();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAlert).mock.calls[0][1]).toEqual(expect.stringContaining(message.slice(0, 12)));
    expect(confirm()).toBeUndefined();
  });

  it('holds the alert of "the GRN can no longer be invoiced" until the question has closed (a new invoice only)', async () => {
    if (mode === 'edit') return; // an invoice that exists never asks the GRN question
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: false, message: 'Already invoiced' } as never);
    await pressSave();
    await act(async () => { await confirm().props.onConfirm(); });
    expect(showAlert).not.toHaveBeenCalled();

    await dismissConfirm();

    expect(showAlert).toHaveBeenCalledWith(expect.any(String), 'Already invoiced');
    expect(send).not.toHaveBeenCalled();
  });

  it('a failed save reads "Couldn\'t update the invoice" in an edit and "Couldn\'t save the invoice" in a new invoice', async () => {
    send.mockResolvedValue({ success: false, data: { invoice_id: '', invoice_no: 0 }, message: 'Server says no' } as never);
    await pressSave();
    await act(async () => { await confirm().props.onConfirm(); });
    await dismissConfirm();

    expect(showAlert).toHaveBeenCalledWith(mode === 'edit' ? "Couldn't update the invoice" : "Couldn't save the invoice", 'Server says no');
  });

  it('draws no Snackbar of its own', async () => {
    await save();

    expect(tree.root.findAll((node) => typeof node.type !== 'string' && (node.type as { displayName?: string }).displayName === 'Snackbar')).toHaveLength(0);
    const source = require('fs').readFileSync(require('path').join(__dirname, '../InvoiceReviewStep.tsx'), 'utf8');
    expect(source).not.toMatch(/react-native-paper|Snackbar/);
  });
});
