/**
 * The item page (screen B): the default rate as a box typed over in place, what comes next, the customer and GRN
 * rates as count links, old rates, and the actions each role may take. Rates come from a mocked useItemRatesFor; the
 * actions run against mocked services.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Dimensions, Keyboard, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import ItemRatesPage from '../../../app/item-rates/[itemId]';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { getItemGrnRates, replaceItemRates, undoRateChange } from '@/services/item-pricing-service';
import { showToast } from '@/utils/toast';
import { showAlert } from '@/utils/alert';
import { F1, ITEMS, ORCHARD_B, row } from '@/tests/helpers/ratesFixtures';
import { customerListPath, grnListPath, notifyRatesChanged } from '@/features/item-pricing/contract';
import { RatesOnBar } from '@/features/item-pricing/components/RatesOnBar';
import { useStandardRate } from '@/features/item-pricing/useStandardRate';

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
let mockGuard: { hasChanges: boolean } = { hasChanges: false };
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: jest.fn() }));
jest.mock('@/features/item-pricing/contract', () => ({ ...jest.requireActual('@/features/item-pricing/contract'), notifyRatesChanged: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), undoRateChange: jest.fn(), getItemGrnRates: jest.fn() }));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn().mockResolvedValue([]) } }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }));

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
const cell = (id: string) => tree.root.findAllByType(TextInput).find(n => n.props.testID === id)!;
const host = (id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const type = async (id: string, text: string) => { await act(async () => { cell(id).props.onChangeText(text); }); };
const chip = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

const WINDOW = Dimensions.get('window');
let tree: ReactTestRenderer;
async function open(role: string, data: Partial<UseItemRatesForResult> = {}, params: Record<string, string> = { itemId: 'cumin' }) {
  mockRole = role;
  mockParams = params;
  jest.mocked(useItemRatesFor).mockReturnValue(page(data));
  await act(async () => { tree = create(<ItemRatesPage />); });
}

beforeEach(() => {
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
  mockGuard = { hasChanges: false };
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-14T10:00:00+05:30'));
  jest.clearAllMocks();
  jest.mocked(getItemGrnRates).mockResolvedValue([]);
  // No standard rate unless a test gives one.
  jest.mocked(useStandardRate).mockReturnValue({ rate: null, status: 'ready', refresh: jest.fn(), key: 'k' });
});
afterEach(() => {
  act(() => tree.unmount());
  Dimensions.set({ window: WINDOW });
  jest.useRealTimers();
});

describe('item page: Review Cumin Bold on 14 Oct 2026', () => {
  it('shows ₹11.00 in the box as the rate in force, never the later ₹12.00 (P-10, P-20)', async () => {
    await open('admin');
    expect(host('rate-box-monthly').length).toBeGreaterThan(0);
    expect(cell('band-0-rent').props.value).toBe('11.00');
    expect(cell('band-0-upTo').props.value).toBe('100');
    expect(cell('labour').props.value).toBe('3.00');
    expect(cell('tax').props.value).toBe('5');
    const text = texts(tree);
    expect(text).toContain('per bag, per month');
    expect(text).toContain('Up to (kg)');
    expect(text).toContain('Rent (₹)');
    expect(text).toContain('Lots received since 1 Apr 2026');
    // The later rate is a strip under the box, not a figure in it.
    expect(tree.root.findAllByType(TextInput).filter(n => n.props.value === '12.00')).toHaveLength(0);
    // Nothing is changed: no Save bar, nothing to ask on leaving.
    expect(host('save-bar')).toHaveLength(0);
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('typing a rent over the figure shows the Save bar with Starts on, the live summary, Discard and a Save that waits for a day', async () => {
    await open('admin');
    await type('band-0-rent', '12.50');
    expect(host('save-bar').length).toBeGreaterThan(0);
    const s = shown(tree);
    expect(s).toContain('Starts on');
    expect(s).toContain('Choose a start date.');
    expect(byId(tree, 'save-bar-discard').length).toBeGreaterThan(0);
    expect(byId(tree, 'save-bar-save')[0].props.disabled).toBe(true);
    expect(mockGuard.hasChanges).toBe(true);

    await act(async () => { chip('1 Nov 2026').props.onPress(); });
    expect(byId(tree, 'save-bar-save')[0].props.disabled).toBe(false);
    const after = shown(tree);
    expect(after).toContain('Lots received from 1 Nov 2026 are charged the new rate. Lots received before keep ₹11.00.');
    expect(after).toContain('Until 31 Oct 2026: ₹11.00 per bag, per month');
    expect(after).toContain('From 1 Nov 2026: ₹12.50 per bag, per month');
  });

  it('Save sends replace_item_rates with the box, the toast says when it starts, and the bar goes', async () => {
    jest.mocked(replaceItemRates).mockResolvedValue({ success: true } as never);
    await open('admin');
    await type('band-0-rent', '12.50');
    await act(async () => { chip('Today').props.onPress(); });
    await act(async () => { byId(tree, 'save-bar-save')[0].props.onPress(); });
    expect(replaceItemRates).toHaveBeenCalledTimes(1);
    expect(replaceItemRates).toHaveBeenCalledWith({
      mode: 'change',
      seen_rows: expect.any(Array),
      item_id: 'cumin',
      customer_id: null,
      price_type: 'monthly',
      starts_on: '2026-10-14',
      bands: [{ weight_min: 0, weight_max: 100, unit_price: 12.5, labour_rate: 3, tax_percent: 5 }],
    });
    expect(notifyRatesChanged).toHaveBeenCalledWith('cumin');
    expect(showToast).toHaveBeenCalledWith('New rate saved. Starts 14 Oct 2026.');
    expect(host('save-bar')).toHaveLength(0);
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('Discard on the bar puts the saved figure back and the bar goes', async () => {
    await open('admin');
    await type('band-0-rent', '12.50');
    await act(async () => { byId(tree, 'save-bar-discard')[0].props.onPress(); });
    expect(cell('band-0-rent').props.value).toBe('11.00');
    expect(host('save-bar')).toHaveLength(0);
    expect(replaceItemRates).not.toHaveBeenCalled();
  });

  it('with the keyboard up the bar keeps only Discard and Save', async () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (event: unknown) => void) => {
      listeners[name] = fn;
      return { remove: jest.fn() };
    }) as never);
    await open('admin');
    await type('band-0-rent', '12.50');
    expect(shown(tree)).toContain('Starts on');
    await act(async () => { listeners.keyboardDidShow({ endCoordinates: { screenY: 500 } }); });
    expect(shown(tree)).not.toContain('Starts on');
    expect(byId(tree, 'save-bar-save').length).toBeGreaterThan(0);
    expect(byId(tree, 'save-bar-discard').length).toBeGreaterThan(0);
    await act(async () => { listeners.keyboardDidHide({}); });
    expect(shown(tree)).toContain('Starts on');
    jest.restoreAllMocks();
  });

  it('shows the later rate as a strip with Edit new rate and Cancel new rate (P-10); Edit puts that rate in the box', async () => {
    await open('admin');
    expect(shown(tree)).toContain('From 1 Jan 2027: ₹12.00 per bag, per month');
    expect(byId(tree, 'edit-upcoming').length).toBeGreaterThan(0);
    expect(byId(tree, 'cancel-upcoming').length).toBeGreaterThan(0);
    press(tree, 'edit-upcoming');
    // No second screen: the box holds the planned rate, and its start day is in the Save bar once something is typed.
    expect(router.push).not.toHaveBeenCalled();
    expect(cell('band-0-rent').props.value).toBe('12.00');
    await type('band-0-rent', '12.50');
    expect(chip('Other date').props.accessibilityState.selected).toBe(true);
    expect(shown(tree)).toContain('From 1 Jan 2027: ₹12.50 per bag, per month');
  });

  it('an administrator has Correct this rate and Stop this rate, no Change rate and no Delete (P-24, P-25)', async () => {
    await open('admin');
    expect(byId(tree, 'rate-correct').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-stop').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-change')).toHaveLength(0);
    expect(texts(tree).some(l => /delete/i.test(l))).toBe(false);
    expect(texts(tree)).not.toContain('Change rate');

    // Stop opens the unchanged stop screen.
    press(tree, 'rate-stop');
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/item-rates/stop',
      params: { item_id: 'cumin', item_name: 'Review Cumin Bold', price_type: 'monthly' },
    });
    expect(router.push).toHaveBeenCalledTimes(1);

    // Correct puts the box in correction: the start day is the rate's own.
    press(tree, 'rate-correct');
    expect(shown(tree)).toContain('This changes the rate since 1 Apr 2026.');
    await type('band-0-rent', '11.50');
    expect(shown(tree)).toContain('1 Apr 2026 (a correction keeps the start date)');
    expect(shown(tree)).toContain('Save correction');
    expect(chip('Today')).toBeUndefined();
  });

  it('staff are not offered Item pricing; if the page were opened they would get no box, no Stop or Correct button and no old rates', async () => {
    await open('staff');
    expect(host('rate-box-monthly')).toHaveLength(0);
    expect(host('rate-card-monthly').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-stop').length).toBe(0);
    expect(byId(tree, 'rate-correct').length).toBe(0);
    expect(byId(tree, 'item-changes').length).toBe(0);
    expect(shown(tree)).not.toContain('old rate');
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

  it('old rates are folded, and say Ended, not Expired (P-12, P-21)', async () => {
    await open('supervisor');
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

  it('names Default rate, with the customer rates and the GRN rates one line below it and no Base or Default pricing (P-19, P-33)', async () => {
    await open('admin');
    const s = shown(tree);
    expect(s).toContain('All customers pay this unless they have their own rate.');
    expect(s).not.toMatch(/Base|Default pricing/);
    // The only section header reads exactly "Default rate": no icon glyph in front (P-33).
    const headers = tree.root.findAll(n => n.props.accessibilityRole === 'header' && typeof n.props.accessibilityLabel === 'string' && n.props.accessible === true);
    expect([...new Set(headers.map(h => h.props.accessibilityLabel))]).toEqual(['Default rate']);
    expect(headers[0].props.accessibilityLabel).not.toMatch(/[-]/);
  });

  it('offers to add a one-time rate when the item only has a monthly one (P-13): it opens a box under the first', async () => {
    await open('admin');
    expect(shown(tree)).toContain('Add one-time rate');
    press(tree, 'add-other-type');
    expect(router.push).not.toHaveBeenCalled();
    expect(host('rate-box-add').length).toBeGreaterThan(0);
    expect(texts(tree)).toContain('per bag, once');
    expect(byId(tree, 'add-other-type')).toHaveLength(0);
    // Discard closes it again.
    press(tree, 'box-close');
    expect(host('rate-box-add')).toHaveLength(0);
    expect(byId(tree, 'add-other-type').length).toBeGreaterThan(0);
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
    const files = [
      'app/item-rates/[itemId].tsx',
      'app/item-rates/[itemId]/customers.tsx',
      'app/item-rates/[itemId]/grns.tsx',
      'app/item-rates/[itemId]/customer/[customerId].tsx',
      'src/features/item-pricing/components/RateCard.tsx',
      'src/features/item-pricing/components/ScopeRates.tsx',
      'src/features/item-pricing/components/BandsTable.tsx',
    ];
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

  it('staff, who are not offered Item pricing, get no Undo stop even on a stop whose last day is today', async () => {
    const stopped = [row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, effective_from: '2025-01-01', effective_to: '2026-10-14' })];
    await open('staff', { itemRates: { item: ITEMS.find(i => i.id === 'onion')!, rows: stopped } }, { itemId: 'onion' });
    expect(shown(tree)).toContain('This rate stops after 14 Oct 2026.');
    expect(byId(tree, 'undo-stop').length).toBe(0);
  });

  it('an item with no rate is a critical strip with Add default rate, which reveals an empty box (P-10)', async () => {
    await open('admin', { itemRates: itemRows('onion-small') }, { itemId: 'onion-small' });
    expect(shown(tree)).toContain("No default rate today. Invoices can't price Review Onion Red Small for lots received today.");
    expect(host('rate-box-add')).toHaveLength(0);
    press(tree, 'add-default');
    expect(router.push).not.toHaveBeenCalled();
    expect(host('rate-box-add').length).toBeGreaterThan(0);
    expect(cell('band-0-rent').props.value).toBe('');
    // The type is chosen in the box for an item with no rate at all; the bar saves a new rate.
    expect(tree.root.findAll(n => Array.isArray(n.props.options) && n.props.options.length === 2).length).toBeGreaterThan(0);
    expect(byId(tree, 'save-bar-save').length).toBeGreaterThan(0);
    expect(byId(tree, 'rate-stop')).toHaveLength(0);
  });

  it('an item whose only rate starts later says so and shows it as a strip, not as today\'s rate', async () => {
    const later = [row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 8, effective_from: '2027-01-01' })];
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'potato')!, rows: later } }, { itemId: 'potato' });
    const s = shown(tree);
    expect(s).toContain('No default rate until 1 Jan 2027.');
    expect(s).toContain('From 1 Jan 2027: ₹8.00 per bag, per month');
    expect(byId(tree, 'rate-stop')).toHaveLength(0);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
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

  it('several bands are a row each in the table: the upper weight and the rent', async () => {
    await open('admin', { itemRates: itemRows('garlic') }, { itemId: 'garlic' });
    expect(['band-0-upTo', 'band-0-rent', 'band-1-upTo', 'band-1-rent'].map(id => cell(id).props.value)).toEqual(['40', '6.00', '100', '9.50']);
    expect(texts(tree)).toEqual(expect.arrayContaining(['0 –', '41 –']));
    // Typing over the upper weight of the first band moves the start of the second.
    await type('band-0-upTo', '50');
    expect(texts(tree)).toContain('51 –');
    expect(host('save-bar').length).toBeGreaterThan(0);
  });

  it('the list\'s "+" link opens the box with one more empty band', async () => {
    await open('admin', { itemRates: itemRows('garlic') }, { itemId: 'garlic', add_band: '1' });
    expect(cell('band-2-upTo').props.value).toBe('');
    expect(cell('band-2-rent').props.value).toBe('');
    expect(mockGuard.hasChanges).toBe(true);
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

  it('offline disables the actions and says to connect; a typed figure is kept and Save is off (P-45 state table)', async () => {
    const { useIsOffline } = jest.requireMock('@/hooks/useNetworkStatus');
    useIsOffline.mockReturnValue(true);
    await open('admin');
    for (const id of ['rate-correct', 'rate-stop']) expect(byId(tree, id)[0].props.disabled).toBe(true);
    expect(shown(tree)).toContain('Connect to change rates.');
    await type('band-0-rent', '12');
    await act(async () => { chip('Today').props.onPress(); });
    expect(cell('band-0-rent').props.value).toBe('12');
    expect(byId(tree, 'save-bar-save')[0].props.disabled).toBe(true);
    useIsOffline.mockReturnValue(false);
  });
});

describe('customer rates and GRN rates are one line each', () => {
  it('customer rates: a count link that opens the list of customers; no row per customer, no Add customer rate', async () => {
    const rows = [...F1.filter(r => r.item_id === 'onion'), row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.2, effective_from: '2027-01-01', customer_id: 'orchard-c', customer_name: 'Review Orchard C' })];
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'onion')!, rows } }, { itemId: 'onion' });
    expect(texts(tree)).toContain('Customer rates for this item (2)');
    expect(shown(tree)).not.toContain('Review Orchard B');
    expect(byId(tree, `customer-rate-row-${ORCHARD_B.customer_id}`)).toHaveLength(0);
    expect(byId(tree, 'add-customer-rate')).toHaveLength(0);
    const link = tree.root.findAll(n => n.props.testID === 'customer-rates-link' && n.props.accessibilityRole === 'link');
    expect(link.length).toBeGreaterThan(0);
    press(tree, 'customer-rates-link');
    expect(router.push).toHaveBeenCalledWith(customerListPath('onion'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/[itemId]/customers', params: { itemId: 'onion' } });
  });

  it('with no customer rates: the plain sentence, no link and no button', async () => {
    await open('admin');
    expect(shown(tree)).toContain('No customer has their own rate for this item.');
    expect(byId(tree, 'customer-rates-link')).toHaveLength(0);
    expect(byId(tree, 'add-customer-rate')).toHaveLength(0);
  });

  it('on another day the link carries the day', async () => {
    await open('admin', { itemRates: itemRows('onion') }, { itemId: 'onion', on: '2026-06-01' });
    press(tree, 'customer-rates-link');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/[itemId]/customers', params: { itemId: 'onion', on: '2026-06-01' } });
  });

  const grnRate = (over: Record<string, unknown>) => ({
    id: 'g1', gr_id: 'gr1', gr_no: 'A0010', grn_date: '2026-10-12', customer_id: 'c1', customer_name: 'Review Orchard A',
    price_type: 'monthly', weight_min: 11, weight_max: 20, unit_price: 4.5, labour_rate: 1.5, tax_percent: 5,
    archived: false, created_at: '2026-10-12T05:00:00Z', ...over,
  });

  it('Rates typed on single GRNs (N) counts the GRNs that are not invoiced and opens their list; the invoiced ones are under Old rates', async () => {
    jest.mocked(getItemGrnRates).mockResolvedValue([
      grnRate({}),
      grnRate({ id: 'b2', weight_min: 21, weight_max: 40, unit_price: 6 }),
      grnRate({ id: 'o1', gr_id: 'gr5', gr_no: 'A0015', price_type: 'one_time', customer_name: null }),
      grnRate({ id: 'g2', gr_id: 'gr9', gr_no: 'A0007', grn_date: '2026-09-01', archived: true }),
    ] as never);
    await open('admin');
    await act(async () => { await Promise.resolve(); });
    // Two GRNs are open (gr1 with two bands, gr5), one is archived.
    expect(texts(tree)).toContain('Rates typed on single GRNs (2)');
    expect(shown(tree)).not.toContain('A0010');
    press(tree, 'grn-rates-link');
    expect(router.push).toHaveBeenCalledWith(grnListPath('cumin'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/item-rates/[itemId]/grns', params: { itemId: 'cumin' } });
    await act(async () => { byId(tree, 'old-rates-toggle')[0].props.onPress(); });
    expect(shown(tree)).toContain('For GRN A0007 only · Review Orchard A · 1 Sep 2026');
    expect(shown(tree)).toContain('Archived once invoiced');
  });

  it('shows no GRN line when there is none, and one line of text when they cannot be loaded', async () => {
    await open('admin');
    await act(async () => { await Promise.resolve(); });
    expect(byId(tree, 'grn-rates-link')).toHaveLength(0);
    act(() => tree.unmount());
    jest.mocked(getItemGrnRates).mockRejectedValue(new Error('down'));
    await open('admin');
    await act(async () => { await Promise.resolve(); });
    expect(shown(tree)).toContain("Couldn't load the rates set for single GRNs.");
    expect(byId(tree, 'grn-rates-link')).toHaveLength(0);
  });
});

describe('the day control is behind a link', () => {
  it('"Change date", "Back to today" and "You\'re looking at…" are not shown until "See rates on another day" is tapped', async () => {
    await open('admin');
    expect(shown(tree)).not.toContain('Change date');
    expect(shown(tree)).not.toContain('Back to today');
    expect(shown(tree)).not.toContain("You're looking at");
    expect(shown(tree)).not.toContain('Rates for lots received on');
    expect(texts(tree)).toContain('See rates on another day');
    press(tree, 'other-day-link');
    expect(shown(tree)).toContain('Rates for lots received on 14 Oct 2026');
    expect(shown(tree)).toContain('Change date');
    expect(byId(tree, 'other-day-link')).toHaveLength(0);
    // Still today: the box is still there to type in.
    expect(host('rate-box-monthly').length).toBeGreaterThan(0);
    press(tree, 'other-day-hide');
    expect(shown(tree)).not.toContain('Change date');
    expect(texts(tree)).toContain('See rates on another day');
  });

  it('choosing another day makes the page read-only: the rate cards, no cell, a strip and Back to today', async () => {
    await open('admin');
    press(tree, 'other-day-link');
    await act(async () => { tree.root.findByType(RatesOnBar).props.onChangeDay('2026-06-01'); });
    expect(host('rate-card-monthly').length).toBeGreaterThan(0);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(host('rate-box-monthly')).toHaveLength(0);
    expect(shown(tree)).toContain("You're looking at rates for lots received on 1 Jun 2026. Go back to today to change rates.");
    await act(async () => { byId(tree, 'other-day-back')[0].props.onPress(); });
    expect(host('rate-box-monthly').length).toBeGreaterThan(0);
    expect(cell('band-0-rent').props.value).toBe('11.00');
    expect(shown(tree)).not.toContain('Change date');
  });

  it('the day cannot be changed while a figure is typed over and not saved', async () => {
    await open('admin');
    await type('band-0-rent', '12');
    // The link is gone while something is changed; nothing can leave the box silently.
    expect(byId(tree, 'other-day-link')).toHaveLength(0);
    await act(async () => { byId(tree, 'save-bar-discard')[0].props.onPress(); });
    expect(byId(tree, 'other-day-link').length).toBeGreaterThan(0);
  });

  it('the day shown follows the `on` param, and the controls are open so the page is never silently read-only', async () => {
    await open('admin', {}, { itemId: 'cumin', on: '2026-03-31' });
    const card = tree.root.find(n => n.props.testID === 'rate-card-monthly');
    expect(card.findAllByType(Text)[0].props.children).toBe('₹10.00');
    expect(shown(tree)).toContain('Rates for lots received on 31 Mar 2026');
    expect(shown(tree)).toContain('Change date');
    expect(byId(tree, 'other-day-back').length).toBeGreaterThan(0);
  });
});

// CR-04: write actions belong to today's rows only.
describe('another day than today', () => {
  const WRITE_IDS = ['rate-correct', 'rate-stop', 'edit-upcoming', 'cancel-upcoming', 'add-other-type', 'add-customer-rate', 'add-default', 'undo-stop'];

  it.each(['2026-06-01', '2027-02-01'])('on %s shows no write action and no cell, a strip and Back to today', async day => {
    await open('admin', {}, { itemId: 'cumin', on: day });
    for (const id of WRITE_IDS) expect(byId(tree, id)).toHaveLength(0);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(shown(tree)).toContain("Go back to today to change rates.");
    await act(async () => { byId(tree, 'other-day-back')[0].props.onPress(); });
    expect(byId(tree, 'rate-correct').length).toBeGreaterThan(0);
    expect(byId(tree, 'cancel-upcoming').length).toBeGreaterThan(0);
    expect(shown(tree)).not.toContain('Go back to today to change rates.');
  });
});

describe('Standard / This item tags', () => {
  const tier = (min: number, max: number, rent: number, labour = 2.5, tax = 5) => ({ weight_min: min, weight_max: max, unit_price: rent, labour_rate: labour, tax_percent: tax });
  const standard = (tiers: ReturnType<typeof tier>[]) =>
    jest.mocked(useStandardRate).mockReturnValue({ rate: { tiers, updatedAt: null, updatedByName: null }, status: 'ready', refresh: jest.fn(), key: 'k' });
  const tagsOf = () => tree.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('band-tag-') && typeof n.type === 'function' && n.props.label).map(n => `${n.props.testID}:${n.props.label}`);

  it('tags the band of a one-band monthly rate Standard when weights, rent, labour and tax equal a tier', async () => {
    standard([tier(0, 100, 11, 3, 5)]);
    await open('admin');
    expect(tagsOf()).toEqual(['band-tag-0:Standard']);
  });

  it('tags it This item when the rent, labour or tax differs from every tier', async () => {
    for (const other of [tier(0, 100, 11.5, 3, 5), tier(0, 100, 11, 3.5, 5), tier(0, 100, 11, 3, 12)]) {
      standard([other]);
      await open('admin');
      expect(tagsOf()).toEqual(['band-tag-0:This item']);
      act(() => tree.unmount());
    }
    await open('admin');
  });

  it('tags it This item when the weights differ although the figures match', async () => {
    standard([tier(0, 50, 11, 3, 5)]);
    await open('admin');
    expect(tagsOf()).toEqual(['band-tag-0:This item']);
  });

  it('tags each band of a several-band rate on its own', async () => {
    standard([tier(0, 40, 6), tier(41, 100, 9)]);
    await open('admin', { itemRates: itemRows('garlic') }, { itemId: 'garlic' });
    // garlic: 0-40 at 6.00 matches; 41-100 at 9.50 does not match 9.00
    expect(tagsOf()).toEqual(['band-tag-0:Standard', 'band-tag-1:This item']);
  });

  it('the tags go once a figure is typed over (they would describe the saved rate, not the draft)', async () => {
    standard([tier(0, 100, 11, 3, 5)]);
    await open('admin');
    expect(tagsOf()).toEqual(['band-tag-0:Standard']);
    await type('band-0-rent', '11.5');
    expect(tagsOf()).toEqual([]);
  });

  it('has no tags at all when the standard rate is empty, not loaded or could not be read', async () => {
    standard([]);
    await open('admin');
    expect(tagsOf()).toEqual([]);
    act(() => tree.unmount());
    jest.mocked(useStandardRate).mockReturnValue({ rate: null, status: 'loading', refresh: jest.fn(), key: 'k' });
    await open('admin');
    expect(tagsOf()).toEqual([]);
    act(() => tree.unmount());
    jest.mocked(useStandardRate).mockReturnValue({ rate: null, status: 'error', refresh: jest.fn(), key: 'k' });
    await open('admin');
    expect(tagsOf()).toEqual([]);
  });

  it('tags the monthly box only, not a one-time box with the same figures', async () => {
    standard([tier(0, 100, 11, 3, 5)]);
    const oneTime = row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 11, labour_rate: 0, tax_percent: 5, price_type: 'one_time', effective_from: '2025-01-01' });
    await open('admin', { itemRates: { item: ITEMS.find(i => i.id === 'cumin')!, rows: [...F1.filter(r => r.item_id === 'cumin'), oneTime] } });
    const monthly = tree.root.find(n => n.props.testID === 'rate-box-monthly' && typeof n.type === 'string');
    const once = tree.root.find(n => n.props.testID === 'rate-box-one_time' && typeof n.type === 'string');
    expect(monthly.findAll(n => n.props.testID === 'band-tag-0' && n.props.label)).toHaveLength(1);
    expect(once.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('band-tag-'))).toHaveLength(0);
  });

  it('says Standard in the status tag in Gujarati too', async () => {
    standard([tier(0, 100, 11, 3, 5)]);
    const { setLanguage } = jest.requireActual('@/i18n');
    setLanguage('gu');
    try {
      await open('admin');
      expect(tagsOf()).toEqual(['band-tag-0:પ્રમાણભૂત']);
    } finally {
      setLanguage('en');
    }
  });
});

describe('the removed sections', () => {
  it('has no customer rows, no Add customer rate, no customer picker and no GRN-only cards on the page', async () => {
    jest.mocked(getItemGrnRates).mockResolvedValue([
      { id: 'g1', gr_id: 'gr1', gr_no: 'A0010', grn_date: '2026-10-12', customer_id: 'c1', customer_name: 'Review Orchard A', price_type: 'monthly', weight_min: 11, weight_max: 20, unit_price: 4.5, labour_rate: 1.5, tax_percent: 5, archived: false, created_at: '' },
    ] as never);
    await open('admin', { itemRates: itemRows('onion') }, { itemId: 'onion' });
    await act(async () => { await Promise.resolve(); });
    expect(host('grn-only-section')).toHaveLength(0);
    expect(host('grn-only-card-gr1')).toHaveLength(0);
    expect(byId(tree, 'add-customer-rate')).toHaveLength(0);
    expect(shown(tree)).not.toContain('Add customer rate');
    expect(shown(tree)).not.toContain('FOR GRNS ONLY');
    const source = fs.readFileSync(path.join(__dirname, '../../../app/item-rates/[itemId].tsx'), 'utf8');
    expect(source).not.toMatch(/CustomerPickerSheet/);
  });
});
