/**
 * Leaving the Add customer rate form and the item's default-rate form (ported from the removed invoice-pencil
 * editor's tests): the guard asks only when something changed, and with the house wording "Discard this rate?". (The
 * hook itself, with the header Back, the Back key and the swipe, is tested in src/hooks/__tests__/useLeaveGuard.test.tsx;
 * here the form's use of it.) A change includes choosing another start day, though no field was typed.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';
import { replaceItemRates } from '@/services/item-pricing-service';
import { RateForm } from '@/features/item-pricing/components/RateForm';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { chip, inputsWithLabel, onionRows, rate } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'admin' } } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
let mockGuard: { hasChanges: boolean; title?: string; blocked?: boolean } = { hasChanges: false };
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean; title?: string; blocked?: boolean }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

const ORCHARD_A = { id: 'cust-a', name: 'Review Orchard A' };

let tree: ReactTestRenderer | undefined;
const DEFAULT_ONLY = onionRows().filter(r => !r.customer_id);

const ratesFor = (rows = DEFAULT_ONLY): UseItemRatesForResult => ({
  itemRates: { item: { id: 'onion', name: 'Review Onion Red', packaging: 'Bag' } as never, rows },
  status: 'ready',
  notFound: false,
  refreshing: false,
  refreshError: false,
  lastUpdated: Date.now(),
  refresh: jest.fn().mockResolvedValue(undefined),
});
async function openCustomer(rows = DEFAULT_ONLY) {
  jest.mocked(useItemRatesFor).mockReturnValue(ratesFor(rows));
  await act(async () => { tree = create(<CustomerRateForm itemId="onion" customerId="cust-a" customerName="Review Orchard A" customerDeactivated={false} />); });
  return tree!;
}
const type = async (t: ReactTestRenderer, label: string, text: string) => {
  await act(async () => { inputsWithLabel(t, label)[0].props.onChangeText(text); });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGuard = { hasChanges: false };
  jest.useFakeTimers({
    now: new Date('2026-10-14T10:00:00+05:30'),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'hrtime'],
  });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.useRealTimers();
});

describe('Add customer rate (Orchard A has none)', () => {
  it('asks nothing when nothing was changed, and names the thing it would discard', async () => {
    await openCustomer();
    expect(mockGuard.hasChanges).toBe(false);
    expect(mockGuard.title).toBe('Discard this rate?');
  });

  it('asks once the rent was typed (3.25 in place of 3.50), and no longer when it is typed back', async () => {
    const t = await openCustomer();
    await type(t, 'Rent ₹/month', '3.25');
    expect(mockGuard.hasChanges).toBe(true);
    await type(t, 'Rent ₹/month', '3.50');
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('asks after a weight band was added', async () => {
    const t = await openCustomer();
    await act(async () => { t.root.find(n => n.props.testID === 'add-band' && typeof n.props.onPress === 'function').props.onPress(); });
    expect(mockGuard.hasChanges).toBe(true);
  });

  it('asks after another start day was chosen, though no field was typed', async () => {
    const t = await openCustomer();
    expect(mockGuard.hasChanges).toBe(false);
    await act(async () => { chip(t, '1 Nov 2026').props.onPress(); });
    expect(mockGuard.hasChanges).toBe(true);
    await act(async () => { chip(t, 'Today').props.onPress(); });
    expect(mockGuard.hasChanges).toBe(false);
  });
});

describe('while the save runs and when the customer cannot be checked', () => {
  it('holds the ways out (blocked) from the tap on Save until the server answers', async () => {
    const t = await openCustomer();
    expect(mockGuard.blocked).toBe(false);
    await type(t, 'Rent ₹/month', '3.25');
    await act(async () => { chip(t, 'Today').props.onPress(); });
    let answer!: (v: unknown) => void;
    jest.mocked(replaceItemRates).mockReturnValue(new Promise(res => { answer = res; }) as never);
    const save = t.root.findAll(n => n.props.testID === 'add-rate-save' && typeof n.props.onPress === 'function')[0];
    await act(async () => { save.props.onPress(); });
    expect(mockGuard.blocked).toBe(true);
    await act(async () => { answer({ success: false, errorCode: 'X', message: 'No.' }); });
    expect(mockGuard.blocked).toBe(false);
  });

  it('a customer that could not be checked shows the strip with Try again, and Try again calls the retry', async () => {
    jest.mocked(useItemRatesFor).mockReturnValue(ratesFor());
    const retry = jest.fn();
    await act(async () => {
      tree = create(<CustomerRateForm itemId="onion" customerId="cust-a" customerName="Review Orchard A" customerDeactivated={null} customerCheckFailed onRetryCustomerCheck={retry} />);
    });
    const text = JSON.stringify(tree!.toJSON());
    expect(text).toContain("Couldn't check this customer. Try again.");
    await act(async () => { tree!.root.find(n => n.props.testID === 'add-rate-customer-check-retry' && typeof n.props.onPress === 'function').props.onPress(); });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows no such strip when the state is simply not read yet', async () => {
    jest.mocked(useItemRatesFor).mockReturnValue(ratesFor());
    await act(async () => { tree = create(<CustomerRateForm itemId="onion" customerId="cust-a" customerName="Review Orchard A" customerDeactivated={null} />); });
    expect(JSON.stringify(tree!.toJSON())).not.toContain("Couldn't check this customer");
  });
});

describe("the item's default rate (RateForm, correct)", () => {
  async function openCorrect() {
    jest.mocked(useItemRatesFor).mockReturnValue(ratesFor([rate('onion', null, 0, 100, 3.5, 1.5, 5, '2025-01-01', null, 'monthly', 'Review Onion Red')] as never));
    await act(async () => { tree = create(<RateForm itemId="onion" mode="correct" priceType="monthly" />); });
    return tree!;
  }

  it('asks nothing when nothing was typed, and asks "Discard this rate?" once the rent is changed', async () => {
    const t = await openCorrect();
    expect(mockGuard.hasChanges).toBe(false);
    expect(mockGuard.title).toBe('Discard this rate?');
    await type(t, 'Rent ₹/month', '3.75');
    expect(mockGuard.hasChanges).toBe(true);
    await type(t, 'Rent ₹/month', '3.50');
    expect(mockGuard.hasChanges).toBe(false);
  });
});
