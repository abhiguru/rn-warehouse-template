/**
 * ScopeRates: the rates of one scope of one item on the page. A box per price type for today, the strips and
 * buttons under it, the add flows, what the Save bar must show (`onBar`), one box edited at a time, and the save.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
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
let user: ReturnType<typeof userEvent.setup>;
const mount = async (props: ScopeRatesProps) => { await render(<ScopeRates {...props} />); };
const rerender = async (props: ScopeRatesProps) => { await screen.rerender(<ScopeRates {...props} />); };
beforeEach(() => {
  jest.clearAllMocks();
  user = userEvent.setup({ delay: 0 });
  Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
});
afterEach(() => {
  Dimensions.set({ window: WINDOW });
});

// A check that something is NOT drawn must also see a node that is mounted but hidden.
const everything = { includeHiddenElements: true } as const;
const here = (id: string) => expect(screen.getAllByTestId(id)[0]).toBeOnTheScreen();
const gone = (id: string) => expect(screen.queryAllByTestId(id, everything)).toHaveLength(0);
const textHere = (text: string | RegExp) => expect(screen.getAllByText(text)[0]).toBeOnTheScreen();
const text = (part: string) => new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const press = async (id: string) => { await user.press(screen.getAllByTestId(id)[0]); };
const cell = (id: string, scope?: string) => screen.getAllByTestId(id)[scope === 'last' ? 1 : 0];
const type = async (id: string, value: string, scope?: string) => {
  await user.clear(cell(id, scope));
  await user.type(cell(id, scope), value);
};
// The dialogs are real ConfirmDialogs: an alert named by its title, with its two buttons.
// The card has no role a query can reach (a View with a role is not an accessible element), so it is found by its
// test id and its title must be the one on it.
const dialogOf = (id: string, title: string) => {
  const card = screen.getByTestId(id);
  expect(within(card).getByText(title)).toBeOnTheScreen();
  return card;
};
const dialogGone = (id: string) => expect(screen.queryByTestId(id, everything)).not.toBeOnTheScreen();
const answer = async (id: string, title: string, button: string) => {
  await user.press(within(dialogOf(id, title)).getByRole('button', { name: button }));
};
const monthlyIds = (rows: ItemStoragePrice[]) => rows.filter(r => r.price_type === 'monthly').map(r => r.id);

describe('today, a manager', () => {
  it('draws a box with the rate in force, the unit, and the buttons Correct and Stop; no Change rate', async () => {
    await mount(baseProps(CUMIN));
    here('rate-box-monthly');
    expect(cell('band-0-rent')).toHaveDisplayValue('11.00');
    expect(cell('band-0-upTo')).toHaveDisplayValue('100');
    expect(cell('labour')).toHaveDisplayValue('3.00');
    expect(cell('tax')).toHaveDisplayValue('5');
    textHere('per bag, per month');
    here('rate-correct');
    here('rate-stop');
    gone('rate-change');
    gone('rate-card-monthly');
    // Nothing is changed yet: no Save bar, not dirty.
    expect(lastBar()).toBeNull();
    expect(lastDirty()).toBe(false);
  });

  it('shows the later rate as a strip with Edit new rate and Cancel new rate, never as the box figure', async () => {
    await mount(baseProps(CUMIN));
    textHere(text('From 01/01/27: ₹12.00 per bag, per month'));
    here('edit-upcoming');
    here('cancel-upcoming');
    expect(cell('band-0-rent')).toHaveDisplayValue('11.00');
  });

  it('Edit new rate turns the box into that rate: its figures, its start day, a way back', async () => {
    await mount(baseProps(CUMIN));
    await press('edit-upcoming');
    here('upcoming-mode');
    expect(cell('band-0-rent')).toHaveDisplayValue('12.00');
    await type('band-0-rent', '12.50');
    const bar = lastBar()!;
    expect(bar.startsOn).toMatchObject({ choice: 'other', day: '2027-01-01', fixed: false });
    expect(bar.summaryLines.join(' ')).toContain('₹12.50');
    // The way back puts the rate in force into the box again and the bar goes.
    // Figures were typed, so the way back asks first ("Keep editing" leaves everything as it is).
    await press('upcoming-discard');
    expect(dialogOf('discard-rate-dialog', 'Discard changes?')).toBeOnTheScreen();
    await answer('discard-rate-dialog', 'Discard changes?', 'Keep editing');
    dialogGone('discard-rate-dialog');
    here('upcoming-mode');
    expect(cell('band-0-rent')).toHaveDisplayValue('12.50');
    await press('upcoming-discard');
    await answer('discard-rate-dialog', 'Discard changes?', 'Discard');
    gone('upcoming-mode');
    expect(cell('band-0-rent')).toHaveDisplayValue('11.00');
    expect(lastBar()).toBeNull();
    expect(lastDirty()).toBe(false);
  });

  it('Cancel new rate asks first, then undoes the change from its start day', async () => {
    jest.mocked(undoRateChange).mockResolvedValue({ success: true });
    await mount(baseProps(CUMIN));
    await press('cancel-upcoming');
    expect(dialogOf('cancel-rate-dialog', 'Cancel the rate from 01/01/27?')).toBeOnTheScreen();
    expect(undoRateChange).not.toHaveBeenCalled();
    await answer('cancel-rate-dialog', 'Cancel the rate from 01/01/27?', 'Cancel new rate');
    expect(undoRateChange).toHaveBeenCalledWith({ itemId: 'cumin', customerId: CUST.customer_id, priceType: 'monthly', startsOn: '2027-01-01', seenRows: expect.arrayContaining(monthlyIds(CUMIN)) });
    expect(notifyRatesChanged).toHaveBeenCalledWith('cumin');
  });

  it('Correct this rate fixes the start day: the box shows the warning, the bar the day of the rate and Save correction', async () => {
    await mount(baseProps(CUMIN));
    await press('rate-correct');
    here('correct-warning');
    textHere(text('This changes the rate since 01/04/26.'));
    gone('rate-correct');
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
    textHere(text('This rate stops after 31/03/27.'));
    await press('undo-stop');
    expect(undoRateChange).toHaveBeenCalledWith({ itemId: 'onion', customerId: CUST.customer_id, priceType: 'monthly', startsOn: '2027-04-01', seenRows: expect.arrayContaining(monthlyIds(stopping)) });
    expect(showToast).toHaveBeenCalledWith('The rate continues.');
  });

  it('has no Standard / This item tags: the standard tiers belong to the item\'s default rate, not a customer\'s', async () => {
    await mount(baseProps(CUMIN));
    // The tags would carry a test id that starts with band-tag-.
    expect(screen.queryAllByTestId(/^band-tag-/, everything)).toHaveLength(0);
  });

  it('with an overlap, a critical strip names the rate invoices use', async () => {
    const overlap = [
      row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 5, effective_from: '2026-01-01' }),
      row({ item_id: 'potato', weight_min: 0, weight_max: 100, unit_price: 6, effective_from: '2026-03-01' }),
    ];
    await mount(baseProps(overlap, 'potato'));
    textHere(text('Two rates cover 0–100 kg on this day. Invoices use ₹6.00'));
  });
});

describe('another day, or a role that cannot write', () => {
  it.each(['2026-06-01', '2027-02-01'])('on %s the read-only rate card, with no box and no button', async day => {
    await mount({ ...baseProps(CUMIN), day });
    here('rate-card-monthly');
    expect(screen.queryAllByDisplayValue(/.*/, everything)).toHaveLength(0);
    for (const id of ['rate-correct', 'rate-stop', 'edit-upcoming', 'cancel-upcoming', 'add-other-type', 'undo-stop']) gone(id);
  });

  it('a role without the right gets the card too', async () => {
    await mount({ ...baseProps(CUMIN), rights: rateRights('staff'), role: 'staff' });
    here('rate-card-monthly');
    gone('rate-box-monthly');
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
    expect(dialogOf('discard-rate-dialog', 'Discard changes?')).toBeOnTheScreen();
    expect(lastBar()).not.toBeNull();
    await answer('discard-rate-dialog', 'Discard changes?', 'Discard');
    expect(lastBar()).toBeNull();
    expect(lastDirty()).toBe(false);
    expect(cell('band-0-rent')).toHaveDisplayValue('11.00');
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
    expect(cell('band-0-rent')).toHaveDisplayValue('12');
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
    // The bar is drawn on its own: the screen now points at it.
    await render(<ScopeSaveBar bar={bar} />);
    textHere('What changes');
    textHere('Save new rate');
    textHere('Discard');
    here('save-bar-save');
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
    expect(cell('band-0-rent')).toHaveDisplayValue('11.00');
    textHere(text('From 01/11/26: ₹12.50 per bag, per month'));
    expect(lastBar()).toBeNull();
  });

  it('a refused save keeps the box dirty and shows the message in it', async () => {
    jest.mocked(replaceItemRates).mockResolvedValue({ success: false, errorCode: 'SERVER', message: 'The server is busy.' } as never);
    await mount(baseProps(CUMIN));
    await type('band-0-rent', '12');
    await act(async () => { lastBar()!.startsOn.onChange('today', TODAY); });
    await act(async () => { lastBar()!.save.onPress(); });
    expect(screen.getAllByTestId('editor-error')[0]).toHaveAccessibleName('The server is busy.');
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
    gone('correct-warning');
    expect(cell('band-0-rent')).toHaveDisplayValue('11.25');
    here('rate-correct');
  });
});

describe('one box at a time', () => {
  it('while the monthly box is changed, the one-time box shows its figures, says why, and the buttons that switch are off', async () => {
    await mount(baseProps(CUMIN_BOTH));
    here('rate-box-monthly');
    here('rate-box-one_time');
    gone('rate-box-one_time-locked');

    await type('band-0-rent', '12');
    here('rate-box-one_time-locked');
    gone('rate-box-monthly-locked');
    const oneTimeRent = screen.getAllByTestId('band-0-rent')[1];
    expect(oneTimeRent).toHaveDisplayValue('9.00');
    expect(oneTimeRent).toHaveProp('editable', false);
    expect(screen.getAllByTestId('rate-correct')[0]).toBeDisabled();
    expect(screen.getAllByTestId('edit-upcoming')[0]).toBeDisabled();

    // Discarded: both open again.
    await act(async () => { lastBar()!.discard.onPress(); });
    await answer('discard-rate-dialog', 'Discard changes?', 'Discard');
    gone('rate-box-one_time-locked');
    expect(screen.getAllByTestId('band-0-rent')[1]).toHaveProp('editable', true);
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
    expect(cell('band-0-rent')).toHaveDisplayValue('12');
    expect(lastBar()).not.toBeNull();
    await rerender(baseProps(CUMIN.map(r => (r.unit_price === 11 ? { ...r, unit_price: 11.75 } : r))));
    // Typed figures are kept when the rows change under them (the server refuses a stale save).
    expect(cell('band-0-rent')).toHaveDisplayValue('12');
    expect(lastBar()).not.toBeNull();
    // Typing the saved figure back lets the new rows in.
    await type('band-0-rent', '11.00');
    expect(cell('band-0-rent')).toHaveDisplayValue('11.75');
    expect(lastBar()).toBeNull();
  });
});

describe('adding', () => {
  it('one price type present: Add one-time rate reveals a box of the other type, below the first', async () => {
    await mount(baseProps(CUMIN));
    textHere(text('Add one-time rate'));
    await press('add-other-type');
    here('rate-box-add');
    textHere('per bag, once');
    gone('add-other-type');
    // Both types: no offer.
    await screen.unmount();
    await mount(baseProps(CUMIN_BOTH));
    gone('add-other-type');
  });

  it('closing a new box with typed figures asks "Discard this rate?" first', async () => {
    await mount(baseProps(CUMIN));
    await press('add-other-type');
    await type('band-0-rent', '4', 'last');
    await press('box-close');
    expect(dialogOf('discard-rate-dialog', 'Discard this rate?')).toBeOnTheScreen();
    await answer('discard-rate-dialog', 'Discard this rate?', 'Keep editing');
    here('rate-box-add');
    await press('box-close');
    await answer('discard-rate-dialog', 'Discard this rate?', 'Discard');
    gone('rate-box-add');
  });

  it('a customer with no own rate: the strip, and Add customer rate opens the full-screen Add customer rate form', async () => {
    await mount({ ...baseProps(itemRows('onion'), 'onion', false), customerId: 'orchard-c', customerName: 'Review Orchard C' });
    textHere(text('Review Orchard C has no rate of their own for this item now. Invoices use the default rate.'));
    await press('add-customer-rate');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/item-rates/[itemId]/customer-add/[customerId]',
      params: { itemId: 'onion', customerId: 'orchard-c', customer_name: 'Review Orchard C', deactivated: '0' },
    });
    // No box opens on this page; the form saves the rate (its own tests).
    gone('band-0-rent');
  });

  it('a customer who has an own rate gets its box, and the default for comparison', async () => {
    await mount({ ...baseProps(itemRows('onion'), 'onion', false), customerId: ORCHARD_B.customer_id, customerName: ORCHARD_B.customer_name });
    expect(cell('band-0-rent')).toHaveDisplayValue('3.00');
    expect(cell('first-from')).toHaveDisplayValue('0');
    textHere('Default rate: ₹3.50 per bag, per month');
    // Only the customer's own rows are in the box: the default rate has none.
    expect(screen.queryAllByTestId('rate-box-monthly', everything)).toHaveLength(1);
  });

  it('says the unit once: the "Default rate" line has it, so the box does not repeat it on a line of its own', async () => {
    await mount({ ...baseProps(itemRows('onion'), 'onion', false), customerId: ORCHARD_B.customer_id, customerName: ORCHARD_B.customer_name });
    textHere('Default rate: ₹3.50 per bag, per month');
    expect(screen.queryAllByText('per bag, per month', everything)).toHaveLength(0);
    // The box itself is there, with its start line.
    expect(screen.queryAllByTestId('rate-box-monthly', everything)).toHaveLength(1);
  });

  it('a customer without a default rate for the item keeps the unit line over the box', async () => {
    await mount(baseProps(CUMIN));
    expect(screen.queryAllByText(/^Default rate:/, everything)).toHaveLength(0);
    expect(screen.queryAllByText('per bag, per month', everything)).toHaveLength(1);
  });
});
