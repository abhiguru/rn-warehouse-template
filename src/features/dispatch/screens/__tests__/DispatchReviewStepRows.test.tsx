/**
 * The dispatch review step's items: each is a memoized row with a stable
 * toggle, so opening one item draws that item alone again, not every item
 * (review finding P2F-UI-1). The list stays a plain ScrollView.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { formatIdentifier } from '@/i18n';

/** 20 items, each from its own GRN, so a drawn row can be told by the GRN number it formats. */
const item = (n: number) => ({
  unique_id: `u${n}`, grns_id: `g${n}`, grns_gr_no: `A${String(100 + n)}`, grns_date: '2026-09-01', grns_customer_name: 'Fictional Traders',
  grnItems_id: `l${n}`, grnItems_item_id: `i${n}`, grnItems_item_name: `Fictional item ${n}`, grnItems_quantity: 50, grnItems_stock: 40,
  grnItems_package_mark: `M${n}`, grnItems_rack: `R${n}`, grnItems_weight: 25, disp_quantity: 5,
});
const mockItems = Array.from({ length: 20 }, (_, n) => item(n));
const GRN_NUMBERS = new Set(mockItems.map((line) => line.grns_gr_no));

jest.mock('@/i18n', () => {
  const actual = jest.requireActual('@/i18n');
  return { ...actual, formatIdentifier: jest.fn(actual.formatIdentifier) };
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { disp_no: 'I0042', disp_date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders', registration: '', note: '' },
    items: mockItems,
    images: [],
    isSaving: false,
    isLoading: false,
    isCreateMode: true,
    dispatchId: null,
    submitForm: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
    addImageToForm: jest.fn(),
    updateImageStatus: jest.fn(),
    removeImageFromForm: jest.fn(),
    validationErrors: {},
  }),
}));

// Children are stand-ins that keep their props, so the test can press their buttons.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: 'SwipeableFormStep' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

async function render() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<DispatchReviewStep mode="create" />);
  });
  return tree;
}
/** The GRN numbers formatted since the last clear: the rows that were drawn. */
const rowsDrawn = () => new Set(jest.mocked(formatIdentifier).mock.calls.map(([value]) => value).filter((value) => GRN_NUMBERS.has(value as string)));
const header = (tree: ReactTestRenderer, n: number) =>
  tree.root.find((node) => typeof node.props.onPress === 'function' && node.props.accessibilityState?.expanded !== undefined && String(node.props.accessibilityLabel).includes(`Fictional item ${n},`));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('opening one item draws that item alone again', async () => {
  const tree = await render();
  expect(rowsDrawn()).toEqual(GRN_NUMBERS);
  expect(header(tree, 3).props.accessibilityState).toEqual({ expanded: false });
  jest.mocked(formatIdentifier).mockClear();

  await act(async () => { header(tree, 3).props.onPress(); });

  expect(header(tree, 3).props.accessibilityState).toEqual({ expanded: true });
  expect(header(tree, 4).props.accessibilityState).toEqual({ expanded: false });
  expect(rowsDrawn()).toEqual(new Set(['A103']));

  // And closing it again, the same.
  jest.mocked(formatIdentifier).mockClear();
  await act(async () => { header(tree, 3).props.onPress(); });
  expect(header(tree, 3).props.accessibilityState).toEqual({ expanded: false });
  expect(rowsDrawn()).toEqual(new Set(['A103']));
  await act(async () => { tree.unmount(); });
});
