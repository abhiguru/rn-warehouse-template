/**
 * WH-161: the texts that depend on whether the GRN has a number yet (design 10.10). A GRN with no number (made offline,
 * or an empty number) does not name one in the Create question or in the "saved after you left" alert; a numbered one does.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { GrnReviewStep } from '@/features/grn/screens/GrnReviewStep';
import { createGRN, updateGRN } from '@/features/grn/services/grnFormService';
import { nextGrnFormSession } from '@/features/grn/utils/grnFormSession';
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

const PHOTO = { id: 'p1', fileName: 'book.webp', imageUrl: 'https://example.invalid/book', storagePath: 'headers/g/book.webp', uploadStatus: 'completed' };
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
  gr_images: [PHOTO],
};
const mockItems = [
  { grn_trl_id: '55555555-2222-4333-8444-555555555555', item_table_id: 'i1', item_name: 'Example Potatoes', packaging: 'Bag', qty: 10, stock: 10, weight: 50, rack: '', package_mark: '', trl_images: [] },
];
let mockForm: Record<string, unknown>;
let mockConfirmEnded: unknown;
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/features/grn/rates/useGrnRates', () => require('@/tests/helpers/grnRatesMock').grnRatesModuleMock());
jest.mock('@/features/grn/rates/GrnRateSheet', () => ({ GrnRateSheet: () => null }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null, status: 'ready' }) }));

// Children are stand-ins. The Create/Save question is drawn only while open: its title is the alert's label, and
// pressing it calls the real onConfirm. The bottom bar draws its Next button and calls the real prop.
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; onConfirm: () => unknown }) => {
    const { Pressable, Text } = require('react-native');
    const { createElement } = require('react');
    return props.visible
      ? createElement(
        Pressable,
        { accessibilityRole: 'alert', accessibilityLabel: props.title, onPress: () => { mockConfirmEnded = props.onConfirm(); } },
        createElement(Text, null, props.title)
      )
      : null;
  },
}));
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

const FAILED_PHOTO = {
  image: { id: 'temp_1', fileName: 'new.webp', imageUrl: 'file:///cache/new.webp', uploadStatus: 'completed' },
  imageType: 'header' as const,
  position: 1,
  error: 'Network request failed',
};
const GRN_ID = '11111111-2222-4333-8444-555555555555';

async function show(mode: 'create' | 'edit', grNo: string) {
  mockForm = {
    header: { ...mockHeader, gr_no: grNo },
    items: mockItems,
    grnId: mode === 'edit' ? GRN_ID : null,
    tempGrnId: mode === 'edit' ? null : 'temp_grn_fixture',
    isSaving: false,
    isCreateMode: mode === 'create',
    resetFormState: jest.fn(),
  };
  await render(<GrnReviewStep mode={mode} />);
}

const user = () => userEvent.setup({ delay: 0 });
const pressNext = () => user().press(screen.getByRole('button', { name: 'Wizard next' }));

/** Opens the Create / Save question and returns its title. */
async function questionTitle() {
  await pressNext();
  return screen.getByRole('alert').props.accessibilityLabel as string;
}

/**
 * Saves with an answer that arrives after the form was left, and returns what the alert says: [title, message].
 * `answerNumber` is the number the server's answer carries.
 */
async function saveAfterLeaving(mode: 'create' | 'edit', formNumber: string, answerNumber: string, withFailedPhoto: boolean) {
  const photos = { uploadedCount: 0, failed: withFailedPhoto ? [FAILED_PHOTO] : [], removalFailures: 0 };
  const answer = async () => {
    nextGrnFormSession();
    return { success: true, data: { id: GRN_ID, gr_no: answerNumber, photos } };
  };
  (createGRN as jest.Mock).mockImplementation(answer);
  (updateGRN as jest.Mock).mockImplementation(answer);
  await show(mode, formNumber);
  await pressNext();
  await user().press(screen.getByRole('alert'));
  await act(async () => { await mockConfirmEnded; });
  const call = jest.mocked(showAlert).mock.calls.at(-1)!;
  return [call[0], call[1]];
}

describe('GRN review step texts for a GRN with and without a number', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirmEnded = undefined;
    setFormNumberMode('grn', 'online');
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    setFormNumberMode('grn', 'online');
    setLanguage('en');
    jest.restoreAllMocks();
  });

  describe('the Create question', () => {
    it('does not name a number while the number is pending (offline New GRN)', async () => {
      setFormNumberMode('grn', 'pending');
      await show('create', '');

      expect(await questionTitle()).toBe('Create this GRN?');
    });

    it('does not name a number while pending, even if the form holds a placeholder number', async () => {
      setFormNumberMode('grn', 'pending');
      await show('create', 'A0010');

      expect(await questionTitle()).toBe('Create this GRN?');
    });

    it('names a typed number', async () => {
      setFormNumberMode('grn', 'typed');
      await show('create', 'A0010');

      expect(await questionTitle()).toBe('Create GRN A0010?');
    });

    it('says the same in Gujarati', async () => {
      setLanguage('gu');
      setFormNumberMode('grn', 'pending');
      await show('create', '');

      expect(await questionTitle()).toBe('આ આવક પાવતી બનાવશો?');
    });

    it('names a typed number in Gujarati', async () => {
      setLanguage('gu');
      setFormNumberMode('grn', 'typed');
      await show('create', 'A0010');

      expect(await questionTitle()).toBe('આવક પાવતી A0010 બનાવવી છે?');
    });

    it('an edit asks to save changes to the numbered GRN', async () => {
      await show('edit', 'A0010');

      expect(await questionTitle()).toBe('Save changes to GRN A0010?');
    });
  });

  describe('the alert for a save that answered after the form was left', () => {
    it('English, no number, no failed photos', async () => {
      const [title, message] = await saveAfterLeaving('create', 'A0010', '', false);

      expect(title).toBe('GRN saved');
      expect(message).toBe('The GRN was saved before you left the form. Find it in the GRN list.');
    });

    it('English, numbered, no failed photos', async () => {
      const [, message] = await saveAfterLeaving('create', 'A0010', 'A0010', false);

      expect(message).toBe('GRN A0010 was saved before you left the form. Find it in the GRN list.');
    });

    it('English, no number, photos not uploaded', async () => {
      const [, message] = await saveAfterLeaving('create', 'A0010', '', true);

      expect(message).toBe('The GRN was saved, but its photos were not uploaded. Open it in the GRN list and add them under Images.');
    });

    it('English, numbered, photos not uploaded', async () => {
      const [, message] = await saveAfterLeaving('create', 'A0010', 'A0010', true);

      expect(message).toBe('GRN A0010 was saved, but its photos were not uploaded. Open it in the GRN list and add them under Images.');
    });

    it('Gujarati, no number, no failed photos', async () => {
      setLanguage('gu');
      const [, message] = await saveAfterLeaving('create', 'A0010', '', false);

      expect(message).toBe('તમે ફોર્મ છોડ્યું તે પહેલાં આવક પાવતી સચવાઈ ગઈ. તે આવક પાવતીની યાદીમાં છે.');
    });

    it('Gujarati, numbered, no failed photos', async () => {
      setLanguage('gu');
      const [, message] = await saveAfterLeaving('create', 'A0010', 'A0010', false);

      expect(message).toBe('તમે ફોર્મ છોડ્યું તે પહેલાં આવક પાવતી A0010 સચવાઈ ગઈ. તે આવક પાવતીની યાદીમાં છે.');
    });

    it('Gujarati, no number, photos not uploaded', async () => {
      setLanguage('gu');
      const [, message] = await saveAfterLeaving('create', 'A0010', '', true);

      expect(message).toBe('આવક પાવતી સચવાઈ ગઈ, પણ તેના ફોટો અપલોડ થયા નથી. તેને આવક પાવતીની યાદીમાં ખોલો અને ફોટો ટૅબમાં ફોટો ઉમેરો.');
    });

    it('Gujarati, numbered, photos not uploaded', async () => {
      setLanguage('gu');
      const [, message] = await saveAfterLeaving('create', 'A0010', 'A0010', true);

      expect(message).toBe('આવક પાવતી A0010 સચવાઈ ગઈ, પણ તેના ફોટો અપલોડ થયા નથી. તેને આવક પાવતીની યાદીમાં ખોલો અને ફોટો ટૅબમાં ફોટો ઉમેરો.');
    });

    it('an edit saved after leaving names its number', async () => {
      const [, message] = await saveAfterLeaving('edit', 'A0010', 'A0010', false);

      expect(message).toBe('GRN A0010 was saved before you left the form. Find it in the GRN list.');
    });
  });
});
