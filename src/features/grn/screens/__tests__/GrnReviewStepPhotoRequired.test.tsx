/**
 * WH-161: the "Add a photo of the GRN" dialog on the GRN review step. While the GRN has no number yet (a New GRN made
 * offline, whose number is given when it is sent, or an empty number) the sentence does not name one; with a number
 * the person typed or the server offered, it still reads "for GRN {number}".
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { showAlert } from '@/utils/alert';
import { setFormNumberMode } from '@/features/unsent/formNumberMode';
import { setLanguage } from '@/i18n/language';

const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      theme: { preference: 'light', brand: 'orange' },
      grnForm: { items: [], removedImages: [], submissionNonce: null, grNoTyped: false },
    }),
}));
jest.mock('@/utils/lostAnswer', () => ({
  checkSubmission: jest.fn(),
  waitForServer: jest.fn(),
  isLostAnswer: jest.fn(),
  useIsDisconnected: () => false,
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
  gr_images: [],
};
const mockItems = [
  { grn_trl_id: '55555555-2222-4333-8444-555555555555', item_table_id: 'i1', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '', trl_images: [] },
];
let mockForm: Record<string, unknown>;
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/features/grn/rates/useGrnRates', () => require('@/tests/helpers/grnRatesMock').grnRatesModuleMock());
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));

// Children are stand-ins; the bar draws its Next button and calls the real prop.
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/WizardBottomBar', () => ({
  __esModule: true,
  default: (props: { onNext: () => unknown }) =>
    require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Wizard next', onPress: props.onNext }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useRouter: () => ({ back: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper', () => ({ Snackbar: 'Snackbar' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: 'GRNStepIndicator' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/features/grn/services/grnFormService', () => ({ createGRN: jest.fn(), updateGRN: jest.fn(), getNextGRNNumber: jest.fn() }));
jest.mock('@/features/grn/services/imageUploadService', () => ({ uploadGRNPhotos: jest.fn(), unpreparedGRNPhotos: jest.fn(() => null) }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
jest.mock('@/services/unfinishedSaves', () => ({
  forgetUnfinishedSave: jest.fn(async () => {}),
  releaseUnfinishedSave: jest.fn(),
  rememberUnfinishedSave: jest.fn(async () => {}),
}));
jest.mock('@/features/grn/schemas/grnValidation', () => ({ validateStep3: jest.fn(async () => ({ isValid: true, errors: {} })), withoutStoredNumberError: (result: unknown) => result }));
jest.mock('@/services/print-service', () => ({ printGRNRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateGRNPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));
jest.mock('@/utils/localPhotoFiles', () => ({
  abandonLocalPhotoUpload: jest.fn(),
  releaseLocalPhotos: jest.fn(async () => 0),
}));

async function show(grNo: string) {
  mockForm = {
    header: { ...mockHeader, gr_no: grNo },
    items: mockItems,
    grnId: null,
    tempGrnId: 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: true,
    resetFormState: jest.fn(),
  };
  await render(<GrnReviewStep mode="create" />);
}

/** Presses Create with no photo on the form and returns what the photo dialog says: [title, message]. */
async function pressCreateWithoutPhoto() {
  await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Wizard next' }));
  const call = jest.mocked(showAlert).mock.calls.at(-1)!;
  return [call[0], call[1]];
}

describe('the photo-required dialog of the GRN review step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setFormNumberMode('grn', 'online');
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    setFormNumberMode('grn', 'online');
    setLanguage('en');
    jest.restoreAllMocks();
  });

  it('does not name a number while the number is pending (offline New GRN)', async () => {
    setFormNumberMode('grn', 'pending');
    await show('');

    const [title, message] = await pressCreateWithoutPhoto();

    expect(title).toBe('Add a photo of the GRN');
    expect(message).toBe('Attach a photo of the GRN book entry.');
    expect(message).not.toMatch(/GRN\s*\./);
    expect(message).not.toContain('for GRN');
  });

  it('does not name a number while pending, even if the form holds a placeholder number', async () => {
    setFormNumberMode('grn', 'pending');
    await show('A0010');

    const [, message] = await pressCreateWithoutPhoto();

    expect(message).toBe('Attach a photo of the GRN book entry.');
    expect(message).not.toContain('A0010');
  });

  it('says the same in Gujarati, with no empty number', async () => {
    setLanguage('gu');
    setFormNumberMode('grn', 'pending');
    await show('');

    const [title, message] = await pressCreateWithoutPhoto();

    expect(title).toBe('આવક પાવતીનો ફોટો ઉમેરો');
    expect(message).toBe('પાવતી બુકની નોંધનો ફોટો જોડો.');
    expect(message).not.toMatch(/\{\{|undefined/);
  });

  it('names a typed number: "for GRN {number}"', async () => {
    setFormNumberMode('grn', 'typed');
    await show('A0010');

    const [, message] = await pressCreateWithoutPhoto();

    expect(message).toBe('Attach a photo of the GRN book entry for GRN A0010.');
  });

  it('names a typed number in Gujarati', async () => {
    setLanguage('gu');
    setFormNumberMode('grn', 'typed');
    await show('A0010');

    const [, message] = await pressCreateWithoutPhoto();

    expect(message).toBe('આવક પાવતી A0010 માટે પાવતી બુકની નોંધનો ફોટો જોડો.');
  });

  it('names the number the server offered when the form is numbered online', async () => {
    setFormNumberMode('grn', 'online');
    await show('A0011');

    const [, message] = await pressCreateWithoutPhoto();

    expect(message).toBe('Attach a photo of the GRN book entry for GRN A0011.');
  });

  it('does not name an empty number when an online form has none', async () => {
    setFormNumberMode('grn', 'online');
    await show('');

    const [, message] = await pressCreateWithoutPhoto();

    expect(message).toBe('Attach a photo of the GRN book entry.');
  });
});
