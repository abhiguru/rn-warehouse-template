/**
 * The dispatch review step in all four themes (brand x mode), in a new dispatch and in an edited one whose stock read
 * failed: every surface and text colour comes from a token, never a literal or a brand fill.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { reviewHeader, reviewLine } from '@/tests/helpers/dispatchReviewFixtures';

let mockState = { theme: { preference: 'light', brand: 'orange' } };
const mockForm = {
  header: { ...reviewHeader },
  items: [reviewLine(1), reviewLine(2)] as ReturnType<typeof reviewLine>[],
  images: [],
  isSaving: false,
  isLoading: false,
  isCreateMode: true,
  dispatchId: 'd1',
  submitForm: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
  addImageToForm: jest.fn(),
  updateImageUploadProgress: jest.fn(),
  updateImageUploadStatus: jest.fn(),
  removeImageFromForm: jest.fn(),
  validationErrors: {},
};

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 891, scale: 2.6, fontScale: 1 }),
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
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

const MODES: Mode[] = ['light', 'dark'];
const THEMES = BRANDS.flatMap((brand) => MODES.map((mode) => [brand, mode] as const));

type El = ReturnType<typeof screen.getByText>;
const renderIn = async (brand: string, mode: Mode, step: 'create' | 'edit') => {
  mockState = { theme: { preference: mode, brand } };
  mockForm.isCreateMode = step === 'create';
  await render(<DispatchReviewStep mode={step} />);
};
afterEach(() => {
  jest.restoreAllMocks();
});

const styleOf = (node: El) => StyleSheet.flatten(node.props.style) ?? {};
// The table card, the ITEMS block and the bottom bar button have no role or label that names them: found by testID.
const byTestId = (id: string) => screen.getByTestId(id);
const textNamed = (text: string) => screen.getAllByText(text, { includeHiddenElements: true })[0];
/** The nearest element above `node` (itself included) that paints a background. */
const surfaceOf = (node: El): El => {
  let current: El = node;
  while (styleOf(current).backgroundColor === undefined) current = current.parent!;
  return current;
};

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
/** The test ids of every element that fills its background with `color`. Nothing else lists elements by style. */
const filledWith = (color: string): unknown[] => {
  const found: unknown[] = [];
  const walk = (node: Json | string | null) => {
    if (!node || typeof node === 'string') return;
    if ((StyleSheet.flatten(node.props.style as never) as { backgroundColor?: string } | undefined)?.backgroundColor === color) found.push(node.props.testID);
    node.children?.forEach(walk);
  };
  [screen.toJSON()].flat().forEach((node) => walk(node as Json | null));
  return found;
};

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('a new dispatch: the card is surface.card, the open ITEMS section table.insetFill, the total in text.primary', async () => {
    await renderIn(brand, mode, 'create');

    expect(byTestId('dispatch-review-table')).toHaveStyle({ backgroundColor: t.surface.card, borderColor: t.table.outline });
    // ITEMS is the open section; its block is the section node that holds the body.
    expect(styleOf(surfaceOf(byTestId('dispatch-review-body-items'))).backgroundColor).toBe(t.table.insetFill);
    expect(textNamed('Total')).toHaveStyle({ color: t.text.primary });
    // The weight and stock tags are neutral status tags.
    expect(textNamed('50 kg each')).toHaveStyle({ color: t.status.neutral.text });
    expect(styleOf(surfaceOf(textNamed('35 left'))).backgroundColor).toBe(t.status.neutral.background);
  });

  it('an edit whose stock read failed: the strip is status.negative and Try again is brand.tint; the ITEMS tag is critical', async () => {
    jest.mocked(getGRNDetailByNumber).mockResolvedValue({ success: false } as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderIn(brand, mode, 'edit');

    // The message strip is the shared InlineValidation: the View around the text
    const message = textNamed("Couldn't check the stock of these lots. Check your connection and try again.");
    const strip = styleOf(surfaceOf(message));
    expect(strip.backgroundColor).toBe(t.status.negative.background);
    expect(strip.borderColor).toBe(t.status.negative.border);
    expect(message).toHaveStyle({ color: t.status.negative.text });
    expect(textNamed('Try again')).toHaveStyle({ color: t.brand.tint });
    // The "Stock not checked" tag sits in a critical status tag.
    expect(textNamed('Stock not checked')).toHaveStyle({ color: t.status.critical.text });
  });

  it('never fills a surface with brand.fill except the primary button of the bottom bar', async () => {
    await renderIn(brand, mode, 'create');

    expect(filledWith(t.brand.fill)).toEqual(['dispatch-review-submit']);
  });
});
