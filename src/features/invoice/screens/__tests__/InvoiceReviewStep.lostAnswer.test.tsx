/**
 * Invoice Review step while the answer of a save is lost (owner rule D22), with the real header, the real hook and the
 * real alert host. The save question has closed, the strip says the server is asked, and the bottom button reads
 * its busy label. The close button (X) and the Android Back key must both ask "Leave without an answer?"
 * [Keep waiting | Leave anyway]; "Leave anyway" ends the check (create: the form is reset and the Invoices tab opens;
 * edit: the invoice's page opens); and nothing in this state can send a second save.
 */
import React from 'react';
import { View } from 'react-native';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AlertHost } from '@/components/AlertHost';
import { showAlert, resetAlertQueueForTests } from '@/utils/alert';
import { checkSubmission } from '@/utils/lostAnswer';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { checkGrnStillInvoiceable, createInvoice, updateInvoice } from '@/features/invoice/services/invoiceFormService';
import { fillNewInvoice, makeInvoiceStore, openForEdit, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { updateHeader } from '@/store/slices/invoiceFormSlice';
import InvoiceFormStep3 from '../../../../../app/invoice-form/step3';
import InvoiceEditStep3 from '../../../../../app/invoice-edit/[id]/step3';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useRouter: () => require('expo-router').router,
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
// The real alert queue (the host below draws it), recorded so the test can press a button by its label.
jest.mock('@/utils/alert', () => {
  const actual = jest.requireActual('@/utils/alert');
  return { ...actual, showAlert: jest.fn(actual.showAlert) };
});
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/lostAnswer', () => ({ ...jest.requireActual('@/utils/lostAnswer'), checkSubmission: jest.fn() }));
// The wait for the server reads the network state from NetInfo (a native module): the phone is online.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => undefined },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: () => null }));
// The success and print dialogs are not part of this state: nothing of them is drawn.
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));


let hardwareBack: ReturnType<typeof installHardwareBack>;

const TITLE = 'Leave without an answer?';
const MESSAGE = 'It may have been saved. Check the list before entering it again.';

const MODES = [
  ['create', 'Create invoice', 'Close new invoice', '/(tabs)/invoices', InvoiceFormStep3],
  ['edit', 'Save invoice', 'Close invoice edit', '/invoice-details/inv-42', InvoiceEditStep3],
] as const;

const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
const button = (name: string) => screen.getByRole('button', { name });
// The save question is the dialog with a Cancel button; the leave question has Keep waiting / Leave anyway instead.
const confirmOpen = () => screen.queryByRole('button', { name: 'Cancel' }) !== null;
const strip = () => screen.queryByTestId('invoice-lost-answer');
/** The calls of showAlert that asked the "Leave without an answer?" question. */
const leaveQuestions = () => jest.mocked(showAlert).mock.calls.filter((call) => call[0] === TITLE);
// A dialog takes no press in its first 250 ms (a double tap on the dialog before it): the clock is moved past that.
const settle = () => act(async () => { jest.advanceTimersByTime(300); });
/** Presses a button of the "Leave without an answer?" question the real host draws. */
const answer = async (text: string) => {
  await settle();
  await user().press(button(text));
};
/** The bottom button's own handler, called past its disabled state: what the screen's guard against a second save has to hold. */
const pressPastDisabled = async (name: string) => {
  // Testing Library shows host views only; the Pressable's own onPress is on the fiber above the button's view.
  let fiber = button(name).unstable_fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
  const onPress = fiber?.memoizedProps.onPress as () => unknown;
  await act(async () => { await onPress(); });
};

describe.each(MODES)('the %s Review step while the answer is lost', (mode, saveLabel, closeLabel, leaveTo, Step) => {
  const send = (mode === 'edit' ? updateInvoice : createInvoice) as jest.Mock;
  let checkSignal: AbortSignal | undefined;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetAlertQueueForTests();
    hardwareBack = installHardwareBack();
    mockStore = makeInvoiceStore();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    if (mode === 'edit') {
      openForEdit(mockStore);
    } else {
      fillNewInvoice(mockStore);
      mockStore.dispatch(updateHeader({ inv_no: 42, inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no_typed: true }));
    }
    jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
    // The first send gets no answer, and the check for it never ends until the person leaves.
    send.mockResolvedValue({ success: false, error: '', lostAnswer: { sentAt: Date.now() } } as never);
    checkSignal = undefined;
    jest.mocked(checkSubmission).mockImplementation(
      (_key, _sentAt, signal) =>
        new Promise((_resolve, reject) => {
          checkSignal = signal;
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
        }) as never
    );
    await render(<View><AlertHost /><Step /></View>);
    // Save, answer the question: the answer is lost, so the question closes and the strip shows.
    await user().press(button(saveLabel));
    expect(confirmOpen()).toBe(true);
    await settle();
    // The dialog's own button carries the same label as the bottom button; the dialog is drawn after the screen.
    await user().press(screen.getAllByRole('button', { name: saveLabel }).at(-1)!);
    expect(await screen.findByTestId('invoice-lost-answer')).toBeOnTheScreen();
  });
  afterEach(() => {
    hardwareBack.restore();
    resetAlertQueueForTests();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('is locked: the strip shows, the question is closed and the bottom button says its busy label', () => {
    expect(strip()).toBeOnTheScreen();
    expect(confirmOpen()).toBe(false);
    expect(button(mode === 'edit' ? 'Saving invoice…' : 'Creating invoice…')).toBeDisabled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(checkSubmission).toHaveBeenCalledTimes(1);
  });

  it('the X is usable and asks "Leave without an answer?" with Keep waiting and Leave anyway', async () => {
    expect(button(closeLabel)).toBeEnabled();

    await user().press(button(closeLabel));

    expect(leaveQuestions()).toHaveLength(1);
    const [, message, buttons] = leaveQuestions()[0];
    expect(message).toBe(MESSAGE);
    expect(buttons?.map((candidate) => candidate.text)).toEqual(['Keep waiting', 'Leave anyway']);
    // The real host draws it.
    expect(await screen.findByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByText(MESSAGE)).toBeOnTheScreen();
    expect(screen.getByText('Keep waiting')).toBeOnTheScreen();
    expect(screen.getByText('Leave anyway')).toBeOnTheScreen();
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('the Android Back key asks the same question and takes the press', async () => {
    let taken = false;
    await act(async () => { taken = hardwareBack.press(); });

    expect(taken).toBe(true);
    expect(leaveQuestions()).toHaveLength(1);
    expect(leaveQuestions()[0][1]).toBe(MESSAGE);
    expect(leaveQuestions()[0][2]?.map((candidate) => candidate.text)).toEqual(['Keep waiting', 'Leave anyway']);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('Keep waiting leaves the form locked and the check running', async () => {
    await user().press(button(closeLabel));
    await answer('Keep waiting');

    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(checkSignal?.aborted).toBe(false);
    expect(strip()).toBeOnTheScreen();
  });

  it('Leave anyway from the X ends the check, leaves the form and sends nothing more', async () => {
    await user().press(button(closeLabel));
    await answer('Leave anyway');

    expect(checkSignal?.aborted).toBe(true);
    expect(router.dismissTo).toHaveBeenCalledWith(leaveTo);
    expect(send).toHaveBeenCalledTimes(1);
    // The aborted check clears the lock one step later.
    await waitFor(() => expect(strip()).not.toBeOnTheScreen());
    // A new invoice's form is emptied; an edit's is left to its layout.
    if (mode === 'create') expect(mockStore.getState().invoiceForm.header.gr_id).toBe('');
  });

  it('Leave anyway from Back does the same', async () => {
    await act(async () => { hardwareBack.press(); });
    await answer('Leave anyway');

    expect(checkSignal?.aborted).toBe(true);
    expect(router.dismissTo).toHaveBeenCalledWith(leaveTo);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('the Save button and the question cannot start a second save', async () => {
    await pressPastDisabled(mode === 'edit' ? 'Saving invoice…' : 'Creating invoice…');

    expect(confirmOpen()).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
