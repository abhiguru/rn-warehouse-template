/**
 * Two ways into the rate editor that give it more than the stored rate: the Add button of the
 * Item pricing list (`add_band=1`: the item's tiers plus one empty tier, but leaving untouched still
 * asks) and "Copy tiers from another item…".
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { cuminRows, garlicRows, gingerRows, inputsWithLabel, textsOf, rate } from '@/tests/helpers/rateEditorFixtures';
import RateEditorScreen from '../../../app/item-rates/edit';
import { clearItemRatesCache } from '@/features/item-pricing/useItemRates';
import { listActiveItems, listAllRates, listItemRates } from '@/services/item-pricing-service';

let mockParams: Record<string, string> = {};
let mockGuard: { hasChanges: boolean; title?: string } = { hasChanges: false };
let mockOffline = false;
let sheetProps: Record<string, any> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; },
}));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', role: 'admin' } } }),
}));
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => ({ instanceId: 'test-facility' }) }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/hooks/useLeaveGuard', () => ({
  useLeaveGuard: (options: { hasChanges: boolean; title?: string }) => {
    mockGuard = options;
    return { leaveWithoutAsking: (go: () => void) => go() };
  },
}));
jest.mock('@/services/item-pricing-service', () => ({
  replaceItemRates: jest.fn(),
  listItemRates: jest.fn(),
  listActiveItems: jest.fn(),
  listAllRates: jest.fn(),
}));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

const ITEMS = [
  { id: 'cumin', name: 'Review Cumin Bold', packaging: null },
  { id: 'garlic', name: 'Review Garlic Desi', packaging: null },
  { id: 'ginger', name: 'Review Ginger Fresh', packaging: null },
  { id: 'saffron', name: 'Review Saffron Stopped', packaging: null },
];
// Saffron's only default rate ended: it has no rate in force today and must not be offered.
const saffron = rate('saffron', null, 0, 100, 9, 2, 5, '2025-01-01', '2026-03-31', 'monthly', 'Review Saffron Stopped');

let tree: ReactTestRenderer | undefined;
async function open(params: Record<string, string>, rows = cuminRows()) {
  mockParams = params;
  jest.mocked(listItemRates).mockResolvedValue(rows);
  await act(async () => { tree = create(<RateEditorScreen />); });
  return tree!;
}
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const upTos = (t: ReactTestRenderer) => inputsWithLabel(t, 'Up to').map(n => n.props.value);

beforeEach(() => {
  jest.clearAllMocks();
  clearItemRatesCache();
  mockGuard = { hasChanges: false };
  mockOffline = false;
  sheetProps = {};
  jest.mocked(listActiveItems).mockResolvedValue(ITEMS);
  jest.mocked(listAllRates).mockResolvedValue([...cuminRows(), ...garlicRows(), ...gingerRows(), saffron]);
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

describe('add_band', () => {
  it('opens with the item\'s tiers plus one empty tier after the last, and asks before leaving untouched', async () => {
    const t = await open({ mode: 'change', item_id: 'garlic', price_type: 'monthly', add_band: '1' }, garlicRows());
    expect(upTos(t)).toEqual(['40', '100', '']);
    expect(textsOf(t)).toContain('From 101 kg');
    expect(mockGuard.hasChanges).toBe(true);
  });

  it('without the param the item opens as stored and asks nothing', async () => {
    const t = await open({ mode: 'change', item_id: 'garlic', price_type: 'monthly' }, garlicRows());
    expect(upTos(t)).toEqual(['40', '100']);
    expect(mockGuard.hasChanges).toBe(false);
  });

  it('removing the empty tier that was added ends where it began', async () => {
    const t = await open({ mode: 'change', item_id: 'garlic', price_type: 'monthly', add_band: '1' }, garlicRows());
    await act(async () => { t.root.find(n => n.props.testID === 'band-2-remove' && typeof n.props.onPress === 'function').props.onPress(); });
    expect(upTos(t)).toEqual(['40', '100']);
    expect(mockGuard.hasChanges).toBe(false);
  });
});

describe('Copy tiers from another item', () => {
  const press = async (t: ReactTestRenderer) => {
    await act(async () => { t.root.find(n => n.props.testID === 'copy-tiers' && typeof n.props.onPress === 'function').props.onPress(); });
    await flush();
  };

  it('offers the other items that have a default rate in force today, and replaces the tiers with the one chosen', async () => {
    const t = await open({ mode: 'change', item_id: 'cumin', price_type: 'monthly' });
    expect(upTos(t)).toEqual(['100']);
    await press(t);
    expect(sheetProps.isVisible).toBe(true);
    expect(sheetProps.title).toBe('Choose an item to copy');
    let offered: { name: string }[] = [];
    let filtered: unknown[] = [];
    await act(async () => { offered = await sheetProps.searchFn(''); filtered = await sheetProps.searchFn('gar'); });
    expect(offered.map(i => i.name)).toEqual(['Review Garlic Desi', 'Review Ginger Fresh']);
    expect(filtered).toHaveLength(1);
    await act(async () => { sheetProps.onSelect(offered[0]); });
    expect(upTos(t)).toEqual(['40', '100']);
    expect(inputsWithLabel(t, 'Rent per bag, per month').map(n => n.props.value)).toEqual(['6.00', '9.50']);
    expect(textsOf(t)).toContain('Tiers copied from Review Garlic Desi. Change what is different.');
    expect(mockGuard.hasChanges).toBe(true);
  });

  it('has no Copy button in a customer rate', async () => {
    const t = await open({ mode: 'addCustomer', item_id: 'cumin', customer_id: 'cust-a', customer_name: 'Review Orchard A', price_type: 'monthly' });
    expect(t.root.findAll(n => n.props.testID === 'copy-tiers')).toHaveLength(0);
  });

  it('is disabled offline', async () => {
    mockOffline = true;
    const t = await open({ mode: 'change', item_id: 'cumin', price_type: 'monthly' });
    expect(t.root.find(n => n.props.testID === 'copy-tiers' && typeof n.props.onPress === 'function').props.disabled).toBe(true);
  });
});
