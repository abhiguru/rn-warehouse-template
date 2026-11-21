/**
 * Invoice Review step in the four themes (Orange and the sample brand, light and dark), for a new invoice and for an edit: the
 * card sits on surface.card with the table outline, the bottom bar is the shared one, and there is exactly one
 * filled (brand.fill) button on the screen.
 */
import React from 'react';
import { registerSampleBrand, SAMPLE_BRAND } from '@/tests/helpers/sampleBrand';

registerSampleBrand(); // Orange plus the fictional sample brand (WH-141)
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { render, screen } from '@testing-library/react-native';
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
    useAppStore: hooks.useAppStore,
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/features/invoice/components/GRNAutocomplete', () => ({ GRNAutocomplete: () => null }));
jest.mock('@/features/invoice/components/InvoiceSuccessDialog', () => ({ InvoiceSuccessDialog: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));

type AnyStyle = StyleProp<ViewStyle & TextStyle>;
const flat = (style: unknown): Record<string, any> => (StyleSheet.flatten(typeof style === 'function' ? (style as (s: { pressed: boolean }) => AnyStyle)({ pressed: false }) : (style as AnyStyle)) ?? {}) as Record<string, any>;
const THEMES = BRANDS.flatMap((brand) => (['light', 'dark'] as const).map((mode) => [brand, mode] as const));

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
      await render(<Step />);
      // The sections draw their bodies a frame after the first draw: wait for them.
      await screen.findByText('Estimated total');

      // The card is a plain View with no role or text: its test id is the only way to reach it.
      const card = screen.getByTestId('invoice-review');
      expect(card).toHaveStyle({ backgroundColor: t.surface.card, borderColor: t.table.outline });

      const filled = screen.getAllByRole('button').filter((button) => flat(button.props.style).backgroundColor === t.brand.fill);
      expect(filled).toHaveLength(1);
      expect(filled[0]).toHaveAccessibleName(mode === 'edit' ? 'Save invoice' : 'Create invoice');

      expect(screen.getByText('Estimated total')).toHaveStyle({ color: t.text.primary });
    });
  });
});
