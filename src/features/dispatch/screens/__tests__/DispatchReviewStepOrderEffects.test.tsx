/**
 * What a save does to customers' orders, told on the dispatch review step: a note on the step and the lines under the
 * confirm question, from the server's preview; nothing extra on a server without the preview; the lines again in the
 * success dialog of the real save.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
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
// Dialog stand-ins draw what a person reads in an open dialog (its title and message, the order lines of the success
// dialog); the confirm also keeps its props, so the test can answer it where the real component answers by its button.
interface MockConfirmProps {
  visible: boolean;
  title: string;
  message?: string;
  onConfirm: () => unknown;
}
let mockConfirmProps: MockConfirmProps | undefined;
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: MockConfirmProps) => {
    const { Text, View } = require('react-native');
    const { createElement } = require('react');
    // The first one drawn is the confirm of Create.
    mockConfirmProps = mockConfirmProps ?? props;
    if (mockConfirmProps.title === props.title) mockConfirmProps = props;
    return props.visible
      ? createElement(View, { accessible: true, accessibilityRole: 'alert' }, createElement(Text, null, props.title), createElement(Text, { testID: 'confirm-message' }, props.message))
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({
  DocumentSuccessDialog: (props: { isVisible: boolean; documentData?: { orderNotes?: string[] } }) => {
    const { Text, View } = require('react-native');
    const { createElement } = require('react');
    return props.isVisible
      ? createElement(View, { accessible: true, accessibilityLabel: 'Success dialog' }, ...(props.documentData?.orderNotes ?? []).map((note) => createElement(Text, { key: note }, note)))
      : null;
  },
}));
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
  availableStock: null, orderLinesLeft: 2, packaging: null, ...over,
});

const show = async (mode: 'create' | 'edit' = 'create') => {
  mockForm.isCreateMode = mode === 'create';
  await render(<DispatchReviewStep mode={mode} />);
};
beforeEach(() => {
  jest.clearAllMocks();
  mockConfirmProps = undefined;
  mockForm.images = [];
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({ success: true, data: { grn: {}, items: [] } } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
  jest.mocked(previewCreateDispatch).mockResolvedValue(null);
  jest.mocked(previewUpdateDispatch).mockResolvedValue(null);
});
afterEach(() => {
  setLanguage('en');
  jest.restoreAllMocks();
});

// The notice is a plain strip with no role or label of its own.
const orderEffects = () => screen.queryByTestId('dispatch-review-order-effects');
const create = () => screen.getByRole('button', { name: 'Create dispatch' });
const confirmTitle = 'Create dispatch I0042?';

it('names each affected order line on the step and in the question, using the create preview', async () => {
  jest.mocked(previewCreateDispatch).mockResolvedValue([effect({}), effect({ itemName: 'Garlic', change: 'removed', removed: true, newQuantity: 0, orderLinesLeft: 0 })]);
  await show('create');

  expect(within(await screen.findByTestId('dispatch-review-order-effects')).getByText("Lakeview Spices' order: Onions (X0001) 20 → 15 bags", { exact: false, includeHiddenElements: true })).toBeOnTheScreen();
  await userEvent.setup({ delay: 0 }).press(create());
  expect(await screen.findByText(confirmTitle)).toBeOnTheScreen();
  expect(jest.mocked(previewCreateDispatch).mock.calls.length).toBeGreaterThanOrEqual(2);
  const message = screen.getByTestId('confirm-message');
  expect(message).toHaveTextContent(/This also changes orders:/);
  expect(message).toHaveTextContent(/• Lakeview Spices' order: Onions \(X0001\) 20 → 15 bags/);
  expect(message).toHaveTextContent(/Garlic \(X0001\) is removed from Lakeview Spices' order\. No line is left, so the order is removed\./);
});

it('uses the update preview for an edit, with the version the edit read', async () => {
  jest.mocked(previewUpdateDispatch).mockResolvedValue([effect({ change: 'exceeds_stock', availableStock: 3, newQuantity: 5, oldQuantity: 5 })]);
  await show('edit');

  expect(previewUpdateDispatch).toHaveBeenCalledWith('route-dispatch', expect.anything(), expect.anything(), 'v1');
  expect(within(await screen.findByTestId('dispatch-review-order-effects')).getByText('asks for 5 bags, but only 3 bags will be in stock.', { exact: false, includeHiddenElements: true })).toBeOnTheScreen();
});

it('asks the question as before when the server has no preview, or no order changes', async () => {
  await show('create');
  expect(orderEffects()).not.toBeOnTheScreen();
  await userEvent.setup({ delay: 0 }).press(create());
  expect(await screen.findByText(confirmTitle)).toBeOnTheScreen();
  expect(screen.getByTestId('confirm-message')).not.toHaveTextContent('orders');

  jest.mocked(previewCreateDispatch).mockResolvedValue([]);
  await screen.unmount();
  mockConfirmProps = undefined;
  await show('create');
  expect(orderEffects()).not.toBeOnTheScreen();
});

it('repeats the order lines of the real save in the success dialog', async () => {
  // On Android the success dialog opens as soon as the confirm is hidden.
  jest.replaceProperty(Platform, 'OS', 'android');
  mockForm.submitForm.mockResolvedValue({ success: true, dispatchId: 'd9', orderEffects: [effect({})] });
  await show('create');
  await userEvent.setup({ delay: 0 }).press(create());
  expect(await screen.findByText(confirmTitle)).toBeOnTheScreen();
  await act(async () => { await mockConfirmProps!.onConfirm(); });
  const notes = within(screen.getByLabelText('Success dialog')).getAllByText(/./);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toHaveTextContent("Lakeview Spices' order: Onions (X0001) 20 → 15 bags", { exact: true });
});
