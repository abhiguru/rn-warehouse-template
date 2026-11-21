/**
 * The dispatch review step's items are a table whose lines work out what they say about themselves once (screen-reader
 * label, GRN text): opening or closing a section, or a dialog opening, does not format a line again (review finding
 * P2F-UI-1; the lines no longer open since the Review was rebuilt, 2026-10-18).
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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
// The confirm dialog is a stand-in that draws its title while it is open.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string }) =>
    props.visible ? require('react').createElement(require('react-native').Text, { accessibilityRole: 'alert' }, props.title) : null,
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

/** The GRN numbers formatted since the last clear: the lines that were worked out. */
const rowsDrawn = () => new Set(jest.mocked(formatIdentifier).mock.calls.map(([value]) => value).filter((value) => GRN_NUMBERS.has(value as string)));
const toggle = (section: 'items' | 'details') => screen.getByRole('button', { name: section === 'items' ? /^Items/ : /^Dispatch details/ });

beforeEach(() => {
  jest.clearAllMocks();
});

it('opening and closing a section, and a dialog opening, format no line again', async () => {
  const user = userEvent.setup({ delay: 0 });
  await render(<DispatchReviewStep mode="create" />);
  // Every one of the 20 lines was worked out (not only the first)
  expect(rowsDrawn()).toEqual(GRN_NUMBERS);
  expect(toggle('items')).toBeExpanded();
  expect(toggle('details')).toBeCollapsed();
  jest.mocked(formatIdentifier).mockClear();

  // Details opens, and ITEMS closes with it (one open at a time).
  await user.press(toggle('details'));
  expect(toggle('details')).toBeExpanded();
  expect(toggle('items')).toBeCollapsed();
  expect(rowsDrawn().size).toBe(0);

  // And back.
  await user.press(toggle('items'));
  expect(toggle('items')).toBeExpanded();
  expect(rowsDrawn().size).toBe(0);

  // The confirm dialog opens: no line is worked out again.
  await user.press(screen.getByRole('button', { name: 'Create dispatch' }));
  expect(screen.getByText('Create dispatch I0042?')).toBeOnTheScreen();
  expect(rowsDrawn().size).toBe(0);
});
