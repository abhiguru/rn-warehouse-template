/**
 * The Standard rate screen (Settings): the four starting tiers, the checks, what is sent, the toast
 * that counts the items that got the rate, the leave guard and offline.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { getStandardRate, setStandardRate } from '@/services/item-pricing-service';
import { clearStandardRateCache } from '@/features/item-pricing/useStandardRate';
import { inputsWithLabel, textsOf } from '@/tests/helpers/rateEditorFixtures';
import { showToast } from '@/utils/toast';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean; title?: string }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ getStandardRate: jest.fn(), setStandardRate: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));

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
});
afterEach(() => {
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
    expect(inputsWithLabel(t, 'Rent per bag, per month')[0].props.error).toBe('Enter a rent of 0 or more.');
    expect(inputsWithLabel(t, 'Labour per bag')[3].props.error).toBe('Enter a labour rate of 0 or more.');
    expect(inputsWithLabel(t, 'Tax')[2].props.error).toBe('Enter a tax rate from 0 to 100.');
  });

  it('sends the four tiers as typed and tells how many items got the rate', async () => {
    const t = await open();
    await fillAll(t);
    expect(mockGuard.hasChanges).toBe(true);
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: FOUR.map(x => ({ ...x, labour_rate: 1 })), itemsPriced: 55 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(setStandardRate).toHaveBeenCalledWith([tier(0, 10, 3), tier(11, 20, 4), tier(21, 30, 5), tier(31, 50, 6)]);
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

  it('removes a tier and the one before takes its weights', async () => {
    const t = await open(FOUR);
    await act(async () => { t.root.find(n => n.props.testID === 'band-3-remove' && typeof n.props.onPress === 'function').props.onPress(); });
    jest.mocked(setStandardRate).mockResolvedValue({ success: true, tiers: [], itemsPriced: 0 });
    await act(async () => { saveButton(t).props.onPress(); });
    expect(jest.mocked(setStandardRate).mock.calls[0][0]).toEqual([tier(0, 10, 3), tier(11, 20, 4), tier(21, 50, 5)]);
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
});
