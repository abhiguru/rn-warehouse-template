/**
 * The items step with the real editor: no pricing pencil any more (prices are changed in Settings, Item pricing),
 * "How pricing works" is a button, and Next stops at a figure that holds refused text.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AccessibilityInfo, Keyboard, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { groupLines } from '@/tests/helpers/invoiceFixtures';
import { openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));

async function render(mode: 'create' | 'edit' = 'create') {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<GestureHandlerRootView><InvoiceItemsStep mode={mode} /></GestureHandlerRootView>); });
  return tree;
}
const press = async (tree: ReactTestRenderer, label: string) => {
  const button = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  await act(async () => { await button.props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the pricing pencil', () => {
  it('is gone from a new invoice and from an edit', async () => {
    for (const mode of ['create', 'edit'] as const) {
      const tree = await render(mode);
      expect(tree.root.findAll((node) => /^Edit pricing for/.test(String(node.props.accessibilityLabel)))).toHaveLength(0);
    }
  });
});

describe('How pricing works', () => {
  it('is a button whose hint does not say its label again', async () => {
    const tree = await render('create');
    const buttons = tree.root.findAll((node) => node.props.accessibilityLabel === 'How pricing works' && typeof node.props.onPress === 'function');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => expect(button.props.accessibilityHint).toBeUndefined());
  });
});

describe('Next', () => {
  it('goes to the review with nothing wrong', async () => {
    const tree = await render();
    await press(tree, 'Next: review');
    expect(mockNavigateToStep).toHaveBeenCalledWith(3);
  });

  it('stays on the step while a figure holds refused text, and announces it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const tree = await render();
    await openAllGroups(tree);
    const cell = tree.root.findAllByType(TextInput).find((node) => node.props.testID === 'cell|edit_0_0|charge')!;
    await act(async () => { cell.props.onFocus({}); });
    await act(async () => { cell.props.onChangeText('1000000'); });

    await press(tree, 'Next: review');

    expect(mockNavigateToStep).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Fix the highlighted figure, then continue.');
  });
});

describe('closing the keyboard', () => {
  it('lets go of the focused input when the keyboard hides (useBlurOnKeyboardHide)', async () => {
    const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
    const focused = { blur: jest.fn() };
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(focused as never);
    await render('create');
    expect(focused.blur).not.toHaveBeenCalled();
    await act(async () => { listen.mock.calls.filter(([name]) => name === 'keyboardDidHide').forEach(([, handler]) => (handler as () => void)()); });
    expect(focused.blur).toHaveBeenCalledTimes(1);
  });
});
