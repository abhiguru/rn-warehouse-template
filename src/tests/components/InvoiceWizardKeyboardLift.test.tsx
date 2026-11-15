/**
 * WH-228: on the invoice wizard's first step the real WizardBottomBar is lifted by the part the keyboard covers
 * (useKeyboardCoverLift). The step, the store and the bar are real; the keyboard and the window are stand-ins.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { fillNewInvoice, groupLines, makeInvoiceStore, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { updateHeader } from '@/store/slices/invoiceFormSlice';
import { wizardKeyboardLiftCases } from '@/tests/helpers/wizardKeyboardLift';
import InvoiceFormStep1 from '../../../app/invoice-form/step1';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => {
  const hooks = require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore);
  return {
    useAppDispatch: hooks.useAppDispatch,
    useAppStore: hooks.useAppStore,
    useAppSelector: (selector: (state: Record<string, unknown>) => unknown) =>
      hooks.useAppSelector((state: Record<string, unknown>) => selector({ ...state, theme: { preference: 'light', brand: 'orange' } })),
  };
});
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: 'staff' }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getNextInvoiceNumber: jest.fn(), loadInvoiceFormData: jest.fn(), loadInvoiceData: jest.fn(),
  createInvoice: jest.fn(), updateInvoice: jest.fn(), checkGrnStillInvoiceable: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));

describe('Invoice wizard, details step: the bottom bar and the keyboard', () => {
  wizardKeyboardLiftCases(async () => {
    mockStore = makeInvoiceStore();
    fillNewInvoice(mockStore, groupLines(1));
    mockStore.dispatch(updateHeader({ inv_no: 42, inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no_typed: true }));
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<InvoiceFormStep1 />); });
    return tree;
  });
});
