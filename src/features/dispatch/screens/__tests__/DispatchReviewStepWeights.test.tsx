/**
 * Weights on the dispatch review step (phone review 2026-10-14, UX-06; Review rebuilt 2026-10-18).
 *
 * A lot stores one weight: the weight of one bag, box or crate. The review used to multiply it by the bags and show
 * "Total weight" next to a "Unit weight". The owner's decision: total weights are not shown anywhere, and the weight
 * of one bag reads "50 kg each". Since the lines are a table, the weight is visible without opening anything. A lot
 * without a weight shows no weight.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { setLanguage } from '@/i18n';
import { reviewHeader, reviewLine } from '@/tests/helpers/dispatchReviewFixtures';

const mockForm = {
  header: { ...reviewHeader },
  items: [reviewLine(1)] as ReturnType<typeof reviewLine>[],
  images: [],
  isSaving: false,
  isLoading: false,
  isCreateMode: true,
  dispatchId: null,
  submitForm: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
  addImageToForm: jest.fn(),
  updateImageUploadProgress: jest.fn(),
  updateImageUploadStatus: jest.fn(),
  removeImageFromForm: jest.fn(),
  validationErrors: {},
};

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
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

const texts = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join('').replace(/\u00A0/g, ' '));
const labels = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll((node) => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string').map((node) => node.props.accessibilityLabel as string);

let tree: ReactTestRenderer;
const render = async (mode: 'create' | 'edit' = 'create') => {
  mockForm.isCreateMode = mode === 'create';
  await act(async () => { tree = create(<DispatchReviewStep mode={mode} />); });
  return tree;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockForm.items = [reviewLine(1)];
  // An edit reads each GRN's lots again; lot l1 holds 40 now.
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({
    success: true,
    data: { grn: {}, items: [{ id: 'l1', stock: 40 }] },
  } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  setLanguage('en');
});

describe.each([['a new dispatch', 'create'], ['an edited dispatch', 'edit']] as const)('the review of %s', (_name, mode) => {
  it('shows the weight of one bag without opening anything, once, and never a total', async () => {
    await render(mode);

    // ITEMS is open when the step opens: the weight is a tag of the line.
    expect(texts(tree).filter((text) => text === '50 kg each')).toHaveLength(1);
    expect(texts(tree)).not.toContain('Total weight');
    expect(texts(tree)).not.toContain('Unit weight');
    expect(texts(tree)).not.toContain('50 kg');
    expect(texts(tree).some((text) => /250|total weight|unit weight/i.test(text))).toBe(false);
    expect(labels(tree).some((label) => /250|total weight|unit weight/i.test(label))).toBe(false);
    // The details and the table's total row keep their bags.
    expect(texts(tree)).toEqual(expect.arrayContaining(['I0042', 'GJ01AB1234', 'Asha', 'Total quantity', 'Total']));
    // The line's spoken label has the weight of one bag.
    expect(labels(tree).some((label) => label.includes('Fictional item 1') && label.includes('50 kg each'))).toBe(true);
  });

  it.each([[0], [null]])('a lot with no weight (%s) shows no weight tag', async (weight) => {
    mockForm.items = [reviewLine(1, { weight })];
    await render(mode);

    expect(texts(tree).some((text) => /kg|weight/i.test(text))).toBe(false);
    expect(labels(tree).some((label) => /kg each|weight/i.test(label))).toBe(false);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Fictional item 1', 'Rack R1']));
  });
});

it('two items of 5 bags: the total counts 10 bags and still no weight', async () => {
  mockForm.items = [reviewLine(1, { weight: 50 }), reviewLine(2, { weight: 20 })];
  await render('create');

  expect(texts(tree)).toEqual(expect.arrayContaining(['Fictional item 1', 'Fictional item 2', '20 kg each', '50 kg each']));
  expect(tree.root.findByProps({ testID: 'dispatch-review-items-total' }).props.accessibilityLabel).toContain('10 bags');
  expect(texts(tree).some((text) => /350|total weight/i.test(text))).toBe(false);
});

it('in Gujarati the weight of one bag reads દરેક ૫૦ કિલો, with no કુલ વજન', async () => {
  setLanguage('gu');
  await render('create');

  expect(texts(tree).filter((text) => text.includes('દરેક ૫૦ કિલો'))).toHaveLength(1);
  expect(texts(tree)).not.toContain('કુલ વજન');
  expect(texts(tree)).not.toContain('એક નંગનું વજન');
});
