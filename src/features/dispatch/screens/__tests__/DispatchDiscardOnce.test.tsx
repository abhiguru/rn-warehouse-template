/**
 * Leaving a dispatch form with the X on the items and review steps: one
 * question, not two. The step header asks before it calls the step, and the
 * step used to open a dialog of its own after that ("Cancel dispatch", then
 * "Discard this dispatch?"). The header is the real one here.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { DispatchItemsStep } from '../DispatchItemsStep';
import { DispatchReviewStep } from '../DispatchReviewStep';

const line = (id: string) => ({ unique_id: id, grnItems_id: `lot-${id}`, gr_no: 'A0010', item_name: 'Example Potatoes', package_mark: 'M1', quantity: 10, stock: 40 });
const mockForm = {
  header: { disp_no: 'I0042', disp_date: '2026-10-01', customer_id: 'c1', customer_name: 'Example Traders', registration: 'GJ01XX0000', note: '' },
  items: [] as ReturnType<typeof line>[],
  images: [],
  isSaving: false,
  isLoading: false,
  isCreateMode: true,
  dispatchId: null,
  validationErrors: {},
  submitForm: jest.fn(),
  addFormItems: jest.fn(),
  updateFormItem: jest.fn(),
  removeFormItem: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
  addImageToForm: jest.fn(),
  updateImageStatus: jest.fn(),
  removeImageFromForm: jest.fn(),
};

jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'KeyboardAwareScrollView' }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
// Stand-ins that keep their props, so a dialog of the step's own would be seen.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/features/dispatch/components', () => ({
  GRNAutocompleteBottomSheet: () => null,
  GRNItemBottomSheet: () => null,
  LotBottomSheet: () => null,
  ItemsSummaryBottomSheet: () => null,
}));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({
  getGRNDetailByNumber: jest.fn(() => Promise.resolve({ success: false })),
}));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockForm.items = [];
  mockForm.isCreateMode = true;
});
afterEach(() => jest.restoreAllMocks());

async function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
}
const pressX = async (tree: ReactTestRenderer, label: string) => {
  const close = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  await act(async () => { close.props.onPress(); });
};
const question = () => {
  const [title, message, buttons] = jest.mocked(showAlert).mock.calls.at(-1)!;
  return { title, message, buttons: buttons!.map((button) => button.text) };
};
const answer = async (text: string) => {
  const button = jest.mocked(showAlert).mock.calls.at(-1)![2]!.find((candidate) => candidate.text === text)!;
  await act(async () => { button.onPress?.(); });
};
const ownDiscardDialogs = (tree: ReactTestRenderer) =>
  tree.root.findAllByType('ConfirmDialog' as never).filter((dialog) => dialog.props.title === 'Discard this dispatch?');

const STEPS: [string, (mode: 'create' | 'edit') => React.ReactElement][] = [
  ['items', (mode) => <DispatchItemsStep mode={mode} />],
  ['review', (mode) => <DispatchReviewStep mode={mode} />],
];

describe.each(STEPS)('The X on the %s step of a new dispatch', (_step, screen) => {
  it('asks once, naming the lines that would be lost, and "Discard" empties the form and shows the list', async () => {
    mockForm.items = [line('a'), line('b')];
    const tree = await render(screen('create'));

    await pressX(tree, 'Cancel Dispatch');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toEqual({
      title: 'Discard this dispatch?',
      message: 'The 2 items you added will be lost.',
      buttons: ['Keep editing', 'Discard'],
    });
    expect(mockForm.resetFormState).not.toHaveBeenCalled();

    await answer('Discard');

    // No dialog of the step's own follows the header's question.
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(ownDiscardDialogs(tree)).toHaveLength(0);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
    await act(async () => { tree.unmount(); });
  });

  it('with one line it says "1 item"; "Keep editing" leaves everything as it is', async () => {
    mockForm.items = [line('a')];
    const tree = await render(screen('create'));

    await pressX(tree, 'Cancel Dispatch');
    expect(question().message).toBe('The 1 item you added will be lost.');
    await answer('Keep editing');

    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('without a line it speaks of the details entered on the first step', async () => {
    const tree = await render(screen('create'));

    await pressX(tree, 'Cancel Dispatch');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toMatchObject({ title: 'Discard this dispatch?', message: 'The details you entered will be lost.' });
    await act(async () => { tree.unmount(); });
  });
});

describe.each(STEPS)('The X on the %s step of a dispatch that is being edited', (_step, screen) => {
  it('asks once, about the changes, and "Discard" leaves the form', async () => {
    mockForm.isCreateMode = false;
    mockForm.items = [line('a')];
    const tree = await render(screen('edit'));

    await pressX(tree, 'Cancel editing');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question().title).toBe('Cancel dispatch');
    await answer('Discard');
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(ownDiscardDialogs(tree)).toHaveLength(0);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
