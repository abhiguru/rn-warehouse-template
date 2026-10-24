/**
 * New dispatch, step 1: the Android Back key asks "Discard this dispatch?"
 * once something was entered, the question of the X in the header, and
 * "Discard" does what the X's does (owner decision 7 of 2026-10-11). The X
 * asks once: the header's question is the only one. The header is the real one.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { resetSheetBack, sheetBackPresses } from '@/tests/helpers/backClosingSheet';
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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
// The sheets draw nothing here, but an open one listens for Back as the real ones do.
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('@/tests/helpers/backClosingSheet').refSheet('customer'),
}));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({
  SupervisorBottomSheet: require('@/tests/helpers/backClosingSheet').flagSheet('supervisor'),
}));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: require('react').forwardRef(() => null) }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/WizardBottomBar', () => ({ __esModule: true, default: () => null }));
// A stand-in that keeps its props, so a dialog of the step's own would be seen.
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));

let back: ReturnType<typeof installHardwareBack>;
beforeEach(() => {
  jest.clearAllMocks();
  mockForm.header = emptyHeader();
  mockForm.isCreateMode = true;
  resetSheetBack();
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
const pressX = async (tree: ReactTestRenderer, label = 'Cancel Dispatch') => {
  const close = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  await act(async () => { close.props.onPress(); });
};
/** The last question shown, with its buttons made comparable. */
const question = () => {
  const [title, message, buttons, options] = jest.mocked(showAlert).mock.calls.at(-1)!;
  return { title, message, buttons: buttons!.map((button) => ({ text: button.text, style: button.style })), options };
};
const answer = async (text: string) => {
  const button = jest.mocked(showAlert).mock.calls.at(-1)![2]!.find((candidate) => candidate.text === text)!;
  await act(async () => { button.onPress?.(); });
};
/** A dialog of the step's own on top of the header's question: the second question that used to follow. */
const ownDialogs = (tree: ReactTestRenderer) =>
  tree.root.findAllByType('ConfirmDialog' as unknown as React.ElementType).filter((dialog) => dialog.props.visible);

const DISCARD_QUESTION = {
  title: 'Discard this dispatch?',
  message: 'The details you entered will be lost.',
  buttons: [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive' }],
  options: { cancelable: true },
};
const ENTERED: [string, () => void][] = [
  ['a customer', () => { mockForm.header.customer_id = 'c1'; mockForm.header.customer_name = 'Example Traders'; }],
  ['a vehicle number', () => { mockForm.header.registration = 'GJ01XX0000'; }],
  ['a note', () => { mockForm.header.note = 'Call before loading'; }],
];

describe('Back on step 1 of a new dispatch', () => {
  it('leaves for the dispatch list at once while nothing was entered', async () => {
    const tree = await render();

    expect(await pressBack()).toBe(true);

    expect(showAlert).not.toHaveBeenCalled();
    expect(ownDialogs(tree)).toHaveLength(0);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/dispatch');
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it.each(ENTERED)('asks "Discard this dispatch?" once and stays when the form has %s', async (_what, enter) => {
    enter();
    const tree = await render();

    expect(await pressBack()).toBe(true);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toEqual(DISCARD_QUESTION);
    expect(ownDialogs(tree)).toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('"Discard" empties the form and goes to the dispatch list, with no second question', async () => {
    mockForm.header.registration = 'GJ01XX0000';
    const tree = await render();
    await pressBack();

    await answer('Discard');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(ownDialogs(tree)).toHaveLength(0);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
    await act(async () => { tree.unmount(); });
  });

  it('"Keep editing" stays on the form with everything in it', async () => {
    mockForm.header.customer_id = 'c1';
    const tree = await render();
    await pressBack();

    await answer('Keep editing');

    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    // Back asks again the next time.
    await pressBack();
    expect(showAlert).toHaveBeenCalledTimes(2);
    await act(async () => { tree.unmount(); });
  });
});

describe('The X on step 1 of a new dispatch', () => {
  it.each(ENTERED)('asks once, exactly what Back asks, when the form has %s', async (_what, enter) => {
    enter();
    const tree = await render();

    await pressX(tree);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toEqual(DISCARD_QUESTION);
    expect(ownDialogs(tree)).toHaveLength(0);
    await pressBack();
    expect(showAlert).toHaveBeenCalledTimes(2);
    expect(question()).toEqual(DISCARD_QUESTION);
    await act(async () => { tree.unmount(); });
  });

  it('"Discard" is the end of it: the form is emptied and the list is shown, no second question', async () => {
    mockForm.header.customer_id = 'c1';
    const tree = await render();
    await pressX(tree);

    await answer('Discard');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(ownDialogs(tree)).toHaveLength(0);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
    await act(async () => { tree.unmount(); });
  });
});

describe('Back on step 1 of a new dispatch while a picker is open', () => {
  const open = async (tree: ReactTestRenderer, label: string) => {
    const field = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    await act(async () => { field.props.onPress(); });
  };
  /** The screen draws itself again, as it does when a field loses focus or a suggestion arrives. */
  const drawAgain = async (tree: ReactTestRenderer) => {
    await act(async () => { tree.update(<DispatchFormStep1 />); });
  };
  const PICKERS: [string, string][] = [
    ['supervisor', 'Supervisor, Fictional Supervisor'],
    ['customer', 'Choose customer'],
  ];

  it.each(PICKERS)('the open %s picker takes Back: it closes, and the form asks nothing', async (name, label) => {
    mockForm.header.note = 'Call before loading';
    const tree = await render();
    await open(tree, label);
    await drawAgain(tree);

    expect(await pressBack()).toBe(true);

    expect(sheetBackPresses).toEqual([name]);
    expect(showAlert).not.toHaveBeenCalled();
    expect(ownDialogs(tree)).toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();

    // The picker is closed now, so the next Back is the form's.
    expect(await pressBack()).toBe(true);
    expect(sheetBackPresses).toEqual([name]);
    expect(showAlert).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it.each(PICKERS)('the open %s picker takes Back in an empty form too: the form is not left', async (name, label) => {
    const tree = await render();
    await open(tree, label);
    await drawAgain(tree);

    expect(await pressBack()).toBe(true);

    expect(sheetBackPresses).toEqual([name]);
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('keeps one listener of its own however often the screen draws itself', async () => {
    const tree = await render();
    expect(back.count()).toBe(1);

    await drawAgain(tree);
    await drawAgain(tree);

    expect(back.count()).toBe(1);
    await act(async () => { tree.unmount(); });
    expect(back.count()).toBe(0);
  });
});

describe('Step 1 of a dispatch that is being edited', () => {
  beforeEach(() => {
    mockForm.isCreateMode = false;
    mockForm.header.customer_id = 'c1';
  });

  it('Back is left to the system: the edit flow is as it was', async () => {
    const tree = await render(<DispatchEditStep1 />);

    expect(await pressBack()).toBe(false);

    expect(back.count()).toBe(0);
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('the X asks once, about the changes, and "Discard" goes back', async () => {
    const tree = await render(<DispatchEditStep1 />);

    await pressX(tree, 'Cancel editing');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toMatchObject({
      title: 'Cancel dispatch',
      message: 'Discard your changes to this dispatch? Unsaved changes will be lost.',
    });
    await answer('Discard');
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(ownDialogs(tree)).toHaveLength(0);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });
});
