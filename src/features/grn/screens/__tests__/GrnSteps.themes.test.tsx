import React from 'react';
import { StyleSheet, View } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { GrnHeaderStep } from '@/features/grn/screens/GrnHeaderStep';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';

let mockTheme = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: mockTheme, grnForm: { items: [{ qty: 120, stock: 100 }] } }),
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
  isLoading: false,
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
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const));

function render(element: React.ReactElement, brand: string, mode: Mode) {
  mockTheme = { preference: mode, brand };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).join(''))
    .join('|');
}

describe.each(THEMES)('GRN wizard steps in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('renders the header step on the theme background with token error colours', () => {
    const tree = render(<GrnHeaderStep mode="edit" />, brand, mode);
    const root = tree.root.findAllByType(View)[0];
    expect(StyleSheet.flatten(root.props.style).backgroundColor).toBe(t.background.base);
    const text = allText(tree);
    expect(text).toContain('Some items are already dispatched');
    const error = tree.root.findAll(
      node => (node.type as unknown) === 'Text' && node.props.children === 'Select a supervisor.'
    )[0];
    expect(StyleSheet.flatten(error.props.style).color).toBe(t.status.negative.text);
    act(() => tree.unmount());
  });

  it('renders the review step with edit links and the item cell', () => {
    const tree = render(<GrnReviewStep mode="edit" />, brand, mode);
    const text = allText(tree);
    expect(text).toContain('GRN DETAILS');
    expect(text).toContain('Potatoes');
    expect(text).toContain('Dispatched');
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Edit GRN details' && typeof node.props.onPress === 'function').length).toBeGreaterThan(0);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Edit items' && typeof node.props.onPress === 'function').length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
});
