/**
 * Dispatch review step, a create or save whose answer was lost (owner rule D22). While the server is asked what
 * became of the request the step is locked: no Create, Save, Previous, step pills or edit links, no photo changes, and
 * the X is the only way out, with the warning. The confirm that was busy closes (it would hide all this), and the
 * dialog that follows the answer opens without waiting for a closing that already happened.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { t } from '@/i18n';

const DISPATCH_ID = '11111111-2222-4333-8444-555555555555';

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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
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
const dialogs = () => tree.root.findAllByType('ConfirmDialog' as never);
const confirm = () => dialogs()[0];
const success = () => tree.root.findByType('DocumentSuccessDialog' as never);
const indicator = () => tree.root.findByType('DispatchStepIndicator' as never);
const strips = () => tree.root.findAllByType('LostAnswerStrip' as never);
/** The controls with this test id that can be pressed. */
const byTestId = (id: string) => tree.root.findAll((node) => node.props.testID === id && typeof node.props.onPress === 'function');
const submitButton = () => tree.root.find((n) => n.props.testID === 'dispatch-review-submit' && typeof n.props.onPress === 'function');
const setPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

const render = async (mode: 'create' | 'edit' = 'create') => {
  mockCreateMode = mode === 'create';
  await act(async () => { tree = create(<DispatchReviewStep mode={mode} />); });
};
/** Draws the step again with the lock as `mockChecking` now says. */
const redraw = async (mode: 'create' | 'edit' = 'create') => {
  await act(async () => { tree.update(<DispatchReviewStep mode={mode} />); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockCreateMode = true;
  mockChecking = false;
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  jest.restoreAllMocks();
});

describe('a step that is not locked', () => {
  it('has the strip off, the step pills and edit links on, and the photo button', async () => {
    await render();

    expect(strips()).toHaveLength(0);
    expect(typeof indicator().props.onStepPress).toBe('function');
    expect(indicator().props.cancelMessage).not.toBe(t('errors.lostAnswer.leaveWarning'));
    expect(byTestId('dispatch-review-section-details-edit').length).toBeGreaterThan(0);
    expect(byTestId('dispatch-review-section-items-edit').length).toBeGreaterThan(0);
    expect(tree.root.findAllByType('ImageUploadButton' as never)).toHaveLength(1);
  });
});

describe('a step that is locked while the server is asked', () => {
  beforeEach(() => { mockChecking = true; });

  it('says why, with the strip', async () => {
    await render();

    expect(strips()).toHaveLength(1);
    expect(strips()[0].props.kind).toBe('save');
  });

  it('has no step pills, and the X warns that it may have been saved', async () => {
    await render();

    expect(indicator().props.onStepPress).toBeUndefined();
    expect(indicator().props.cancelMessage).toBe(t('errors.lostAnswer.leaveWarning'));
  });

  it('has no edit links and no photo changes', async () => {
    await render();

    expect(byTestId('dispatch-review-section-details-edit')).toHaveLength(0);
    expect(byTestId('dispatch-review-section-items-edit')).toHaveLength(0);
    expect(tree.root.findAllByType('ImageUploadButton' as never)).toHaveLength(0);
  });

  it('does not open the confirm when Create is tapped', async () => {
    await render();

    await act(async () => { submitButton().props.onPress(); });

    expect(confirm().props.visible).toBe(false);
    expect(mockSubmitForm).not.toHaveBeenCalled();
  });

  it('the same for an edit: the strip and no Save', async () => {
    await render('edit');

    expect(strips()).toHaveLength(1);
    expect(byTestId('dispatch-review-section-details-edit')).toHaveLength(0);
    await act(async () => { submitButton().props.onPress(); });
    expect(confirm().props.visible).toBe(false);
  });
});

describe('the confirm that was busy when the answer was lost', () => {
  const start = async () => {
    await act(async () => { submitButton().props.onPress(); });
    expect(confirm().props.visible).toBe(true);
  };

  it.each(['ios', 'android'] as const)('closes at once, and the success dialog opens when the answer comes (%s)', async (os) => {
    setPlatform(os);
    let answer!: (result: unknown) => void;
    mockSubmitForm.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await render();
    await start();
    await act(async () => { confirm().props.onConfirm(); });
    expect(confirm().props.visible).toBe(true);

    // No answer came: the form is locked, and the confirm (which has no X) is gone.
    mockChecking = true;
    await redraw();
    expect(confirm().props.visible).toBe(false);
    expect(success().props.isVisible).toBe(false);

    // The server says it was saved: the dialogs go on although the confirm closed long ago (no closing is awaited).
    mockChecking = false;
    await act(async () => { answer({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [], orderLinesLeft: null }); });
    await redraw();
    expect(success().props.isVisible).toBe(true);
  });

  it('shows the failure of the resent request once', async () => {
    setPlatform('android');
    const { showAlert } = require('@/utils/alert');
    let answer!: (result: unknown) => void;
    mockSubmitForm.mockImplementation(
      (_generateInvoice: boolean, onFailure: (title: string, message: string) => void) =>
        new Promise((resolve) => { answer = (result) => { onFailure('Could not save', 'No stock left'); resolve(result); }; })
    );
    await render();
    await start();
    await act(async () => { confirm().props.onConfirm(); });
    mockChecking = true;
    await redraw();

    mockChecking = false;
    await act(async () => { answer({ success: false, error: 'No stock left' }); });

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith('Could not save', 'No stock left');
  });

  it('says nothing when the person left meanwhile (the save returned as aborted)', async () => {
    setPlatform('android');
    const { showAlert } = require('@/utils/alert');
    mockSubmitForm.mockResolvedValue({ success: false, aborted: true });
    await render();
    await start();

    await act(async () => { confirm().props.onConfirm(); });

    expect(showAlert).not.toHaveBeenCalled();
    expect(success().props.isVisible).toBe(false);
  });
});
