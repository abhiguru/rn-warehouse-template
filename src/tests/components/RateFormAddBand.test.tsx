/**
 * "Add rate" on a rate in force, the form (WH-74, spec add-rate-next-band-change-rate, criteria 2, 6 and 9): the rate's own
 * band is closed and cannot be changed or removed, a new band is open from 31 kg with nothing wrong shown, the start
 * is the rate's own day or Today (one choice when the rate started today), and a save sends the bands as loaded.
 * The item has one band, 0 to 30 kg, since 1 Jan 2025; today is 14 Oct 2026.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { RateForm } from '@/features/item-pricing/components/RateForm';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { replaceItemRates } from '@/services/item-pricing-service';
import { clearRateStartFloor, rememberRateStartFloor } from '@/services/rateStartFloor';
import { inputsWithLabel, rate, textsOf } from '@/tests/helpers/rateEditorFixtures';
import { showToast } from '@/utils/toast';

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
jest.mock('@/hooks/useLeaveGuard', () => ({ useLeaveGuard: () => ({ leaveWithoutAsking: (go: () => void) => go() }) }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn(), askAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

const own = () => rate('onion', null, 0, 30, 3.5, 1.5, 5, '2025-01-01', null, 'monthly', 'Review Onion Red');
const replace = jest.mocked(replaceItemRates);
let tree: ReactTestRenderer | undefined;

async function openWith(rows: ReturnType<typeof rate>[]) {
  const result: UseItemRatesForResult = {
    itemRates: { item: { id: 'onion', name: 'Review Onion Red', packaging: 'Bag' } as never, rows },
    status: 'ready',
    notFound: false,
    refreshing: false,
    refreshError: false,
    lastUpdated: Date.now(),
    refresh: jest.fn().mockResolvedValue(undefined),
  };
  jest.mocked(useItemRatesFor).mockReturnValue(result);
  await act(async () => { tree = create(<RateForm itemId="onion" mode="addBand" priceType="monthly" />); });
  return tree!;
}
const ids = (t: ReactTestRenderer, id: string) => t.root.findAll(n => n.props.testID === id);
const textOf = (t: ReactTestRenderer, id: string) =>
  t.root.findAllByType(Text).filter(n => n.props.testID === id).map(n => [n.props.children].flat(Infinity).join(''));
const type = async (t: ReactTestRenderer, label: string, text: string, index = 0) => {
  await act(async () => { inputsWithLabel(t, label)[index].props.onChangeText(text); });
};
const press = async (t: ReactTestRenderer, id: string) => {
  await act(async () => { t.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); });
};
const save = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => b.props.testID === 'add-rate-save')!;
const pressSave = async (t: ReactTestRenderer) => { await act(async () => { save(t).props.onPress(); }); };
/** The chips of the start choice, by label. */
const startChips = (t: ReactTestRenderer) =>
  ids(t, 'add-rate-band-start')[0].findAll(n => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string').map(n => String(n.props.accessibilityLabel));

beforeEach(() => {
  jest.clearAllMocks();
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

describe('criterion 2: what the form opens with on 0-30', () => {
  it('Band 1 is a closed card with its figures and no field, no remove button; Band 2 is open', async () => {
    const t = await openWith([own()]);
    expect(ids(t, 'add-rate-band-0').length).toBeGreaterThan(0);
    expect(textOf(t, 'add-rate-band-0-rate').length).toBeGreaterThan(0);
    expect(ids(t, 'add-rate-band-0-remove')).toHaveLength(0);
    expect(ids(t, 'add-rate-band-0-toggle')).toHaveLength(0);
    expect(inputsWithLabel(t, 'Up to (kg)').map(n => n.props.testID)).toEqual(['add-rate-band.1.upTo']);
    expect(textOf(t, 'add-rate-band-1-from')).toEqual(['From 31 kg']);
    expect(textsOf(t)).toContain("Bands already in the rate can't be changed here. Use Change rate to start a new rent from a date.");
  });

  it('Up to and rent are blank, the labour and tax of Band 2 are those of Band 1, and no message shows', async () => {
    const t = await openWith([own()]);
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.value).toBe('');
    expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.value).toBe('');
    const valueOf = (testID: string) => t.root.findAllByType(Input).find(n => n.props.testID === testID)?.props.value;
    expect(valueOf('add-rate-band.1.labour')).toBe('1.50');
    expect(valueOf('add-rate-band.1.tax')).toBe('5');
    for (const input of t.root.findAllByType(Input)) expect(input.props.error).toBeFalsy();
    expect(ids(t, 'add-rate-error')).toHaveLength(0);
  });

  it('leaves out the shared labour and tax boxes and "Copy weight bands"', async () => {
    const t = await openWith([own()]);
    expect(ids(t, 'add-rate-shared')).toHaveLength(0);
    expect(ids(t, 'add-rate-copy')).toHaveLength(0);
  });

  it('"Add weight band" adds a further band that can be removed; the own band of the rate has no remove button', async () => {
    const t = await openWith([own()]);
    await type(t, 'Up to (kg)', '50');
    await press(t, 'add-band');
    expect(ids(t, 'add-rate-band-2').length).toBeGreaterThan(0);
    expect(ids(t, 'add-rate-band-2-remove').length).toBeGreaterThan(0);
    expect(ids(t, 'add-rate-band-0-remove')).toHaveLength(0);
  });
});

describe('criterion 6 and the start choice', () => {
  it('a rate that started earlier offers its own start (with the date) and Today', async () => {
    const t = await openWith([own()]);
    expect(startChips(t)).toEqual(["The rate's own start, 1 Jan 2025", expect.stringMatching(/^Today, /)]);
  });

  it('a rate that started today has one date choice', async () => {
    const t = await openWith([rate('onion', null, 0, 30, 3.5, 1.5, 5, '2026-10-14', null, 'monthly', 'Review Onion Red')]);
    const chips = startChips(t);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain("The rate's own start");
  });

  it('bands that start on different days offer no choice: the line says a new band can only start today', async () => {
    const t = await openWith([
      rate('onion', null, 0, 30, 3.5, 1.5, 5, '2025-01-01', null, 'monthly', 'Review Onion Red'),
      rate('onion', null, 31, 50, 4, 1.5, 5, '2025-06-01', null, 'monthly', 'Review Onion Red'),
    ]);
    expect(textOf(t, 'add-rate-mixed-starts')).toEqual(["This rate's bands don't all run on the same dates, so a new band can only start today."]);
    expect(ids(t, 'add-rate-band-start')).toHaveLength(0);
  });

  it('an ended band that started the same day offers no choice either, and a save is a change from today', async () => {
    const t = await openWith([
      own(),
      rate('onion', null, 31, 50, 4, 1.5, 5, '2025-01-01', '2025-06-30', 'monthly', 'Review Onion Red'),
    ]);
    expect(textOf(t, 'add-rate-mixed-starts')).toHaveLength(1);
    expect(ids(t, 'add-rate-band-start')).toHaveLength(0);
    await type(t, 'Up to (kg)', '50');
    await type(t, 'Rent ₹/month', '4');
    replace.mockResolvedValueOnce({ success: true } as never);
    await pressSave(t);
    expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'change', starts_on: '2026-10-14' });
  });

  it('says which lots get the new band, for each choice', async () => {
    const t = await openWith([own()]);
    expect(textOf(t, 'add-rate-rule')[0]).toContain('01/01/25');
    await act(async () => { ids(t, 'add-rate-band-start')[0].findAll(n => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('Today'))[0].props.onPress(); });
    expect(textOf(t, 'add-rate-rule')[0]).toContain('14/10/26');
    expect(textOf(t, 'add-rate-rule')[0]).toContain('Earlier lots keep the old rent and have no rate for the new weights');
  });
});

describe('criterion 9: a planned later rate', () => {
  it('says on the form that the band is not added to it, with the rate\'s own start only', async () => {
    const t = await openWith([own(), rate('onion', null, 0, 30, 4, 1.5, 5, '2027-01-01', null, 'monthly', 'Review Onion Red')]);
    expect(textOf(t, 'add-rate-planned-note')).toEqual(["A rate from 01/01/27 is also planned. This band isn't added to it."]);
    await act(async () => { ids(t, 'add-rate-band-start')[0].findAll(n => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('Today'))[0].props.onPress(); });
    expect(ids(t, 'add-rate-planned-note')).toHaveLength(0);
  });

  it('shows no note when nothing is planned', async () => {
    const t = await openWith([own()]);
    expect(ids(t, 'add-rate-planned-note')).toHaveLength(0);
  });

  describe('on a rate that began before the earliest day (WH-81)', () => {
    // The facility's oldest GRN is 1 Jun 2025, so the rate from 1 Jan 2025 is older than the earliest day.
    beforeEach(() => { rememberRateStartFloor('2025-06-01'); });
    afterEach(() => { clearRateStartFloor(); });
    const planned = () => rate('onion', null, 0, 30, 4, 1.5, 5, '2027-01-01', null, 'monthly', 'Review Onion Red');

    it('offers only Today and gives the planned rate as the reason', async () => {
      const t = await openWith([own(), planned()]);
      expect(textOf(t, 'add-rate-mixed-starts')).toEqual(['A rate from 01/01/27 is planned, so a new band can only start today. To start it earlier, cancel the planned rate first.']);
      expect(ids(t, 'add-rate-band-start')).toHaveLength(0);
    });

    it('the save is a change from today, which the server refuses while the planned rate stands: the form asks, and "Keep it" saves nothing', async () => {
      const t = await openWith([own(), planned()]);
      await type(t, 'Up to (kg)', '50');
      await type(t, 'Rent ₹/month', '4');
      // What the server answers to a change that a later rate follows (backend migration 129): a refusal naming that rate, never a success.
      replace.mockResolvedValueOnce({
        success: false,
        errorCode: 'LATER_RATES_EXIST',
        later: [{ effective_from: '2027-01-01', weight_min: 0, weight_max: 30, unit_price: 4 }],
      } as never);
      await pressSave(t);
      expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'change', starts_on: '2026-10-14' });
      expect(replace.mock.calls[0][0]).not.toHaveProperty('replace_later');
      const question = () => t.root.findAllByType(ConfirmDialog).find(d => d.props.confirmText === 'Replace it')!;
      expect(question().props.visible).toBe(true);
      expect(question().props.title).toBe('Replace the rate from 01/01/27?');
      expect(question().props.cancelText).toBe('Keep it');
      await act(async () => { question().props.onCancel(); });
      expect(question().props.visible).toBe(false);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(router.back).not.toHaveBeenCalled();
    });

    it('keeps the differing-dates line when an ended band is at risk as well', async () => {
      const t = await openWith([
        own(),
        rate('onion', null, 31, 50, 4, 1.5, 5, '2025-08-01', '2025-12-31', 'monthly', 'Review Onion Red'),
        planned(),
      ]);
      expect(textOf(t, 'add-rate-mixed-starts')).toEqual(["This rate's bands don't all run on the same dates, so a new band can only start today."]);
      expect(ids(t, 'add-rate-band-start')).toHaveLength(0);
    });
  });
});

describe('saving', () => {
  it('sends a correction on the rate\'s own start with all bands, tells the band was saved and leaves', async () => {
    const t = await openWith([own()]);
    await type(t, 'Up to (kg)', '50');
    await type(t, 'Rent ₹/month', '4');
    replace.mockResolvedValueOnce({ success: true } as never);
    await pressSave(t);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toMatchObject({
      mode: 'correct',
      starts_on: '2025-01-01',
      bands: [
        { weight_min: 0, weight_max: 30, unit_price: 3.5, labour_rate: 1.5, tax_percent: 5 },
        { weight_min: 31, weight_max: 50, unit_price: 4, labour_rate: 1.5, tax_percent: 5 },
      ],
    });
    expect(showToast).toHaveBeenCalledWith('New weight band saved. It starts 01/01/25.');
    expect(router.back).toHaveBeenCalled();
  });

  it('with Today it is a change from today and says so as a new rate', async () => {
    const t = await openWith([own()]);
    await act(async () => { ids(t, 'add-rate-band-start')[0].findAll(n => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel).startsWith('Today'))[0].props.onPress(); });
    await type(t, 'Up to (kg)', '50');
    await type(t, 'Rent ₹/month', '4');
    replace.mockResolvedValueOnce({ success: true } as never);
    await pressSave(t);
    expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'change', starts_on: '2026-10-14' });
    expect(replace.mock.calls[0][0].bands).toHaveLength(2);
    expect(showToast).toHaveBeenCalledWith('New rate saved. Starts 14/10/26.');
  });

  it('with Up to or rent missing it sends nothing', async () => {
    const t = await openWith([own()]);
    await pressSave(t);
    expect(replace).not.toHaveBeenCalled();
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.error).toBeTruthy();
    expect(inputsWithLabel(t, 'Rent ₹/month')[0].props.error).toBeTruthy();
  });
});
