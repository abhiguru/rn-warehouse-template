/**
 * Dispatch review step, printing: when the printer did not confirm the job (print result
 * `unconfirmed`), the snackbar says to check the printer before printing again, as the invoice
 * screens do, and not the plain failure that invites a reprint.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { printDispatchRange } from '@/services/print-service';

const item = (n: number) => ({
  unique_id: `u${n}`, grns_id: `g${n}`, grns_gr_no: `A${String(100 + n)}`, grns_date: '2026-09-01', grns_customer_name: 'Fictional Traders',
  grnItems_id: `l${n}`, grnItems_item_id: `i${n}`, grnItems_item_name: `Fictional item ${n}`, grnItems_quantity: 50, grnItems_stock: 40,
  grnItems_package_mark: `M${n}`, grnItems_rack: `R${n}`, grnItems_weight: 25, disp_quantity: 5,
});
const mockItems = [item(1)];

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
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
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
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const snackbarText = (tree: ReactTestRenderer) =>
  tree.root.findByType('Snackbar' as never).findAll((node) => (node.type as unknown) === 'Text').map((node) => ([] as unknown[]).concat(node.props.children).join(''));

it.each([
  [{ success: false, error: 'x', unconfirmed: true }, 'The printer did not confirm the job. Check the printer before printing again.'],
  [{ success: false, error: 'x' }, "Couldn't send to the printer. Check the printer and try again."],
])('print answer %j shows "%s"', async (answer, text) => {
  jest.mocked(printDispatchRange).mockResolvedValue(answer as never);
  const tree = await render();

  await act(async () => { await tree.root.findByType('PrintRangeDialog' as never).props.onConfirm('I0042', 'I0042'); });

  expect(snackbarText(tree)).toEqual([text]);
  await act(async () => { tree.unmount(); });
});
