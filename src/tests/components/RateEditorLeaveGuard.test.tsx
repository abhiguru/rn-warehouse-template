/**
 * Leaving the rate editor (P-01): the guard asks only when something changed, and with the
 * house wording of the form: "Discard this rate?" for a new rate, the default "Discard changes?" for a
 * change. (The hook itself, with the header Back, the Back key and the swipe, is tested in
 * src/hooks/__tests__/useLeaveGuard.test.tsx; here the screen's use of it.)
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ORCHARD_A, chip, cuminRows, inputsWithLabel, onionRows } from '@/tests/helpers/rateEditorFixtures';
import RateEditorScreen from '../../../app/item-rates/edit';

let mockRole = 'admin';
let mockParams: Record<string, string> = {};
let mockGuard: { hasChanges: boolean; title?: string } = { hasChanges: false };
import { listItemRates } from '@/services/item-pricing-service';
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
async function open(params: Record<string, string>, rows = cuminRows(), role = 'admin') {
  mockRole = role;
  mockParams = params;
  jest.mocked(listItemRates).mockResolvedValue(rows);
  await act(async () => { tree = create(<RateEditorScreen />); });
  return tree!;
}
const type = async (t: ReactTestRenderer, label: string, text: string) => {
  await act(async () => { inputsWithLabel(t, label)[0].props.onChangeText(text); });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGuard = { hasChanges: false };
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

describe('Change rate', () => {
  const params = { mode: 'change', item_id: 'cumin', price_type: 'monthly' };

  it('asks nothing when nothing was typed', async () => {
    await open(params);
    expect(mockGuard.hasChanges).toBe(false);
    expect(mockGuard.title).toBeUndefined(); // the hook's default, "Discard changes?"
  });

  it('asks once the rent was typed (12 in place of 11.00), and no longer when it is typed back', async () => {
    const t = await open(params);
    await type(t, 'Rent per bag, per month', '12');
    expect(mockGuard.hasChanges).toBe(true);
    await type(t, 'Rent per bag, per month', '11.00');
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('asks after a start day was chosen, though no field was typed', async () => {
    const t = await open(params);
    await act(async () => { chip(t, 'Today').props.onPress(); });
    expect(mockGuard.hasChanges).toBe(true);
  });

  it('asks after a weight band was added', async () => {
    const t = await open(params);
    const add = t.root.findAll(n => typeof n.props.onPress === 'function' && n.props.children === 'Add weight band')[0];
    await act(async () => { add.props.onPress(); });
    expect(mockGuard.hasChanges).toBe(true);
  });
});

describe('Add rate', () => {
  it('a new rate asks "Discard this rate?", but only after a change (Today is preselected)', async () => {
    const t = await open({ mode: 'addCustomer', item_id: 'onion', customer_id: ORCHARD_A.id, customer_name: ORCHARD_A.name, price_type: 'monthly' }, onionRows());
    expect(mockGuard.hasChanges).toBe(false);
    expect(mockGuard.title).toBe('Discard this rate?');
    await type(t, 'Rent per bag, per month', '3.25');
    expect(mockGuard.hasChanges).toBe(true);
  });
});

it('a staff member sent to Correct rate is asked nothing: there is nothing to lose', async () => {
  await open({ mode: 'correct', item_id: 'cumin', price_type: 'monthly' }, cuminRows(), 'staff');
  expect(mockGuard.hasChanges).toBe(false);
});
