/**
 * The Standard rate screen (Settings): the four starting tiers, the checks, what is sent, the toast
 * that counts the items that got the rate, the leave guard and offline.
 */
import React from 'react';
import { ScrollView, StyleSheet, TextInput } from 'react-native';
import { act, fireEvent, render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { getStandardRate, setStandardRate } from '@/services/item-pricing-service';
import { clearStandardRateCache, rememberStandardRate } from '@/features/item-pricing/useStandardRate';
import { setLanguage } from '@/i18n';

import { showToast } from '@/utils/toast';
import { askAlert } from '@/utils/alert';
import StandardRateScreen from '../../../app/standard-rate';

let mockOffline = false;
let mockGuard: { hasChanges: boolean; title?: string } = { hasChanges: false };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ instanceId: 'test-facility' }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean; title?: string }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ getStandardRate: jest.fn(), setStandardRate: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
// Save first asks how many items would get the rate; the dialog answers "Save and give it" unless a test says otherwise.
jest.mock('@/utils/alert', () => ({ askAlert: jest.fn() }));
const RENT_ERROR = 'Enter a rent from 0 to 9999.99, up to 2 decimals, for example 12.50.';

const tier = (min: number, max: number, rent: number, labour = 1, tax = 5) => ({ weight_min: min, weight_max: max, unit_price: rent, labour_rate: labour, tax_percent: tax });
const FOUR = [tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5), tier(31, 50, 6)];

// includeHiddenElements: the bands fold like an accordion and a closed band's body is drawn with display none; the old tests
// read the fields of every band, open or closed, so these finders do too.
const HIDDEN = { includeHiddenElements: true };
const fields = () => screen.queryAllByDisplayValue(/^/, HIDDEN);
const inputs = (label: string) => fields().filter(n => n.props.accessibilityLabel === label || n.props.accessibilityLabel === `${label}, required`);
const messageOf = (label: string, index: number) => inputs(label)[index].props.accessibilityHint;

async function open(tiers: ReturnType<typeof tier>[] = []) {
  jest.mocked(getStandardRate).mockResolvedValue({ tiers, updatedAt: null, updatedByName: null });
  await render(<StandardRateScreen />);
  await screen.findByTestId('standard-note');
}
const value = (label: string) => inputs(label).map(n => n.props.value);
const type = async (label: string, index: number, text: string) => {
  await userEvent.paste(inputs(label)[index], text);
};
const saveButton = () => screen.getByTestId('standard-save');
const pressSave = () => userEvent.press(saveButton());
const fillAll = async () => {
  for (let i = 0; i < 4; i++) {
    await type('Rent per bag, per month', i, String(i + 3));
    await type('Labour per bag', i, '1');
    await type('Tax', i, '5');
  }
};
/** The jest TextInput and ScrollView keep measureInWindow and scrollTo on a shared prototype; the app calls them on the instance. */
let measuredTop: Record<string, number> = {};

beforeEach(() => {
  jest.clearAllMocks();
  clearStandardRateCache();
  mockOffline = false;
  mockGuard = { hasChanges: false };
  measuredTop = {};
  jest.mocked(askAlert).mockResolvedValue(true as never);
  jest.spyOn(TextInput.prototype as unknown as { measureInWindow: (cb: never) => void }, 'measureInWindow').mockImplementation(function (this: { props: { accessibilityLabel?: string } }, cb: (x: number, y: number, w: number, h: number) => void) {
    const key = Object.keys(measuredTop).find(k => String(this.props.accessibilityLabel).startsWith(k));
    if (key) cb(0, measuredTop[key], 100, 40);
  });
  jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => {
  setLanguage('en');
  jest.restoreAllMocks();
});

describe('Standard rate', () => {
  it('says what it does and starts with the four tiers 0-10, 11-20, 21-30, 31-50 kg and blank figures', async () => {
    await open();
    expect(screen.getByText('New items get this rate. Changing it does not change items that already have a rate.')).toBeOnTheScreen();
    expect(value('Up to')).toEqual(['10', '20', '30', '50']);
    expect(screen.queryAllByText(/^From \d+ kg$/, HIDDEN).map(n => [n.props.children].flat(Infinity).join(''))).toEqual(['From 0 kg', 'From 11 kg', 'From 21 kg', 'From 31 kg']);
    expect(value('Rent per bag, per month')).toEqual(['', '', '', '']);
    expect(value('Labour per bag')).toEqual(['', '', '', '']);
    expect(value('Tax')).toEqual(['', '', '', '']);
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('shows the tiers already saved instead', async () => {
    await open([tier(0, 10, 3, 1.5, 5), tier(11, 40, 4, 2, 12)]);
    expect(value('Up to')).toEqual(['10', '40']);
    expect(value('Rent per bag, per month')).toEqual(['3.00', '4.00']);
    expect(value('Labour per bag')).toEqual(['1.50', '2.00']);
    expect(value('Tax')).toEqual(['5', '12']);
  });

  it('does not save blank figures: every tier names what is missing and nothing is sent', async () => {
    await open();
    await pressSave();
    expect(setStandardRate).not.toHaveBeenCalled();
    expect(messageOf('Rent per bag, per month', 0)).toBe(RENT_ERROR);
    expect(messageOf('Labour per bag', 3)).toBe('Enter a labour rate from 0 to 999999.');
    expect(messageOf('Tax', 2)).toBe('Enter a tax rate from 0 to 100.');
  });

  it('sends the four tiers as typed and tells how many items got the rate', async () => {
    await open();
    await fillAll();
    expect(mockGuard.hasChanges).toBe(true);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR.map(x => ({ ...x, labour_rate: 1 })), itemsPriced: 55 });
    await pressSave();
    // A dry run first (writes nothing), then the real save, both with the version the form was built from.
    expect(setStandardRate).toHaveBeenCalledTimes(2);
    expect(setStandardRate).toHaveBeenNthCalledWith(1, [tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5), tier(31, 50, 6)], { expectedUpdatedAt: '-infinity', dryRun: true });
    expect(setStandardRate).toHaveBeenNthCalledWith(2, [tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5), tier(31, 50, 6)], { expectedUpdatedAt: '-infinity', requestKey: expect.stringMatching(/^warehouse-rate-standard-/), signal: expect.anything() });
    expect(askAlert).toHaveBeenCalledWith('Give this rate to 55 items that have never had a rate?', 'They are charged it for lots received from their first GRN.', expect.any(Array), false);
    expect(showToast).toHaveBeenCalledWith('Standard rate saved. 55 items got it.');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('says "1 item got it." for one and says nothing of items when none got it', async () => {
    await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 1 });
    await pressSave();
    expect(showToast).toHaveBeenLastCalledWith('Standard rate saved. 1 item got it.');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 0 });
    await pressSave();
    expect(showToast).toHaveBeenLastCalledWith('Standard rate saved.');
  });
  // WH-61: Add band asks where the new band starts; the box is pre-filled with the last Up to + 1.
  const press = async (id: string) => {
    await userEvent.press(screen.getByTestId(id));
  };
  const startBox = () => screen.getByTestId('add-band-start');
  const addAt = async (start: string) => {
    await press('add-band');
    await userEvent.paste(startBox(), start);
    await press('add-band-confirm');
  };

  it('Add band opens a box pre-filled with the last Up to + 1, and Cancel closes it without adding', async () => {
    await open(FOUR);
    await press('add-band');
    expect(startBox()).toHaveDisplayValue('51');
    await press('add-band-cancel');
    expect(screen.queryByTestId('add-band-panel')).not.toBeOnTheScreen();
    expect(value('Up to')).toEqual(['10', '20', '30', '50']);
  });

  it('a start of 5 splits 0-10 into 0-4 and 5-10: the new band keeps the old figures, nothing else changes', async () => {
    await open(FOUR);
    await addAt('5');
    expect(value('Up to')).toEqual(['4', '10', '20', '30', '50']);
    expect(value('Rent per bag, per month')).toEqual(['3.00', '3.00', '4.00', '5.00', '6.00']);
    expect(mockGuard.hasChanges).toBe(true);
  });

  it('a start of 10 gives 0-9 and 10-10', async () => {
    await open(FOUR);
    await addAt('10');
    expect(value('Up to')).toEqual(['9', '10', '20', '30', '50']);
  });

  it('refuses a start the bands do not allow, says why in the box, and adds nothing', async () => {
    await open(FOUR);
    for (const [start, message] of [
      ['60', 'Start from 51 kg or lower'],
      ['11', 'A band already starts at 11 kg'],
      ['0', 'A band already starts at 0 kg'],
    ] as const) {
      await press('add-band');
      await userEvent.paste(startBox(), start);
      await press('add-band-confirm');
      expect(startBox().props.accessibilityHint).toContain(message.replace(/ kg.*/, ''));
      expect(value('Up to')).toEqual(['10', '20', '30', '50']);
      await press('add-band-cancel');
    }
  });

  it('refuses a start that is not a whole number', async () => {
    await open(FOUR);
    await press('add-band');
    await userEvent.paste(startBox(), 'abc');
    await press('add-band-confirm');
    expect(startBox().props.accessibilityHint).toBeTruthy();
    expect(value('Up to')).toEqual(['10', '20', '30', '50']);
  });

  // WH-60: the bands fold like an accordion, one open at a time.
  const opened = () =>
    [0, 1, 2, 3, 4].map(i => screen.queryAllByTestId(`band-section-${i}`, HIDDEN).find(n => n.props.accessibilityState))
      .filter(Boolean)
      .map(n => n!.props.accessibilityState.expanded as boolean);
  const toggle = async (i: number) => {
    await userEvent.press(screen.getByTestId(`band-section-${i}`));
  };

  it('opens the first band on load and the rest closed, each closed band with its line of figures', async () => {
    await open(FOUR);
    expect(opened()).toEqual([true, false, false, false]);
    expect(screen.getAllByTestId('bands-card').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('band-section-1-line', HIDDEN).length).toBeGreaterThan(0);
  });

  it('opens one band at a time: opening another closes the first, and a second tap closes the open one', async () => {
    await open(FOUR);
    await toggle(2);
    expect(opened()).toEqual([false, false, true, false]);
    await toggle(3);
    expect(opened()).toEqual([false, false, false, true]);
    await toggle(3);
    expect(opened()).toEqual([false, false, false, false]);
  });

  it('a band added opens, and the band it was added after closes', async () => {
    await open(FOUR);
    await addAt('51');
    expect(opened()).toEqual([false, false, false, false, true]);
  });


  it('only the open band body is shown: the others are hidden, Remove in them too', async () => {
    await open(FOUR);
    const hidden = () => [0, 1, 2, 3].map(i => StyleSheet.flatten(screen.getByTestId(`band-body-${i}`, HIDDEN).props.style)?.display === 'none');
    expect(hidden()).toEqual([false, true, true, true]);
    await toggle(3);
    expect(hidden()).toEqual([true, true, true, false]);
    expect(within(screen.getByTestId('band-body-3')).getAllByTestId('band-3-remove').length).toBeGreaterThan(0);
  });

  it('Save with an error in a closed band opens that band', async () => {
    await open(FOUR);
    await fillAll();
    await type('Tax', 2, '101');
    expect(opened()).toEqual([true, false, false, false]);
    await pressSave();
    expect(setStandardRate).not.toHaveBeenCalled();
    expect(opened()).toEqual([false, false, true, false]);
    expect(messageOf('Tax', 2)).toBe('Enter a tax rate from 0 to 100.');
  });

  it('adds a tier after the last and sends five', async () => {
    await open(FOUR);
    await press('add-band');
    await press('add-band-confirm');
    expect(value('Up to')).toEqual(['10', '20', '30', '50', '']);
    await type('Up to', 4, '80');
    await type('Rent per bag, per month', 4, '7');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await pressSave();
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual([...FOUR, tier(51, 80, 7)]);
  });

  it('removing the last tier drops it: the range ends at the tier before', async () => {
    await open(FOUR);
    await userEvent.press(screen.getByTestId('band-3-remove', HIDDEN));
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await pressSave();
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual([tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5)]);
  });

  it('removing a middle tier gives its weights to the tier before', async () => {
    await open(FOUR);
    await userEvent.press(screen.getByTestId('band-1-remove', HIDDEN));
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await pressSave();
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual([tier(0, 20, 3), tier(21, 30, 5), tier(31, 50, 6)]);
    expect(screen.getByText('Removing a band gives its weights to the band before it. Removing the last band shortens the range.')).toBeOnTheScreen();
  });

  it('puts the server\'s refusal on the tier and field it names, and stays', async () => {
    await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: 'INVALID_AMOUNT', message: 'Check the rent, labour and tax amounts.', tierIndex: 2, field: 'labour_rate' });
    await pressSave();
    expect(messageOf('Labour per bag', 2)).toBe('Check the rent, labour and tax amounts.');
    expect(router.back).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows a refusal that names no field at the top', async () => {
    await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: 'STANDARD_RATE_MANAGER_ONLY', message: 'Only an administrator or supervisor can set the standard rate.' });
    await pressSave();
    expect(screen.getByRole('alert', { name: 'Only an administrator or supervisor can set the standard rate.' })).toHaveProp('testID', 'standard-error');
  });

  it('asks before leaving typed work, and not when nothing was typed', async () => {
    await open(FOUR);
    expect(mockGuard.hasChanges).toBe(false);
    await type('Rent per bag, per month', 0, '3.50');
    expect(mockGuard.hasChanges).toBe(true);
    await type('Rent per bag, per month', 0, '3.00');
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('is offline: Save is disabled and says to connect', async () => {
    mockOffline = true;
    await open(FOUR);
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Connect to change rates.')).toBeOnTheScreen();
  });

  it('says it could not load, with Try again, when the server cannot be read', async () => {
    jest.mocked(getStandardRate).mockRejectedValue(new Error('down'));
    await render(<StandardRateScreen />);
    expect(await screen.findByTestId('standard-load-error')).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load the standard rate")).toBeOnTheScreen();
  });

  // Review A1: the form is built from a fresh read, never from a copy another screen left in the cache.
  it('shows what the server holds now, not the copy an item page cached, and saves that', async () => {
    rememberStandardRate('test-facility|u1', { tiers: [tier(0, 10, 3), tier(11, 50, 4)], updatedAt: null, updatedByName: null });
    await open(FOUR);
    expect(value('Up to')).toEqual(['10', '20', '30', '50']);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 0 });
    await pressSave();
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual(FOUR);
  });

  it('waits for the fresh read instead of showing the cached copy first', async () => {
    rememberStandardRate('test-facility|u1', { tiers: [tier(0, 10, 3)], updatedAt: null, updatedByName: null });
    let release!: (v: { tiers: ReturnType<typeof tier>[]; updatedAt: null; updatedByName: null }) => void;
    jest.mocked(getStandardRate).mockReturnValue(new Promise(r => { release = r; }));
    await render(<StandardRateScreen />);
    expect(inputs('Up to')).toHaveLength(0);
    await act(async () => { release({ tiers: FOUR, updatedAt: null, updatedByName: null }); });
    expect(value('Up to')).toEqual(['10', '20', '30', '50']);
  });

  it('after an unknown outcome the cache is cleared, so the next opening reads the server again', async () => {
    await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: 'UNKNOWN', message: "We couldn't confirm that the standard rate was saved. Close this screen and open it again before you try again.", outcomeUnknown: true });
    await pressSave();
    // The strip is the "Reload" one: nothing may be saved again until the screen has read the rate anew.
    expect(screen.getByTestId('standard-unconfirmed')).toBeOnTheScreen();
    expect(within(screen.getByTestId('standard-unconfirmed')).getByText(/couldn't confirm/)).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
    await screen.unmount();
    jest.mocked(getStandardRate).mockReturnValue(new Promise(() => {}));
    await render(<StandardRateScreen />);
    expect(inputs('Up to')).toHaveLength(0);
    expect(getStandardRate).toHaveBeenCalledTimes(2);
  });

  // Review A6
  it('says the facility server needs an update when it has no standard rate yet', async () => {
    jest.mocked(getStandardRate).mockRejectedValue(Object.assign(new Error('x'), { code: 'SERVER_NEEDS_UPDATE' }));
    await render(<StandardRateScreen />);
    expect(await screen.findByText("This cold storage's server needs an update before the standard rate is available.")).toBeOnTheScreen();
  });

  it('Try again reads the server again and shows the tiers', async () => {
    jest.mocked(getStandardRate).mockRejectedValueOnce(new Error('down'));
    await render(<StandardRateScreen />);
    await screen.findByTestId('standard-load-error');
    jest.mocked(getStandardRate).mockResolvedValue({ tiers: FOUR, updatedAt: null, updatedByName: null });
    await userEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(value('Up to')).toEqual(['10', '20', '30', '50']));
  });

  // Review A10
  it('refuses a tax above 100, a rate with three decimals and an Up to below its From, and sends nothing', async () => {
    await open(FOUR);
    await fillAll();
    await type('Tax', 0, '101');
    await type('Rent per bag, per month', 1, '4.125');
    await type('Up to', 2, '15');
    await pressSave();
    expect(setStandardRate).not.toHaveBeenCalled();
    expect(messageOf('Tax', 0)).toBe('Enter a tax rate from 0 to 100.');
    expect(messageOf('Rent per bag, per month', 1)).toBe(RENT_ERROR);
    expect(messageOf('Up to', 2)).toBe('Must be more than 20 kg; this band starts at 21 kg.');
  });

  it.each(['INVALID_BAND', 'BANDS_GAP', 'BANDS_OVERLAP'] as const)('puts a server %s on the Up to of the tier it names', async code => {
    await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: code, message: 'Check the weights.', tierIndex: 1 });
    await pressSave();
    expect(messageOf('Up to', 1)).toBe('Check the weights.');
  });

  it('says "Back" to the give-the-rate question: the dry run was the only call and nothing is saved', async () => {
    await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 3 });
    jest.mocked(askAlert).mockResolvedValue(false as never);
    await pressSave();
    expect(setStandardRate).toHaveBeenCalledTimes(1);
    expect(jest.mocked(setStandardRate).mock.calls[0][1]).toEqual({ expectedUpdatedAt: null, dryRun: true });
    expect(askAlert).toHaveBeenCalledWith('Give this rate to 3 items that have never had a rate?', expect.any(String), expect.any(Array), false);
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does not ask when no item would get the rate: the real save follows the dry run at once', async () => {
    await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 0 });
    await pressSave();
    expect(askAlert).not.toHaveBeenCalled();
    expect(setStandardRate).toHaveBeenCalledTimes(2);
  });

  it('asks before changing a saved standard rate, naming the old and the new figures', async () => {
    await open([tier(0, 50, 4, 1, 5)]);
    await type('Rent per bag, per month', 0, '4.50');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [tier(0, 50, 4.5, 1, 5)], itemsPriced: 0 });
    await pressSave();
    expect(askAlert).toHaveBeenCalledWith(
      'Change the standard rate?',
      'Now:\n0–50 kg: rent ₹4.00, labour ₹1.00, tax 5%\n\nNew:\n0–50 kg: rent ₹4.50, labour ₹1.00, tax 5%',
      expect.any(Array),
      false,
    );
    expect(setStandardRate).toHaveBeenCalledTimes(2);
  });

  it('saves nothing more than the dry run when the change question is answered Back', async () => {
    await open([tier(0, 50, 4, 1, 5)]);
    await type('Rent per bag, per month', 0, '4.50');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    jest.mocked(askAlert).mockResolvedValue(false as never);
    await pressSave();
    expect(setStandardRate).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('asks the change question in Gujarati digits', async () => {
    setLanguage('gu');
    await open([tier(0, 50, 4, 1, 5)]);
    await userEvent.paste(screen.getByDisplayValue('૪.૦૦', HIDDEN), '4.50');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await pressSave();
    const [title, message] = jest.mocked(askAlert).mock.calls[0];
    expect(title).toBe('પ્રમાણભૂત દર બદલવો છે?');
    expect(String(message)).toContain('ભાડું');
    expect(/[0-9]/.test(String(message))).toBe(false);
  });

  it('shows a stale answer as the Reload strip and saves nothing', async () => {
    await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: 'STALE_STANDARD_RATE', message: 'x' });
    await pressSave();
    expect(setStandardRate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('standard-stale')).toBeOnTheScreen();
    expect(within(screen.getByTestId('standard-stale')).getByText('Someone else changed the standard rate. Reload to see their changes.')).toBeOnTheScreen();
  });

  it('shows the figures in Gujarati digits and still sends 0-9', async () => {
    setLanguage('gu');
    await open([tier(0, 10, 3.5, 1.5, 5), tier(11, 50, 4, 2, 12)]);
    const shown = fields().map(n => n.props.value);
    expect(shown).toEqual(expect.arrayContaining(['૧૦', '૫૦', '૫', '૧૨']));
    expect(shown.some(v => /[0-9]/.test(String(v)))).toBe(false);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await pressSave();
    expect(setStandardRate).toHaveBeenLastCalledWith([tier(0, 10, 3.5, 1.5, 5), tier(11, 50, 4, 2, 12)], { expectedUpdatedAt: null, requestKey: expect.any(String), signal: expect.anything() });
  });

  // Review A5: an error above the fold scrolls to the field by its place in the content, not its place on the window.
  it('scrolls to the first wrong field using the scroll offset as well as the field position', async () => {
    await open();
    // The scroll area is the host RCTScrollView around the fields (Testing Library has no query for it).
    let scroll = fields()[0].parent;
    while (scroll && scroll.type !== 'RCTScrollView') scroll = scroll.parent;
    await fireEvent.scroll(scroll!, { nativeEvent: { contentOffset: { y: 300 } } });
    measuredTop = { 'Rent per bag': 500 };
    await pressSave();
    expect(ScrollView.prototype.scrollTo).toHaveBeenCalledWith({ y: 640, animated: true });
  });
});
