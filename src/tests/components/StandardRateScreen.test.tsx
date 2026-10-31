/**
 * The Standard rate screen (Settings): the four starting tiers, the checks, what is sent, the toast
 * that counts the items that got the rate, the leave guard and offline.
 */
import React from 'react';
import { ScrollView, TextInput } from 'react-native';
import { BandsEditor } from '@/features/item-pricing/components/BandsEditor';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { getStandardRate, setStandardRate } from '@/services/item-pricing-service';
import { clearStandardRateCache, rememberStandardRate } from '@/features/item-pricing/useStandardRate';
import { setLanguage } from '@/i18n';
import { inputsWithLabel, textsOf } from '@/tests/helpers/rateEditorFixtures';
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
let tree: ReactTestRenderer | undefined;

async function open(tiers: ReturnType<typeof tier>[] = []) {
  jest.mocked(getStandardRate).mockResolvedValue({ tiers, updatedAt: null, updatedByName: null });
  await act(async () => { tree = create(<StandardRateScreen />); });
  return tree!;
}
const value = (t: ReactTestRenderer, label: string) => inputsWithLabel(t, label).map(n => n.props.value);
const type = async (t: ReactTestRenderer, label: string, index: number, text: string) => {
  await act(async () => { inputsWithLabel(t, label)[index].props.onChangeText(text); });
};
const saveButton = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => b.props.testID === 'standard-save')!;
const fillAll = async (t: ReactTestRenderer) => {
  for (let i = 0; i < 4; i++) {
    await type(t, 'Rent per bag, per month', i, String(i + 3));
    await type(t, 'Labour per bag', i, '1');
    await type(t, 'Tax', i, '5');
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  clearStandardRateCache();
  mockOffline = false;
  mockGuard = { hasChanges: false };
  jest.mocked(askAlert).mockResolvedValue(true as never);
});
afterEach(() => {
  setLanguage('en');
  act(() => tree?.unmount());
  tree = undefined;
});

describe('Standard rate', () => {
  it('says what it does and starts with the four tiers 0-10, 11-20, 21-30, 31-50 kg and blank figures', async () => {
    const t = await open();
    expect(textsOf(t)).toContain('New items get this rate. Changing it does not change items that already have a rate.');
    expect(value(t, 'Up to')).toEqual(['10', '20', '30', '50']);
    expect(textsOf(t).filter(x => /^From \d+ kg$/.test(x))).toEqual(['From 0 kg', 'From 11 kg', 'From 21 kg', 'From 31 kg']);
    expect(value(t, 'Rent per bag, per month')).toEqual(['', '', '', '']);
    expect(value(t, 'Labour per bag')).toEqual(['', '', '', '']);
    expect(value(t, 'Tax')).toEqual(['', '', '', '']);
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('shows the tiers already saved instead', async () => {
    const t = await open([tier(0, 10, 3, 1.5, 5), tier(11, 40, 4, 2, 12)]);
    expect(value(t, 'Up to')).toEqual(['10', '40']);
    expect(value(t, 'Rent per bag, per month')).toEqual(['3.00', '4.00']);
    expect(value(t, 'Labour per bag')).toEqual(['1.50', '2.00']);
    expect(value(t, 'Tax')).toEqual(['5', '12']);
  });

  it('does not save blank figures: every tier names what is missing and nothing is sent', async () => {
    const t = await open();
    await act(async () => { saveButton(t).props.onPress(); });
    expect(setStandardRate).not.toHaveBeenCalled();
    expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.error).toBe(RENT_ERROR);
    expect(inputsWithLabel(t, 'Labour per bag')[3].props.error).toBe('Enter a labour rate of 0 or more.');
    expect(inputsWithLabel(t, 'Tax')[2].props.error).toBe('Enter a tax rate from 0 to 100.');
  });

  it('sends the four tiers as typed and tells how many items got the rate', async () => {
    const t = await open();
    await fillAll(t);
    expect(mockGuard.hasChanges).toBe(true);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR.map(x => ({ ...x, labour_rate: 1 })), itemsPriced: 55 });
    await act(async () => { saveButton(t).props.onPress(); });
    // A dry run first (writes nothing), then the real save, both with the version the form was built from.
    expect(setStandardRate).toHaveBeenCalledTimes(2);
    expect(setStandardRate).toHaveBeenNthCalledWith(1, [tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5), tier(31, 50, 6)], { expectedUpdatedAt: '-infinity', dryRun: true });
    expect(setStandardRate).toHaveBeenNthCalledWith(2, [tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5), tier(31, 50, 6)], { expectedUpdatedAt: '-infinity' });
    expect(askAlert).toHaveBeenCalledWith('Give this rate to 55 items that have never had a rate?', 'They are charged it for lots received from their first GRN.', expect.any(Array), false);
    expect(showToast).toHaveBeenCalledWith('Standard rate saved. 55 items got it.');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('says "1 item got it." for one and says nothing of items when none got it', async () => {
    const t = await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 1 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(showToast).toHaveBeenLastCalledWith('Standard rate saved. 1 item got it.');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(showToast).toHaveBeenLastCalledWith('Standard rate saved.');
  });

  it('adds a tier after the last and sends five', async () => {
    const t = await open(FOUR);
    await act(async () => { t.root.find(n => n.props.testID === 'add-band' && typeof n.props.onPress === 'function').props.onPress(); });
    expect(value(t, 'Up to')).toEqual(['10', '20', '30', '50', '']);
    await type(t, 'Up to', 4, '80');
    await type(t, 'Rent per bag, per month', 4, '7');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual([...FOUR, tier(51, 80, 7)]);
  });

  it('removing the last tier drops it: the range ends at the tier before', async () => {
    const t = await open(FOUR);
    await act(async () => { t.root.find(n => n.props.testID === 'band-3-remove' && typeof n.props.onPress === 'function').props.onPress(); });
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual([tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5)]);
  });

  it('removing a middle tier gives its weights to the tier before', async () => {
    const t = await open(FOUR);
    await act(async () => { t.root.find(n => n.props.testID === 'band-1-remove' && typeof n.props.onPress === 'function').props.onPress(); });
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual([tier(0, 20, 3), tier(21, 30, 5), tier(31, 50, 6)]);
    expect(textsOf(t)).toContain('Removing a band gives its weights to the band before it. Removing the last band shortens the range.');
  });

  it('puts the server\'s refusal on the tier and field it names, and stays', async () => {
    const t = await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: 'INVALID_AMOUNT', message: 'Check the rent, labour and tax amounts.', tierIndex: 2, field: 'labour_rate' });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(inputsWithLabel(t, 'Labour per bag')[2].props.error).toBe('Check the rent, labour and tax amounts.');
    expect(router.back).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows a refusal that names no field at the top', async () => {
    const t = await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: 'STANDARD_RATE_MANAGER_ONLY', message: 'Only an administrator or supervisor can set the standard rate.' });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(t.root.find(n => n.props.testID === 'standard-error' && n.props.message).props.message).toBe('Only an administrator or supervisor can set the standard rate.');
  });

  it('asks before leaving typed work, and not when nothing was typed', async () => {
    const t = await open(FOUR);
    expect(mockGuard.hasChanges).toBe(false);
    await type(t, 'Rent per bag, per month', 0, '3.50');
    expect(mockGuard.hasChanges).toBe(true);
    await type(t, 'Rent per bag, per month', 0, '3.00');
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('is offline: Save is disabled and says to connect', async () => {
    mockOffline = true;
    const t = await open(FOUR);
    expect(saveButton(t).props.disabled).toBe(true);
    expect(textsOf(t)).toContain('Connect to change rates.');
  });

  it('says it could not load, with Try again, when the server cannot be read', async () => {
    jest.mocked(getStandardRate).mockRejectedValue(new Error('down'));
    await act(async () => { tree = create(<StandardRateScreen />); });
    expect(tree!.root.findAll(n => n.props.testID === 'standard-load-error').length).toBeGreaterThan(0);
    expect(textsOf(tree!)).toContain("Couldn't load the standard rate");
  });

  // Review A1: the form is built from a fresh read, never from a copy another screen left in the cache.
  it('shows what the server holds now, not the copy an item page cached, and saves that', async () => {
    rememberStandardRate('test-facility|u1', { tiers: [tier(0, 10, 3), tier(11, 50, 4)], updatedAt: null, updatedByName: null });
    const t = await open(FOUR);
    expect(value(t, 'Up to')).toEqual(['10', '20', '30', '50']);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual(FOUR);
  });

  it('waits for the fresh read instead of showing the cached copy first', async () => {
    rememberStandardRate('test-facility|u1', { tiers: [tier(0, 10, 3)], updatedAt: null, updatedByName: null });
    let release!: (v: { tiers: ReturnType<typeof tier>[]; updatedAt: null; updatedByName: null }) => void;
    jest.mocked(getStandardRate).mockReturnValue(new Promise(r => { release = r; }));
    await act(async () => { tree = create(<StandardRateScreen />); });
    expect(inputsWithLabel(tree!, 'Up to')).toHaveLength(0);
    await act(async () => { release({ tiers: FOUR, updatedAt: null, updatedByName: null }); });
    expect(value(tree!, 'Up to')).toEqual(['10', '20', '30', '50']);
  });

  it('after an unknown outcome the cache is cleared, so the next opening reads the server again', async () => {
    const t = await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: 'UNKNOWN', message: "We couldn't confirm that the standard rate was saved. Close this screen and open it again before you try again.", outcomeUnknown: true });
    await act(async () => { saveButton(t).props.onPress(); });
    // The strip is the "Reload" one: nothing may be saved again until the screen has read the rate anew.
    expect(t.root.find(n => n.props.testID === 'standard-unconfirmed' && n.props.message).props.message).toMatch(/couldn't confirm/);
    expect(saveButton(t).props.disabled).toBe(true);
    act(() => t.unmount());
    jest.mocked(getStandardRate).mockReturnValue(new Promise(() => {}));
    await act(async () => { tree = create(<StandardRateScreen />); });
    expect(inputsWithLabel(tree!, 'Up to')).toHaveLength(0);
    expect(getStandardRate).toHaveBeenCalledTimes(2);
  });

  // Review A6
  it('says the facility server needs an update when it has no standard rate yet', async () => {
    jest.mocked(getStandardRate).mockRejectedValue(Object.assign(new Error('x'), { code: 'SERVER_NEEDS_UPDATE' }));
    await act(async () => { tree = create(<StandardRateScreen />); });
    expect(textsOf(tree!)).toContain("This cold storage's server needs an update before the standard rate is available.");
  });

  it('Try again reads the server again and shows the tiers', async () => {
    jest.mocked(getStandardRate).mockRejectedValueOnce(new Error('down'));
    await act(async () => { tree = create(<StandardRateScreen />); });
    jest.mocked(getStandardRate).mockResolvedValue({ tiers: FOUR, updatedAt: null, updatedByName: null });
    await act(async () => { tree!.root.find(n => n.props.testID === 'standard-load-error').props.onAction(); });
    expect(value(tree!, 'Up to')).toEqual(['10', '20', '30', '50']);
  });

  // Review A10
  it('refuses a tax above 100, a rate with three decimals and an Up to below its From, and sends nothing', async () => {
    const t = await open(FOUR);
    await fillAll(t);
    await type(t, 'Tax', 0, '101');
    await type(t, 'Rent per bag, per month', 1, '4.125');
    await type(t, 'Up to', 2, '15');
    await act(async () => { saveButton(t).props.onPress(); });
    expect(setStandardRate).not.toHaveBeenCalled();
    expect(inputsWithLabel(t, 'Tax')[0].props.error).toBe('Enter a tax rate from 0 to 100.');
    expect(inputsWithLabel(t, 'Rent per bag, per month')[1].props.error).toBe(RENT_ERROR);
    expect(inputsWithLabel(t, 'Up to')[2].props.error).toBe('Must be more than 20 kg; this band starts at 21 kg.');
  });

  it.each(['INVALID_BAND', 'BANDS_GAP', 'BANDS_OVERLAP'] as const)('puts a server %s on the Up to of the tier it names', async code => {
    const t = await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: code, message: 'Check the weights.', tierIndex: 1 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(inputsWithLabel(t, 'Up to')[1].props.error).toBe('Check the weights.');
  });

  it('says "Back" to the give-the-rate question: the dry run was the only call and nothing is saved', async () => {
    const t = await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 3 });
    jest.mocked(askAlert).mockResolvedValue(false as never);
    await act(async () => { saveButton(t).props.onPress(); });
    expect(setStandardRate).toHaveBeenCalledTimes(1);
    expect(jest.mocked(setStandardRate).mock.calls[0][1]).toEqual({ expectedUpdatedAt: null, dryRun: true });
    expect(askAlert).toHaveBeenCalledWith('Give this rate to 3 items that have never had a rate?', expect.any(String), expect.any(Array), false);
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does not ask when no item would get the rate: the real save follows the dry run at once', async () => {
    const t = await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR, itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(askAlert).not.toHaveBeenCalled();
    expect(setStandardRate).toHaveBeenCalledTimes(2);
  });

  it('asks before changing a saved standard rate, naming the old and the new figures', async () => {
    const t = await open([tier(0, 50, 4, 1, 5)]);
    await type(t, 'Rent per bag, per month', 0, '4.50');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [tier(0, 50, 4.5, 1, 5)], itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(askAlert).toHaveBeenCalledWith(
      'Change the standard rate?',
      'Now:\n0\u201350 kg: rent \u20b94.00, labour \u20b91.00, tax 5%\n\nNew:\n0\u201350 kg: rent \u20b94.50, labour \u20b91.00, tax 5%',
      expect.any(Array),
      false,
    );
    expect(setStandardRate).toHaveBeenCalledTimes(2);
  });

  it('saves nothing more than the dry run when the change question is answered Back', async () => {
    const t = await open([tier(0, 50, 4, 1, 5)]);
    await type(t, 'Rent per bag, per month', 0, '4.50');
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    jest.mocked(askAlert).mockResolvedValue(false as never);
    await act(async () => { saveButton(t).props.onPress(); });
    expect(setStandardRate).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('asks the change question in Gujarati digits', async () => {
    setLanguage('gu');
    const t = await open([tier(0, 50, 4, 1, 5)]);
    await act(async () => { t.root.findAllByType(TextInput).find(n => n.props.value === '૪.૦૦')!.props.onChangeText('4.50'); });
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    const [title, message] = jest.mocked(askAlert).mock.calls[0];
    expect(title).toBe('પ્રમાણભૂત દર બદલવો છે?');
    expect(String(message)).toContain('ભાડું');
    expect(/[0-9]/.test(String(message))).toBe(false);
  });

  it('shows a stale answer as the Reload strip and saves nothing', async () => {
    const t = await open(FOUR);
    jest.mocked(setStandardRate).mockResolvedValue({ success: false, errorCode: 'STALE_STANDARD_RATE', message: 'x' });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(setStandardRate).toHaveBeenCalledTimes(1);
    expect(t.root.findAll(n => n.props.testID === 'standard-stale' && n.props.message).length).toBeGreaterThan(0);
    expect(textsOf(t)).toContain('Someone else changed the standard rate. Reload to see their changes.');
  });

  it('shows the figures in Gujarati digits and still sends 0-9', async () => {
    setLanguage('gu');
    const t = await open([tier(0, 10, 3.5, 1.5, 5), tier(11, 50, 4, 2, 12)]);
    const shown = t.root.findAllByType(TextInput).map(n => n.props.value);
    expect(shown).toEqual(expect.arrayContaining(['૧૦', '૫૦', '૫', '૧૨']));
    expect(shown.some(v => /[0-9]/.test(String(v)))).toBe(false);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(setStandardRate).toHaveBeenLastCalledWith([tier(0, 10, 3.5, 1.5, 5), tier(11, 50, 4, 2, 12)], { expectedUpdatedAt: null });
  });

  // Review A5: an error above the fold scrolls to the field by its place in the content, not its place on the window.
  it('scrolls to the first wrong field using the scroll offset as well as the field position', async () => {
    const t = await open();
    const scrollTo = jest.fn();
    const scroll = t.root.findByType(ScrollView);
    (scroll.instance ?? {}).scrollTo = scrollTo;
    await act(async () => { scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } }); });
    const fields = t.root.findByType(BandsEditor).props.fields;
    fields.register('band.0.rent', { focus: jest.fn(), measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 500, 100, 40) });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(scrollTo).toHaveBeenCalledWith({ y: 640, animated: true });
  });
});
