/**
 * What a save does to customers' orders, told on the dispatch review step: a note on the step and the lines under the
 * confirm question, from the server's preview; nothing extra on a server without the preview; the lines again in the
 * success dialog of the real save.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { setLanguage } from '@/i18n';
import { previewCreateDispatch, previewUpdateDispatch, type OrderEffect } from '@/services/orderEffects';
import { reviewHeader, reviewLine } from '@/tests/helpers/dispatchReviewFixtures';

const mockForm = {
  header: { ...reviewHeader },
  items: [reviewLine(1), reviewLine(2)] as ReturnType<typeof reviewLine>[],
  images: [] as { id: string; file_name: string; image_url: string; upload_status: string }[],
  isSaving: false,
  isLoading: false,
  isCreateMode: true,
  dispatchId: 'd1',
  submitForm: jest.fn() as jest.Mock,
  getLoadedUpdatedAt: () => 'v1',
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
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  // The route's dispatch: an edit goes back to it, whatever the form holds.
  useLocalSearchParams: () => ({ id: 'route-dispatch' }),
}));
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
jest.mock('@/services/orderEffects', () => ({
  ...jest.requireActual('@/services/orderEffects'),
  previewCreateDispatch: jest.fn(),
  previewUpdateDispatch: jest.fn(),
}));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

const effect = (over: Partial<OrderEffect>): OrderEffect => ({
  customerId: 'c1', customerName: 'Lakeview Spices', orderId: 'o1', orderNo: 'ORD-1', orderItemId: 'oi1', grnItemId: 'l1',
  itemName: 'Onions', packageMark: null, grnNo: 'X0001', oldQuantity: 20, newQuantity: 15, removed: false, change: 'reduced',
  availableStock: null, orderLinesLeft: 2, ...over,
});

let tree: ReactTestRenderer;
const render = async (mode: 'create' | 'edit' = 'create') => {
  mockForm.isCreateMode = mode === 'create';
  await act(async () => { tree = create(<DispatchReviewStep mode={mode} />); });
};
beforeEach(() => {
  jest.clearAllMocks();
  mockForm.images = [];
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({ success: true, data: { grn: {}, items: [] } } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
  jest.mocked(previewCreateDispatch).mockResolvedValue(null);
  jest.mocked(previewUpdateDispatch).mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  setLanguage('en');
});

const byTestId = (id: string) => tree.root.findAll((n) => n.props.testID === id);
const textOf = (node: ReactTestInstance): string => node.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join('')).join('\n');
const dialog = () => tree.root.findAllByType('ConfirmDialog' as never)[0];

it('names each affected order line on the step and in the question, using the create preview', async () => {
  jest.mocked(previewCreateDispatch).mockResolvedValue([effect({}), effect({ itemName: 'Garlic', change: 'removed', removed: true, newQuantity: 0, orderLinesLeft: 0 })]);
  await render('create');

  expect(textOf(byTestId('dispatch-review-order-effects')[0])).toContain("Lakeview Spices' order: Onions (X0001) 20 → 15 bags");
  await act(async () => { byTestId('dispatch-review-submit').find((n) => typeof n.props.onPress === 'function').props.onPress(); });
  expect(jest.mocked(previewCreateDispatch).mock.calls.length).toBeGreaterThanOrEqual(2);
  const message = dialog().props.message as string;
  expect(message).toContain('This also changes orders:');
  expect(message).toContain("• Lakeview Spices' order: Onions (X0001) 20 → 15 bags");
  expect(message).toContain('Garlic (X0001) is removed from Lakeview Spices\' order. No line is left, so the order is removed.');
});

it('uses the update preview for an edit, with the version the edit read', async () => {
  jest.mocked(previewUpdateDispatch).mockResolvedValue([effect({ change: 'exceeds_stock', availableStock: 3, newQuantity: 5, oldQuantity: 5 })]);
  await render('edit');

  expect(previewUpdateDispatch).toHaveBeenCalledWith('route-dispatch', expect.anything(), expect.anything(), 'v1');
  expect(textOf(byTestId('dispatch-review-order-effects')[0])).toContain('asks for 5 bags, but only 3 bags will be in stock.');
});

it('asks the question as before when the server has no preview, or no order changes', async () => {
  await render('create');
  expect(byTestId('dispatch-review-order-effects')).toHaveLength(0);
  await act(async () => { byTestId('dispatch-review-submit').find((n) => typeof n.props.onPress === 'function').props.onPress(); });
  expect(dialog().props.message).not.toContain('orders');
  expect(dialog().props.visible).toBe(true);

  jest.mocked(previewCreateDispatch).mockResolvedValue([]);
  await act(async () => { tree.unmount(); });
  await render('create');
  expect(byTestId('dispatch-review-order-effects')).toHaveLength(0);
});

it('repeats the order lines of the real save in the success dialog', async () => {
  mockForm.submitForm.mockResolvedValue({ success: true, dispatchId: 'd9', orderEffects: [effect({})] });
  await render('create');
  await act(async () => { byTestId('dispatch-review-submit').find((n) => typeof n.props.onPress === 'function').props.onPress(); });
  await act(async () => { await dialog().props.onConfirm(); });
  const success = tree.root.findAllByType('DocumentSuccessDialog' as never)[0];
  expect(success.props.documentData.orderNotes).toEqual(["Lakeview Spices' order: Onions (X0001) 20 → 15 bags"]);
});
