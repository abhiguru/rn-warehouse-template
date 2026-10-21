/**
 * Invoice Review step while the answer of a save is lost (owner rule D22), with the real header, the real hook and the
 * real alert host. The save question has closed, the strip says the server is asked, and the bottom button reads
 * "Saving…". The close button (X) and the Android Back key must both ask "Leave without an answer?"
 * [Keep waiting | Leave anyway]; "Leave anyway" ends the check (create: the form is reset and the Invoices tab opens;
 * edit: the invoice's page opens); and nothing in this state can send a second save.
 */
import React from 'react';
import { View } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: () => null }));
// Stand-ins that keep their props, so the test can read what they show and answer them.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: 'InvoiceSuccessDialog' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));

const as = (name: string) => name as unknown as React.ElementType;
let tree: ReactTestRenderer;
let hardwareBack: ReturnType<typeof installHardwareBack>;

const TITLE = 'Leave without an answer?';
const MESSAGE = 'It may have been saved. Check the list before entering it again.';

const MODES = [
  ['create', 'Save invoice', 'Cancel Invoice', '/(tabs)/invoices', InvoiceFormStep3],
  ['edit', 'Update invoice', 'Cancel invoice edit', '/invoice-details/inv-42', InvoiceEditStep3],
] as const;

const pressable = (label: string) =>
  tree.root.find((node) => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function');
const confirm = () => tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible)[0];
const strip = () => tree.root.findAll((node) => node.props?.testID === 'invoice-lost-answer');
/** The calls of showAlert that asked the "Leave without an answer?" question. */
const leaveQuestions = () => jest.mocked(showAlert).mock.calls.filter((call) => call[0] === TITLE);
/** Presses a button of the latest "Leave without an answer?" question, as the host does (its handler runs after the dialog closes). */
const answer = async (text: string) => {
  const calls = leaveQuestions();
  const button = calls[calls.length - 1][2]?.find((candidate) => candidate.text === text);
  await act(async () => { button?.onPress?.(); });
};

describe.each(MODES)('the %s Review step while the answer is lost', (mode, saveLabel, closeLabel, leaveTo, Step) => {
  const send = (mode === 'edit' ? updateInvoice : createInvoice) as jest.Mock;
  let checkSignal: AbortSignal | undefined;

  beforeEach(async () => {
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
    await act(async () => { tree = create(<View><AlertHost /><Step /></View>); });
    // Save, answer the question: the answer is lost, so the question closes and the strip shows.
    await act(async () => { pressable(saveLabel).props.onPress(); });
    await act(async () => { void confirm().props.onConfirm(); });
  });
  afterEach(async () => {
    await act(async () => { tree.unmount(); });
    hardwareBack.restore();
    resetAlertQueueForTests();
    jest.restoreAllMocks();
  });

  it('is locked: the strip shows, the question is closed and the bottom button says Saving…', () => {
    expect(strip().length).toBeGreaterThan(0);
    expect(tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible)).toHaveLength(0);
    expect(pressable('Saving…').props.disabled).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(checkSubmission).toHaveBeenCalledTimes(1);
  });

  it('the X is usable and asks "Leave without an answer?" with Keep waiting and Leave anyway', async () => {
    expect(pressable(closeLabel).props.disabled).toBeFalsy();

    await act(async () => { pressable(closeLabel).props.onPress(); });

    expect(leaveQuestions()).toHaveLength(1);
    const [, message, buttons] = leaveQuestions()[0];
    expect(message).toBe(MESSAGE);
    expect(buttons?.map((button) => button.text)).toEqual(['Keep waiting', 'Leave anyway']);
    // The real host draws it.
    const texts = tree.root.findAll((node) => (node.type as unknown) === require('react-native').Text).map((node) => node.props.children);
    expect(texts).toEqual(expect.arrayContaining([TITLE, MESSAGE, 'Keep waiting', 'Leave anyway']));
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('the Android Back key asks the same question and takes the press', async () => {
    let taken = false;
    await act(async () => { taken = hardwareBack.press(); });

    expect(taken).toBe(true);
    expect(leaveQuestions()).toHaveLength(1);
    expect(leaveQuestions()[0][1]).toBe(MESSAGE);
    expect(leaveQuestions()[0][2]?.map((button) => button.text)).toEqual(['Keep waiting', 'Leave anyway']);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('Keep waiting leaves the form locked and the check running', async () => {
    await act(async () => { pressable(closeLabel).props.onPress(); });
    await answer('Keep waiting');

    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(checkSignal?.aborted).toBe(false);
    expect(strip().length).toBeGreaterThan(0);
  });

  it('Leave anyway from the X ends the check, leaves the form and sends nothing more', async () => {
    await act(async () => { pressable(closeLabel).props.onPress(); });
    await answer('Leave anyway');

    expect(checkSignal?.aborted).toBe(true);
    expect(router.dismissTo).toHaveBeenCalledWith(leaveTo);
    expect(send).toHaveBeenCalledTimes(1);
    expect(strip()).toHaveLength(0);
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
    await act(async () => { pressable('Saving…').props.onPress?.(); });

    expect(tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible)).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
