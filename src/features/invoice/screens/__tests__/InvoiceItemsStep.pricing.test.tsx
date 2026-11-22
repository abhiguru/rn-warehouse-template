/**
 * The items step with the real editor: no pricing pencil any more (prices are changed in Settings, Item pricing),
 * "How pricing works" is a button, and Next stops at a figure that holds refused text.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AccessibilityInfo, Keyboard, TextInput } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { groupLines } from '@/tests/helpers/invoiceFixtures';
import { flashListOf, inputOf, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import { expectRevealWired, recordedRevealRefs } from '@/tests/helpers/revealWiring';
import { InvoiceItemsStep } from '../InvoiceItemsStep';

const mockNavigateToStep = jest.fn();
const mockApplySaved = jest.fn();
const mockItems = groupLines(2);
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => ({ invoiceForm: { items: [], editedItems: {}, bulkPricing: {}, header: {} } }), subscribe: () => () => undefined, dispatch: jest.fn() }),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, invoiceForm: { bulkPricing: {} } }),
}));
jest.mock('@/hooks/useInvoiceForm', () => ({
  useInvoiceForm: () => ({
    header: { customer_id: 'cccccccc-2222-4333-8444-555555555555', customer_name: 'Example Traders', one_time_charge: false, inv_no: 12 },
    items: mockItems,
    itemOverrides: {},
    invoiceId: 'inv-42',
    updateItemPricing: jest.fn(),
    applyGroupPricing: jest.fn(),
    applySavedRatesToLines: mockApplySaved,
    navigateToStep: mockNavigateToStep,
    resetFormState: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useRevealFocusedField', () => require('@/tests/helpers/revealWiring').recordRevealRefs());
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

async function mount(mode: 'create' | 'edit' = 'create') {
  await render(<GestureHandlerRootView><InvoiceItemsStep mode={mode} /></GestureHandlerRootView>);
}
const press = async (label: string) => { await userEvent.press(screen.getByRole('button', { name: label })); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('the items list notes a drag on its scroll view (useRevealScrollRef), so a moved bar does not scroll back', async () => {
  recordedRevealRefs.length = 0;
  await mount();
  const lists = screen.root!.queryAll((n) => typeof n.props.onScrollBeginDrag === 'function', { includeSelf: true });
  expect(lists.length).toBeGreaterThan(0);
  // WH-243: the list (the editor passes the step's handlers on to its FlashList) carries the step's own reveal handlers
  expect(recordedRevealRefs).toHaveLength(1);
  expectRevealWired(flashListOf(), recordedRevealRefs[0]);
});

describe('the pricing pencil', () => {
  it('is gone from a new invoice and from an edit', async () => {
    for (const mode of ['create', 'edit'] as const) {
      await mount(mode);
      expect(screen.queryAllByLabelText(/^Edit pricing for/)).toHaveLength(0);
      await screen.unmount();
    }
  });
});

describe('How pricing works', () => {
  it('is a button whose hint does not say its label again', async () => {
    await mount('create');
    const buttons = screen.getAllByRole('button', { name: 'How pricing works' });
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => expect(button.props.accessibilityHint).toBeUndefined());
  });
});

describe('Next', () => {
  it('goes to the review with nothing wrong', async () => {
    await mount();
    await press('Review');
    expect(mockNavigateToStep).toHaveBeenCalledWith(3);
  });

  it('stays on the step while a figure holds refused text, and announces it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await mount();
    await openAllGroups();
    const cell = inputOf('cell|edit_0_0|charge');
    await fireEvent(cell, 'focus', {});
    await fireEvent.changeText(cell, '1000000');

    await press('Review');

    expect(mockNavigateToStep).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Fix the highlighted figure, then continue.');
  });
});

describe('closing the keyboard', () => {
  it('lets go of the focused input when the keyboard hides (useBlurOnKeyboardHide)', async () => {
    const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
    const focused = { blur: jest.fn() };
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(focused as never);
    await mount('create');
    expect(focused.blur).not.toHaveBeenCalled();
    await act(async () => { listen.mock.calls.filter(([name]) => name === 'keyboardDidHide').forEach(([, handler]) => (handler as () => void)()); });
    expect(focused.blur).toHaveBeenCalledTimes(1);
  });
});
