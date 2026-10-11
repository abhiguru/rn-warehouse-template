/**
 * New GRN, step 1: the Android Back key asks the same question as the X in
 * the header once something was entered, and "Discard" does what the X's
 * does (owner decision 7 of 2026-10-11). The header is the real one.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { installHardwareBack } from '@/tests/helpers/hardwareBack';
import GRNFormStep1 from '../../../app/grn-form/step1';
import GRNEditStep1 from '../../../app/grn-edit/[id]/step1';

const emptyHeader = () => ({
  // Filled in by the form itself when a new GRN opens.
  gr_no: 'A0002', date: '2026-10-11', supervisor_id: 'u1', supervisor_name: 'Fictional Supervisor', pricing_mode: 'MONTHLY', leon: false,
  registration: '', sender_id: '', sender_name: '', customer_id: '', customer_name: '', note: '', gr_images: [] as unknown[],
});
const mockForm = {
  header: emptyHeader(),
  isLoading: false,
  isGeneratingNumber: false,
  isCreateMode: true,
  validationErrors: {},
  handleGrNoChange: jest.fn(),
  updateHeaderField: jest.fn(),
  updateHeaderFields: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
};
let mockItems: unknown[] = [];

jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: mockItems } }),
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

let back: ReturnType<typeof installHardwareBack>;
beforeEach(() => {
  jest.clearAllMocks();
  mockForm.header = emptyHeader();
  mockForm.isCreateMode = true;
  mockItems = [];
  back = installHardwareBack();
});
afterEach(() => back.restore());

async function render(element: React.ReactElement = <GRNFormStep1 />) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
}
const pressBack = async () => {
  let taken = false;
  await act(async () => { taken = back.press(); });
  return taken;
};
const pressX = async (tree: ReactTestRenderer) => {
  const close = tree.root.find((node) => node.props.accessibilityLabel === 'Cancel GRN' && typeof node.props.onPress === 'function');
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

const ENTERED: [string, () => void][] = [
  ['a customer', () => { mockForm.header.customer_id = 'c1'; mockForm.header.customer_name = 'Example Traders'; }],
  ['a sender typed by hand', () => { mockForm.header.sender_name = 'Fictional Sender'; }],
  ['a vehicle number', () => { mockForm.header.registration = 'GJ01XX0000'; }],
  ['a note', () => { mockForm.header.note = 'Bags are wet'; }],
  ['a photo', () => { mockForm.header.gr_images = [{ id: 'temp_1' }]; }],
  ['a line added on the items step', () => { mockItems = [{ grn_trl_id: 'item-1', qty: 10, stock: 10 }]; }],
];

describe('Back on step 1 of a new GRN', () => {
  it('leaves for the GRN list at once while nothing was entered', async () => {
    const tree = await render();

    expect(await pressBack()).toBe(true);

    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/grn');
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it.each(ENTERED)('asks "Discard this GRN?" and stays when the form has %s', async (_what, enter) => {
    enter();
    const tree = await render();

    expect(await pressBack()).toBe(true);

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(question()).toEqual({
      title: 'Discard this GRN?',
      message: 'The details you entered will be lost.',
      buttons: [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive' }],
      options: { cancelable: true },
    });
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(mockForm.resetFormState).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it('asks exactly what the X asks', async () => {
    mockForm.header.customer_id = 'c1';
    const tree = await render();

    await pressBack();
    const fromBack = question();
    await pressX(tree);

    expect(showAlert).toHaveBeenCalledTimes(2);
    expect(question()).toEqual(fromBack);
    await act(async () => { tree.unmount(); });
  });

  it('"Discard" empties the form and goes to the GRN list, as the X\'s does', async () => {
    mockForm.header.customer_id = 'c1';
    const tree = await render();
    await pressBack();

    await answer('Discard');

    expect(mockForm.resetFormState).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/grn');
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

describe('Back on step 1 of a GRN that is being edited', () => {
  it('is not handled by the form: the edit flow is as it was', async () => {
    mockForm.isCreateMode = false;
    mockForm.header.customer_id = 'c1';
    const tree = await render(<GRNEditStep1 />);

    expect(await pressBack()).toBe(false);

    expect(back.count()).toBe(0);
    expect(showAlert).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });
});
