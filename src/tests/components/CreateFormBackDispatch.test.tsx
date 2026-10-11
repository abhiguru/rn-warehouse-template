/**
 * New dispatch, step 1: the Android Back key asks before discarding once
 * something was entered, with the step's own "Discard this dispatch?" dialog,
 * and "Discard dispatch" does what it does after the X (owner decision 7 of
 * 2026-10-11).
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import DispatchFormStep1 from '../../../app/dispatch-form/step1';
import DispatchEditStep1 from '../../../app/dispatch-edit/[id]/step1';

const emptyHeader = () => ({
  // Filled in by the form itself when a new dispatch opens.
  disp_no: 'I0002', disp_date: '2026-10-11', supervisor_id: 'u1', supervisor_name: 'Fictional Supervisor',
  registration: '', customer_id: '', customer_name: '', customer_address: '', customer_city: '', customer_mobile: '', note: '',
});
const mockForm = {
  header: emptyHeader(),
  validationErrors: {},
  isLoading: false,
  isGeneratingNumber: false,
  isCreateMode: true,
  updateHeaderField: jest.fn(),
  updateHeaderFields: jest.fn(),
  handleDispNoChange: jest.fn(),
  clearFieldValidationError: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
};

jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => {
  const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (callback: () => void | (() => void)) => require('react').useEffect(callback, [callback]),
  };
});
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: require('react').forwardRef(() => null) }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: () => null }));
// A stand-in that keeps its props, so the test can read the dialog and press its buttons.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));

let back: ReturnType<typeof installHardwareBack>;
beforeEach(() => {
  jest.clearAllMocks();
  mockForm.header = emptyHeader();
  mockForm.isCreateMode = true;
  back = installHardwareBack();
});
afterEach(() => back.restore());

async function render(element: React.ReactElement = <DispatchFormStep1 />) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
}
const pressBack = async () => {
  let taken = false;
  await act(async () => { taken = back.press(); });
  return taken;
};
const dialog = (tree: ReactTestRenderer) => tree.root.findByType('ConfirmDialog' as unknown as React.ElementType);

describe('Back on step 1 of a new dispatch', () => {
  it('leaves for the dispatch list at once while nothing was entered', async () => {
    const tree = await render();

    expect(await pressBack()).toBe(true);

    expect(dialog(tree).props.visible).toBe(false);
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/dispatch');
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it.each([
    ['a customer', () => { mockForm.header.customer_id = 'c1'; mockForm.header.customer_name = 'Example Traders'; }],
    ['a note', () => { mockForm.header.note = 'Call before loading'; }],
  ])('asks "Discard this dispatch?" and stays when the form has %s', async (_what, enter) => {
    enter();
    const tree = await render();
    expect(dialog(tree).props.visible).toBe(false);

    expect(await pressBack()).toBe(true);

    expect(dialog(tree).props).toMatchObject({
      visible: true,
      title: 'Discard this dispatch?',
      message: 'The details you entered will be lost.',
      confirmText: 'Discard dispatch',
      cancelText: 'Keep editing',
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('"Discard dispatch" empties the form and goes to the dispatch list', async () => {
    mockForm.header.customer_id = 'c1';
    const tree = await render();
    await pressBack();

    await act(async () => { dialog(tree).props.onConfirm(); });

    expect(dialog(tree).props.visible).toBe(false);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
    await act(async () => { tree.unmount(); });
  });

  it('"Keep editing" closes the question and stays on the form', async () => {
    mockForm.header.customer_id = 'c1';
    const tree = await render();
    await pressBack();

    await act(async () => { dialog(tree).props.onCancel(); });

    expect(dialog(tree).props.visible).toBe(false);
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    // Back asks again the next time.
    await pressBack();
    expect(dialog(tree).props.visible).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it('shows the dialog the X ends in, and "Discard" there does the same', async () => {
    mockForm.header.customer_id = 'c1';
    const tree = await render();
    const close = tree.root.find((node) => node.props.accessibilityLabel === 'Cancel Dispatch' && typeof node.props.onPress === 'function');

    // The X asks in the header first, then the step shows this dialog.
    await act(async () => { close.props.onPress(); });
    const discard = jest.mocked(showAlert).mock.calls[0][2]!.find((button) => button.text === 'Discard')!;
    await act(async () => { discard.onPress!(); });
    const afterX = { ...dialog(tree).props };
    await act(async () => { dialog(tree).props.onCancel(); });

    await pressBack();

    const { onConfirm: _a, onCancel: _b, ...shownByBack } = dialog(tree).props;
    const { onConfirm: _c, onCancel: _d, ...shownByX } = afterX;
    expect(shownByBack).toEqual(shownByX);
    await act(async () => { tree.unmount(); });
  });
});

describe('Back on step 1 of a dispatch that is being edited', () => {
  it('is left to the system: the edit flow is as it was', async () => {
    mockForm.isCreateMode = false;
    mockForm.header.customer_id = 'c1';
    const tree = await render(<DispatchEditStep1 />);

    expect(await pressBack()).toBe(false);

    expect(dialog(tree).props.visible).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
