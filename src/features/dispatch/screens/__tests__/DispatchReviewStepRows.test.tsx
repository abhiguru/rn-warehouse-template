/**
 * The dispatch review step's items are a table whose lines work out what they say about themselves once (screen-reader
 * label, GRN text): opening or closing a section, or a dialog opening, does not format a line again (review finding
 * P2F-UI-1; the lines no longer open since the Review was rebuilt, 2026-10-18).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { formatIdentifier } from '@/i18n';
import { reviewHeader, reviewLine } from '@/tests/helpers/dispatchReviewFixtures';

/** 20 items, each from its own GRN, so a drawn line can be told by the GRN number it formats. */
const mockItems = Array.from({ length: 20 }, (_, n) => reviewLine(n, { grn: `A${String(100 + n)}` }));
const GRN_NUMBERS = new Set(mockItems.map((line) => line.grns_gr_no));
const mockForm = {
  header: { ...reviewHeader },
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
  updateImageUploadStatus: jest.fn(),
  removeImageFromForm: jest.fn(),
  validationErrors: {},
};

jest.mock('@/i18n', () => {
  const actual = jest.requireActual('@/i18n');
  return { ...actual, formatIdentifier: jest.fn(actual.formatIdentifier) };
});
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
// A new object on every render, as the real hook gives; the items array is the same.
jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => ({ ...mockForm }) }));

// Children are stand-ins that keep their props, so the test can press their buttons.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  unpreparedDispatchPhotos: () => 'ready',
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
/** The GRN numbers formatted since the last clear: the lines that were worked out. */
const rowsDrawn = () => new Set(jest.mocked(formatIdentifier).mock.calls.map(([value]) => value).filter((value) => GRN_NUMBERS.has(value as string)));
const byTestId = (tree: ReactTestRenderer, id: string) => tree.root.find((node) => node.props.testID === id && typeof node.props.onPress === 'function');
const open = (tree: ReactTestRenderer, section: string) => byTestId(tree, `dispatch-review-section-${section}`).props.accessibilityState.expanded as boolean;

beforeEach(() => {
  jest.clearAllMocks();
});

it('opening and closing a section, and a dialog opening, format no line again', async () => {
  const tree = await render();
  // Every one of the 20 lines was worked out (not only the first)
  expect(rowsDrawn()).toEqual(GRN_NUMBERS);
  expect(open(tree, 'items')).toBe(true);
  expect(open(tree, 'details')).toBe(false);
  jest.mocked(formatIdentifier).mockClear();

  // Details opens, and ITEMS closes with it (one open at a time).
  await act(async () => { byTestId(tree, 'dispatch-review-section-details').props.onPress(); });
  expect(open(tree, 'details')).toBe(true);
  expect(open(tree, 'items')).toBe(false);
  expect(rowsDrawn().size).toBe(0);

  // And back.
  await act(async () => { byTestId(tree, 'dispatch-review-section-items').props.onPress(); });
  expect(open(tree, 'items')).toBe(true);
  expect(rowsDrawn().size).toBe(0);

  // The confirm dialog opens: no line is worked out again.
  await act(async () => { byTestId(tree, 'dispatch-review-submit').props.onPress(); });
  expect(tree.root.findAllByType('ConfirmDialog' as never)[0].props.visible).toBe(true);
  expect(rowsDrawn().size).toBe(0);
  await act(async () => { tree.unmount(); });
});
