/**
 * The customer's rate box (screen B2): one customer's own rate for one item on ScopeRates, typed over in place, with
 * the default rate beside it, Correct / Stop under it, old rates folded and the day control behind a link. Rates come
 * from a mocked useItemRatesFor; saves run against mocked services.
 */
import React from 'react';
import { Dimensions, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import CustomerRatePage from '../../../app/item-rates/[itemId]/customer/[customerId]';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { replaceItemRates } from '@/services/item-pricing-service';
import { customerService } from '@/services/customer-service';
import { RatesOnBar } from '@/features/item-pricing/components/RatesOnBar';
import { F1, ITEMS } from '@/tests/helpers/ratesFixtures';

let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: mockRole } } }),
}));
let mockParams: Record<string, string> = { itemId: 'onion', customerId: 'orchard-b', deactivated: '0' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: jest.fn(() => false) }));
let mockGuard: { hasChanges: boolean } = { hasChanges: false };
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/features/item-pricing/contract', () => ({ ...jest.requireActual('@/features/item-pricing/contract'), notifyRatesChanged: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), undoRateChange: jest.fn() }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/services/customer-service', () => ({ customerService: { getCustomerById: jest.fn() } }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }));

const data = (rows = F1.filter(r => r.item_id === 'onion')): UseItemRatesForResult => ({
  itemRates: { item: ITEMS.find(i => i.id === 'onion')!, rows },
  status: 'ready',
  notFound: false,
  refreshing: false,
  refreshError: false,
  lastUpdated: Date.now(),
  refresh: jest.fn().mockResolvedValue(undefined),
});
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const shown = () => texts(tree).join(' | ');
const byId = (id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function');
const press = (id: string) => act(() => byId(id)[0].props.onPress());
const cell = (id: string) => tree.root.findAllByType(TextInput).find(n => n.props.testID === id)!;
const host = (id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const type = async (id: string, text: string) => { await act(async () => { cell(id).props.onChangeText(text); }); };
const chip = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

// Discard asks "Discard changes?" when figures were typed; this answers it.
const confirmDiscard = async () => {
  const dialog = tree.root.findAll(n => n.props.testID === 'discard-rate-dialog' && typeof n.props.onConfirm === 'function').find(n => n.props.visible);
  expect(dialog?.props.title).toBe('Discard changes?');
  await act(async () => { dialog!.props.onConfirm(); });
};

let tree: ReactTestRenderer;
async function open(role: string, d = data(), params: Record<string, string> = { itemId: 'onion', customerId: 'orchard-b', deactivated: '0' }) {
  mockRole = role;
  mockParams = params;
  jest.mocked(useItemRatesFor).mockReturnValue(d);
  await act(async () => { tree = create(<CustomerRatePage />); });
}
const WINDOW = Dimensions.get('window');
beforeEach(() => {
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
  jest.clearAllMocks();
  mockGuard = { hasChanges: false };
});
afterEach(() => {
  mockParams = { itemId: 'onion', customerId: 'orchard-b', deactivated: '0' };
  act(() => tree.unmount());
  Dimensions.set({ window: WINDOW });
  jest.useRealTimers();
});

describe("Review Orchard B's own rate for Review Onion Red", () => {
  it("is titled with the customer's own rate and names the item (P-19)", async () => {
    await open('admin');
    const s = texts(tree);
    expect(s).toContain("Review Orchard B's own rate");
    expect(s).toContain('Review Onion Red');
  });

  it('shows the own ₹3.00 in the box (not the default ₹3.50) and the default beside it, ₹3.50 per bag, per month (B2)', async () => {
    await open('admin');
    expect(host('rate-box-monthly')).toHaveLength(1);
    expect(cell('band-0-rent').props.value).toBe('3.00');
    expect(cell('first-from').props.value).toBe('0');
    expect(texts(tree)).toContain('Default rate: ₹3.50 per bag, per month');
    expect(host('save-bar')).toHaveLength(0);
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('typing a rent shows the Save bar; Save sends the customer rate with customer_id', async () => {
    jest.mocked(replaceItemRates).mockResolvedValue({ success: true } as never);
    await open('admin');
    await type('band-0-rent', '3.25');
    expect(host('save-bar').length).toBeGreaterThan(0);
    expect(shown()).toContain('Starts on');
    expect(mockGuard.hasChanges).toBe(true);
    // The day choice is folded behind the "Starts on" line (RateStartLine): open it first.
    await press('rate-box-monthly-starts-toggle');
    await act(async () => { chip('Today').props.onPress(); });
    await act(async () => { byId('save-bar-save')[0].props.onPress(); });
    expect(replaceItemRates).toHaveBeenCalledTimes(1);
    expect(replaceItemRates).toHaveBeenCalledWith(expect.objectContaining({
      item_id: 'onion',
      customer_id: 'orchard-b',
      price_type: 'monthly',
      starts_on: '2026-10-14',
      bands: [{ weight_min: 0, weight_max: 100, unit_price: 3.25, labour_rate: 1.5, tax_percent: 5 }],
    }), expect.anything());
  });

  it('Discard puts the saved figure back and the bar goes', async () => {
    await open('admin');
    await type('band-0-rent', '3.25');
    await act(async () => { byId('save-bar-discard')[0].props.onPress(); });
    await confirmDiscard();
    expect(cell('band-0-rent').props.value).toBe('3.00');
    expect(host('save-bar')).toHaveLength(0);
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('Stop this rate opens the stop screen for this customer only; Correct puts the box in correction on its own start day', async () => {
    await open('admin');
    expect(byId('rate-change')).toHaveLength(0);
    press('rate-stop');
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/item-rates/stop',
      params: { item_id: 'onion', item_name: 'Review Onion Red', price_type: 'monthly', customer_id: 'orchard-b', customer_name: 'Review Orchard B' },
    });
    press('rate-correct');
    expect(shown()).toContain('This changes the rate since 1 Jan 2026.');
    await type('band-0-rent', '3.10');
    expect(shown()).toContain('Save correction');
    expect(chip('Today')).toBeUndefined();
  });

  it('staff are not offered Item pricing; if the page were opened they would get no box, no Correct, Stop or Changes button', async () => {
    await open('staff');
    expect(host('rate-box-monthly')).toHaveLength(0);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    for (const id of ['rate-correct', 'rate-stop', 'customer-changes']) expect(byId(id)).toHaveLength(0);
  });

  it('Changes for this customer opens the history of the item and the customer', async () => {
    await open('supervisor');
    press('customer-changes');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-price-history',
      params: { item_id: 'onion', customer_id: 'orchard-b', item_name: 'Review Onion Red', customer_name: 'Review Orchard B' },
    });
  });

  it('keeps old rates of this customer folded and readable', async () => {
    const rows = [...F1.filter(r => r.item_id === 'onion'), { ...F1.find(r => r.customer_id === 'orchard-b')!, id: 'old', unit_price: 2.5, effective_from: '2025-01-01', effective_to: '2025-12-31' }];
    await open('supervisor', data(rows));
    expect(shown()).toContain('Show 1 old rate');
  });
});

describe('a customer with no own rate for the item', () => {
  const noOwn = () => data(F1.filter(r => r.item_id === 'onion' && r.customer_id === null));
  const params = { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '0' };

  it('says invoices use the default rate and offers Add customer rate, which opens the full-screen Add customer rate form', async () => {
    await open('admin', noOwn(), params);
    expect(shown()).toContain('Review Orchard B has no rate of their own for this item now. Invoices use the default rate.');
    expect(host('rate-box-add')).toHaveLength(0);
    press('add-customer-rate');
    // The first rate of a customer is added on its own screen (owner, 2026-10-17); this page opens no box.
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/[itemId]/customer-add/[customerId]',
      params: { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B', deactivated: '0' },
    });
    expect(host('rate-box-add')).toHaveLength(0);
  });

  it('a customer whose own rate ended is in the same place', async () => {
    const rows = F1.filter(r => r.item_id === 'onion').map(r => (r.customer_id ? { ...r, effective_to: '2026-06-30' } : r));
    await open('admin', data(rows));
    expect(shown()).toContain('Review Orchard B has no rate of their own for this item now. Invoices use the default rate.');
    expect(byId('add-customer-rate').length).toBeGreaterThan(0);
  });

  it('keeps the name from the link when there is no row to read it from', async () => {
    await open('admin', data([]), params);
    expect(texts(tree)).toContain("Review Orchard B's own rate");
    expect(byId('add-customer-rate').length).toBeGreaterThan(0);
  });

  it('keeps the name read from the rows when a refresh leaves no row', async () => {
    await open('admin');
    jest.mocked(useItemRatesFor).mockReturnValue(data(F1.filter(r => r.item_id === 'onion' && r.customer_id !== 'orchard-b')));
    await act(async () => { tree.update(<CustomerRatePage />); });
    const s = texts(tree);
    expect(s).toContain("Review Orchard B's own rate");
    expect(s.some(x => x.includes('—'))).toBe(false);
    expect(byId('add-customer-rate').length).toBeGreaterThan(0);
  });
});

describe('the day control is behind a link', () => {
  it('is hidden until "See rates on another day" is tapped; the box stays editable on today', async () => {
    await open('admin');
    expect(shown()).not.toContain('Change date');
    expect(shown()).not.toContain("You're looking at");
    expect(texts(tree)).toContain('See rates on another day');
    press('other-day-link');
    expect(shown()).toContain('Rates for lots received on 14 Oct 2026');
    expect(shown()).toContain('Change date');
    expect(host('rate-box-monthly').length).toBeGreaterThan(0);
    press('other-day-hide');
    expect(shown()).not.toContain('Change date');
  });

  it('another day shows the read-only card, no cell and no write action, a strip and Back to today, which brings the box back', async () => {
    await open('admin');
    press('other-day-link');
    await act(async () => { tree.root.findByType(RatesOnBar).props.onChangeDay('2026-06-01'); });
    expect(host('rate-card-monthly').length).toBeGreaterThan(0);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    for (const id of ['rate-correct', 'rate-stop', 'add-customer-rate', 'add-other-type']) expect(byId(id)).toHaveLength(0);
    expect(shown()).toContain("You're looking at rates for lots received on 1 Jun 2026. Go back to today to change rates.");
    await act(async () => { byId('other-day-back')[0].props.onPress(); });
    expect(cell('band-0-rent').props.value).toBe('3.00');
    expect(shown()).not.toContain("You're looking at");
  });

  it('the `on` param opens the controls on that day, so the page is never silently read-only', async () => {
    await open('admin', data(), { itemId: 'onion', customerId: 'orchard-b', deactivated: '0', on: '2026-06-01' });
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(shown()).toContain('Rates for lots received on 1 Jun 2026');
    expect(byId('other-day-back').length).toBeGreaterThan(0);
  });

  it('the link is gone while a figure is typed over and not saved', async () => {
    await open('admin');
    await type('band-0-rent', '3.25');
    expect(byId('other-day-link')).toHaveLength(0);
    await act(async () => { byId('save-bar-discard')[0].props.onPress(); });
    await confirmDiscard();
    expect(byId('other-day-link').length).toBeGreaterThan(0);
  });
});

describe('loading, error and not found', () => {
  it('loading shows the skeleton, no box', async () => {
    await open('admin', { ...data(), itemRates: undefined, status: 'loading' });
    expect(host('customer-skeleton').length).toBeGreaterThan(0);
    expect(host('scope-rates')).toHaveLength(0);
  });
  it('an error shows Try again, which reads again', async () => {
    const d = { ...data(), itemRates: undefined, status: 'error' as const };
    await open('admin', d);
    expect(host('customer-load-error').length).toBeGreaterThan(0);
    const retry = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Try again')[0];
    await act(async () => { retry.props.onPress(); });
    expect(d.refresh).toHaveBeenCalled();
  });
  it('an item that is no longer active says so', async () => {
    await open('admin', { ...data(), itemRates: undefined, notFound: true });
    expect(host('item-not-found').length).toBeGreaterThan(0);
  });
});

describe('a deactivated customer', () => {
  const link = { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B' };

  it('the link says deactivated=1: the rate is shown read only with the warning, no box and no write button', async () => {
    await open('admin', data(), { ...link, deactivated: '1' });
    expect(customerService.getCustomerById).not.toHaveBeenCalled();
    expect(shown()).toContain('This customer is deactivated. Activate them to change their rates.');
    expect(host('rate-box-monthly')).toHaveLength(0);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    for (const id of ['rate-correct', 'rate-stop', 'add-customer-rate', 'add-other-type']) expect(byId(id)).toHaveLength(0);
  });

  it('the link says nothing: the customer is read, and while that is unknown the rate is read only', async () => {
    let release!: (v: unknown) => void;
    jest.mocked(customerService.getCustomerById).mockReturnValue(new Promise(r => { release = r; }) as never);
    await open('admin', data(), link);
    expect(customerService.getCustomerById).toHaveBeenCalledWith('orchard-b');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    await act(async () => { release({ success: true, data: { active: true } }); });
    expect(cell('band-0-rent').props.value).toBe('3.00');
  });

  it('the customer cannot be read: the rate stays read only', async () => {
    jest.mocked(customerService.getCustomerById).mockRejectedValue(new Error('down'));
    await open('admin', data(), link);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(byId('rate-correct')).toHaveLength(0);
  });
});
