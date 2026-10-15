/**
 * The invoice pencil lands in the editor (spec section 10): the mode is resolved from the rows,
 * the strip says the change is for every invoice from now on, Back with Discard saves nothing.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { listItemRates, replaceItemRates } from '@/services/item-pricing-service';
import { ORCHARD_A, ORCHARD_B, chipState, inputWithLabel, inputsWithLabel, onionRows, textsOf } from '@/tests/helpers/rateEditorFixtures';
import RateEditorScreen from '../../../app/item-rates/edit';

let mockRole = 'admin';
let mockParams: Record<string, string> = {};
let mockGuard: { hasChanges: boolean; title?: string } = { hasChanges: false };
jest.mock('@/components/common/SearchableBottomSheet', () => ({ SearchableBottomSheet: () => null }));
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
const line = {
  mode: 'invoice',
  item_id: 'onion',
  item_name: 'Review Onion Red',
  customer_id: ORCHARD_B.id,
  customer_name: ORCHARD_B.name,
  price_type: 'monthly',
  unit_price: '3.2',
  labour_rate: '1.75',
  tax_percent: '5',
  weight_min: '0',
  weight_max: '60',
  grn_date: '2026-05-02',
};
async function open(params: Record<string, string>, role = 'admin', rows = onionRows()) {
  mockRole = role;
  mockParams = params;
  jest.mocked(listItemRates).mockResolvedValue(rows);
  await act(async () => { tree = create(<RateEditorScreen />); });
  return tree!;
}

const NOTE = (customer: string) =>
  `This changes ${customer}'s rate for every invoice made from now on for goods received from 2 May 2026, not only this invoice. To change only this invoice, go back and edit the line.`;

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

it('admin, Orchard B has an own rate: Correct rate, the note names the customer and 2 May 2026, the line figures are in the fields', async () => {
  const t = await open(line);
  const texts = textsOf(t);
  expect(texts).toContain('Correct rate');
  expect(texts).toContain(NOTE('Review Orchard B'));
  expect(texts).toContain('1 Jan 2026 (a correction keeps the start date)');
  expect(inputWithLabel(t, 'Rent per bag, per month')?.props.value).toBe('3.20');
  expect(inputWithLabel(t, 'Labour per bag')?.props.value).toBe('1.75');
  expect(inputsWithLabel(t, 'Up to').map(n => n.props.value)).toEqual(['100']);
});

it('admin, Orchard A has none: Add customer rate with the default bands (0 to 100, not 0 to the line weight 60) from the received day', async () => {
  const t = await open({ ...line, customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name });
  const texts = textsOf(t);
  expect(texts).toContain('Add customer rate');
  expect(texts).toContain(NOTE('Review Orchard A'));
  expect(inputsWithLabel(t, 'Up to').map(n => n.props.value)).toEqual(['100']);
  expect(inputWithLabel(t, 'Rent per bag, per month')?.props.value).toBe('3.20');
  expect(chipState(t)[0]).toBe('Received 2 May 2026:on');
});

it('staff: the rate starts Today and the staff sentence shows', async () => {
  const t = await open(line, 'staff');
  const texts = textsOf(t);
  expect(texts).toContain('Change rate');
  expect(texts).toContain('A rate that is already in force is corrected by an administrator or supervisor. Your change starts on the date you choose, from today.');
  expect(chipState(t)[0]).toBe('Today:on');
  expect(chipState(t).some(c => c.startsWith('Received'))).toBe(false);
});

it('Back with nothing typed saves nothing; typing then makes the guard ask', async () => {
  const t = await open({ ...line, customer_id: ORCHARD_A.id });
  expect(mockGuard.hasChanges).toBe(false);
  expect(replaceItemRates).not.toHaveBeenCalled();
  await act(async () => { inputsWithLabel(t, 'Rent per bag, per month')[0].props.onChangeText('3.30'); });
  expect(mockGuard.hasChanges).toBe(true);
  expect(mockGuard.title).toBe('Discard this rate?');
  expect(replaceItemRates).not.toHaveBeenCalled();
});
