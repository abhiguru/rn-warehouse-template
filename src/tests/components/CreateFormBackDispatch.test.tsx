/**
 * New dispatch, step 1: the Android Back key asks "Discard this dispatch?"
 * once something was entered, the question of the X in the header, and
 * "Discard" does what the X's does (owner decision 7 of 2026-10-11). The X
 * asks once: the header's question is the only one. The header is the real one.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { toLocalISODate } from '@/utils/formatters';
import { showAlert } from '@/utils/alert';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import { resetSheetBack, sheetBackPresses } from '@/tests/helpers/backClosingSheet';
import DispatchFormStep1 from '../../../app/dispatch-form/step1';
import DispatchEditStep1 from '../../../app/dispatch-edit/[id]/step1';

const emptyHeader = () => ({
  // Filled in by the form itself when a new dispatch opens.
  disp_no: 'I0002', disp_date: toLocalISODate(new Date()), supervisor_id: 'u1', supervisor_name: 'Fictional Supervisor',
  registration: '', customer_id: '', customer_name: '', customer_address: '', customer_city: '', customer_mobile: '', note: '',
});
const mockForm = {
  header: emptyHeader(),
  items: [] as unknown[],
  images: [] as unknown[],
  // WH-255: the number counts once typed, the date once picked in the picker (not an offered number, not today's date).
  dispNoTyped: false,
  dateChosenByUser: false,
  validationErrors: {},
  isLoading: false,
  isGeneratingNumber: false,
  isCreateMode: true,
  isChanged: false,
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
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
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
// A stand-in that draws its title as an alert while it is visible, so a dialog of the step's own would be seen.
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: ({ visible, title }: { visible: boolean; title: string }) =>
    visible ? require('react').createElement(require('react-native').Text, { accessibilityRole: 'alert' }, title) : null,
}));

let back: ReturnType<typeof installHardwareBack>;
beforeEach(() => {
  jest.clearAllMocks();
  mockForm.header = emptyHeader();
  mockForm.items = [];
  mockForm.images = [];
  mockForm.dispNoTyped = false;
  mockForm.dateChosenByUser = false;
  mockForm.isCreateMode = true;
  mockForm.isChanged = false;
  resetSheetBack();
  back = installHardwareBack();
});
afterEach(() => back.restore());

async function show(element: React.ReactElement = <DispatchFormStep1 />) {
  await render(element);
}
const pressBack = async () => {
  let taken = false;
  await act(async () => { taken = back.press(); });
  return taken;
};
const pressX = async (label = 'Close new dispatch') => {
  await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: label }));
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
const ownDialogs = () => screen.queryAllByRole('alert');

const DISCARD_QUESTION = {
  title: 'Discard this dispatch?',
  message: 'The details you entered will be lost.',
  buttons: [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard dispatch', style: 'destructive' }],
  options: { cancelable: true },
};
const ENTERED: [string, () => void][] = [
  ['a customer', () => { mockForm.header.customer_id = 'c1'; mockForm.header.customer_name = 'Example Traders'; }],
  ['a vehicle number', () => { mockForm.header.registration = 'GJ01XX0000'; }],
  ['a note', () => { mockForm.header.note = 'Call before loading'; }],
  ['only a typed Dispatch number', () => { mockForm.header.disp_no = 'I9'; mockForm.dispNoTyped = true; }],
  ['only a picked date (today, picked in the picker)', () => { mockForm.dateChosenByUser = true; }],
  ['only a line', () => { mockForm.items = [{ unique_id: 'a' }]; }],
  ['only a photo', () => { mockForm.images = [{ id: 'temp_1' }]; }],
  ['only a changed supervisor', () => { mockForm.header.supervisor_id = 'u2'; mockForm.header.supervisor_name = 'Another Supervisor'; }],
];

describe('Back on step 1 of a new dispatch', () => {
  it('leaves for the dispatch list at once while nothing was entered', async () => {
    await show();

    expect(await pressBack()).toBe(true);

    expect(showAlert).not.toHaveBeenCalled();
    expect(ownDialogs()).toHaveLength(0);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/dispatch');
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
  });

  it.each(ENTERED)('asks "Discard this dispatch?" once and stays when the form has %s', async (_what, enter) => {
    enter();
    await show();

    expect(await pressBack()).toBe(true);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toEqual(DISCARD_QUESTION);
    expect(ownDialogs()).toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
  });

  it('"Discard" empties the form and goes to the dispatch list, with no second question', async () => {
    mockForm.header.registration = 'GJ01XX0000';
    await show();
    await pressBack();

    await answer('Discard dispatch');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(ownDialogs()).toHaveLength(0);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
  });

  it('"Keep editing" stays on the form with everything in it', async () => {
    mockForm.header.customer_id = 'c1';
    await show();
    await pressBack();

    await answer('Keep editing');

    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    // Back asks again the next time.
    await pressBack();
    expect(showAlert).toHaveBeenCalledTimes(2);
  });
});

describe('The X on step 1 of a new dispatch', () => {
  it.each(ENTERED)('asks once, exactly what Back asks, when the form has %s', async (_what, enter) => {
    enter();
    await show();

    await pressX();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toEqual(DISCARD_QUESTION);
    expect(ownDialogs()).toHaveLength(0);
    await pressBack();
    expect(showAlert).toHaveBeenCalledTimes(2);
    expect(question()).toEqual(DISCARD_QUESTION);
  });

  it('closes at once, asking nothing, while nothing was entered (WH-217)', async () => {
    await show();

    await pressX();

    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
  });

  it('"Discard" is the end of it: the form is emptied and the list is shown, no second question', async () => {
    mockForm.header.customer_id = 'c1';
    await show();
    await pressX();

    await answer('Discard dispatch');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(ownDialogs()).toHaveLength(0);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/dispatch');
  });
});

describe('Back on step 1 of a new dispatch while a picker is open', () => {
  const open = async (label: string) => {
    await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: label }));
  };
  /** The screen draws itself again, as it does when a field loses focus or a suggestion arrives. */
  const drawAgain = async () => {
    await screen.rerender(<DispatchFormStep1 />);
  };
  const PICKERS: [string, string][] = [
    ['supervisor', 'Supervisor, Fictional Supervisor'],
    ['customer', 'Choose customer'],
  ];

  it.each(PICKERS)('the open %s picker takes Back: it closes, and the form asks nothing', async (name, label) => {
    mockForm.header.note = 'Call before loading';
    await show();
    await open(label);
    await drawAgain();

    expect(await pressBack()).toBe(true);

    expect(sheetBackPresses).toEqual([name]);
    expect(showAlert).not.toHaveBeenCalled();
    expect(ownDialogs()).toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();

    // The picker is closed now, so the next Back is the form's.
    expect(await pressBack()).toBe(true);
    expect(sheetBackPresses).toEqual([name]);
    expect(showAlert).toHaveBeenCalledTimes(1);
  });

  it.each(PICKERS)('the open %s picker takes Back in an empty form too: the form is not left', async (name, label) => {
    await show();
    await open(label);
    await drawAgain();

    expect(await pressBack()).toBe(true);

    expect(sheetBackPresses).toEqual([name]);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('keeps one listener of its own however often the screen draws itself', async () => {
    await show();
    expect(back.count()).toBe(1);

    await drawAgain();
    await drawAgain();

    expect(back.count()).toBe(1);
    await screen.unmount();
    expect(back.count()).toBe(0);
  });
});

describe('Step 1 of a dispatch that is being edited', () => {
  beforeEach(() => {
    mockForm.isCreateMode = false;
    mockForm.header.customer_id = 'c1';
  });
  // WH-264: an edited dispatch asks (X and Back alike) only when something was changed since it opened.
  it('with nothing changed, Back is left to the system, which leaves at once with no question', async () => {
    await show(<DispatchEditStep1 />);

    expect(await pressBack()).toBe(false);

    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
  });

  it('with nothing changed, the X closes with no question', async () => {
    await show(<DispatchEditStep1 />);

    await pressX('Close dispatch edit');

    expect(showAlert).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('after a change, Back asks the same question as the X and leaves nothing yet', async () => {
    mockForm.isChanged = true;
    await show(<DispatchEditStep1 />);

    expect(await pressBack()).toBe(true);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toMatchObject({ title: 'Discard changes to this dispatch?' });
    expect(router.replace).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
  });


  it('the X asks once, about the changes, and "Discard changes" goes back', async () => {
    mockForm.isChanged = true;
    await show(<DispatchEditStep1 />);

    await pressX('Close dispatch edit');

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toMatchObject({
      title: 'Discard changes to this dispatch?',
      message: 'Your changes to this dispatch will be lost.',
    });
    await answer('Discard changes');
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(ownDialogs()).toHaveLength(0);
    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
