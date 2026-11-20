/**
 * Dispatch review step, a create or save whose answer was lost (owner rule D22). While the server is asked what
 * became of the request the step is locked: no Create, Save, Previous, step pills or edit links, no photo changes, and
 * the X is the only way out, with the warning. The confirm that was busy closes (it would hide all this), and the
 * dialog that follows the answer opens without waiting for a closing that already happened.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
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

// Children are stand-ins that draw what the step hands them (an open dialog's title, the step header's pills, X and
// warning, the photo button) and the confirm keeps its props, so the test can answer it.
interface MockDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  onConfirm: () => unknown;
}
let mockDialogs: Record<string, MockDialogProps> = {};
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: MockDialogProps) => {
    const { Text, View } = require('react-native');
    const { createElement } = require('react');
    mockDialogs[props.title] = props;
    return props.visible
      ? createElement(View, { accessible: true, accessibilityRole: 'alert' }, createElement(Text, null, props.title), createElement(Text, null, props.message))
      : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({
  DocumentSuccessDialog: (props: { isVisible: boolean }) =>
    props.isVisible ? require('react').createElement(require('react-native').View, { accessible: true, accessibilityLabel: 'Success dialog' }) : null,
}));
jest.mock('@/components/DispatchStepIndicator', () => ({
  DispatchStepIndicator: (props: { onStepPress?: () => void; disabled?: boolean; leaveWarning?: string; cancelMessage?: string }) => {
    const { Pressable, Text, View } = require('react-native');
    const { createElement } = require('react');
    return createElement(
      View,
      null,
      props.onStepPress ? createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Step pills', onPress: props.onStepPress }) : null,
      createElement(Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: 'Close',
        accessibilityHint: props.cancelMessage,
        accessibilityState: { disabled: props.disabled },
      }),
      props.leaveWarning === undefined ? null : createElement(Text, { testID: 'leave-warning' }, props.leaveWarning)
    );
  },
  dispatchSteps: () => [],
}));
jest.mock('@/features/dispatch/components/LostAnswerStrip', () => ({
  LostAnswerStrip: (props: { kind: string }) => require('react').createElement(require('react-native').Text, null, `Checking (${props.kind})`),
}));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({
  ImageUploadButton: () => require('react').createElement(require('react-native').Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Add photos' }),
}));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

const confirmTitle = () => (mockCreateMode ? 'Create dispatch I0042?' : 'Save changes to dispatch I0042?');
const confirmProps = () => mockDialogs[confirmTitle()];
const confirmOnScreen = () => screen.queryByText(confirmTitle());
const successDialog = () => screen.queryByLabelText('Success dialog');
const closeButton = () => screen.getByRole('button', { name: 'Close' });
const stepPills = () => screen.queryByRole('button', { name: 'Step pills' });
/** The edit links of the two cards: they carry the edit labels. */
const editLinks = (name: string) => screen.queryAllByRole('button', { name });
/** Create or Save; while the step is locked its label is the busy one ('Creating dispatch…'). */
const submitButton = () => screen.getByRole('button', { name: /^(Creat|Sav)/ });
/** The button's own handler, called past the disabled state: what the bar's loading guard has to hold against. */
const pressPastDisabled = async () => {
  // Testing Library shows host views only; the Pressable's own onPress is on the fiber above the button's view.
  let fiber = submitButton().unstable_fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
  const onPress = fiber?.memoizedProps.onPress as () => unknown;
  await act(async () => { await onPress(); });
};
const setPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

const show = async (mode: 'create' | 'edit' = 'create') => {
  mockCreateMode = mode === 'create';
  await render(<DispatchReviewStep mode={mode} />);
};
/** Draws the step again with the lock as `mockChecking` now says. */
const redraw = async (mode: 'create' | 'edit' = 'create') => {
  await screen.rerender(<DispatchReviewStep mode={mode} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockCreateMode = true;
  mockChecking = false;
  mockDialogs = {};
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('a step that is not locked', () => {
  it('has the strip off, the step pills and edit links on, and the photo button', async () => {
    await show();

    expect(screen.queryByText('Checking (save)')).not.toBeOnTheScreen();
    expect(stepPills()).toBeOnTheScreen();
    expect(screen.queryByHintText(t('errors.lostAnswer.leaveWarning'))).not.toBeOnTheScreen();
    // Exactly `disabled: false`, not a missing key.
    expect(closeButton().props.accessibilityState).toEqual({ disabled: false });
    expect(screen.queryByTestId('leave-warning')).not.toBeOnTheScreen();
    expect(editLinks('Edit dispatch details').length).toBeGreaterThan(0);
    expect(editLinks('Edit items').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Add photos', includeHiddenElements: true })).toHaveLength(1);
  });
});

describe('a step that is locked while the server is asked', () => {
  beforeEach(() => { mockChecking = true; });

  it('says why, with the strip', async () => {
    await show();

    // The strip says 'saved' (kind 'save'), not 'deleted'.
    expect(screen.getByText('Checking (save)')).toBeOnTheScreen();
    expect(screen.queryByText('Checking (delete)')).not.toBeOnTheScreen();
  });

  it('has no step pills, and the X warns that it may have been saved', async () => {
    await show();

    expect(stepPills()).not.toBeOnTheScreen();
    // The X still asks, with the warning, and its buttons read 'Keep waiting' / 'Leave anyway' (the header does that
    // when it is `disabled` and has a `leaveWarning`).
    expect(closeButton().props.accessibilityState).toEqual({ disabled: true });
    expect(screen.getByTestId('leave-warning')).toHaveTextContent(t('errors.lostAnswer.leaveWarning'));
  });

  it('has no edit links and no photo changes', async () => {
    await show();

    expect(editLinks('Edit dispatch details')).toHaveLength(0);
    expect(editLinks('Edit items')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Add photos', includeHiddenElements: true })).not.toBeOnTheScreen();
  });

  it('does not open the confirm when Create is tapped', async () => {
    await show();

    // The step is busy, so Create is disabled and a tap does not reach the handler at all.
    expect(submitButton()).toBeDisabled();
    await userEvent.setup({ delay: 0 }).press(submitButton());
    await pressPastDisabled();

    expect(confirmOnScreen()).not.toBeOnTheScreen();
    expect(mockSubmitForm).not.toHaveBeenCalled();
  });

  it('the same for an edit: the strip and no Save', async () => {
    await show('edit');

    expect(screen.getByText('Checking (save)')).toBeOnTheScreen();
    expect(editLinks('Edit dispatch details')).toHaveLength(0);
    expect(submitButton()).toBeDisabled();
    await userEvent.setup({ delay: 0 }).press(submitButton());
    await pressPastDisabled();
    expect(confirmOnScreen()).not.toBeOnTheScreen();
  });
});

describe('the confirm that was busy when the answer was lost', () => {
  const start = async () => {
    await userEvent.setup({ delay: 0 }).press(submitButton());
    expect(await screen.findByText(confirmTitle())).toBeOnTheScreen();
  };

  it.each(['ios', 'android'] as const)('closes at once, and the success dialog opens when the answer comes (%s)', async (os) => {
    setPlatform(os);
    let answer!: (result: unknown) => void;
    mockSubmitForm.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await show();
    await start();
    await act(async () => { confirmProps().onConfirm(); });
    expect(confirmOnScreen()).toBeOnTheScreen();

    // No answer came: the form is locked, and the confirm (which has no X) is gone.
    mockChecking = true;
    await redraw();
    expect(confirmOnScreen()).not.toBeOnTheScreen();
    expect(successDialog()).not.toBeOnTheScreen();

    // The server says it was saved: the dialogs go on although the confirm closed long ago (no closing is awaited).
    mockChecking = false;
    await act(async () => { answer({ success: true, dispatchId: DISPATCH_ID, failedPhotos: [], orderLinesLeft: null }); });
    await redraw();
    expect(successDialog()).toBeOnTheScreen();
  });

  it('shows the failure of the resent request once', async () => {
    setPlatform('android');
    const { showAlert } = require('@/utils/alert');
    let answer!: (result: unknown) => void;
    mockSubmitForm.mockImplementation(
      (_generateInvoice: boolean, onFailure: (title: string, message: string) => void) =>
        new Promise((resolve) => { answer = (result) => { onFailure('Could not save', 'No stock left'); resolve(result); }; })
    );
    await show();
    await start();
    await act(async () => { confirmProps().onConfirm(); });
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
    await show();
    await start();

    await act(async () => { confirmProps().onConfirm(); });

    expect(showAlert).not.toHaveBeenCalled();
    expect(successDialog()).not.toBeOnTheScreen();
  });
});
