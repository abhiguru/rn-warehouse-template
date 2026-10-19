/**
 * Invoice Details step (step 1) in the four themes, for a new invoice and for an edit: the read-only fields are the
 * style guide's (§10, §13.2: `surface.fieldReadOnly`, no border, the value in `text.primary`, which the token tests
 * hold above the guide's text contrast), the content ends clear of the bottom bar, and the bar is the shared one with
 * Next only (no Back on step 1).
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, space } from '@/theme/tokens';
import { AA, contrastRatio } from '@/theme/tokens/contrast';
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

describe.each([['create', InvoiceFormStep1], ['edit', InvoiceEditStep1]] as const)('the %s Details step', (mode, Step) => {
  describe.each(THEMES)('%s %s', (brand, themeMode) => {
    it('draws read-only fields as the guide says, content clear of the bar, and Next alone', async () => {
      mockTheme = { preference: themeMode, brand };
      const t = getTokens(brand, themeMode);
      mockStore = makeInvoiceStore();
      if (mode === 'edit') openForEdit(mockStore, groupLines(1));
      else {
        fillNewInvoice(mockStore, groupLines(1));
        mockStore.dispatch(updateHeader({ inv_no: 42, inv_date: '2026-10-05', inv_fin_year: '2026-27', inv_no_typed: true }));
      }
      await act(async () => { tree = create(<Step />); });

      const readOnly = tree.root.findAll((node) => typeof node.type === 'string' && flat(node.props.style).backgroundColor === t.surface.fieldReadOnly);
      // Financial year, Customer and One-time charge.
      expect(readOnly).toHaveLength(3);
      // The guide's read-only field has no border (and never borrows the outline of a secondary button).
      readOnly.forEach((node) => {
        expect(flat(node.props.style).borderWidth).toBeFalsy();
        expect(flat(node.props.style).borderColor).toBeUndefined();
        expect(flat(node.props.style).borderColor).not.toBe(t.border.button);
      });
      expect(contrastRatio(t.text.primary, t.surface.fieldReadOnly)).toBeGreaterThanOrEqual(AA.text);
      const customer = tree.root.findAllByType(Text).find((node) => node.props.children === 'Example Traders');
      expect(flat(customer!.props.style).color).toBe(t.text.primary);

      // The content has room under it for the bar, beyond the usual end padding.
      const scroll = tree.root.find((node) => typeof node.type === 'string' && (node.type as unknown) === 'KeyboardAwareScrollView');
      expect(flat(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThan(space.xxl);

      const labels = tree.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function').map((node) => node.props.accessibilityLabel);
      expect(labels).toContain('Next: items');
      expect(labels).not.toContain('Back');
      await act(async () => { tree.unmount(); });
    });
  });
});
