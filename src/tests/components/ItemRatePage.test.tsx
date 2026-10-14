/**
 * The item page (screen B): the rate in force, what comes next, old rates, and the actions each
 * role may take. Rates come from a mocked useItemRatesFor; the actions run against mocked services.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import ItemRatesPage from '../../../app/item-rates/[itemId]';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { replaceItemRates, undoRateChange } from '@/services/item-pricing-service';
import { showToast } from '@/utils/toast';
import { showAlert } from '@/utils/alert';
import { F1, ITEMS, ORCHARD_B, row } from '@/tests/helpers/ratesFixtures';
import { notifyRatesChanged } from '@/features/item-pricing/contract';
import { CustomerPickerSheet } from '@/features/item-pricing/components/CustomerPickerSheet';

let mockRole = 'admin';
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: mockRole } } }),
}));
let mockParams: Record<string, string> = { itemId: 'cumin' };
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => mockParams }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: jest.fn(() => false) }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/features/item-pricing/contract', () => ({ ...jest.requireActual('@/features/item-pricing/contract'), notifyRatesChanged: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), undoRateChange: jest.fn() }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null }));

const itemRows = (id: string) => ({ item: ITEMS.find(i => i.id === id)!, rows: F1.filter(r => r.item_id === id) });
const page = (over: Partial<UseItemRatesForResult> = {}): UseItemRatesForResult => ({
  itemRates: itemRows('cumin'),
  status: 'ready',
  notFound: false,
  refreshing: false,
  refreshError: false,
  lastUpdated: Date.now(),
  refresh: jest.fn().mockResolvedValue(undefined),
  ...over,
});
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const shown = (tree: ReactTestRenderer) => texts(tree).join(' | ');
const byId = (tree: ReactTestRenderer, id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function');
const press = (tree: ReactTestRenderer, id: string) => act(() => byId(tree, id)[0].props.onPress());

let tree: ReactTestRenderer;
async function open(role: string, data: Partial<UseItemRatesForResult> = {}, params: Record<string, string> = { itemId: 'cumin' }) {
  mockRole = role;
  mockParams = params;
  jest.mocked(useItemRatesFor).mockReturnValue(page(data));
  await act(async () => { tree = create(<ItemRatesPage />); });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

describe('item page: Review Cumin Bold on 14 Oct 2026', () => {
  it('shows ₹11.00 per bag, per month as the figure, never the later ₹12.00 (P-10, P-20)', async () => {
    await open('admin');
    const card = tree.root.find(n => n.props.testID === 'rate-card-monthly');
    const text = card.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
    expect(text[0]).toBe('₹11.00');
    expect(text).toContain('per bag, per month');
    expect(text).toContain('Weight each');
    expect(text).toContain('0–100 kg');
    expect(text).toContain('₹3.00 per bag, charged once at dispatch');
    expect(text).toContain('5% on rent and labour');
    expect(text).toContain('Lots received since 1 Apr 2026');
    expect(text).not.toContain('₹12.00');
  });

  it('shows the later rate as a strip with Edit new rate and Cancel new rate (P-10)', async () => {
    await open('admin');
    expect(shown(tree)).toContain('From 1 Jan 2027: ₹12.00 per bag, per month');
    expect(byId(tree, 'edit-upcoming').length).toBeGreaterThan(0);
    expect(byId(tree, 'cancel-upcoming').length).toBeGreaterThan(0);
    press(tree, 'edit-upcoming');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/edit',
      params: { mode: 'upcoming', item_id: 'cumin', item_name: 'Review Cumin Bold', price_type: 'monthly', starts_on: '2027-01-01' },
    });
  });

  it('an administrator has Change rate, Correct this rate and Stop this rate, and no Delete (P-24, P-25)', async () => {
    await open('admin');
    expect(byId(tree, 'rate-change').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-correct').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-stop').length).toBeGreaterThan(0);
    const labels = texts(tree);
    expect(labels.some(l => /delete/i.test(l))).toBe(false);
    press(tree, 'rate-correct');
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/item-rates/edit',
      params: { mode: 'correct', item_id: 'cumin', item_name: 'Review Cumin Bold', price_type: 'monthly', starts_on: '2026-04-01' },
    });
    press(tree, 'rate-stop');
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/item-rates/stop',
      params: { item_id: 'cumin', item_name: 'Review Cumin Bold', price_type: 'monthly' },
    });
    press(tree, 'rate-change');
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/item-rates/edit',
      params: { mode: 'change', item_id: 'cumin', item_name: 'Review Cumin Bold', price_type: 'monthly' },
    });
  });

  it('staff cannot correct: no Correct button, the reason is shown (P-45)', async () => {
    await open('staff');
    expect(byId(tree, 'rate-change').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-stop').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-correct').length).toBe(0);
    expect(shown(tree)).toContain('Only an administrator or supervisor can correct a rate that is already in force.');
    expect(byId(tree, 'item-changes').length).toBe(0);
  });

  it('Changes is for an administrator or supervisor only (P-12)', async () => {
    await open('supervisor');
    press(tree, 'item-changes');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-price-history', params: { item_id: 'cumin', item_name: 'Review Cumin Bold' } });
  });

  it('Cancel new rate says the current rate continues, then undoes the change from its start day (P-24, P-37)', async () => {
    jest.mocked(undoRateChange).mockResolvedValue({ success: true });
    await open('admin');
    press(tree, 'cancel-upcoming');
    const dialog = tree.root.find(n => n.props.testID === 'cancel-rate-dialog');
    expect(dialog.props.visible).toBe(true);
    expect(dialog.props.variant).toBe('danger');
    expect(dialog.props.title).toBe('Cancel the rate from 1 Jan 2027?');
    expect(dialog.props.message).toBe('₹11.00 per bag, per month continues after 31 Dec 2026. The new rate of ₹12.00 is removed.');
    expect(dialog.props.confirmText).toBe('Cancel new rate');
    expect(dialog.props.cancelText).toBe('Keep it');
    await act(async () => { dialog.props.onConfirm(); });
    expect(undoRateChange).toHaveBeenCalledTimes(1);
    expect(undoRateChange).toHaveBeenCalledWith({ itemId: 'cumin', customerId: null, priceType: 'monthly', startsOn: '2027-01-01' });
    expect(notifyRatesChanged).toHaveBeenCalledWith('cumin');
    expect(showToast).toHaveBeenCalledWith('New rate cancelled.');
    expect(tree.root.find(n => n.props.testID === 'cancel-rate-dialog').props.visible).toBe(false);
  });

  it('a Cancel new rate that finds nothing to undo shows that message and still refreshes', async () => {
    jest.mocked(undoRateChange).mockResolvedValue({ success: false, errorCode: 'NOTHING_TO_UNDO', message: 'There is no change starting on that day to undo.' });
    await open('admin');
    press(tree, 'cancel-upcoming');
    await act(async () => { tree.root.find(n => n.props.testID === 'cancel-rate-dialog').props.onConfirm(); });
    expect(showAlert).toHaveBeenCalledWith("Couldn't cancel the new rate", 'There is no change starting on that day to undo.');
    expect(showToast).not.toHaveBeenCalled();
    expect(notifyRatesChanged).toHaveBeenCalledWith('cumin');
  });

  it('Keep it closes the dialog and deletes nothing', async () => {
    await open('admin');
    press(tree, 'cancel-upcoming');
    act(() => tree.root.find(n => n.props.testID === 'cancel-rate-dialog').props.onCancel());
    expect(undoRateChange).not.toHaveBeenCalled();
    expect(tree.root.find(n => n.props.testID === 'cancel-rate-dialog').props.visible).toBe(false);
  });

  it('old rates are folded, readable by staff, and say Ended, not Expired (P-12, P-21)', async () => {
    await open('staff');
    expect(shown(tree)).toContain('Show 1 old rate');
    expect(shown(tree)).not.toContain('₹10.00');
    press(tree, 'old-rates-toggle');
    const s = shown(tree);
    expect(s).toContain('₹10.00 per bag, per month · 1 Jan 2025 – 31 Mar 2026');
    expect(s).toContain('Ended');
    expect(s).toContain('Still used for lots received 1 Jan 2025 – 31 Mar 2026 that are not invoiced yet.');
    expect(s).not.toMatch(/Expired/);
    expect(s).toContain('Hide old rates');
  });

  it('names Default rate and Customer rates, with no Base or Default pricing, and a clean header (P-19, P-33)', async () => {
    await open('admin');
    const s = shown(tree);
    expect(s).toContain('All customers pay this unless they have their own rate.');
    expect(s).not.toMatch(/Base|Default pricing/);
    // The section headers read exactly "Default rate" and "Customer rates, 0": no icon glyph in front (P-33).
    const headers = tree.root.findAll(n => n.props.accessibilityRole === 'header' && typeof n.props.accessibilityLabel === 'string' && n.props.accessible === true);
    expect([...new Set(headers.map(h => h.props.accessibilityLabel))]).toEqual(['Default rate', 'Customer rates, 0']);
    expect(headers[0].props.accessibilityLabel).not.toMatch(/[\uE000-\uF8FF]/);
  });

  it('offers to add a one-time rate when the item only has a monthly one (P-13)', async () => {
    await open('admin');
    press(tree, 'add-other-type');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/edit',
      params: { mode: 'add', item_id: 'cumin', item_name: 'Review Cumin Bold', price_type: 'one_time' },
    });
    expect(shown(tree)).toContain('Add one-time rate');
  });

  it('shows the rule and opens the five-line sheet from the link', async () => {
    await open('admin');
    expect(shown(tree)).toContain('Invoices use the rate in force on the day the goods were received. A customer\'s own rate comes before the default rate.');
    press(tree, 'how-link');
    const s = shown(tree);
    for (const line of ['The customer\'s own rate, if there is one for that bag weight.', 'Otherwise the default rate.', 'The narrowest weight band that holds the weight of one bag.', 'The rate in force on the day the goods were received, not the invoice or dispatch day.', 'If two rates tie, the one that started last.']) {
      expect(s).toContain(line);
    }
  });

  it('is built without Modal, Swipeable or animations (P-25, P-37)', () => {
    const files = ['app/item-rates/[itemId].tsx', 'app/item-rates/[itemId]/customer/[customerId].tsx', 'src/features/item-pricing/components/RateCard.tsx'];
    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, '../../../', file), 'utf8');
      expect(source).not.toMatch(/Swipeable|LayoutAnimation|from 'react-native'[^;]*\bModal\b/);
    }
  });
});

describe('item page states', () => {
  it('a rate that stops shows the strip; Undo stop undoes the change from the next day and the strip goes (P-29)', async () => {
    const stopping = [row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, labour_rate: 1.5, effective_from: '2025-01-01', effective_to: '2027-03-31' })];
    jest.mocked(undoRateChange).mockResolvedValue({ success: true });
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'onion')!, rows: stopping } }, { itemId: 'onion' });
    expect(shown(tree)).toContain('This rate stops after 31 Mar 2027.');
    await act(async () => { byId(tree, 'undo-stop')[0].props.onPress(); });
    expect(undoRateChange).toHaveBeenCalledWith({ itemId: 'onion', customerId: null, priceType: 'monthly', startsOn: '2027-04-01' });
    expect(replaceItemRates).not.toHaveBeenCalled();
    expect(notifyRatesChanged).toHaveBeenCalledWith('onion');
    expect(showToast).toHaveBeenCalledWith('The rate continues.');
    // The refetch brings the re-opened row: no end date, so no stop strip.
    const reopened = [{ ...stopping[0], effective_to: null }];
    jest.mocked(useItemRatesFor).mockReturnValue(page({ itemRates: { item: ITEMS.find(i => i.id === 'onion')!, rows: reopened } }));
    await act(async () => { tree.update(<ItemRatesPage />); });
    expect(shown(tree)).not.toContain('This rate stops after');
    expect(byId(tree, 'undo-stop').length).toBe(0);
    expect(shown(tree)).toContain('Lots received since 1 Jan 2025');
  });

  it('Undo stop that finds nothing to undo shows that message', async () => {
    const stopping = [row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, effective_from: '2025-01-01', effective_to: '2027-03-31' })];
    jest.mocked(undoRateChange).mockResolvedValue({ success: false, errorCode: 'NOTHING_TO_UNDO', message: 'There is no change starting on that day to undo.' });
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'onion')!, rows: stopping } }, { itemId: 'onion' });
    await act(async () => { byId(tree, 'undo-stop')[0].props.onPress(); });
    expect(showAlert).toHaveBeenCalledWith("Couldn't undo the stop", 'There is no change starting on that day to undo.');
    expect(showToast).not.toHaveBeenCalled();
    expect(notifyRatesChanged).toHaveBeenCalledWith('onion');
  });

  it('staff may undo a stop whose last day is today (the rate would restart tomorrow)', async () => {
    const stopped = [row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, effective_from: '2025-01-01', effective_to: '2026-10-14' })];
    await open('staff', { itemRates: { item: ITEMS.find(i => i.id === 'onion')!, rows: stopped } }, { itemId: 'onion' });
    expect(shown(tree)).toContain('This rate stops after 14 Oct 2026.');
    expect(byId(tree, 'undo-stop').length).toBeGreaterThan(0);
  });

  it('an item with no rate is a critical strip with Add default rate (P-10)', async () => {
    await open('admin', { itemRates: itemRows('onion-small') }, { itemId: 'onion-small' });
    expect(shown(tree)).toContain("No default rate today. Invoices can't price Review Onion Red Small for lots received today.");
    press(tree, 'add-default');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/edit', params: { mode: 'add', item_id: 'onion-small', item_name: 'Review Onion Red Small' } });
    expect(byId(tree, 'rate-change').length).toBe(0);
  });

  it('an item whose only rate starts later says so and shows it as a strip, not as today\'s rate', async () => {
    const later = [row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 8, effective_from: '2027-01-01' })];
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'potato')!, rows: later } }, { itemId: 'potato' });
    const s = shown(tree);
    expect(s).toContain('No default rate until 1 Jan 2027.');
    expect(s).toContain('From 1 Jan 2027: ₹8.00 per bag, per month');
    expect(byId(tree, 'rate-change').length).toBe(0);
  });

  it('a rate that ended says so and offers Add default rate', async () => {
    const ended = [row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 8, effective_from: '2025-01-01', effective_to: '2026-06-30' })];
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'potato')!, rows: ended } }, { itemId: 'potato' });
    expect(shown(tree)).toContain('The default rate ended on 30 Jun 2026.');
    expect(byId(tree, 'add-default').length).toBeGreaterThan(0);
  });

  it('two open rates over the same weights get a critical strip naming what invoices use', async () => {
    const overlap = [
      row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2026-01-01' }),
      row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 6, effective_from: '2026-03-01' }),
    ];
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'potato')!, rows: overlap } }, { itemId: 'potato' });
    expect(shown(tree)).toContain('Two rates cover 0–100 kg on this day. Invoices use ₹6.00');
  });

  it('several bands render the band list with Weight each and the rent', async () => {
    await open('admin', { itemRates: itemRows('garlic') }, { itemId: 'garlic' });
    const list = tree.root.find(n => n.props.testID === 'band-list');
    const text = list.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
    expect(text).toEqual(['Weight each', 'Rent per month', '0–40 kg', '₹6.00', '41–100 kg', '₹9.50']);
  });

  it('customer rates: a row per customer, opening their page; Add customer rate opens the picker', async () => {
    const rows = [...F1.filter(r => r.item_id === 'onion'), row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.2, effective_from: '2027-01-01', customer_id: 'orchard-c', customer_name: 'Review Orchard C' })];
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'onion')!, rows } }, { itemId: 'onion' });
    const s = shown(tree);
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'Customer rates, 2').length).toBeGreaterThan(0);
    expect(s).toContain('Review Orchard B');
    expect(s).toContain('0–100 kg · since 1 Jan 2026');
    expect(s).toContain('New rate from 1 Jan 2027');
    press(tree, 'customer-rate-row-orchard-b');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/[itemId]/customer/[customerId]', params: { itemId: 'onion', customerId: 'orchard-b' } });
    void ORCHARD_B;
  });

  it('with no customer rates: the sentence and a secondary Add customer rate', async () => {
    await open('admin');
    expect(shown(tree)).toContain('No customer has their own rate for this item.');
    expect(byId(tree, 'add-customer-rate').length).toBeGreaterThan(0);
  });

  it('loading shows two skeletons under the header; an error shows Try again; not found says so', async () => {
    await open('admin', { status: 'loading', itemRates: undefined });
    expect(byId(tree, 'item-skeleton').length).toBe(0);
    expect(tree.root.findAll(n => n.props.testID === 'item-skeleton').length).toBeGreaterThan(0);
    act(() => tree.unmount());
    const refresh = jest.fn().mockResolvedValue(undefined);
    await open('admin', { status: 'error', itemRates: undefined, refresh });
    expect(shown(tree)).toContain("Couldn't load rates");
    act(() => tree.root.find(n => n.props.accessibilityRole === 'button' && n.findAllByType(Text).some(x => x.props.children === 'Try again')).props.onPress());
    expect(refresh).toHaveBeenCalled();
    act(() => tree.unmount());
    await open('admin', { status: 'ready', notFound: true, itemRates: undefined });
    expect(shown(tree)).toContain('This item is no longer active.');
  });

  it('offline disables the actions and says to connect (P-45 state table)', async () => {
    const { useIsOffline } = jest.requireMock('@/hooks/useNetworkStatus');
    useIsOffline.mockReturnValue(true);
    await open('admin');
    for (const id of ['rate-change', 'rate-correct', 'rate-stop']) expect(byId(tree, id)[0].props.disabled).toBe(true);
    expect(shown(tree)).toContain('Connect to change rates.');
    useIsOffline.mockReturnValue(false);
  });

  it('the day shown follows the `on` param', async () => {
    await open('admin', {}, { itemId: 'cumin', on: '2026-03-31' });
    const card = tree.root.find(n => n.props.testID === 'rate-card-monthly');
    expect(card.findAllByType(Text)[0].props.children).toBe('₹10.00');
    expect(shown(tree)).toContain('Rates for lots received on 31 Mar 2026');
  });
});

// CR-04: write actions belong to today's rows only.
describe('another day than today', () => {
  const WRITE_IDS = ['rate-change', 'rate-correct', 'rate-stop', 'edit-upcoming', 'cancel-upcoming', 'add-other-type', 'add-customer-rate'];

  it.each(['2026-06-01', '2027-02-01'])('on %s shows no write action, a strip and Back to today', async day => {
    await open('admin', {}, { itemId: 'cumin', on: day });
    for (const id of WRITE_IDS) expect(byId(tree, id)).toHaveLength(0);
    expect(shown(tree)).toContain("Go back to today to change rates.");
    await act(async () => { byId(tree, 'other-day-back')[0].props.onPress(); });
    expect(byId(tree, 'rate-change').length).toBeGreaterThan(0);
    expect(byId(tree, 'cancel-upcoming').length).toBeGreaterThan(0);
    expect(shown(tree)).not.toContain('Go back to today to change rates.');
  });
});

// CR-15: adding a customer rate for a customer who already has one opens that rate instead.
describe('Add customer rate', () => {
  it('opens the own-rate page of a customer who already has an own rate, and the editor for one who has none', async () => {
    await open('admin', { itemRates: itemRows('onion') }, { itemId: 'onion' });
    const onSelect = tree.root.findByType(CustomerPickerSheet).props.onSelect;
    act(() => onSelect({ id: 'orchard-b', name: 'Review Orchard B' }));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/item-rates/[itemId]/customer/[customerId]', params: { itemId: 'onion', customerId: 'orchard-b' } });
    act(() => onSelect({ id: 'orchard-a', name: 'Review Orchard A' }));
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: '/item-rates/edit', params: expect.objectContaining({ mode: 'addCustomer', customer_id: 'orchard-a' }) }),
    );
  });
});
