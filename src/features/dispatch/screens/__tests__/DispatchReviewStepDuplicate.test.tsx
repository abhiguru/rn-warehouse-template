/**
 * Dispatch Review step and the duplicate warning (backend migration 124): a direct dispatch that looks like one made in
 * the last 30 minutes comes back as `duplicate`. Nothing was saved. Once the confirm is gone the person is asked
 * "Possible duplicate" [Cancel | Save anyway]: Cancel leaves the form as it was on Review; Save anyway sends the same
 * dispatch again with the warning off (`warnDuplicate: false`).
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { pressAlertButton } from '@/tests/helpers/alertMock';
import { triggerError, triggerWarning } from '@/hooks/useHaptics';

let mockCreateMode = true;
let mockChecking = false;
const mockSubmitForm = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { disp_no: 'I0042', disp_date: '2026-10-01', customer_id: 'c1', customer_name: 'Fictional Traders', registration: '', note: '' },
    items: [],
    images: [],
    isSaving: false,
    isCheckingAnswer: mockChecking,
    isCreateMode: mockCreateMode,
    dispatchId: mockCreateMode ? null : 'd1',
    submitForm: mockSubmitForm,
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
    addImageToForm: jest.fn(),
    updateImageStatus: jest.fn(),
    removeImageFromForm: jest.fn(),
    validationErrors: {},
  }),
}));

// Children are stand-ins that keep their props, so the test can read and answer them.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({
  DispatchStepIndicator: (props: object) => require('react').createElement('DispatchStepIndicator', props),
  dispatchSteps: () => [],
}));
jest.mock('@/features/dispatch/components/LostAnswerStrip', () => ({ LostAnswerStrip: 'LostAnswerStrip' }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: 'PrintRangeDialog' }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => require('@/tests/helpers/alertMock').alertModuleMock(jest.fn()));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  unpreparedDispatchPhotos: () => 'ready',
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn().mockResolvedValue({ success: true, data: { items: [] } }) }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

let tree: ReactTestRenderer;
const confirm = () => tree.root.findAllByType('ConfirmDialog' as never)[0];
const success = () => tree.root.findByType('DocumentSuccessDialog' as never);
const submitButton = () => tree.root.find((n) => n.props.testID === 'dispatch-review-submit' && typeof n.props.onPress === 'function');
const alerts = () => (require('@/utils/alert').showAlert as jest.Mock).mock.calls as [string, string, { text: string }[]][];
const duplicateQuestions = () => alerts().filter(([title]) => title === 'Possible duplicate');

const duplicate = {
  kind: 'dispatch' as const,
  existingId: '77777777-2222-4333-8444-555555555555',
  existingNumber: 'I0041',
  createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  createdBy: 'Ravi Example',
  customerName: 'Fictional Traders',
  items: [{ grNo: 'A0010', itemName: 'Potatoes', packaging: 'Jute bag' }],
  vehicle: 'GJ01AB1234',
  windowMinutes: 30,
};

const render = async () => {
  await act(async () => { tree = create(<DispatchReviewStep mode="create" />); });
};
/** Create, then the confirm's own button: the save starts. */
const createAndConfirm = async () => {
  await act(async () => { submitButton().props.onPress(); });
  expect(confirm().props.visible).toBe(true);
  await act(async () => { await confirm().props.onConfirm(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.replaceProperty(Platform, 'OS', 'android');
  mockCreateMode = true;
  mockChecking = false;
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

describe('a direct dispatch that looks like one made a moment ago', () => {
  it('asks "Possible duplicate" with the earlier dispatch, after the confirm has closed, and saves nothing yet', async () => {
    mockSubmitForm.mockResolvedValue({ success: false, duplicate });
    await render();

    await createAndConfirm();

    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
    expect(confirm().props.visible).toBe(false);
    expect(duplicateQuestions()).toHaveLength(1);
    const [, message, buttons] = duplicateQuestions()[0];
    expect(message).toBe(
      'Dispatch I0041 for Fictional Traders was created 4 minutes ago by Ravi Example with the same lots (A0010 · Potatoes · Jute bag) and vehicle GJ01AB1234. Save this as a new dispatch anyway?'
    );
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Save anyway']);
    expect(success().props.isVisible).toBe(false);
  });

  it('is a warning to the hand, not an error: a warning buzz, no error buzz', async () => {
    mockSubmitForm.mockResolvedValue({ success: false, duplicate });
    await render();

    await createAndConfirm();

    expect(triggerWarning).toHaveBeenCalledTimes(1);
    expect(triggerError).not.toHaveBeenCalled();
  });

  it('a refusal that is not the warning is still an error buzz', async () => {
    mockSubmitForm.mockResolvedValue({ success: false, error: 'No stock left' });
    await render();

    await createAndConfirm();

    expect(triggerError).toHaveBeenCalledTimes(1);
    expect(triggerWarning).not.toHaveBeenCalled();
  });

  it('the first save asked for the check: no override', async () => {
    mockSubmitForm.mockResolvedValue({ success: false, duplicate });
    await render();

    await createAndConfirm();

    // (generateInvoice, onFailure, options): a normal save passes no options, so the service asks for the warning.
    expect(mockSubmitForm.mock.calls[0][2]).toBeUndefined();
  });

  it('Save anyway sends the same dispatch again with the warning off, and its success is shown', async () => {
    mockSubmitForm
      .mockResolvedValueOnce({ success: false, duplicate })
      .mockResolvedValueOnce({ success: true, dispatchId: '88888888-2222-4333-8444-555555555555', orderLinesLeft: null, failedPhotos: [] });
    await render();
    await createAndConfirm();

    await act(async () => { pressAlertButton(require('@/utils/alert').showAlert, 'Save anyway'); });

    expect(mockSubmitForm).toHaveBeenCalledTimes(2);
    expect(mockSubmitForm.mock.calls[1][2]).toEqual({ warnDuplicate: false });
    expect(success().props.isVisible).toBe(true);
  });

  it('Save anyway sends nothing, so no answer can arrive, until the question\'s dialog has finished closing (iOS cannot open a Modal over one that is closing)', async () => {
    const alertModule = require('@/utils/alert');
    const original = alertModule.whenAlertsClosed;
    let closed!: () => void;
    alertModule.whenAlertsClosed = () => new Promise<void>((resolve) => { closed = resolve; });
    try {
      mockSubmitForm
        .mockResolvedValueOnce({ success: false, duplicate })
        .mockResolvedValueOnce({ success: true, dispatchId: '88888888-2222-4333-8444-555555555555', orderLinesLeft: null, failedPhotos: [] });
      await render();
      await createAndConfirm();

      // The person answers; the Modal is still closing: nothing is sent, and no success dialog is open.
      await act(async () => { pressAlertButton(alertModule.showAlert, 'Save anyway'); });
      expect(mockSubmitForm).toHaveBeenCalledTimes(1);
      expect(success().props.isVisible).toBe(false);

      await act(async () => { closed(); });
      expect(mockSubmitForm).toHaveBeenCalledTimes(2);
      expect(success().props.isVisible).toBe(true);
    } finally {
      alertModule.whenAlertsClosed = original;
    }
  });

  it('Cancel leaves the form as it was on Review: nothing is sent, and Create can be tried again', async () => {
    mockSubmitForm.mockResolvedValue({ success: false, duplicate });
    await render();
    await createAndConfirm();

    await act(async () => { pressAlertButton(require('@/utils/alert').showAlert, 'Cancel'); });

    expect(mockSubmitForm).toHaveBeenCalledTimes(1);
    expect(success().props.isVisible).toBe(false);
    expect(confirm().props.visible).toBe(false);
    expect(submitButton().props.disabled).toBeFalsy();
    // A second Create asks the server again, with the warning on.
    await act(async () => { submitButton().props.onPress(); });
    expect(confirm().props.visible).toBe(true);
  });

  it('a refusal of the second send (Save anyway) is told like any refusal, and no second warning follows', async () => {
    mockSubmitForm
      .mockResolvedValueOnce({ success: false, duplicate })
      .mockImplementationOnce(async (_invoice: boolean, onFailure: (title: string, message: string) => void) => {
        onFailure('Could not save', 'No stock left');
        return { success: false, error: 'No stock left' };
      });
    await render();
    await createAndConfirm();

    await act(async () => { pressAlertButton(require('@/utils/alert').showAlert, 'Save anyway'); });

    expect(alerts().filter(([title]) => title === 'Could not save')).toHaveLength(1);
    expect(duplicateQuestions()).toHaveLength(1);
  });
});
