/**
 * The item's own rate form (RateForm, no customer) after the "Add rate" fixes (spec add-rate-band-entry, criteria
 * 1, 3, 5, 6 and 7): From is shown as text, never typed; a new band is quiet and starts where the last one ends; a
 * missing Up to brings focus to the field and sends nothing; a band-wide refusal shows once, at the top, and scrolls
 * there; the customer's rate keeps its From boxes, a first band above 0 and gaps. Where "Add weight band" sits is
 * not tested here (WH-63 is being reworked). The item has one band, 0 to 30 kg.
 */
import React from 'react';
import { ScrollView, TextInput } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { CustomerRateForm } from '@/features/item-pricing/components/CustomerRateForm';
import { RateForm } from '@/features/item-pricing/components/RateForm';
import { useItemRatesFor, type UseItemRatesForResult } from '@/features/item-pricing/useItemRates';
import { replaceItemRates } from '@/services/item-pricing-service';
import { inputsWithLabel, rate, textsOf } from '@/tests/helpers/rateEditorFixtures';

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

const ROWS = [rate('onion', null, 0, 30, 3.5, 1.5, 5, '2025-01-01', null, 'monthly', 'Review Onion Red')];
const replace = jest.mocked(replaceItemRates);


const ratesFor = (): UseItemRatesForResult => ({
  itemRates: { item: { id: 'onion', name: 'Review Onion Red', packaging: 'Bag' } as never, rows: ROWS },
  status: 'ready',
  notFound: false,
  refreshing: false,
  refreshError: false,
  lastUpdated: Date.now(),
  refresh: jest.fn().mockResolvedValue(undefined),
});
async function openItem(mode: 'add' | 'correct' = 'add') {
  jest.mocked(useItemRatesFor).mockReturnValue(ratesFor());
  await render(<RateForm itemId="onion" mode={mode} priceType="monthly" startsOn={mode === 'correct' ? '2025-01-01' : undefined} />);
}
async function openCustomer() {
  jest.mocked(useItemRatesFor).mockReturnValue(ratesFor());
  await render(<CustomerRateForm itemId="onion" customerId="cust-a" customerName="Review Orchard A" customerDeactivated={false} />);
}
const type = async (label: string, text: string, index = 0) => {
  await userEvent.paste(inputsWithLabel(label)[index], text);
};
const press = async (id: string) => {
  await userEvent.press(screen.getByTestId(id));
};
const save = () => screen.getByTestId('add-rate-save');
const pressSave = () => userEvent.press(save());
/** The words of the text with this testID. */
const textOf = (id: string) =>
  screen.queryAllByTestId(id).map(n => [n.props.children].flat(Infinity).join(''));
/** Every text field on the screen. */
const fields = () => screen.queryAllByDisplayValue(/^/);
/**
 * The jest TextInput and ScrollView keep focus and scrollTo on a shared prototype and the app calls them on the component
 * instance, which Testing Library does not return: they are spied on the prototype, and a focus knows its field by testID.
 */
let focused: string[] = [];
const bandTitles = () => textsOf().filter(s => s.startsWith('Band '));

beforeEach(() => {
  jest.clearAllMocks();
  focused = [];
  jest.spyOn(TextInput.prototype as unknown as { focus: () => void }, 'focus').mockImplementation(function (this: { props: { testID?: string } }) {
    focused.push(String(this.props.testID));
  });
  jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo').mockImplementation(() => undefined);
  jest.useFakeTimers({
    now: new Date('2026-10-14T10:00:00+05:30'),
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'hrtime'],
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('criterion 1: From is shown, not typed', () => {
  it.each(['add', 'correct'] as const)('mode %s: Band 1 shows "From 0 kg" as text and has no From box', async mode => {
    await openItem(mode);
    expect(textOf('add-rate-band-0-from')).toEqual(['From 0 kg']);
    expect(screen.queryByTestId('add-rate-firstFrom')).not.toBeOnTheScreen();
    expect(fields().filter(n => String(n.props.accessibilityLabel).startsWith('From'))).toHaveLength(0);
    expect(fields().some(n => String(n.props.testID).includes('from'))).toBe(false);
    // Up to stays a box.
    expect(inputsWithLabel('Up to (kg)')).toHaveLength(1);
  });
});

describe('criterion 3: Add weight band opens a quiet Band 2 from 31 kg', () => {
  it('shows From 31 kg as text, no messages, and no From box', async () => {
    await openItem();
    await press('add-band');
    expect(textOf('add-rate-band-1-from')).toEqual(['From 31 kg']);
    expect(fields().filter(n => String(n.props.accessibilityLabel).startsWith('From'))).toHaveLength(0);
    for (const input of fields()) expect(input.props.accessibilityHint).toBeUndefined();
    expect(screen.queryByTestId('add-rate-error')).not.toBeOnTheScreen();
    expect(inputsWithLabel('Up to (kg)')[0]).toHaveProp('testID', 'add-rate-band.1.upTo');
  });

  it('the title never shows a range ending below its start while Up to is typed', async () => {
    await openItem();
    await press('add-band');
    expect(bandTitles()).toContain('Band 2 · weights not set');
    for (const typed of ['5', '3', '30', '0', '']) {
      await type('Up to (kg)', typed);
      expect(bandTitles().filter(s => s.startsWith('Band 2'))).toEqual(['Band 2 · weights not set']);
    }
    await type('Up to (kg)', '50');
    expect(bandTitles().find(s => s.startsWith('Band 2'))).toMatch(/31.{1,3}50/);
  });
});

describe('criterion 5: a save with Band 2 Up to empty', () => {
  it('shows the message, focuses the field and sends nothing', async () => {
    await openItem();
    await press('add-band');
    await pressSave();
    expect(replace).not.toHaveBeenCalled();
    const upTo = inputsWithLabel('Up to (kg)')[0];
    expect(upTo).toHaveProp('testID', 'add-rate-band.1.upTo');
    expect(upTo.props.accessibilityHint).toBeTruthy();
    expect(focused.filter(id => id === 'add-rate-band.1.upTo')).toHaveLength(1);
  });

  it('opens the band holding the empty Up to when another band is open, then focuses it', async () => {
    await openItem();
    await press('add-band');
    await press('add-rate-band-0-toggle');
    await pressSave();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    expect(inputsWithLabel('Up to (kg)')[0]).toHaveProp('testID', 'add-rate-band.1.upTo');
    expect(inputsWithLabel('Up to (kg)')[0].props.accessibilityHint).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('criterion 6: a band-wide refusal shows once, at the top, and scrolls there', () => {
  it.each([
    ['BANDS_GAP', 'Weight bands must follow on from 0 kg with no gap.'],
    ['BANDS_OVERLAP', 'Weight bands overlap. Check the Up to weights.'],
  ] as const)('%s', async (errorCode, message) => {
    await openItem();
    await press('add-band');
    await type('Up to (kg)', '50');
    await type('Rent ₹/month', '4');
    (ScrollView.prototype.scrollTo as unknown as jest.Mock).mockClear();
    replace.mockResolvedValueOnce({ success: false, errorCode, message });
    await pressSave();
    expect(replace).toHaveBeenCalledTimes(1);
    // The strip at the top is the only alert saying it; the bands footer does not draw it a second time.
    expect(screen.getAllByRole('alert', { name: message })).toHaveLength(1);
    expect(screen.getByRole('alert', { name: message })).toHaveProp('testID', 'add-rate-error');
    expect(textsOf().filter(s => s === message)).toHaveLength(1);
    expect(ScrollView.prototype.scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });
});

describe('criterion 7: a customer rate keeps its From boxes, a first band above 0 and gaps', () => {
  it('shows a From box on each band', async () => {
    await openCustomer();
    expect(inputsWithLabel('From (kg)')).toHaveLength(1);
    expect(inputsWithLabel('From (kg)')[0]).toHaveProp('testID', 'add-rate-firstFrom');
    expect(screen.queryByTestId('add-rate-band-0-from')).not.toBeOnTheScreen();
  });

  it('saves a first band that starts above 0, and a gap between bands', async () => {
    await openCustomer();
    replace.mockResolvedValue({ success: true });
    await type('From (kg)', '5');
    expect(inputsWithLabel('From (kg)')[0]).toHaveDisplayValue('5');
    await type('Up to (kg)', '30');
    await press('add-band');
    await type('From (kg)', '40');
    expect(inputsWithLabel('From (kg)')[0]).toHaveDisplayValue('40');
    await type('Up to (kg)', '80');
    await type('Rent ₹/month', '4');
    await pressSave();
    expect(replace).toHaveBeenCalledTimes(1);
    const bands = (replace.mock.calls[0][0] as { bands: { weight_min: number; weight_max: number }[] }).bands;
    expect(bands.map(b => [b.weight_min, b.weight_max])).toEqual([[5, 30], [40, 80]]);
  });
});
