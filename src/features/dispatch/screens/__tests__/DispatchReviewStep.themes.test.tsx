/**
 * The dispatch review step in all four themes (brand x mode), in a new dispatch and in an edited one whose stock read
 * failed: every surface and text colour comes from a token, never a literal or a brand fill.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
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

let tree: ReactTestRenderer;
const renderIn = async (brand: string, mode: Mode, step: 'create' | 'edit') => {
  mockState = { theme: { preference: mode, brand } };
  mockForm.isCreateMode = step === 'create';
  await act(async () => { tree = create(<DispatchReviewStep mode={step} />); });
};
afterEach(async () => {
  await act(async () => { tree.unmount(); });
});

const styleOf = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style) ?? {};
const byTestId = (id: string) => tree.root.find((n) => n.props.testID === id && typeof n.type === 'string');
const textNamed = (text: string) => tree.root.findAll((n) => (n.type as unknown) === 'Text' && [n.props.children].flat().join('') === text)[0];

describe.each(THEMES)('%s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('a new dispatch: the card is surface.card, the open ITEMS section table.insetFill, the total in text.primary', async () => {
    await renderIn(brand, mode, 'create');

    expect(styleOf(byTestId('dispatch-review-table')).backgroundColor).toBe(t.surface.card);
    expect(styleOf(byTestId('dispatch-review-table')).borderColor).toBe(t.table.outline);
    // ITEMS is the open section; its block is the section node that holds the body.
    const itemsBlock = byTestId('dispatch-review-body-items').parent!.parent!;
    expect(styleOf(itemsBlock).backgroundColor ?? styleOf(itemsBlock.parent!).backgroundColor).toBe(t.table.insetFill);
    expect(styleOf(textNamed('Total')).color).toBe(t.text.primary);
    // The weight and stock tags are neutral status tags.
    expect(styleOf(textNamed('50 kg each')).color).toBe(t.status.neutral.text);
    expect(styleOf(textNamed('35 left').parent!.parent!).backgroundColor ?? styleOf(textNamed('35 left').parent!).backgroundColor).toBe(t.status.neutral.background);
  });

  it('an edit whose stock read failed: the strip is status.negative and Try again is brand.tint; the ITEMS tag is critical', async () => {
    jest.mocked(getGRNDetailByNumber).mockResolvedValue({ success: false } as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderIn(brand, mode, 'edit');

    // The message strip is the shared InlineValidation: the View around the text
    let stripNode: ReactTestInstance = textNamed("Couldn't check the stock of these lots. Check your connection and try again.");
    while (styleOf(stripNode).backgroundColor === undefined) stripNode = stripNode.parent!;
    const strip = styleOf(stripNode);
    expect(strip.backgroundColor).toBe(t.status.negative.background);
    expect(strip.borderColor).toBe(t.status.negative.border);
    expect(styleOf(textNamed("Couldn't check the stock of these lots. Check your connection and try again.")).color).toBe(t.status.negative.text);
    expect(styleOf(textNamed('Try again')).color).toBe(t.brand.tint);
    // The "Stock not checked" tag sits in a critical status tag.
    const tag = textNamed('Stock not checked');
    expect(styleOf(tag).color).toBe(t.status.critical.text);
    jest.restoreAllMocks();
  });

  it('never fills a surface with brand.fill except the primary button of the bottom bar', async () => {
    await renderIn(brand, mode, 'create');

    const fills = tree.root.findAll((n) => typeof n.type === 'string' && styleOf(n).backgroundColor === t.brand.fill);
    expect(fills.map((n) => n.props.testID)).toEqual(['dispatch-review-submit']);
  });
});
