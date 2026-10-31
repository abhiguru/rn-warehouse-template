/**
 * The way back and out of the invoice wizards, on the real expo-router stack
 * (the in-memory route context of expo-router's own testing library): the real
 * Invoices tab, both invoice layouts, and the three shared steps in both
 * modes, on the real useInvoiceForm and a real invoice-form slice.
 *
 * - Back on step 2 reaches step 1, and Next there checks step 1 again (the
 *   check used to compare with the step the slice remembered, 2, and skipped it).
 * - The swipe back is off in both stacks.
 * - "Create another" leaves the stack as [tabs, step1] with a new number.
 * - Back on step 1 of an edit asks when there are changes; Cancel and "View
 *   invoice" after a save land on the invoice's page.
 *
 * The step header is a stand-in with the "Discard" of its question, the items
 * table and the amounts summary are left out, and the server is mocked.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { routerStore } from '@/tests/helpers/routerStore';
import { router, Stack, Tabs } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { updateDiscount, updateHeader } from '@/store/slices/invoiceFormSlice';
import {
  checkGrnStillInvoiceable,
  createInvoice,
  getNextInvoiceNumber,
  loadInvoiceData,
  updateInvoice,
} from '@/features/invoice/services/invoiceFormService';
import { showAlert } from '@/utils/alert';
import { editPayload, fillNewInvoice, invoiceLine, makeInvoiceStore, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import InvoicesTab from '../../../app/(tabs)/invoices';
import InvoiceFormLayout from '../../../app/invoice-form/_layout';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';
import InvoiceFormStep2 from '../../../app/invoice-form/step2';
import InvoiceFormStep3 from '../../../app/invoice-form/step3';
import InvoiceEditOuterLayout from '../../../app/invoice-edit/_layout';
import InvoiceEditLayout from '../../../app/invoice-edit/[id]/_layout';
import InvoiceEditStep1 from '../../../app/invoice-edit/[id]/step1';
import InvoiceEditStep2 from '../../../app/invoice-edit/[id]/step2';
import InvoiceEditStep3 from '../../../app/invoice-edit/[id]/step3';

// expo-router's test mocks replace Reanimated with a mock that has no useReducedMotion, which the Review step's
// folding sections read.
(jest.requireMock('react-native-reanimated') as { useReducedMotion?: () => boolean }).useReducedMotion = () => false;

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true, canUpdate: true }) }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('@/components/lists', () => ({ InvoiceFlashList: () => null }));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getNextInvoiceNumber: jest.fn(),
  loadInvoiceFormData: jest.fn(),
  loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(),
  updateInvoice: jest.fn(),
  checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printInvoiceRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateInvoicePDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/features/invoice/components/items/InvoiceItemsEditor', () => ({ InvoiceItemsEditor: () => null }));
jest.mock('@/features/invoice/components/InvoiceCalculationSummary', () => ({ InvoiceCalculationSummary: () => null }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: 'InvoiceSuccessDialog' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
// Stand-ins that keep their props, so the test can read what they show and answer them.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
// The header's X asks "Discard this invoice?"; this stand-in is that question answered with "Discard".
jest.mock('@/components/InvoiceStepIndicator', () => {
  const { Pressable: Press, Text: Label } = jest.requireActual('react-native');
  return {
    invoiceSteps: () => [],
    InvoiceStepIndicator: ({ onCancel, backOnFirstStep }: { onCancel: () => void; backOnFirstStep?: { hasData: boolean; exitRoute: string; exitWith?: 'replace' | 'dismissTo' } }) => {
      // The real header listens for the Back key on step 1 of a new invoice with this.
      const { useFirstStepBack } = jest.requireActual('@/hooks/useFirstStepBack');
      useFirstStepBack({ enabled: !!backOnFirstStep, hasData: !!backOnFirstStep?.hasData, askToDiscard: onCancel, exitRoute: backOnFirstStep?.exitRoute ?? '/', exitWith: backOnFirstStep?.exitWith });
      return <Press testID="discard" onPress={onCancel}><Label>Discard</Label></Press>;
    },
  };
});

const as = (name: string) => name as unknown as React.ElementType;
let tree: ReactTestRenderer;
let backKey: ReturnType<typeof installHardwareBack>;
let numbers: number;

/** The page of the invoice, with the way into its edit form. */
const DetailsPage = () =>
  <Pressable testID="open-edit" onPress={() => router.push('/invoice-edit/inv-42/step1')}><Text>Edit</Text></Pressable>;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockStore = makeInvoiceStore();
  numbers = 54;
  // Every request for a number gets the next one: 55, then 56.
  jest.mocked(getNextInvoiceNumber).mockImplementation(async (finYear: string) =>
    ({ success: true, data: { next_invoice_number: ++numbers, financial_year: finYear } }));
  jest.mocked(checkGrnStillInvoiceable).mockResolvedValue({ ok: true } as never);
  jest.mocked(createInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'new-1', invoice_no: 55, total: 735 } } as never);
  jest.mocked(updateInvoice).mockResolvedValue({ success: true, data: { invoice_id: 'inv-42', invoice_no: 42, total: 735 } } as never);
  jest.mocked(loadInvoiceData).mockImplementation(async () => {
    const { header, items } = editPayload([invoiceLine()]);
    return { success: true, data: { header, items } } as never;
  });
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  backKey = installHardwareBack();
  const context = getMockContext({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    // expo-router 58 tabs show only the screens their layout declares (this context has these two tabs only).
    '(tabs)/_layout': () => (
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="invoices" />
      </Tabs>
    ),
    '(tabs)/index': () => null,
    '(tabs)/invoices': InvoicesTab,
    'invoice-details/[id]': DetailsPage,
    'invoice-form/_layout': InvoiceFormLayout,
    'invoice-form/step1': InvoiceFormStep1,
    'invoice-form/step2': InvoiceFormStep2,
    'invoice-form/step3': InvoiceFormStep3,
    'invoice-edit/_layout': InvoiceEditOuterLayout,
    'invoice-edit/[id]/_layout': InvoiceEditLayout,
    'invoice-edit/[id]/step1': InvoiceEditStep1,
    'invoice-edit/[id]/step2': InvoiceEditStep2,
    'invoice-edit/[id]/step3': InvoiceEditStep3,
  });
  await act(async () => {
    tree = create(<ExpoRoot context={context} location="/invoices" />);
  });
});

afterEach(async () => {
  await act(async () => { tree.unmount(); });
  backKey.restore();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const settle = async () => {
  await act(async () => { await jest.runAllTimersAsync(); });
};

/** The control with this testID or label on the screen that is in front (the last one drawn). */
const control = (testID: string) => {
  const found = tree.root.findAll((node) =>
    (node.props.testID === testID || node.props.accessibilityLabel === testID) && typeof node.props.onPress === 'function');
  if (found.length === 0) throw new Error(`No control ${testID}`);
  return found[found.length - 1];
};
const tap = async (testID: string) => {
  const pressable = control(testID);
  await act(async () => { pressable.props.onPress(); });
  await settle();
};
const go = async (href: string) => {
  await act(async () => { router.push(href as never); });
  await settle();
};
/** The routes of the root stack, with the steps of a wizard in it. */
const stack = () =>
  (routerStore.state!.routes[0].state?.routes ?? []).map((route) =>
    route.name.endsWith('-form') || route.name === 'invoice-edit'
      ? (route.state?.routes ?? []).flatMap((inner) => (inner.state?.routes ?? [inner]).map((step) => step.name))
      : route.name);
const pressBackKey = async () => {
  let taken = false;
  await act(async () => { taken = backKey.press(); });
  await settle();
  return taken;
};
const pathname = () => routerStore.getRouteInfo().pathname;
const form = () => mockStore.getState().invoiceForm;
/** The question of a ConfirmDialog that is open. */
const openDialog = () =>
  tree.root.findAllByType(as('ConfirmDialog')).filter((dialog) => dialog.props.visible)[0];
const successDialog = () => tree.root.findAllByType(as('InvoiceSuccessDialog')).filter((dialog) => dialog.props.isVisible)[0];

/** A new invoice with a GRN and one line, so that Next goes on. */
const openNewInvoice = async () => {
  await tap('create-invoice-fab');
  expect(pathname()).toBe('/invoice-form/step1');
  expect(form().header.inv_no).toBe(55);
  await act(async () => {
    fillNewInvoice(mockStore);
    mockStore.dispatch(updateHeader({ inv_date: '2026-10-05', inv_fin_year: '2026-27' }));
  });
};

/** An invoice opened for editing from its page. */
const openEdit = async () => {
  await go('/invoice-details/inv-42');
  await tap('open-edit');
  expect(pathname()).toBe('/invoice-edit/inv-42/step1');
};

describe('Back on step 2 of a new invoice', () => {
  it.each([
    ['the Back key', async () => { expect(await pressBackKey()).toBe(true); }],
    ['the Back button', async () => { await tap('Back to details'); }],
  ])('reaches step 1 with %s, and Next there checks step 1 again', async (_how, goBack) => {
    await openNewInvoice();
    await tap('Next: items');
    expect(pathname()).toBe('/invoice-form/step2');
    expect(form().currentStep).toBe(2);

    await goBack();

    expect(pathname()).toBe('/invoice-form/step1');
    expect(stack()).toEqual(['(tabs)', ['step1']]);
    expect(form().currentStep).toBe(1);

    // Step 1 is wrong now (a date in the future): Next must say so instead of going on.
    await act(async () => { mockStore.dispatch(updateHeader({ inv_date: '2099-01-01' })); });
    await tap('Next: items');

    expect(pathname()).toBe('/invoice-form/step1');
    expect(showAlert).toHaveBeenCalledWith('Check the invoice', expect.stringContaining('Cannot select a future date'));
    expect(stack()).toEqual(['(tabs)', ['step1']]);

    // Corrected, it goes on again.
    await act(async () => { mockStore.dispatch(updateHeader({ inv_date: '2026-10-05' })); });
    await tap('Next: items');
    expect(pathname()).toBe('/invoice-form/step2');
  });
});

describe('the swipe back', () => {
  const options = () => routerStore.navigationRef.current?.getCurrentOptions() as Record<string, unknown> | undefined;

  it('is off on the steps of a new invoice', async () => {
    await openNewInvoice();

    expect(options()).toMatchObject({ gestureEnabled: false });
  });

  it('is off on the steps of an edit', async () => {
    await openEdit();

    expect(options()).toMatchObject({ gestureEnabled: false });
  });
});

describe('"Create another invoice"', () => {
  it('leaves the stack as the Invoices tab and one step 1, with a number of its own', async () => {
    await openNewInvoice();
    await tap('Next: items');
    await tap('Next: review');
    expect(pathname()).toBe('/invoice-form/step3');
    expect(stack()).toEqual(['(tabs)', ['step1', 'step2', 'step3']]);
    await tap('Save invoice');
    expect(openDialog().props.title).toBe('Save invoice 55?');
    await act(async () => { await openDialog().props.onConfirm(); });
    // The invoice dialog opens once the question has finished closing.
    await act(async () => { tree.root.findAllByType(as('ConfirmDialog')).forEach((dialog) => dialog.props.onDismissed?.()); });
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(successDialog().props.isVisible).toBe(true);

    await act(async () => { successDialog().props.onCreateAnother(); });
    await settle();

    // Was [step1, step2, step3, step1]: a new step 1 pushed on top of the old ones.
    expect(pathname()).toBe('/invoice-form/step1');
    expect(stack()).toEqual(['(tabs)', ['step1']]);
    expect(form().header.gr_id).toBe('');
    expect(form().header.inv_no).toBe(56);
    expect(getNextInvoiceNumber).toHaveBeenCalledTimes(2);
  });
});

describe('leaving a new invoice asks the server for no number (R2-03)', () => {
  it.each([
    ['step 1', 0],
    ['step 2', 1],
    ['step 3', 2],
  ])('Cancel on %s makes no further request, also when the next one would fail', async (_step, forward) => {
    await openNewInvoice();
    for (let step = 0; step < forward; step += 1) {
      await tap(step === 0 ? 'Next: items' : 'Next: review');
    }
    expect(getNextInvoiceNumber).toHaveBeenCalledTimes(1);
    // Offline from here on: a request now would end in "Couldn't get an invoice number" on the Invoices tab.
    jest.mocked(getNextInvoiceNumber).mockRejectedValue(new Error('offline'));

    await tap('discard');

    expect(pathname()).toBe('/invoices');
    expect(getNextInvoiceNumber).toHaveBeenCalledTimes(1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('"View invoices" after a save makes no further request either', async () => {
    await openNewInvoice();
    await tap('Next: items');
    await tap('Next: review');
    await tap('Save invoice');
    await act(async () => { await openDialog().props.onConfirm(); });
    await act(async () => { tree.root.findAllByType(as('ConfirmDialog')).forEach((dialog) => dialog.props.onDismissed?.()); });
    jest.mocked(getNextInvoiceNumber).mockRejectedValue(new Error('offline'));

    await act(async () => { successDialog().props.onViewList(); });
    await settle();

    expect(pathname()).toBe('/invoices');
    expect(getNextInvoiceNumber).toHaveBeenCalledTimes(1);
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('a form opened again after leaving asks for its number once', async () => {
    await openNewInvoice();
    await tap('discard');
    expect(getNextInvoiceNumber).toHaveBeenCalledTimes(1);

    await tap('create-invoice-fab');

    expect(pathname()).toBe('/invoice-form/step1');
    expect(getNextInvoiceNumber).toHaveBeenCalledTimes(2);
    expect(form().header.inv_no).toBe(56);
  });
});

describe('Back on an empty step 1 of a new invoice', () => {
  it('leaves a single (tabs) in the stack, on the Invoices tab', async () => {
    await tap('create-invoice-fab');
    expect(pathname()).toBe('/invoice-form/step1');

    expect(await pressBackKey()).toBe(true);

    expect(pathname()).toBe('/invoices');
    expect(stack()).toEqual(['(tabs)']);
  });
});

describe('Back on step 1 of an edit', () => {
  it('leaves at once for the invoice\'s page when nothing was changed', async () => {
    await openEdit();

    expect(await pressBackKey()).toBe(true);

    expect(showAlert).not.toHaveBeenCalled();
    expect(pathname()).toBe('/invoice-details/inv-42');
    expect(stack()).toEqual(['(tabs)', 'invoice-details/[id]']);
  });

  it('asks "Discard changes to this invoice?" when something was changed, and stays until it is answered', async () => {
    await openEdit();
    await act(async () => { mockStore.dispatch(updateDiscount(10)); });

    expect(await pressBackKey()).toBe(true);

    expect(pathname()).toBe('/invoice-edit/inv-42/step1');
    expect(showAlert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = jest.mocked(showAlert).mock.calls[0];
    expect(title).toBe('Discard changes to this invoice?');
    expect(message).toBe('Your changes to this invoice will be lost.');
    expect(buttons!.map((button) => button.text)).toEqual(['Keep editing', 'Discard']);

    await act(async () => { buttons!.find((button) => button.text === 'Discard')!.onPress!(); });
    await settle();
    expect(pathname()).toBe('/invoice-details/inv-42');
    expect(stack()).toEqual(['(tabs)', 'invoice-details/[id]']);
  });
});

describe('leaving an edit', () => {
  it.each([
    ['step 1', 0],
    ['step 2', 1],
    ['step 3', 2],
  ])('Cancel on %s lands on the invoice\'s page, with nothing of the form left in the stack', async (_step, forward) => {
    await openEdit();
    for (let step = 0; step < forward; step += 1) {
      await tap(step === 0 ? 'Next: items' : 'Next: review');
    }

    await tap('discard');

    expect(pathname()).toBe('/invoice-details/inv-42');
    expect(stack()).toEqual(['(tabs)', 'invoice-details/[id]']);
    expect(form().invoice_id).toBeNull();
  });

  it('"View invoice" after an update lands on the invoice\'s page', async () => {
    await openEdit();
    await tap('Next: items');
    await tap('Next: review');
    expect(pathname()).toBe('/invoice-edit/inv-42/step3');
    await tap('Update invoice');
    expect(openDialog().props.title).toBe('Update invoice 42?');
    await act(async () => { await openDialog().props.onConfirm(); });
    // The invoice dialog opens once the question has finished closing.
    await act(async () => { tree.root.findAllByType(as('ConfirmDialog')).forEach((dialog) => dialog.props.onDismissed?.()); });
    expect(updateInvoice).toHaveBeenCalledTimes(1);
    expect(successDialog().props.isEditMode).toBe(true);

    await act(async () => { successDialog().props.onViewList(); });
    await settle();

    expect(pathname()).toBe('/invoice-details/inv-42');
    expect(stack()).toEqual(['(tabs)', 'invoice-details/[id]']);
  });
});
