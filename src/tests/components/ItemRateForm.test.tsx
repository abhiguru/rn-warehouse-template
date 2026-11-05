/**
 * The item's own rate form (RateForm, no customer) after the "Add rate" fixes (spec add-rate-band-entry, criteria
 * 1, 3, 5, 6 and 7): From is shown as text, never typed; a new band is quiet and starts where the last one ends; a
 * missing Up to brings focus to the field and sends nothing; a band-wide refusal shows once, at the top, and scrolls
 * there; the customer's rate keeps its From boxes, a first band above 0 and gaps. Where "Add weight band" sits is
 * not tested here (WH-63 is being reworked). The item has one band, 0 to 30 kg.
 */
import React from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
let tree: ReactTestRenderer | undefined;

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
  await act(async () => {
    tree = create(<RateForm itemId="onion" mode={mode} priceType="monthly" startsOn={mode === 'correct' ? '2025-01-01' : undefined} />);
  });
  return tree!;
}
async function openCustomer() {
  jest.mocked(useItemRatesFor).mockReturnValue(ratesFor());
  await act(async () => {
    tree = create(<CustomerRateForm itemId="onion" customerId="cust-a" customerName="Review Orchard A" customerDeactivated={false} />);
  });
  return tree!;
}
const type = async (t: ReactTestRenderer, label: string, text: string, index = 0) => {
  await act(async () => { inputsWithLabel(t, label)[index].props.onChangeText(text); });
};
const press = async (t: ReactTestRenderer, id: string) => {
  await act(async () => { t.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); });
};
const save = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => b.props.testID === 'add-rate-save')!;
const pressSave = async (t: ReactTestRenderer) => { await act(async () => { save(t).props.onPress(); }); };
/** The words of the text with this testID. */
const textOf = (t: ReactTestRenderer, id: string) =>
  t.root.findAllByType(Text).filter(n => n.props.testID === id).map(n => [n.props.children].flat(Infinity).join(''));
/** Give every field its own focus (the jest TextInput shares methods on a prototype). */
const nativeFields = (t: ReactTestRenderer) => {
  const out: Record<string, jest.Mock> = {};
  for (const node of t.root.findAllByType(TextInput)) {
    const instance = node.instance as { focus: jest.Mock; measureInWindow: jest.Mock };
    instance.focus = jest.fn();
    instance.measureInWindow = jest.fn();
    out[String(node.props.testID)] = instance.focus;
  }
  return out;
};
const scrollSpy = (t: ReactTestRenderer) => {
  const instance = t.root.findByType(ScrollView).instance as { scrollTo: jest.Mock };
  instance.scrollTo = jest.fn();
  return instance.scrollTo;
};
const bandTitles = (t: ReactTestRenderer) => textsOf(t).filter(s => s.startsWith('Band '));

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

describe('criterion 1: From is shown, not typed', () => {
  it.each(['add', 'correct'] as const)('mode %s: Band 1 shows "From 0 kg" as text and has no From box', async mode => {
    const t = await openItem(mode);
    expect(textOf(t, 'add-rate-band-0-from')).toEqual(['From 0 kg']);
    expect(t.root.findAll(n => n.props.testID === 'add-rate-firstFrom')).toHaveLength(0);
    expect(t.root.findAllByType(Input).filter(n => String(n.props.label).startsWith('From'))).toHaveLength(0);
    expect(t.root.findAllByType(Input).some(n => String(n.props.testID).includes('from'))).toBe(false);
    // Up to stays a box.
    expect(inputsWithLabel(t, 'Up to (kg)')).toHaveLength(1);
  });
});

describe('criterion 3: Add weight band opens a quiet Band 2 from 31 kg', () => {
  it('shows From 31 kg as text, no messages, and no From box', async () => {
    const t = await openItem();
    await press(t, 'add-band');
    expect(textOf(t, 'add-rate-band-1-from')).toEqual(['From 31 kg']);
    expect(t.root.findAllByType(Input).filter(n => String(n.props.label).startsWith('From'))).toHaveLength(0);
    for (const input of t.root.findAllByType(Input)) expect(input.props.error).toBeFalsy();
    expect(t.root.findAll(n => n.props.testID === 'add-rate-error')).toHaveLength(0);
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.testID).toBe('add-rate-band.1.upTo');
  });

  it('the title never shows a range ending below its start while Up to is typed', async () => {
    const t = await openItem();
    await press(t, 'add-band');
    expect(bandTitles(t)).toContain('Band 2 · weights not set');
    for (const typed of ['5', '3', '30', '0', '']) {
      await type(t, 'Up to (kg)', typed);
      expect(bandTitles(t).filter(s => s.startsWith('Band 2'))).toEqual(['Band 2 · weights not set']);
    }
    await type(t, 'Up to (kg)', '50');
    expect(bandTitles(t).find(s => s.startsWith('Band 2'))).toMatch(/31.{1,3}50/);
  });
});

describe('criterion 5: a save with Band 2 Up to empty', () => {
  it('shows the message, focuses the field and sends nothing', async () => {
    const t = await openItem();
    await press(t, 'add-band');
    const focus = nativeFields(t);
    await pressSave(t);
    expect(replace).not.toHaveBeenCalled();
    const upTo = inputsWithLabel(t, 'Up to (kg)')[0];
    expect(upTo.props.testID).toBe('add-rate-band.1.upTo');
    expect(upTo.props.error).toBeTruthy();
    expect(focus['add-rate-band.1.upTo']).toHaveBeenCalledTimes(1);
  });

  it('opens the band holding the empty Up to when another band is open, then focuses it', async () => {
    const t = await openItem();
    await press(t, 'add-band');
    await press(t, 'add-rate-band-0-toggle');
    await pressSave(t);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.testID).toBe('add-rate-band.1.upTo');
    expect(inputsWithLabel(t, 'Up to (kg)')[0].props.error).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('criterion 6: a band-wide refusal shows once, at the top, and scrolls there', () => {
  it.each([
    ['BANDS_GAP', 'Weight bands must follow on from 0 kg with no gap.'],
    ['BANDS_OVERLAP', 'Weight bands overlap. Check the Up to weights.'],
  ] as const)('%s', async (errorCode, message) => {
    const t = await openItem();
    await press(t, 'add-band');
    await type(t, 'Up to (kg)', '50');
    await type(t, 'Rent ₹/month', '4');
    const scrollTo = scrollSpy(t);
    replace.mockResolvedValueOnce({ success: false, errorCode, message });
    await pressSave(t);
    expect(replace).toHaveBeenCalledTimes(1);
    const strips = t.root.findAll(n => n.props.testID === 'add-rate-error' && n.props.message);
    expect(strips).toHaveLength(1);
    expect(strips[0].props.message).toBe(message);
    // Once on the screen: the strip draws it, the bands footer does not draw it a second time.
    expect(textsOf(t).filter(s => s === message)).toHaveLength(1);
    expect(t.root.findAll(n => n.props.accessibilityRole === 'alert' && [n.props.children].flat(Infinity).join('') === message)).toHaveLength(0);
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });
});

describe('criterion 7: a customer rate keeps its From boxes, a first band above 0 and gaps', () => {
  it('shows a From box on each band', async () => {
    const t = await openCustomer();
    expect(inputsWithLabel(t, 'From (kg)')).toHaveLength(1);
    expect(inputsWithLabel(t, 'From (kg)')[0].props.testID).toBe('add-rate-firstFrom');
    expect(t.root.findAll(n => n.props.testID === 'add-rate-band-0-from')).toHaveLength(0);
  });

  it('saves a first band that starts above 0, and a gap between bands', async () => {
    const t = await openCustomer();
    replace.mockResolvedValue({ success: true });
    await type(t, 'From (kg)', '5');
    expect(inputsWithLabel(t, 'From (kg)')[0].props.value).toBe('5');
    await type(t, 'Up to (kg)', '30');
    await press(t, 'add-band');
    await type(t, 'From (kg)', '40');
    expect(inputsWithLabel(t, 'From (kg)')[0].props.value).toBe('40');
    await type(t, 'Up to (kg)', '80');
    await type(t, 'Rent ₹/month', '4');
    await pressSave(t);
    expect(replace).toHaveBeenCalledTimes(1);
    const bands = (replace.mock.calls[0][0] as { bands: { weight_min: number; weight_max: number }[] }).bands;
    expect(bands.map(b => [b.weight_min, b.weight_max])).toEqual([[5, 30], [40, 80]]);
  });
});
