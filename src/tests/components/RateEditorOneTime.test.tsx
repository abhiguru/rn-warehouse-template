/**
 * One-time rates (P-13): labour is included, so the editor has no labour field and sends 0.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { gingerRows, inputWithLabel, inputsWithLabel, textsOf } from '@/tests/helpers/rateEditorFixtures';
import RateEditorScreen from '../../../app/item-rates/edit';

let mockRole = 'admin';
let mockParams: Record<string, string> = {};
let mockGuard: { hasChanges: boolean; title?: string } = { hasChanges: false };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } } }),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean; title?: string }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'DateTimePicker',
  DateTimePickerAndroid: { open: jest.fn() },
}));

let tree: ReactTestRenderer | undefined;
async function open(params: Record<string, string>, rows = gingerRows()) {
  mockParams = params;
  jest.mocked(listItemRates).mockResolvedValue(rows);
  await act(async () => { tree = create(<RateEditorScreen />); });
  return tree!;
}
const type = async (t: ReactTestRenderer, label: string, text: string) => {
  await act(async () => { inputsWithLabel(t, label)[0].props.onChangeText(text); });
};
const save = (t: ReactTestRenderer) => t.root.findAllByType(Button).find(b => String(b.props.children).startsWith('Save'))!;

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

it('Add one-time rate to Ginger Fresh (monthly 8.00, labour 2.00): no labour field, the helper, "once" rent', async () => {
  const t = await open({ mode: 'add', item_id: 'ginger', price_type: 'one_time' });
  const texts = textsOf(t);
  expect(texts).toContain('Add default rate');
  expect(texts).toContain('One-time');
  expect(texts).toContain('Labour is included in a one-time rate.');
  expect(inputWithLabel(t, 'Labour per bag')).toBeUndefined();
  // The type is fixed by the page the person came from.
  expect(t.root.findAllByType(SegmentedControl)).toHaveLength(0);
  // Rent is a different amount for another kind of rate: empty, not the monthly 8.00. Tax is copied.
  expect(inputWithLabel(t, 'Rent per bag, once')?.props.value).toBe('');
  expect(inputWithLabel(t, 'Tax')?.props.value).toBe('5');
});

it('saves with labour 0 and the one-time price type', async () => {
  const t = await open({ mode: 'add', item_id: 'ginger', price_type: 'one_time' });
  await type(t, 'Rent per bag, once', '20');
  jest.mocked(replaceItemRates).mockResolvedValue({ success: true });
  await act(async () => { save(t).props.onPress(); });
  expect(replaceItemRates).toHaveBeenCalledWith({
    mode: 'change',
    item_id: 'ginger',
    customer_id: null,
    price_type: 'one_time',
    starts_on: '2026-10-14',
    seen_rows: expect.any(Array),
    bands: [{ weight_min: 0, weight_max: 100, unit_price: 20, labour_rate: 0, tax_percent: 5 }],
  });
});

it('an item with no rate: typing a labour of 3 and then choosing One-time still sends labour 0', async () => {
  const t = await open({ mode: 'add', item_id: 'fresh', item_name: 'Review Potato Seed' }, []);
  await type(t, 'Rent per bag, per month', '4');
  await type(t, 'Labour per bag', '3');
  await type(t, 'Tax', '5');
  await act(async () => { t.root.findByType(SegmentedControl).props.onValueChange('one_time'); });
  expect(inputWithLabel(t, 'Labour per bag')).toBeUndefined();
  expect(inputWithLabel(t, 'Rent per bag, once')?.props.value).toBe('4');
  jest.mocked(replaceItemRates).mockResolvedValue({ success: true });
  await act(async () => { save(t).props.onPress(); });
  expect(jest.mocked(replaceItemRates).mock.calls[0][0].bands[0]).toMatchObject({ labour_rate: 0, unit_price: 4, tax_percent: 5 });
  expect(jest.mocked(replaceItemRates).mock.calls[0][0].price_type).toBe('one_time');
});
