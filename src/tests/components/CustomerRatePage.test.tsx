import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import CustomerRatePage from '../../../app/item-rates/[itemId]/customer/[customerId]';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { F1, ITEMS } from '@/tests/helpers/ratesFixtures';

let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: mockRole } } }),
}));
let mockParams: Record<string, string> = { itemId: 'onion', customerId: 'orchard-b' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: jest.fn(() => false) }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), undoRateChange: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));

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
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function');

let tree: ReactTestRenderer;
async function open(role: string, d = data()) {
  mockRole = role;
  jest.mocked(useItemRatesFor).mockReturnValue(d);
  await act(async () => { tree = create(<CustomerRatePage />); });
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
  jest.clearAllMocks();
});
afterEach(() => {
  mockParams = { itemId: 'onion', customerId: 'orchard-b' };
  act(() => tree.unmount());
  jest.useRealTimers();
});

describe("Review Orchard B's own rate for Review Onion Red", () => {
  it("is titled with the customer's own rate and names the item (P-19)", async () => {
    await open('admin');
    const s = texts(tree);
    expect(s).toContain("Review Orchard B's own rate");
    expect(s).toContain('Review Onion Red');
  });

  it('shows ₹3.00 and the default for comparison, ₹3.50 per bag, per month (B2)', async () => {
    await open('admin');
    const card = tree.root.find(n => n.props.testID === 'rate-card-monthly');
    expect(card.findAllByType(Text)[0].props.children).toBe('₹3.00');
    expect(texts(tree)).toContain('Default rate: ₹3.50 per bag, per month');
  });

  it('has the same three actions for an administrator, stopping this customer only', async () => {
    await open('admin');
    expect(byId(tree, 'rate-change').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-correct').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-stop').length).toBeGreaterThan(0);
    act(() => byId(tree, 'rate-stop')[0].props.onPress());
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/item-rates/stop',
      params: { item_id: 'onion', item_name: 'Review Onion Red', price_type: 'monthly', customer_id: 'orchard-b', customer_name: 'Review Orchard B' },
    });
    act(() => byId(tree, 'rate-change')[0].props.onPress());
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/item-rates/edit',
      params: { mode: 'change', item_id: 'onion', item_name: 'Review Onion Red', price_type: 'monthly', customer_id: 'orchard-b', customer_name: 'Review Orchard B' },
    });
  });

  it('staff are not offered Item pricing; if the page were opened they would get no Change, Stop, Correct or Changes button', async () => {
    await open('staff');
    expect(byId(tree, 'rate-correct').length).toBe(0);
    expect(byId(tree, 'rate-change').length).toBe(0);
    expect(byId(tree, 'rate-stop').length).toBe(0);
    expect(byId(tree, 'customer-changes').length).toBe(0);
  });

  it('Changes for this customer opens the history of the item and the customer', async () => {
    await open('supervisor');
    act(() => byId(tree, 'customer-changes')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-price-history',
      params: { item_id: 'onion', customer_id: 'orchard-b', item_name: 'Review Onion Red' },
    });
  });

  it('a customer whose own rate ended says invoices use the default and offers Add customer rate', async () => {
    const rows = F1.filter(r => r.item_id === 'onion').map(r => (r.customer_id ? { ...r, effective_to: '2026-06-30' } : r));
    await open('admin', data(rows));
    expect(texts(tree).join(' ')).toContain('Review Orchard B has no rate of their own for this item now. Invoices use the default rate.');
    act(() => byId(tree, 'add-customer-rate')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/edit',
      params: { mode: 'addCustomer', item_id: 'onion', item_name: 'Review Onion Red', customer_id: 'orchard-b', customer_name: 'Review Orchard B', price_type: 'monthly' },
    });
  });

  it('keeps old rates of this customer folded and readable', async () => {
    const rows = [...F1.filter(r => r.item_id === 'onion'), { ...F1.find(r => r.customer_id === 'orchard-b')!, id: 'old', unit_price: 2.5, effective_from: '2025-01-01', effective_to: '2025-12-31' }];
    await open('supervisor', data(rows));
    expect(texts(tree).join(' ')).toContain('Show 1 old rate');
  });
});

// CR-04: write actions belong to today's rows only.
describe('another day than today', () => {
  const WRITE_IDS = ['rate-change', 'rate-correct', 'rate-stop', 'edit-upcoming', 'cancel-upcoming', 'undo-stop', 'add-customer-rate'];

  it('shows no write action, a strip and Back to today, which brings the actions back', async () => {
    mockParams = { itemId: 'onion', customerId: 'orchard-b', on: '2026-06-01' };
    await open('admin');
    for (const id of WRITE_IDS) expect(byId(tree, id)).toHaveLength(0);
    expect(texts(tree)).toContain("You're looking at rates for lots received on 1 Jun 2026. Go back to today to change rates.");
    await act(async () => { byId(tree, 'other-day-back')[0].props.onPress(); });
    expect(byId(tree, 'rate-change').length).toBeGreaterThan(0);
    expect(texts(tree).some(s => s.startsWith("You're looking at rates"))).toBe(false);
  });

  describe('a customer left with no own rate keeps their name', () => {
    it('names the customer, titles the page with them and offers Add customer rate', async () => {
      mockParams = { itemId: 'onion', customerId: 'orchard-b', customer_name: 'Review Orchard B' };
      await open('admin', data([]));
      const s = texts(tree);
      expect(s).toContain("Review Orchard B's own rate");
      expect(s.some(x => x.startsWith('Review Orchard B has no rate of their own'))).toBe(true);
      expect(byId(tree, 'add-customer-rate').length).toBeGreaterThan(0);
    });

    it('keeps the name read from the rows when a refresh leaves no row', async () => {
      await open('admin');
      jest.mocked(useItemRatesFor).mockReturnValue(data(F1.filter(r => r.item_id === 'onion' && r.customer_id !== 'orchard-b')));
      await act(async () => { tree.update(<CustomerRatePage />); });
      const s = texts(tree);
      expect(s).toContain("Review Orchard B's own rate");
      expect(s.some(x => x.includes('—'))).toBe(false);
      expect(byId(tree, 'add-customer-rate').length).toBeGreaterThan(0);
    });
  });
});
