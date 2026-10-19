/**
 * The items step with the real editor: the pricing pencil shows in a new invoice for those who may
 * change prices and nowhere else, opens the price form, and Next stops at a figure that holds refused text.
 */
import React from 'react';
import { AccessibilityInfo, Keyboard, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { getItemStoragePrices, listItemRates } from '@/services/item-pricing-service';
import { notifyRatesChanged } from '@/features/item-pricing/contract';
import { groupLines } from '@/tests/helpers/invoiceFixtures';
import { InvoiceItemsStep } from '../InvoiceItemsStep';

let mockRole = 'supervisor';
const mockNavigateToStep = jest.fn();
const mockApplySaved = jest.fn();
// Every screen-focus callback, so a test can bring the step back into focus after the price form.
const mockFocusCallbacks: Array<() => void> = [];
const mockItems = groupLines(2);
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
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
jest.mock('@/hooks/useRoleBasedAccess', () => ({ useRoleBasedAccess: () => ({ role: mockRole }) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useFocusEffect: (callback: () => void) => { mockFocusCallbacks.push(callback); },
}));
jest.mock('@/hooks/useBackHandler', () => ({ useBackHandler: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/InvoiceStepIndicator', () => ({ InvoiceStepIndicator: () => null, invoiceSteps: () => [] }));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ getItemStoragePrices: jest.fn(), listItemRates: jest.fn() }));

async function render(mode: 'create' | 'edit' = 'create') {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<InvoiceItemsStep mode={mode} />); });
  return tree;
}
const pencils = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === 'Edit pricing for Example Potatoes' && typeof node.props.onPress === 'function');
const press = async (tree: ReactTestRenderer, label: string) => {
  const button = tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  await act(async () => { await button.props.onPress(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCallbacks.length = 0;
  mockRole = 'supervisor';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the pricing pencil', () => {
  it.each([['admin'], ['supervisor']])('shows in a new invoice for %s', async (role) => {
    mockRole = role;
    expect(pencils(await render('create')).length).toBeGreaterThan(0);
  });

  it.each([['staff'], ['customer']])('is not there for %s', async (role) => {
    mockRole = role;
    expect(pencils(await render('create'))).toHaveLength(0);
  });

  it('is not there when an invoice is edited', async () => {
    expect(pencils(await render('edit'))).toHaveLength(0);
  });

  it('opens the price form of the item and writes nothing', async () => {
    jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 100, offset: 0, has_more: false } } as never);
    const tree = await render('create');
    await act(async () => { await pencils(tree)[0].props.onPress(); });
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/item-rates/edit' }));
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

describe('a saved rate', () => {
  it('is applied to the lines of the item when the step is shown again, and only if the form saved it', async () => {
    jest.mocked(getItemStoragePrices).mockResolvedValue({ success: true, data: [], pagination: { total_count: 0, limit: 100, offset: 0, has_more: false } } as never);
    jest.mocked(listItemRates).mockResolvedValue([
      { id: 'r1', item_id: 'i1', customer_id: null, price_type: 'monthly', unit_price: 6.5, labour_rate: 2.5, tax_percent: 12, weight_min: 0, weight_max: 100, effective_from: '2026-01-01', effective_to: null },
    ] as never);
    const tree = await render('create');
    await act(async () => { await pencils(tree)[0].props.onPress(); });

    // Back from the price form without saving: nothing is applied.
    await act(async () => { await mockFocusCallbacks[mockFocusCallbacks.length - 1](); });
    expect(mockApplySaved).not.toHaveBeenCalled();

    // Again, and this time the form saved a rate for the item.
    await act(async () => { await pencils(tree)[0].props.onPress(); });
    await act(async () => { notifyRatesChanged('i1'); });
    await act(async () => { await mockFocusCallbacks[mockFocusCallbacks.length - 1](); });
    expect(mockApplySaved).toHaveBeenCalledWith([
      expect.objectContaining({ temp_id: 'edit_0_0', charge: 6.5, labour_rate: 2.5, tax: 12 }),
      expect.objectContaining({ temp_id: 'edit_1_0', charge: 6.5, labour_rate: 2.5, tax: 12 }),
    ]);
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
