/**
 * Invoice Review step in the four themes (Orange and GCSA, light and dark), for a new invoice and for an edit: the
 * card sits on surface.card with the table outline, the bottom bar is the shared one, and there is exactly one
 * filled (brand.fill) button on the screen.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens } from '@/theme/tokens';
import { fillNewInvoice, groupLines, makeInvoiceStore, openForEdit, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { updateHeader } from '@/store/slices/invoiceFormSlice';
import InvoiceFormStep3 from '../../../../../app/invoice-form/step3';
import InvoiceEditStep3 from '../../../../../app/invoice-edit/[id]/step3';
import InvoiceFormStep1 from '../../../../../app/invoice-form/step1';
import InvoiceEditStep1 from '../../../../../app/invoice-edit/[id]/step1';

let mockStore: InvoiceStore;
let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => {
  const hooks = require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore);
  return {
    useAppDispatch: hooks.useAppDispatch,
    useAppSelector: (selector: (state: Record<string, unknown>) => unknown) => hooks.useAppSelector((state: Record<string, unknown>) => selector({ ...state, theme: mockTheme })),
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));

const flat = (style: unknown): Record<string, any> => (StyleSheet.flatten(typeof style === 'function' ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style) ?? {}) as Record<string, any>;
const MODES = [['create', 'step'], ['edit', 'step']] as const;
const THEMES = BRANDS.flatMap((brand) => (['light', 'dark'] as const).map((mode) => [brand, mode] as const));

let tree: ReactTestRenderer;

describe.each([['create', InvoiceFormStep3], ['edit', InvoiceEditStep3]] as const)('the %s Review step', (mode, Step) => {
  describe.each(THEMES)('%s %s', (brand, themeMode) => {
    it('uses the theme tokens and shows one filled button', async () => {
      mockTheme = { preference: themeMode, brand };
      const t = getTokens(brand, themeMode);
      mockStore = makeInvoiceStore();
      if (mode === 'edit') openForEdit(mockStore, groupLines(2));
      else {
        fillNewInvoice(mockStore, groupLines(2));
        mockStore.dispatch(updateHeader({ inv_no: 42, inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no_typed: true }));
      }
      await act(async () => { tree = create(<Step />); });

      const card = tree.root.find((node) => node.props.testID === 'invoice-review' && typeof node.type === 'string');
      expect(flat(card.props.style).backgroundColor).toBe(t.surface.card);
      expect(flat(card.props.style).borderColor).toBe(t.table.outline);

      const filled = tree.root.findAll((node) => typeof node.props.onPress === 'function' && flat(node.props.style).backgroundColor === t.brand.fill);
      expect(filled).toHaveLength(1);
      expect(filled[0].props.accessibilityLabel).toBe(mode === 'edit' ? 'Update invoice' : 'Save invoice');

      const total = tree.root.findAllByType(Text).find((node) => node.props.children === 'Estimated total');
      expect(flat(total!.props.style).color).toBe(t.text.primary);
      await act(async () => { tree.unmount(); });
    });
  });
});
