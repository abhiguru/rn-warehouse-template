/**
 * ScopeRates: the rates of one scope of one item on the page. A box per price type for today, the strips and
 * buttons under it, the add flows, what the Save bar must show (`onBar`), one box edited at a time, and the save.
 */
import React from 'react';
import { Dimensions, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { ScopeRates, type RateSaveBarState, type ScopeRatesProps } from '@/features/item-pricing/components/ScopeRates';
import { ScopeSaveBar } from '@/features/item-pricing/components/ScopeSaveBar';
import { notifyRatesChanged } from '@/features/item-pricing/contract';
import { rateRights } from '@/features/item-pricing/rateRights';
import { replaceItemRates, undoRateChange } from '@/services/item-pricing-service';
import { showToast } from '@/utils/toast';
import { F1, ORCHARD_B, ITEMS, row } from '@/tests/helpers/ratesFixtures';
import type { ItemStoragePrice } from '@/types/item-pricing.types';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: jest.fn(() => false) }));
jest.mock('@/features/item-pricing/contract', () => ({ ...jest.requireActual('@/features/item-pricing/contract'), notifyRatesChanged: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), undoRateChange: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/features/item-pricing/components/CopyTiersSheet', () => ({ CopyTiersSheet: () => null }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }));

const TODAY = '2026-10-14';
const itemRows = (id: string) => F1.filter(r => r.item_id === id);
const oneTime = (itemId: string, rent: number) =>
  row({ item_id: itemId, weight_min: 0, weight_max: 100, unit_price: rent, labour_rate: 0, tax_percent: 5, price_type: 'one_time', effective_from: '2025-01-01' });
const CUMIN = itemRows('cumin');
const CUMIN_BOTH = [...CUMIN, oneTime('cumin', 9)];

const onBar = jest.fn();
const onDirty = jest.fn();
const onOrder = jest.fn();
const refreshRows = jest.fn();
const lastBar = (): RateSaveBarState | null => onBar.mock.calls[onBar.mock.calls.length - 1]?.[0] ?? null;
const lastDirty = (): boolean => onDirty.mock.calls[onDirty.mock.calls.length - 1]?.[0] ?? false;

// ScopeRates now shows one customer's own rates only (the item's default rate is on the item page's Pricing tab).
// The fixtures are default rows, so by default they are made this customer's own; `own = false` keeps them as they are.
const CUST = { customer_id: 'cust-x', customer_name: 'Review Customer X' };
const asCustomer = (rows: ItemStoragePrice[]): ItemStoragePrice[] => rows.map(r => (r.customer_id === null ? { ...r, ...CUST } : r));
const baseProps = (rows: ItemStoragePrice[], itemId = 'cumin', own = true): ScopeRatesProps => ({
  item: { id: itemId, name: ITEMS.find(i => i.id === itemId)!.name },
  customerId: CUST.customer_id,
  customerName: CUST.customer_name,
  rows: own ? asCustomer(rows) : rows,
  day: TODAY,
  today: TODAY,
  rights: rateRights('admin'),
  offline: false,
  role: 'admin',
  refreshRows,
  onBar,
  onDirty,
  onOrder,
});

const WINDOW = Dimensions.get('window');
let tree: ReactTestRenderer | undefined;
async function mount(props: ScopeRatesProps) {
  await act(async () => { tree = create(<ScopeRates {...props} />); });
  return tree!;
}
const rerender = async (props: ScopeRatesProps) => { await act(async () => { tree!.update(<ScopeRates {...props} />); }); };
beforeEach(() => {
  jest.clearAllMocks();
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  Dimensions.set({ window: WINDOW });
});

const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const shown = () => texts().join(' | ');
const host = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
const pressable = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const press = async (id: string) => { await act(async () => { pressable(id).props.onPress(); }); };
const cell = (id: string, scope?: string) =>
  tree!.root.findAllByType(TextInput).filter(n => n.props.testID === id)[scope === 'last' ? 1 : 0];
const type = async (id: string, text: string) => { await act(async () => { cell(id).props.onChangeText(text); }); };
const dialog = () => {
  const all = tree!.root.findAll(n => n.props.testID === 'discard-rate-dialog' && typeof n.props.onConfirm === 'function');
  return all.find(n => n.props.visible) ?? all[0];
};
const monthlyIds = (rows: ItemStoragePrice[]) => rows.filter(r => r.price_type === 'monthly').map(r => r.id);

describe('today, a manager', () => {
  it('draws a box with the rate in force, the unit, and the buttons Correct and Stop; no Change rate', async () => {
    await mount(baseProps(CUMIN));
    expect(host('rate-box-monthly').length).toBeGreaterThan(0);
    expect(cell('band-0-rent').props.value).toBe('11.00');
    expect(cell('band-0-upTo').props.value).toBe('100');
    expect(cell('labour').props.value).toBe('3.00');
    expect(cell('tax').props.value).toBe('5');
    expect(texts()).toContain('per bag, per month');
    expect(pressable('rate-correct')).toBeDefined();
    expect(pressable('rate-stop')).toBeDefined();
    expect(host('rate-change')).toHaveLength(0);
    expect(host('rate-card-monthly')).toHaveLength(0);
    // Nothing is changed yet: no Save bar, not dirty.
    expect(lastBar()).toBeNull();
    expect(lastDirty()).toBe(false);
  });

  it('shows the later rate as a strip with Edit new rate and Cancel new rate, never as the box figure', async () => {
    await mount(baseProps(CUMIN));
    expect(shown()).toContain('From 01/01/27: ₹12.00 per bag, per month');
    expect(pressable('edit-upcoming')).toBeDefined();
    expect(pressable('cancel-upcoming')).toBeDefined();
    expect(cell('band-0-rent').props.value).toBe('11.00');
  });

  it('Edit new rate turns the box into that rate: its figures, its start day, a way back', async () => {
    await mount(baseProps(CUMIN));
    await press('edit-upcoming');
    expect(host('upcoming-mode').length).toBeGreaterThan(0);
    expect(cell('band-0-rent').props.value).toBe('12.00');
    await type('band-0-rent', '12.50');
    const bar = lastBar()!;
    expect(bar.startsOn).toMatchObject({ choice: 'other', day: '2027-01-01', fixed: false });
    expect(bar.summaryLines.join(' ')).toContain('₹12.50');
    // The way back puts the rate in force into the box again and the bar goes.
    // Figures were typed, so the way back asks first ("Keep editing" leaves everything as it is).
    await press('upcoming-discard');
    expect(dialog().props.visible).toBe(true);
    expect(dialog().props.title).toBe('Discard changes?');
    await act(async () => { dialog().props.onCancel(); });
    expect(dialog().props.visible).toBe(false);
    expect(host('upcoming-mode').length).toBeGreaterThan(0);
    expect(cell('band-0-rent').props.value).toBe('12.50');
    await press('upcoming-discard');
    await act(async () => { dialog().props.onConfirm(); });
    expect(host('upcoming-mode')).toHaveLength(0);
    expect(cell('band-0-rent').props.value).toBe('11.00');
    expect(lastBar()).toBeNull();
    expect(lastDirty()).toBe(false);
  });

  it('Cancel new rate asks first, then undoes the change from its start day', async () => {
    jest.mocked(undoRateChange).mockResolvedValue({ success: true });
    await mount(baseProps(CUMIN));
    await press('cancel-upcoming');
    const dialog = tree!.root.find(n => n.props.testID === 'cancel-rate-dialog');
    expect(dialog.props.visible).toBe(true);
    expect(dialog.props.title).toBe('Cancel the rate from 01/01/27?');
    await act(async () => { dialog.props.onConfirm(); });
    expect(undoRateChange).toHaveBeenCalledWith({ itemId: 'cumin', customerId: CUST.customer_id, priceType: 'monthly', startsOn: '2027-01-01', seenRows: expect.arrayContaining(monthlyIds(CUMIN)) });
    expect(notifyRatesChanged).toHaveBeenCalledWith('cumin');
  });

  it('Correct this rate fixes the start day: the box shows the warning, the bar the day of the rate and Save correction', async () => {
    await mount(baseProps(CUMIN));
    await press('rate-correct');
    expect(host('correct-warning').length).toBeGreaterThan(0);
    expect(shown()).toContain('This changes the rate since 01/04/26.');
    expect(host('rate-correct')).toHaveLength(0);
    await type('band-0-rent', '11.50');
    const bar = lastBar()!;
    expect(bar.startsOn).toMatchObject({ choice: 'fixed', day: '2026-04-01', fixed: true });
    expect(bar.saveLabel).toBe('Save correction');
    expect(bar.discard.onPress).toEqual(expect.any(Function));
  });

  it('Stop this rate opens the stop screen for this customer', async () => {
    await mount(baseProps(CUMIN));
    await press('rate-stop');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/stop',
      params: { item_id: 'cumin', item_name: 'Review Cumin Bold', price_type: 'monthly', customer_id: CUST.customer_id, customer_name: CUST.customer_name },
    });
  });

  it('a rate that stops shows the strip, and Undo stop undoes the change from the next day', async () => {
    jest.mocked(undoRateChange).mockResolvedValue({ success: true });
    const stopping = [row({ item_id: 'onion', weight_min: 0, weight_max: 100, unit_price: 3.5, labour_rate: 1.5, effective_from: '2025-01-01', effective_to: '2027-03-31' })];
    await mount(baseProps(stopping, 'onion'));
    expect(shown()).toContain('This rate stops after 31/03/27.');
    await press('undo-stop');
    expect(undoRateChange).toHaveBeenCalledWith({ itemId: 'onion', customerId: CUST.customer_id, priceType: 'monthly', startsOn: '2027-04-01', seenRows: expect.arrayContaining(monthlyIds(stopping)) });
    expect(showToast).toHaveBeenCalledWith('The rate continues.');
  });

  it('has no Standard / This item tags: the standard tiers belong to the item\'s default rate, not a customer\'s', async () => {
    await mount(baseProps(CUMIN));
    expect(tree!.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('band-tag-'))).toHaveLength(0);
  });

  it('with an overlap, a critical strip names the rate invoices use', async () => {
    const overlap = [
      row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2026-01-01' }),
      row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 6, effective_from: '2026-03-01' }),
    ];
    await mount(baseProps(overlap, 'potato'));
    expect(shown()).toContain('Two rates cover 0–100 kg on this day. Invoices use ₹6.00');
  });
});

describe('another day, or a role that cannot write', () => {
  it.each(['2026-06-01', '2027-02-01'])('on %s the read-only rate card, with no box and no button', async day => {
    await mount({ ...baseProps(CUMIN), day });
    expect(host('rate-card-monthly').length).toBeGreaterThan(0);
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(0);
    for (const id of ['rate-correct', 'rate-stop', 'edit-upcoming', 'cancel-upcoming', 'add-other-type', 'undo-stop']) expect(host(id)).toHaveLength(0);
  });

  it('a role without the right gets the card too', async () => {
    await mount({ ...baseProps(CUMIN), rights: rateRights('staff'), role: 'staff' });
    expect(host('rate-card-monthly').length).toBeGreaterThan(0);
    expect(host('rate-box-monthly')).toHaveLength(0);
  });
});

describe('the Save bar', () => {
  it('gets its payload when a figure is typed over, with the live summary, and null after Discard', async () => {
    await mount(baseProps(CUMIN));
    await type('band-0-rent', '12');
    expect(lastDirty()).toBe(true);
    const bar = lastBar()!;
    expect(bar).not.toBeNull();
    expect(bar.startsOn).toMatchObject({ choice: null, day: null, today: TODAY, canStartInPast: true, fixed: false });
    expect(bar.helper).toBe('Choose a start date.');
    expect(bar.save).toMatchObject({ disabled: true, loading: false });
    expect(bar.saveLabel).toBe('Save new rate');
    expect(bar.summaryLines).toEqual([]);

    // Choosing a day lights Save and writes the lines.
    await act(async () => { bar.startsOn.onChange('nextMonth', '2026-11-01'); });
    const next = lastBar()!;
    expect(next.save.disabled).toBe(false);
    expect(next.helper).toBeNull();
    expect(next.rule).toBe('Lots received from 01/11/26 are charged the new rate. Lots received before keep ₹11.00.');
    expect(next.summaryLines).toEqual(['Until 31/10/26: ₹11.00 per bag, per month', 'From 01/11/26: ₹12.00 per bag, per month']);

    // Discard asks first when figures were typed.
    await act(async () => { next.discard.onPress(); });
    expect(dialog().props.visible).toBe(true);
    expect(lastBar()).not.toBeNull();
    await act(async () => { dialog().props.onConfirm(); });
    expect(lastBar()).toBeNull();
    expect(lastDirty()).toBe(false);
    expect(cell('band-0-rent').props.value).toBe('11.00');
  });

  it('typing the value back is clean again: no bar', async () => {
    await mount(baseProps(CUMIN));
    await type('band-0-rent', '12');
    expect(lastBar()).not.toBeNull();
    await type('band-0-rent', '11.00');
    expect(lastBar()).toBeNull();
  });

  it('offline: Save is off and says so, and the typed figures stay', async () => {
    await mount({ ...baseProps(CUMIN), offline: true });
    await type('band-0-rent', '12');
    await act(async () => { lastBar()!.startsOn.onChange('today', TODAY); });
    expect(lastBar()!.save.disabled).toBe(true);
    expect(lastBar()!.helper).toBe('Connect to change rates.');
    expect(cell('band-0-rent').props.value).toBe('12');
  });

  it('a past day for a manager adds the warning to the bar', async () => {
    await mount(baseProps(CUMIN));
    await type('band-0-rent', '12');
    await act(async () => { lastBar()!.startsOn.onChange('other', '2026-09-01'); });
    expect(lastBar()!.warning).toBe("This date is in the past. Lots received since 01/09/26 that aren't invoiced yet will be charged the new rate.");
  });

  it('renders the bar with ScopeSaveBar: day chips, rule, summary, Discard and Save', async () => {
    await mount(baseProps(CUMIN));
    await type('band-0-rent', '12');
    await act(async () => { lastBar()!.startsOn.onChange('today', TODAY); });
    const bar = lastBar()!;
    let barTree!: ReactTestRenderer;
    await act(async () => { barTree = create(<ScopeSaveBar bar={bar} />); });
    const barTexts = barTree.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
    expect(barTexts).toEqual(expect.arrayContaining(['What changes', 'Save new rate', 'Discard']));
    expect(barTree.root.findAll(n => n.props.testID === 'save-bar-save' && typeof n.props.onPress === 'function')).not.toHaveLength(0);
    act(() => barTree.unmount());
  });
});

describe('saving', () => {
  it('sends the payload of the box, tells the pages, shows the toast and the box is clean', async () => {
    jest.mocked(replaceItemRates).mockResolvedValue({ success: true } as never);
    await mount(baseProps(CUMIN));
    await type('band-0-rent', '12.50');
    await act(async () => { lastBar()!.startsOn.onChange('nextMonth', '2026-11-01'); });
    await act(async () => { lastBar()!.save.onPress(); });

    expect(replaceItemRates).toHaveBeenCalledTimes(1);
    expect(replaceItemRates).toHaveBeenCalledWith({
      mode: 'change',
      seen_rows: expect.arrayContaining(CUMIN.filter(r => r.price_type === 'monthly').map(r => r.id)),
      item_id: 'cumin',
      customer_id: CUST.customer_id,
      price_type: 'monthly',
      starts_on: '2026-11-01',
      bands: [{ weight_min: 0, weight_max: 100, unit_price: 12.5, labour_rate: 3, tax_percent: 5 }],
      request_key: expect.stringMatching(/^warehouse-rate-replace-/),
    }, { signal: expect.anything() });
    expect(notifyRatesChanged).toHaveBeenCalledWith('cumin');
    expect(showToast).toHaveBeenCalledWith('New rate saved. Starts 01/11/26.');
    // Saved: the bar goes and the page is not dirty, before the rows even come back.
    expect(lastBar()).toBeNull();
    expect(lastDirty()).toBe(false);

    // The rows come back with the new rate: the box shows it, clean.
    const saved = [...CUMIN, row({ item_id: 'cumin', weight_min: 0, weight_max: 100, unit_price: 12.5, labour_rate: 3, effective_from: '2026-11-01' })];
    await rerender(baseProps(saved));
    expect(cell('band-0-rent').props.value).toBe('11.00');
    expect(shown()).toContain('From 01/11/26: ₹12.50 per bag, per month');
    expect(lastBar()).toBeNull();
  });

  it('a refused save keeps the box dirty and shows the message in it', async () => {
    jest.mocked(replaceItemRates).mockResolvedValue({ success: false, errorCode: 'SERVER', message: 'The server is busy.' } as never);
    await mount(baseProps(CUMIN));
    await type('band-0-rent', '12');
    await act(async () => { lastBar()!.startsOn.onChange('today', TODAY); });
    await act(async () => { lastBar()!.save.onPress(); });
    expect(host('editor-error')[0].props.accessibilityLabel).toBe('The server is busy.');
    expect(lastDirty()).toBe(true);
    expect(lastBar()).not.toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a correction saved closes the correction when the rows come back', async () => {
    jest.mocked(replaceItemRates).mockResolvedValue({ success: true } as never);
    await mount(baseProps(CUMIN));
    await press('rate-correct');
    await type('band-0-rent', '11.25');
    await act(async () => { lastBar()!.save.onPress(); });
    expect(replaceItemRates).toHaveBeenCalledWith(expect.objectContaining({ mode: 'correct', starts_on: '2026-04-01' }), { signal: expect.anything() });
    expect(showToast).toHaveBeenCalledWith('Correction saved.');
    const corrected = CUMIN.map(r => (r.unit_price === 11 ? { ...r, unit_price: 11.25 } : r));
    await rerender(baseProps(corrected));
    expect(host('correct-warning')).toHaveLength(0);
    expect(cell('band-0-rent').props.value).toBe('11.25');
    expect(pressable('rate-correct')).toBeDefined();
  });
});

describe('one box at a time', () => {
  it('while the monthly box is changed, the one-time box shows its figures, says why, and the buttons that switch are off', async () => {
    await mount(baseProps(CUMIN_BOTH));
    expect(host('rate-box-monthly').length).toBeGreaterThan(0);
    expect(host('rate-box-one_time').length).toBeGreaterThan(0);
    expect(host('rate-box-one_time-locked')).toHaveLength(0);

    await type('band-0-rent', '12');
    expect(host('rate-box-one_time-locked').length).toBeGreaterThan(0);
    expect(host('rate-box-monthly-locked')).toHaveLength(0);
    const oneTimeRent = tree!.root.findAllByType(TextInput).filter(n => n.props.testID === 'band-0-rent')[1];
    expect(oneTimeRent.props.value).toBe('9.00');
    expect(oneTimeRent.props.editable).toBe(false);
    expect(pressable('rate-correct').props.disabled).toBe(true);
    expect(pressable('edit-upcoming').props.disabled).toBe(true);

    // Discarded: both open again.
    await act(async () => { lastBar()!.discard.onPress(); });
    await act(async () => { dialog().props.onConfirm(); });
    expect(host('rate-box-one_time-locked')).toHaveLength(0);
    expect(tree!.root.findAllByType(TextInput).filter(n => n.props.testID === 'band-0-rent')[1].props.editable).toBe(true);
  });

  it('registers the cells under the box they belong to and reports the Next-key order across boxes', async () => {
    const registered: string[] = [];
    const fields = { register: (key: string, node: unknown) => { if (node) registered.push(key); }, onFocus: jest.fn(), next: jest.fn() };
    await mount({ ...baseProps(CUMIN_BOTH), fields });
    expect(registered).toEqual(expect.arrayContaining(['monthly:band.0.rent', 'one_time:band.0.rent', 'monthly:labour', 'one_time:tax']));
    expect(onOrder).toHaveBeenLastCalledWith([
      'monthly:firstFrom', 'monthly:band.0.upTo', 'monthly:band.0.rent', 'monthly:labour', 'monthly:tax',
      'one_time:firstFrom', 'one_time:band.0.upTo', 'one_time:band.0.rent', 'one_time:tax',
    ]);
  });

  it('a read of the same rows does not reopen the draft; changed rows keep the typed figure and say so', async () => {
    await mount(baseProps(CUMIN));
    await type('band-0-rent', '12');
    await rerender(baseProps(CUMIN.map(r => ({ ...r }))));
    expect(cell('band-0-rent').props.value).toBe('12');
    expect(lastBar()).not.toBeNull();
    await rerender(baseProps(CUMIN.map(r => (r.unit_price === 11 ? { ...r, unit_price: 11.75 } : r))));
    // Typed figures are kept when the rows change under them (the server refuses a stale save).
    expect(cell('band-0-rent').props.value).toBe('12');
    expect(lastBar()).not.toBeNull();
    // Typing the saved figure back lets the new rows in.
    await type('band-0-rent', '11.00');
    expect(cell('band-0-rent').props.value).toBe('11.75');
    expect(lastBar()).toBeNull();
  });
});

describe('adding', () => {
  it('one price type present: Add one-time rate reveals a box of the other type, below the first', async () => {
    await mount(baseProps(CUMIN));
    expect(shown()).toContain('Add one-time rate');
    await press('add-other-type');
    expect(host('rate-box-add').length).toBeGreaterThan(0);
    expect(texts()).toContain('per bag, once');
    expect(host('add-other-type')).toHaveLength(0);
    // Both types: no offer.
    act(() => tree!.unmount());
    await mount(baseProps(CUMIN_BOTH));
    expect(host('add-other-type')).toHaveLength(0);
  });

  it('closing a new box with typed figures asks "Discard this rate?" first', async () => {
    await mount(baseProps(CUMIN));
    await press('add-other-type');
    await act(async () => { cell('band-0-rent', 'last').props.onChangeText('4'); });
    await press('box-close');
    expect(dialog().props.visible).toBe(true);
    expect(dialog().props.title).toBe('Discard this rate?');
    await act(async () => { dialog().props.onCancel(); });
    expect(host('rate-box-add').length).toBeGreaterThan(0);
    await press('box-close');
    await act(async () => { dialog().props.onConfirm(); });
    expect(host('rate-box-add')).toHaveLength(0);
  });

  it('a customer with no own rate: the strip, and Add customer rate opens the full-screen Add customer rate form', async () => {
    await mount({ ...baseProps(itemRows('onion'), 'onion', false), customerId: 'orchard-c', customerName: 'Review Orchard C' });
    expect(shown()).toContain('Review Orchard C has no rate of their own for this item now. Invoices use the default rate.');
    await press('add-customer-rate');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/[itemId]/customer-add/[customerId]',
      params: { itemId: 'onion', customerId: 'orchard-c', customer_name: 'Review Orchard C', deactivated: '0' },
    });
    // No box opens on this page; the form saves the rate (its own tests).
    expect(cell('band-0-rent')).toBeUndefined();
  });

  it('a customer who has an own rate gets its box, and the default for comparison', async () => {
    await mount({ ...baseProps(itemRows('onion'), 'onion', false), customerId: ORCHARD_B.customer_id, customerName: ORCHARD_B.customer_name });
    expect(cell('band-0-rent').props.value).toBe('3.00');
    expect(cell('first-from').props.value).toBe('0');
    expect(texts()).toContain('Default rate: ₹3.50 per bag, per month');
    // Only the customer's own rows are in the box: the default rate has none.
    expect(host('rate-box-monthly')).toHaveLength(1);
  });

  it('says the unit once: the "Default rate" line has it, so the box does not repeat it on a line of its own', async () => {
    await mount({ ...baseProps(itemRows('onion'), 'onion', false), customerId: ORCHARD_B.customer_id, customerName: ORCHARD_B.customer_name });
    expect(texts()).toContain('Default rate: ₹3.50 per bag, per month');
    expect(texts().filter(text => text === 'per bag, per month')).toHaveLength(0);
    // The box itself is there, with its start line.
    expect(host('rate-box-monthly')).toHaveLength(1);
  });

  it('a customer without a default rate for the item keeps the unit line over the box', async () => {
    await mount(baseProps(CUMIN));
    expect(texts().filter(text => text.startsWith('Default rate:'))).toHaveLength(0);
    expect(texts().filter(text => text === 'per bag, per month')).toHaveLength(1);
  });
});
