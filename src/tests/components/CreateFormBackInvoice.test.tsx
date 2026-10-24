/**
 * New invoice, step 1: the Android Back key asks "Discard this invoice?", the
 * question of the X in the header, once something was entered, and "Discard"
 * does what the X's does (owner decision 7 of 2026-10-11). The header is the
 * real one. Step 2 still goes back one step.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { resetSheetBack, sheetBackPresses } from '@/tests/helpers/backClosingSheet';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';
import InvoiceFormStep2 from '../../../app/invoice-form/step2';

const emptyHeader = () => ({
  // Filled in by the form itself when a new invoice opens: today's date and the suggested number.
  inv_date: '2026-10-11', inv_fin_year: '2026-27', inv_no: 55, inv_no_typed: false,
  customer_id: '', customer_name: '', gr_id: '', gr_no: '', one_time_charge: false,
});
const mockForm = {
  header: emptyHeader(),
  items: [] as unknown[],
  itemOverrides: {},
  editedItems: {},
  bulkPricing: {},
  invoiceId: null,
  isChanged: false,
  savedGrId: null,
  isLoading: false,
  isLoadingItems: false,
  nextNumberFailed: false,
  validationErrors: {},
  updateHeaderField: jest.fn(),
  updateHeaderFields: jest.fn(),
  updateItemPricing: jest.fn(),
  applyGroupPricing: jest.fn(),
  loadGRNData: jest.fn(),
  clearFieldValidationError: jest.fn(),
  validateField: jest.fn(),
  suggestNumberIfEmpty: jest.fn(() => false),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
};
jest.mock('@/hooks/useInvoiceForm', () => ({ useInvoiceForm: () => mockForm }));
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({ invoiceForm: { items: [], editedItems: {}, bulkPricing: {}, header: {} } }), subscribe: () => () => undefined, dispatch: jest.fn() }),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => {
  const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismiss: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    router: mockRouter,
    useRouter: () => mockRouter,
    useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
  };
});
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
// Draws nothing here, but while open it listens for Back (on a phone it is a Modal, which takes Back itself).
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({
  GRNAutocomplete: require('@/tests/helpers/backClosingSheet').flagSheet('grn'),
}));
jest.mock('@/features/invoice/components/items/InvoiceItemsEditor', () => ({ InvoiceItemsEditor: () => null }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn() }));

let back: ReturnType<typeof installHardwareBack>;
beforeEach(() => {
  jest.clearAllMocks();
  mockForm.header = emptyHeader();
  mockForm.items = [];
  resetSheetBack();
  back = installHardwareBack();
});
afterEach(() => back.restore());

async function render(element: React.ReactElement = <InvoiceFormStep1 />) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
}
const pressBack = async () => {
  let taken = false;
  await act(async () => { taken = back.press(); });
  return taken;
};
const question = () => {
  const [title, message, buttons, options] = jest.mocked(showAlert).mock.calls.at(-1)!;
  return { title, message, buttons: buttons!.map((button) => ({ text: button.text, style: button.style })), options };
};
const answer = async (text: string) => {
  const button = jest.mocked(showAlert).mock.calls.at(-1)![2]!.find((candidate) => candidate.text === text)!;
  await act(async () => { button.onPress?.(); });
};
const chooseGrn = () => {
  Object.assign(mockForm.header, { gr_id: 'g1', gr_no: 'A0010', customer_id: 'c1', customer_name: 'Example Traders' });
  mockForm.items = [{ temp_id: 't1', item_id: 'i1', item_name: 'Example Potatoes', package_mark: 'M1', qty: 100, charge: 5, labour_rate: 2, tax: 5, duration: 1 }];
};

describe('Back on step 1 of a new invoice', () => {
  it('leaves for the invoice list at once while only the suggested number and today\'s date are in the form', async () => {
    const tree = await render();

    expect(await pressBack()).toBe(true);

    expect(showAlert).not.toHaveBeenCalled();
    // Taken off the stack back to the tab: a replace left two (tabs) entries.
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/invoices');
    expect(router.replace).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it.each([
    ['a GRN was chosen', chooseGrn],
    ['an invoice number was typed', () => { mockForm.header.inv_no = 7301; mockForm.header.inv_no_typed = true; }],
  ])('asks "Discard this invoice?" and stays when %s', async (_what, enter) => {
    enter();
    const tree = await render();

    expect(await pressBack()).toBe(true);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toEqual({
      title: 'Discard this invoice?',
      message: 'The details you entered for this invoice will be lost.',
      buttons: [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive' }],
      options: { cancelable: true },
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('asks exactly what the X asks, and "Discard" does what the X\'s does', async () => {
    chooseGrn();
    const tree = await render();
    const close = tree.root.find((node) => node.props.accessibilityLabel === 'Cancel Invoice' && typeof node.props.onPress === 'function');

    // The X: its question, then what its "Discard" does.
    await act(async () => { close.props.onPress(); });
    const fromX = question();
    await answer('Discard');
    const afterX = {
      reset: mockForm.resetFormState.mock.calls.length,
      // The Invoices tab, named (src/tests/navigation/InvoiceFormStack.test.tsx).
      dismissTo: jest.mocked(router.dismissTo).mock.calls,
      back: jest.mocked(router.back).mock.calls.length,
      replace: jest.mocked(router.replace).mock.calls,
    };
    expect(afterX).toEqual({ reset: 1, dismissTo: [['/(tabs)/invoices']], back: 0, replace: [] });
    jest.clearAllMocks();

    // Back: the same question, and the same on "Discard".
    await pressBack();
    expect(question()).toEqual(fromX);
    await answer('Discard');
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/invoices');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('"Keep editing" stays on the form with everything in it', async () => {
    chooseGrn();
    const tree = await render();
    await pressBack();

    await answer('Keep editing');

    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('listens for Back once', async () => {
    const tree = await render();

    expect(back.count()).toBe(1);
    await act(async () => { tree.unmount(); });
    expect(back.count()).toBe(0);
  });
});

describe('Back on step 1 of a new invoice while the GRN picker is open', () => {
  const openPicker = async (tree: ReactTestRenderer, label: string) => {
    const field = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    await act(async () => { field.props.onPress(); });
  };
  const drawAgain = async (tree: ReactTestRenderer) => {
    await act(async () => { tree.update(<InvoiceFormStep1 />); });
  };

  it('the picker takes Back: it closes, and the form asks nothing', async () => {
    chooseGrn();
    const tree = await render();
    await openPicker(tree, 'GRN A0010. Change GRN');
    await drawAgain(tree);
    await drawAgain(tree);

    expect(await pressBack()).toBe(true);

    expect(sheetBackPresses).toEqual(['grn']);
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();

    // The picker is closed now, so the next Back is the form's.
    expect(await pressBack()).toBe(true);
    expect(sheetBackPresses).toEqual(['grn']);
    expect(question().title).toBe('Discard this invoice?');
    await act(async () => { tree.unmount(); });
  });

  it('the picker takes Back in an empty form too: the form is not left', async () => {
    const tree = await render();
    await openPicker(tree, 'Select GRN');
    await drawAgain(tree);

    expect(await pressBack()).toBe(true);

    expect(sheetBackPresses).toEqual(['grn']);
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});

describe('Back on step 2 of a new invoice', () => {
  it('goes to step 1 without a question, also with a GRN chosen', async () => {
    chooseGrn();
    const tree = await render(<InvoiceFormStep2 />);

    expect(await pressBack()).toBe(true);

    expect(showAlert).not.toHaveBeenCalled();
    // To the step 1 already in the stack (src/tests/navigation/InvoiceFormStack.test.tsx).
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/invoice-form/step1');
    expect(router.replace).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
