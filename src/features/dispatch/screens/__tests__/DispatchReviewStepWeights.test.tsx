/**
 * Weights on the dispatch review step (phone review 2026-10-14, UX-06).
 *
 * A lot stores one weight: the weight of one bag, box or crate. The review
 * multiplied it by the bags and showed "Total weight" in three places (the
 * details card, the summary, and each opened item), next to a "Unit weight".
 * The owner's decision: total weights are not shown anywhere, and the weight
 * of one bag reads "Weight 50 kg each". A lot without a weight shows no weight.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { setLanguage } from '@/i18n';

/** 5 bags of a lot whose bags weigh `weight`: the total the review used to show was 250 kg. */
const line = (weight: number | null, n = 1) => ({
  unique_id: `u${n}`, grns_id: `g${n}`, grns_gr_no: `A10${n}`, grns_date: '2026-09-01', grns_customer_name: 'Fictional Traders',
  grnItems_id: `l${n}`, grnItems_item_id: `i${n}`, grnItems_item_name: `Fictional item ${n}`, grnItems_quantity: 100, grnItems_stock: 40,
  grnItems_package_mark: `M${n}`, grnItems_rack: `R${n}`, grnItems_weight: weight, disp_quantity: 5,
});
const mockForm = {
  header: { disp_no: 'I0042', disp_date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders', registration: 'GJ01AB1234', supervisor_name: 'Asha', note: '' },
  items: [line(50)] as ReturnType<typeof line>[],
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

const texts = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join(''));
const labels = (tree: ReactTestRenderer): string[] =>
  tree.root.findAll((node) => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string').map((node) => node.props.accessibilityLabel as string);
const itemHeader = (tree: ReactTestRenderer, n = 1) =>
  tree.root.find((node) => typeof node.props.onPress === 'function' && node.props.accessibilityState?.expanded !== undefined && String(node.props.accessibilityLabel).includes(`Fictional item ${n},`));
const open = async (tree: ReactTestRenderer, n = 1) => {
  await act(async () => { itemHeader(tree, n).props.onPress(); });
};

let tree: ReactTestRenderer;
const render = async (mode: 'create' | 'edit' = 'create') => {
  mockForm.isCreateMode = mode === 'create';
  await act(async () => { tree = create(<DispatchReviewStep mode={mode} />); });
  return tree;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockForm.items = [line(50)];
  // An edit reads each lot's stock again; here the read finds nothing new.
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({ success: false } as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  setLanguage('en');
  jest.restoreAllMocks();
});

describe.each([['a new dispatch', 'create'], ['an edited dispatch', 'edit']] as const)('the review of %s', (_name, mode) => {
  it('shows no "Total weight" in the details card or the summary; "Total quantity" stays', async () => {
    await render(mode);

    expect(texts(tree)).not.toContain('Total weight');
    expect(texts(tree)).not.toContain('Unit weight');
    expect(texts(tree).some((text) => /250|kg|weight/i.test(text))).toBe(false);
    expect(labels(tree).some((label) => /250|kg|weight/i.test(label))).toBe(false);
    // The details card still has its two rows, and the summary its bags.
    expect(texts(tree)).toEqual(expect.arrayContaining(['I0042', 'GJ01AB1234', 'Asha', 'Total quantity', '5']));
  });

  it('an opened item reads "Weight 50 kg each", with no total and no "Unit weight"', async () => {
    await render(mode);
    await open(tree);

    expect(texts(tree)).toEqual(expect.arrayContaining(['Weight', '50 kg each']));
    expect(texts(tree)).not.toContain('Total weight');
    expect(texts(tree)).not.toContain('Unit weight');
    expect(texts(tree)).not.toContain('50 kg');
    expect(texts(tree).some((text) => /250/.test(text))).toBe(false);
    // The rows around it are untouched.
    expect(texts(tree)).toEqual(expect.arrayContaining(['GRN date', 'Original GRN quantity', '100', 'In stock']));
  });

  it.each([[0], [null]])('an opened item whose lot has no weight (%s) shows no weight row', async (weight) => {
    mockForm.items = [line(weight)];
    await render(mode);
    await open(tree);

    expect(texts(tree)).toEqual(expect.arrayContaining(['GRN date', 'Original GRN quantity']));
    expect(texts(tree).some((text) => /kg|weight/i.test(text))).toBe(false);
  });
});

it('two items of 5 bags: the summary counts 10 bags and still no weight', async () => {
  mockForm.items = [line(50, 1), line(20, 2)];
  await render('create');

  expect(texts(tree)).toEqual(expect.arrayContaining(['Total quantity', '10', 'Fictional item 1', 'Fictional item 2']));
  expect(texts(tree).some((text) => /350|kg|weight/i.test(text))).toBe(false);
});

it('in Gujarati an opened item reads વજન, દરેક ૫૦ કિલો, with no કુલ વજન', async () => {
  setLanguage('gu');
  await render('create');
  await open(tree);

  expect(texts(tree)).toEqual(expect.arrayContaining(['વજન', 'દરેક ૫૦ કિલો']));
  expect(texts(tree)).not.toContain('કુલ વજન');
  expect(texts(tree)).not.toContain('એક નંગનું વજન');
});
