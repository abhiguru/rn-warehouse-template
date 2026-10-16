/**
 * GRN review step, printing: when the printer did not confirm the job (print result
 * `unconfirmed`, migration 72 status 'unknown'), the snackbar says to check the printer before
 * printing again, as the invoice screens do, and not the plain failure that invites a reprint.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { printGRNRange } from '@/services/print-service';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'aaaaaaaa-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
let mockRemovedImages: Array<{ id: string; storagePath?: string }> = [];
let mockSaveUnconfirmed = false;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [], removedImages: mockRemovedImages, saveUnconfirmed: mockSaveUnconfirmed } }),
}));

const mockHeader = {
  gr_no: 'A0010',
  date: '2026-10-01',
  sender_name: 'Fictional Sender',
  customer_name: 'Fictional Traders',
  supervisor_name: 'Fictional Supervisor',
  registration: '',
  note: '',
  leon: false,
  pricing_mode: 'MONTHLY',
  gr_images: [
    { id: SAVED_PHOTO, fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' },
  ],
};
/** 30 lines, each with its own weight, so a drawn line can be told by the weight it formats. */
const line = (n: number) => ({
  grn_trl_id: `55555555-2222-4333-8444-${String(n).padStart(12, '0')}`, item_table_id: `i${n}`, item_name: `Fictional item ${n}`,
  packaging: 'Bag', qty: 10 + n, stock: 10 + n, weight: 40 + n / 4, rack: `R${n}`, package_mark: `M${n}`, trl_images: [],
});
const LINES = Array.from({ length: 30 }, (_, n) => line(n));
const WEIGHTS = new Set(LINES.map((item) => item.weight));
let mockForm: Record<string, unknown>;
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/features/grn/rates/useGrnRates', () => require('@/tests/helpers/grnRatesMock').grnRatesModuleMock());
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));
// Children are stand-ins that keep their props, so the test can press their buttons.
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: 'WizardBottomBar' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), findLinesSavedByLostUpdate: jest.fn() }));
// What unpreparedGRNPhotos answers for real forms is tested with the service (grnPhotoSaving.test.ts).
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })) }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));


async function render(mode: 'create' | 'edit', items = LINES) {
  mockForm = {
    header: mockHeader,
    items,
    grnId: mode === 'edit' ? GRN_ID : null,
    tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: mode === 'create',
    resetFormState: jest.fn(),
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GrnReviewStep mode={mode} />);
  });
  return tree;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRemovedImages = [];
  mockSaveUnconfirmed = false;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

/** What the real PrintRangeDialog does on Print: onConfirm, then onDismiss. */
const press = async (tree: ReactTestRenderer) => {
  const dialog = tree.root.findByType('PrintRangeDialog' as never);
  await act(async () => {
    await dialog.props.onConfirm('A0010', 'A0010');
    dialog.props.onDismiss();
  });
};

describe('GRN review step printing', () => {
  it.each(['create', 'edit'] as const)('%s: an unconfirmed print and a plain failure each show a dialog', async (mode) => {
    for (const [answer, title, text] of [
      [{ success: false, error: 'x', unconfirmed: true }, 'Print not confirmed', 'The printer did not confirm the job. Check the printer before printing again.'],
      [{ success: false, error: 'x' }, "Couldn't print", "Couldn't send the print job. Check the printer and try again."],
    ] as const) {
      jest.clearAllMocks();
      jest.mocked(printGRNRange).mockResolvedValue(answer as never);
      const tree = await render(mode);

      await press(tree);

      expect(showAlert).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenCalledWith(title, text);
      // Edit leaves the step exactly once; create stays on the step (the success dialog opens).
      expect(jest.mocked(router.replace).mock.calls).toEqual(mode === 'edit' ? [['/grn']] : []);
      await act(async () => { tree.unmount(); });
    }
  });

  it('a printed job shows no alert', async () => {
    jest.mocked(printGRNRange).mockResolvedValue({ success: true } as never);
    const tree = await render('edit');
    await press(tree);
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });
});
