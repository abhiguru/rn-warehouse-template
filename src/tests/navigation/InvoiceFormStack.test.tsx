/**
 * Review 2026-10-13 (invoice form): Discard on step 1 of a new invoice showed a
 * blank step 1, and a second Back reached the Invoices tab.
 *
 * Here the real expo-router stack runs (the in-memory route context of
 * expo-router's own testing library) with the real Invoices tab, the real
 * invoice-form layout and steps 1 and 2, and the real useInvoiceForm on a real
 * invoice-form slice. The step header is a stand-in that offers the "Discard"
 * of its question; step 2 is the real one (its table left out) with its two ways
 * back: the Back button (useInvoiceForm's navigateToStep(1)) and the Android Back
 * key (the real useBackHandler).
 *
 * The cause found: every way back from step 2 to step 1 added a second step-1
 * entry ([step1, step2, step1] by the Back button; [step1, step1] by the Back
 * key, which useBackHandler turned into `router.replace(step1)`), and a second
 * tap on "Create invoice" did the same. Discard did `router.back()`, which only
 * took off the top entry and showed the step 1 under it, whose form had just
 * been reset.
 *
 * The GRN and dispatch create forms use the same Back-key handling on their
 * later steps; their real step-2 routes run here too, with the step's content
 * left out.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import 'expo-router/build/testing-library/mocks';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { store as routerStore } from 'expo-router/build/global-state/router-store';
import { router, Stack, Tabs } from 'expo-router';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import invoiceFormReducer, { setItems, updateHeader } from '@/store/slices/invoiceFormSlice';
import { getNextInvoiceNumber } from '@/features/invoice/services/invoiceFormService';
import InvoicesTab from '../../../app/(tabs)/invoices';
import InvoiceFormLayout from '../../../app/invoice-form/_layout';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';
import InvoiceFormStep2 from '../../../app/invoice-form/step2';
import GRNFormStep2 from '../../../app/grn-form/step2';
import DispatchFormStep2 from '../../../app/dispatch-form/step2';

// ---------------------------------------------------------------------------
// The store: the real invoice-form slice, read through the app's hooks.
// ---------------------------------------------------------------------------
const makeStore = () =>
  configureStore({
    reducer: {
      invoiceForm: invoiceFormReducer,
      auth: () => ({ userProfile: null }),
      theme: () => ({ preference: 'light', brand: 'orange' }),
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
let mockStore = makeStore();
jest.mock('@/store/hooks', () => {
  const { useSyncExternalStore } = require('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppStore: () => mockStore,
    useAppSelector: (selector: (state: ReturnType<typeof mockStore.getState>) => unknown) =>
      useSyncExternalStore(mockStore.subscribe, () => selector(mockStore.getState())),
  };
});

jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: true }) }));
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
jest.mock('@/features/grn/screens/GrnItemsStep', () => () => null);
jest.mock('@/features/dispatch/screens', () => ({ DispatchItemsStep: () => null }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/features/invoice/components/items/InvoiceItemsEditor', () => ({ InvoiceItemsEditor: () => null }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
// The header's X asks "Discard this invoice?" (CreateFormBackInvoice.test.tsx);
// this stand-in is that question answered with "Discard".
jest.mock('@/components/InvoiceStepIndicator', () => {
  const { Pressable: Press, Text: Label } = jest.requireActual('react-native');
  return {
    invoiceSteps: () => [],
    InvoiceStepIndicator: ({ onCancel }: { onCancel: () => void }) => (
      <Press testID="discard" onPress={onCancel}><Label>Discard</Label></Press>
    ),
  };
});

const NEXT = 'Next: items';
const GRN = '11111111-2222-4333-8444-555555555555';
const CUSTOMER = '22222222-3333-4444-8555-666666666666';
const LINE = '33333333-4444-4555-8666-777777777777';

/** A tab that opens a create form, and that form's step 1, which goes on to step 2. */
const opener = (testID: string, href: '/grn-form/step1' | '/dispatch-form/step1') => () =>
  <Pressable testID={testID} onPress={() => router.push(href)}><Text>Create</Text></Pressable>;
const firstStep = (testID: string, href: '/grn-form/step2' | '/dispatch-form/step2') => () =>
  <Pressable testID={testID} onPress={() => router.push(href)}><Text>Next</Text></Pressable>;

let tree: ReactTestRenderer;
let backKey: ReturnType<typeof installHardwareBack>;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockStore = makeStore();
  jest.mocked(getNextInvoiceNumber).mockImplementation(async (finYear: string) =>
    ({ success: true, data: { next_invoice_number: 55, financial_year: finYear } }));
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  backKey = installHardwareBack();
  const context = getMockContext({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    '(tabs)/_layout': () => <Tabs screenOptions={{ headerShown: false }} />,
    '(tabs)/index': () => null,
    '(tabs)/invoices': InvoicesTab,
    'invoice-form/_layout': InvoiceFormLayout,
    'invoice-form/step1': InvoiceFormStep1,
    'invoice-form/step2': InvoiceFormStep2,
    'invoice-form/step3': () => null,
    '(tabs)/grn': opener('create-grn', '/grn-form/step1'),
    'grn-form/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    'grn-form/step1': firstStep('grn-next', '/grn-form/step2'),
    'grn-form/step2': GRNFormStep2,
    '(tabs)/dispatch': opener('create-dispatch', '/dispatch-form/step1'),
    'dispatch-form/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    'dispatch-form/step1': firstStep('dispatch-next', '/dispatch-form/step2'),
    'dispatch-form/step2': DispatchFormStep2,
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
const tap = async (testID: string, times = 1) => {
  const pressable = control(testID);
  await act(async () => {
    for (let i = 0; i < times; i += 1) pressable.props.onPress();
  });
  await settle();
};

/** The routes of the root stack, with the steps of a create form in it. */
const stack = () =>
  (routerStore.state!.routes[0].state?.routes ?? []).map((route) =>
    route.name.endsWith('-form') ? (route.state?.routes ?? []).map((step) => step.name) : route.name);
/** Presses the Android Back key; true when a screen took it. */
const pressBackKey = async () => {
  let taken = false;
  await act(async () => { taken = backKey.press(); });
  await settle();
  return taken;
};
const pathname = () => routerStore.getRouteInfo().pathname;

/** A new invoice with a GRN and one line, so that Next goes on. */
const fillForm = async () => {
  await act(async () => {
    mockStore.dispatch(updateHeader({
      gr_id: GRN, gr_no: 'A0010', customer_id: CUSTOMER, customer_name: 'Example Traders', one_time_charge: false,
    }));
    mockStore.dispatch(setItems([{
      temp_id: 't1', disp_trl_id: LINE, grn_item_id: 'g1', item_name: 'Example Potatoes',
      qty: 10, charge: 5, labour_rate: 2, tax: 5, duration: 1, no_of_days: 30,
    }] as never));
  });
};

const openNewInvoice = async () => {
  await tap('create-invoice-fab');
  expect(pathname()).toBe('/invoice-form/step1');
  expect(mockStore.getState().invoiceForm.header.inv_no).toBe(55);
  await fillForm();
};

describe('Discard on step 1 of a new invoice', () => {
  it('lands on the Invoices tab after the Back key on step 2, which no longer adds a step-1 entry', async () => {
    await openNewInvoice();
    await tap(NEXT);
    expect(pathname()).toBe('/invoice-form/step2');

    expect(await pressBackKey()).toBe(true);
    // Was [step1, step1]: the double entry this review reproduced on the phone.
    expect(stack()).toEqual(['(tabs)', ['step1']]);
    expect(pathname()).toBe('/invoice-form/step1');

    await tap('discard');

    expect(pathname()).toBe('/invoices');
    expect(stack()).toEqual(['(tabs)']);
  });

  it('lands on the Invoices tab after step 2\'s Back button, which no longer adds a step-1 entry', async () => {
    await openNewInvoice();
    await tap(NEXT);

    await tap('Back to details');
    expect(stack()).toEqual(['(tabs)', ['step1']]);

    await tap('discard');
    expect(pathname()).toBe('/invoices');
    expect(stack()).toEqual(['(tabs)']);
  });
});

describe('a double tap', () => {
  it('on "Create invoice" opens one new invoice, and its suggested number stays', async () => {
    await tap('create-invoice-fab', 2);

    expect(stack()).toEqual(['(tabs)', ['step1']]);
    expect(mockStore.getState().invoiceForm.header.inv_no).toBe(55);
  });

  it('on "Create invoice", the second tap landing after the form opened, opens one new invoice', async () => {
    await tap('create-invoice-fab');
    await tap('create-invoice-fab');

    expect(stack()).toEqual(['(tabs)', ['step1']]);
    // A second reset would have emptied the number the form asked for, and it is not asked again.
    expect(mockStore.getState().invoiceForm.header.inv_no).toBe(55);
  });

  it('on Next opens step 2 once', async () => {
    await openNewInvoice();

    await tap(NEXT, 2);

    expect(stack()).toEqual(['(tabs)', ['step1', 'step2']]);
  });

  it('on Next, the second tap landing after step 2 opened, opens step 2 once', async () => {
    await openNewInvoice();

    await tap(NEXT);
    await tap(NEXT);

    expect(stack()).toEqual(['(tabs)', ['step1', 'step2']]);
  });
});

describe.each([
  ['GRN', '/grn', 'create-grn', 'grn-next', '/grn-form/step2', '/grn-form/step1'],
  ['dispatch', '/dispatch', 'create-dispatch', 'dispatch-next', '/dispatch-form/step2', '/dispatch-form/step1'],
] as const)('the Back key on step 2 of a new %s', (_form, tab, create, next, second, first) => {
  it('returns to the step 1 already in the stack', async () => {
    // The app opens on the Invoices tab; its own tab is drawn once it is chosen.
    await act(async () => { router.navigate(tab); });
    await settle();
    await tap(create);
    await tap(next);
    expect(pathname()).toBe(second);

    expect(await pressBackKey()).toBe(true);

    expect(pathname()).toBe(first);
    expect(stack()).toEqual(['(tabs)', ['step1']]);
  });
});
