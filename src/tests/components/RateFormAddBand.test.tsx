/**
 * "Add rate" on a rate in force, the form (WH-74, spec add-rate-next-band-change-rate, criteria 2, 6 and 9): the rate's own
 * band is closed and cannot be changed or removed, a new band is open from 31 kg with nothing wrong shown, the start
 * is the rate's own day or Today (one choice when the rate started today), and a save sends the bands as loaded.
 * The item has one band, 0 to 30 kg, since 1 Jan 2025; today is 14 Oct 2026.
 */
import React from 'react';
import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { RateForm } from '@/features/item-pricing/components/RateForm';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { replaceItemRates } from '@/services/item-pricing-service';
import { clearRateStartFloor, rememberRateStartFloor } from '@/services/rateStartFloor';
import { inputsWithLabel, rate } from '@/tests/helpers/rateEditorFixtures';
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
  await render(<RateForm itemId="onion" mode="addBand" priceType="monthly" />);
}
const ids = (id: string) => screen.queryAllByTestId(id);
const textOf = (id: string) =>
  screen.queryAllByTestId(id).map(n => [n.props.children].flat(Infinity).join(''));
const type = async (label: string, text: string, index = 0) => {
  await userEvent.paste(inputsWithLabel(label)[index], text);
};
const press = async (id: string) => {
  await userEvent.press(screen.getByTestId(id));
};
const save = () => screen.getByTestId('add-rate-save');
const pressSave = () => userEvent.press(save());
/** The Save button's own onPress, called past the disabled state (Testing Library shows host views only; the Pressable's handler is on the fiber above). */
const pressSavePastDisabled = async () => {
  let fiber = save().unstable_fiber;
  while (fiber && typeof fiber.memoizedProps?.onPress !== 'function') fiber = fiber.return;
  const onPress = fiber?.memoizedProps.onPress as () => void;
  await act(async () => { onPress(); });
};
/** The chips of the start choice, by label. */
const startChips = () => within(ids('add-rate-band-start')[0]).getAllByRole('radio').map(n => String(n.props.accessibilityLabel));
const pressTodayChip = () => userEvent.press(within(ids('add-rate-band-start')[0]).getByRole('radio', { name: /^Today/ }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: new Date('2026-10-14T10:00:00+05:30'),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'hrtime'],
  });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('criterion 2: what the form opens with on 0-30', () => {
  it('Band 1 is a closed card with its figures and no field, no remove button; Band 2 is open', async () => {
    await openWith([own()]);
    expect(ids('add-rate-band-0').length).toBeGreaterThan(0);
    expect(textOf('add-rate-band-0-rate').length).toBeGreaterThan(0);
    expect(ids('add-rate-band-0-remove')).toHaveLength(0);
    expect(ids('add-rate-band-0-toggle')).toHaveLength(0);
    expect(inputsWithLabel('Up to (kg)')).toHaveLength(1);
    expect(inputsWithLabel('Up to (kg)')[0]).toHaveProp('testID', 'add-rate-band.1.upTo');
    expect(textOf('add-rate-band-1-from')).toEqual(['From 31 kg']);
    expect(screen.getByText("Bands already in the rate can't be changed here. Use Change rate to start a new rent from a date.")).toBeOnTheScreen();
  });

  it('Up to and rent are blank, the labour and tax of Band 2 are those of Band 1, and no message shows', async () => {
    await openWith([own()]);
    expect(inputsWithLabel('Up to (kg)')[0]).toHaveDisplayValue('');
    expect(inputsWithLabel('Rent ₹/month')[0]).toHaveDisplayValue('');
    const valueOf = (testID: string) => screen.getByTestId(testID);
    expect(valueOf('add-rate-band.1.labour')).toHaveDisplayValue('1.50');
    expect(valueOf('add-rate-band.1.tax')).toHaveDisplayValue('5');
    for (const input of screen.getAllByDisplayValue(/^/)) expect(input.props.accessibilityHint).toBeUndefined();
    expect(ids('add-rate-error')).toHaveLength(0);
  });

  it('leaves out the shared labour and tax boxes and "Copy weight bands"', async () => {
    await openWith([own()]);
    expect(ids('add-rate-shared')).toHaveLength(0);
    expect(ids('add-rate-copy')).toHaveLength(0);
  });

  it('"Add weight band" adds a further band that can be removed; the own band of the rate has no remove button', async () => {
    await openWith([own()]);
    await type('Up to (kg)', '50');
    await press('add-band');
    expect(ids('add-rate-band-2').length).toBeGreaterThan(0);
    expect(ids('add-rate-band-2-remove').length).toBeGreaterThan(0);
    expect(ids('add-rate-band-0-remove')).toHaveLength(0);
  });
});

describe('criterion 6 and the start choice', () => {
  it('a rate that started earlier offers its own start (with the date) and Today', async () => {
    await openWith([own()]);
    expect(startChips()).toEqual(["The rate's own start, 1 Jan 2025", expect.stringMatching(/^Today, /)]);
  });

  it('a rate that started today has one date choice', async () => {
    await openWith([rate('onion', null, 0, 30, 3.5, 1.5, 5, '2026-10-14', null, 'monthly', 'Review Onion Red')]);
    const chips = startChips();
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain("The rate's own start");
  });

  it('bands that start on different days offer no choice: the line says a new band can only start today', async () => {
    const t = await openWith([
      rate('onion', null, 0, 30, 3.5, 1.5, 5, '2025-01-01', null, 'monthly', 'Review Onion Red'),
      rate('onion', null, 31, 50, 4, 1.5, 5, '2025-06-01', null, 'monthly', 'Review Onion Red'),
    ]);
    expect(textOf('add-rate-mixed-starts')).toEqual(["This rate's bands don't all run on the same dates, so a new band can only start today."]);
    expect(ids('add-rate-band-start')).toHaveLength(0);
  });

  it('an ended band that started the same day offers no choice either, and a save is a change from today', async () => {
    const t = await openWith([
      own(),
      rate('onion', null, 31, 50, 4, 1.5, 5, '2025-01-01', '2025-06-30', 'monthly', 'Review Onion Red'),
    ]);
    expect(textOf('add-rate-mixed-starts')).toHaveLength(1);
    expect(ids('add-rate-band-start')).toHaveLength(0);
    await type('Up to (kg)', '50');
    await type('Rent ₹/month', '4');
    replace.mockResolvedValueOnce({ success: true } as never);
    await pressSave();
    expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'change', starts_on: '2026-10-14' });
  });

  it('says which lots get the new band, for each choice', async () => {
    await openWith([own()]);
    expect(textOf('add-rate-rule')[0]).toContain('01/01/25');
    await pressTodayChip();
    expect(textOf('add-rate-rule')[0]).toContain('14/10/26');
    expect(textOf('add-rate-rule')[0]).toContain('Earlier lots keep the old rent and have no rate for the new weights');
  });
});

describe('criterion 9: a planned later rate', () => {
  it('says on the form that the band is not added to it, with the rate\'s own start only', async () => {
    await openWith([own(), rate('onion', null, 0, 30, 4, 1.5, 5, '2027-01-01', null, 'monthly', 'Review Onion Red')]);
    expect(textOf('add-rate-planned-note')).toEqual(["A rate from 01/01/27 is also planned. This band isn't added to it."]);
    await pressTodayChip();
    expect(ids('add-rate-planned-note')).toHaveLength(0);
  });

  it('shows no note when nothing is planned', async () => {
    await openWith([own()]);
    expect(ids('add-rate-planned-note')).toHaveLength(0);
  });

  describe('on a rate that began before the earliest day (WH-81)', () => {
    // The facility's oldest GRN is 1 Jun 2025, so the rate from 1 Jan 2025 is older than the earliest day.
    beforeEach(() => { rememberRateStartFloor('2025-06-01'); });
    afterEach(() => { clearRateStartFloor(); });
    const planned = () => rate('onion', null, 0, 30, 4, 1.5, 5, '2027-01-01', null, 'monthly', 'Review Onion Red');

    it('offers only Today and gives the planned rate as the reason', async () => {
      await openWith([own(), planned()]);
      expect(textOf('add-rate-mixed-starts')).toEqual(['A rate from 01/01/27 is planned. A new band can only start today, and saving it replaces that planned rate. You\'ll be asked first. Afterwards, use Change rate to plan it again.']);
      expect(ids('add-rate-band-start')).toHaveLength(0);
    });

    it('the save is a change from today, which the server refuses while the planned rate stands: the form asks, and "Keep it" saves nothing', async () => {
      await openWith([own(), planned()]);
      await type('Up to (kg)', '50');
      await type('Rent ₹/month', '4');
      // What the server answers to a change that a later rate follows (backend migration 129): a refusal naming that rate, never a success.
      replace.mockResolvedValueOnce({
        success: false,
        errorCode: 'LATER_RATES_EXIST',
        later: [{ effective_from: '2027-01-01', weight_min: 0, weight_max: 30, unit_price: 4 }],
      } as never);
      await pressSave();
      expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'change', starts_on: '2026-10-14' });
      expect(replace.mock.calls[0][0]).not.toHaveProperty('replace_later');
      expect(screen.getByRole('button', { name: 'Replace it' })).toBeOnTheScreen();
      expect(screen.getByText('Replace the rate from 01/01/27?')).toBeOnTheScreen();
      await userEvent.press(screen.getByRole('button', { name: 'Keep it' }));
      expect(screen.queryByRole('button', { name: 'Replace it' })).not.toBeOnTheScreen();
      expect(screen.queryByText('Replace the rate from 01/01/27?')).not.toBeOnTheScreen();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(router.back).not.toHaveBeenCalled();
    });

    it('"Replace it" saves the bands from today and leaves (WH-103)', async () => {
      await openWith([own(), planned()]);
      await type('Up to (kg)', '50');
      await type('Rent ₹/month', '4');
      replace.mockResolvedValueOnce({
        success: false,
        errorCode: 'LATER_RATES_EXIST',
        later: [{ effective_from: '2027-01-01', weight_min: 0, weight_max: 30, unit_price: 4 }],
      } as never);
      await pressSave();
      replace.mockResolvedValueOnce({ success: true } as never);
      await userEvent.press(screen.getByRole('button', { name: 'Replace it' }));
      expect(replace).toHaveBeenCalledTimes(2);
      expect(replace.mock.calls[1][0]).toMatchObject({ mode: 'change', starts_on: '2026-10-14', replace_later: true });
      expect(replace.mock.calls[1][0].bands).toHaveLength(2);
      expect(router.back).toHaveBeenCalled();
    });
  });

  describe('a refused save on the rate\'s own start (WH-103)', () => {
    it('reads the new bandLaterBlocked text in the strip at the top', async () => {
      clearRateStartFloor();
      await openWith([own(), rate('onion', null, 0, 30, 4, 1.5, 5, '2027-01-01', null, 'monthly', 'Review Onion Red')]);
      await type('Up to (kg)', '50');
      await type('Rent ₹/month', '4');
      replace.mockResolvedValueOnce({
        success: false,
        errorCode: 'LATER_RATES_EXIST',
        later: [{ effective_from: '2027-01-01', weight_min: 0, weight_max: 30, unit_price: 4 }],
      } as never);
      await pressSave();

      expect(screen.getByText("A rate from 01/01/27 is planned, so this band can't start from 01/01/25. It can only start today, and saving it replaces that planned rate. You'll be asked first.")).toBeOnTheScreen();
    });
  });

  describe('(WH-81 continued)', () => {
    beforeEach(() => { rememberRateStartFloor('2025-06-01'); });
    afterEach(() => { clearRateStartFloor(); });
    const planned = () => rate('onion', null, 0, 30, 4, 1.5, 5, '2027-01-01', null, 'monthly', 'Review Onion Red');

    it('keeps the differing-dates line when an ended band is at risk as well', async () => {
      const t = await openWith([
        own(),
        rate('onion', null, 31, 50, 4, 1.5, 5, '2025-08-01', '2025-12-31', 'monthly', 'Review Onion Red'),
        planned(),
      ]);
      expect(textOf('add-rate-mixed-starts')).toEqual(["This rate's bands don't all run on the same dates, so a new band can only start today."]);
      expect(ids('add-rate-band-start')).toHaveLength(0);
    });
  });
});

describe('saving', () => {
  it('sends a correction on the rate\'s own start with all bands, tells the band was saved and leaves', async () => {
    await openWith([own()]);
    await type('Up to (kg)', '50');
    await type('Rent ₹/month', '4');
    replace.mockResolvedValueOnce({ success: true } as never);
    await pressSave();
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
    await openWith([own()]);
    await pressTodayChip();
    await type('Up to (kg)', '50');
    await type('Rent ₹/month', '4');
    replace.mockResolvedValueOnce({ success: true } as never);
    await pressSave();
    expect(replace.mock.calls[0][0]).toMatchObject({ mode: 'change', starts_on: '2026-10-14' });
    expect(replace.mock.calls[0][0].bands).toHaveLength(2);
    expect(showToast).toHaveBeenCalledWith('New rate saved. Starts 14/10/26.');
  });

  it('with Up to or rent missing it sends nothing', async () => {
    await openWith([own()]);
    // Save is off until something is typed: the form's own handler is called past the disabled state, as a tap that got through.
    expect(save()).toBeDisabled();
    await pressSavePastDisabled();
    expect(replace).not.toHaveBeenCalled();
    expect(inputsWithLabel('Up to (kg)')[0].props.accessibilityHint).toBeTruthy();
    expect(inputsWithLabel('Rent ₹/month')[0].props.accessibilityHint).toBeTruthy();
  });
});
