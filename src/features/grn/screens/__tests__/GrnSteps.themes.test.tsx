import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { GrnHeaderStep } from '@/features/grn/screens/GrnHeaderStep';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';

let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: mockTheme, auth: { userProfile: { id: 'u1' } }, grnForm: { items: [{ qty: 120, stock: 100 }] } }),
}));

const mockForm = {
  header: {
    gr_no: 'A0002',
    date: '2026-09-30T00:00:00Z',
    sender_name: 'Patel Traders',
    customer_name: 'Patel Traders',
    supervisor_name: '',
    registration: 'GJ01AB1234',
    note: '',
    leon: true,
    pricing_mode: 'MONTHLY',
    gr_images: [],
  },
  items: [
    { grn_trl_id: 't1', item_table_id: 'i1', item_name: 'Potatoes', packaging: 'Bag', qty: 120, stock: 100, weight: 50.5, rack: 'B-14', package_mark: 'PT', trl_images: [] },
  ],
  isSaving: false,
  isGeneratingNumber: false,
  isCreateMode: false,
  validationErrors: { supervisor_id: 'Select a supervisor.' },
  grnId: 'g1',
  tempGrnId: null,
  handleGrNoChange: jest.fn(),
  updateHeaderField: jest.fn(),
  updateHeaderFields: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
};

jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/features/grn/rates/useGrnRates', () => require('@/tests/helpers/grnRatesMock').grnRatesModuleMock());
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-paper', () => ({ Snackbar: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: require('react').forwardRef(() => null) }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: () => null }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: () => null }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn() }));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(), withoutStoredNumberError: (result: unknown) => result }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

// The old check read every Text; the card header may be hidden from the screen reader.
const everything = { includeHiddenElements: true } as const;
const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

describe.each(THEMES)('GRN wizard steps in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  beforeEach(() => {
    mockTheme = { preference: mode, brand };
  });

  it('renders the header step on the theme background with token error colours', async () => {
    await render(<GrnHeaderStep mode="edit" />);
    expect(screen.root).toHaveStyle({ backgroundColor: t.background.base });
    expect(screen.getByText('Some items are already dispatched')).toBeOnTheScreen();
    expect(screen.getByText('Select a supervisor.')).toHaveStyle({ color: t.status.negative.text });
  });

  it('renders the review step with edit links and the item cell', async () => {
    await render(<GrnReviewStep mode="edit" />);
    expect(screen.getByText('GRN DETAILS', everything)).toBeOnTheScreen();
    expect(screen.getByText('Potatoes')).toBeOnTheScreen();
    expect(screen.getByText('Quantity locked')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Edit GRN details' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Edit items' }).length).toBeGreaterThan(0);
  });
});
