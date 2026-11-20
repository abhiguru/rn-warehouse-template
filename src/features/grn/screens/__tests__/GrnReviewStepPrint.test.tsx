/**
 * GRN review step, printing: when the printer did not confirm the job (print result
 * `unconfirmed`, migration 72 status 'unknown'), the snackbar says to check the printer before
 * printing again, as the invoice screens do, and not the plain failure that invites a reprint.
 */
import React from 'react';
import { act, render as renderScreen, screen, userEvent } from '@testing-library/react-native';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { printGRNRange } from '@/services/print-service';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';

const GRN_ID = '11111111-2222-4333-8444-555555555555';
const SAVED_PHOTO = 'aaaaaaaa-2222-4333-8444-555555555555';

const mockDispatch = jest.fn();
let mockRemovedImages: Array<{ id: string; storagePath?: string }> = [];
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [], removedImages: mockRemovedImages } }),
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
// The stand-in draws the dialog's Print button: what the real PrintRangeDialog does on Print is onConfirm, then onDismiss.
jest.mock('@/components/PrintRangeDialog', () => ({
  PrintRangeDialog: (props: { onConfirm: (start: string, end: string) => Promise<void>; onDismiss: () => void }) =>
    require('react').createElement(require('react-native').Pressable, {
      accessibilityRole: 'button',
      accessibilityLabel: 'Print',
      onPress: async () => {
        await props.onConfirm('A0010', 'A0010');
        props.onDismiss();
      },
    }),
}));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
// The server is asked about a lost answer by this (utils/lostAnswer); none of these tests loses one.
jest.mock('@/utils/lostAnswer', () => ({ checkSubmission: jest.fn() }));
// What unpreparedGRNPhotos answers for real forms is tested with the service (grnPhotoSaving.test.ts).
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })), withoutStoredNumberError: (result: unknown) => result }));
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
  return renderScreen(<GrnReviewStep mode={mode} />);
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRemovedImages = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

/** Press Print, then let what the dialog does after it (onConfirm, then onDismiss) finish. */
const press = async () => {
  const user = userEvent.setup({ delay: 0 });
  await user.press(screen.getByRole('button', { name: 'Print' }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};

describe('GRN review step printing', () => {
  it.each(['create', 'edit'] as const)('%s: an unconfirmed print and a plain failure each show a dialog', async (mode) => {
    for (const [answer, title, text] of [
      [{ success: false, error: 'x', unconfirmed: true }, 'Print not confirmed', 'The printer did not confirm the job. Check the printer before printing again.'],
      [{ success: false, error: 'x' }, "Couldn't print", "Couldn't send the print job. Check the printer and try again."],
    ] as const) {
      jest.clearAllMocks();
      jest.mocked(printGRNRange).mockResolvedValue(answer as never);
      const { unmount } = await render(mode);

      await press();

      expect(showAlert).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenCalledWith(title, text);
      // Edit leaves the step exactly once; create stays on the step (the success dialog opens).
      expect(jest.mocked(router.replace).mock.calls).toEqual(mode === 'edit' ? [['/grn']] : []);
      await unmount();
    }
  });

  it('a printed job shows no alert', async () => {
    jest.mocked(printGRNRange).mockResolvedValue({ success: true } as never);
    await render('edit');
    await press();
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});
