/**
 * The Pricing tab's two actions (WH-74, spec add-rate-next-band-change-rate, criteria 1 and 8): with a rate in force
 * "Add rate" (+) adds the next weight band and "Change rate" (pencil) opens the copy form; with none in force only
 * "Add rate" shows, and it opens the copy form as before. "Add rate" is off, with its line, when the last band
 * reaches 9999 kg or there are 10 bands.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { ItemPricingTab } from '@/features/item-pricing/components/ItemPricingTab';
import { useItemRatesFor } from '@/features/item-pricing/useItemRates';
import { rate } from '@/tests/helpers/rateEditorFixtures';

let mockRole = 'admin';
let mockOffline = false;
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: mockRole } } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/features/item-pricing/useItemRates', () => ({ useItemRatesFor: jest.fn() }));
jest.mock('@/features/item-pricing/useStandardRate', () => ({ useStandardRate: () => ({ rate: null }) }));
jest.mock('@/features/item-pricing/useRateActions', () => ({ useRateActions: () => ({ busy: false, dialog: null }) }));
jest.mock('@/services/item-pricing-service', () => ({ replaceItemRates: jest.fn(), listItemRates: jest.fn() }));

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'admin';
  mockOffline = false;
});
afterEach(() => { act(() => tree?.unmount()); tree = undefined; });

const base = { refreshing: false, refreshError: false, lastUpdated: 1, refresh: jest.fn().mockResolvedValue(undefined) };
const texts = () => tree!.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''));
const button = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0];

async function show(rows: ReturnType<typeof rate>[], active = true) {
  jest.mocked(useItemRatesFor).mockReturnValue({
    ...base,
    itemRates: { item: { id: 'ambali', name: 'Review Ambali' } as never, rows },
    ownRows: rows,
    status: 'ready',
    notFound: false,
  });
  await act(async () => { tree = create(<ItemPricingTab itemId="ambali" itemName="Review Ambali" active={active} />); });
}

/** A rate in force: one band from 0 up to `last`. */
const inForce = (last = 30) => [rate('ambali', null, 0, last, 11, 2, 5, '2020-01-01', null)];

describe('a rate in force', () => {
  it('shows "Add rate" and "Change rate", each with its word (criterion 1)', async () => {
    await show(inForce());
    expect(button('period-add')).toBeDefined();
    expect(button('period-change-rate')).toBeDefined();
    expect(texts()).toEqual(expect.arrayContaining(['Add rate', 'Change rate']));
    // The words are spoken for each tab, and the two differ.
    expect(button('period-add').props.accessibilityLabel).not.toBe(button('period-change-rate').props.accessibilityLabel);
  });

  it('"Add rate" opens the next band and "Change rate" the copy form', async () => {
    await show(inForce());
    await act(async () => { button('period-add').props.onPress(); });
    expect(jest.mocked(router.push).mock.calls[0][0]).toMatchObject({ params: { itemId: 'ambali', mode: 'addBand', price_type: 'monthly' } });
    await act(async () => { button('period-change-rate').props.onPress(); });
    expect(jest.mocked(router.push).mock.calls[1][0]).toMatchObject({ params: { itemId: 'ambali', mode: 'change', price_type: 'monthly' } });
  });
});

describe('no rate in force', () => {
  it('shows only "Add rate", which opens the form for a new rate as today (criterion 1)', async () => {
    await show([rate('ambali', null, 0, 30, 11, 2, 5, '2019-01-01', '2020-12-31')]);
    expect(button('period-add')).toBeDefined();
    expect(button('period-change-rate')).toBeUndefined();
    expect(texts()).not.toContain('Change rate');
    await act(async () => { button('period-add').props.onPress(); });
    expect(jest.mocked(router.push).mock.calls[0][0]).toMatchObject({ params: { mode: 'add' } });
  });
});

describe('no next band (criterion 8)', () => {
  it('a last band up to 9999 disables "Add rate" with its line; "Change rate" still opens', async () => {
    await show([rate('ambali', null, 0, 9999, 11, 2, 5, '2020-01-01', null)]);
    expect(button('period-add').props.disabled).toBe(true);
    expect(texts()).toContain('This rate already covers weights up to 9999 kg.');
    expect(button('period-change-rate').props.disabled).toBeFalsy();
    await act(async () => { button('period-change-rate').props.onPress(); });
    expect(jest.mocked(router.push)).toHaveBeenCalledTimes(1);
  });

  it('ten bands disable "Add rate" with the most-bands line; "Change rate" still opens', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => rate('ambali', null, i * 10 + (i === 0 ? 0 : 1), (i + 1) * 10, 11, 2, 5, '2020-01-01', null));
    await show(ten);
    expect(button('period-add').props.disabled).toBe(true);
    expect(texts()).toContain('You have the most weight bands allowed (10).');
    expect(button('period-change-rate').props.disabled).toBeFalsy();
  });

  it('nine bands, or a last band below 9999, leave "Add rate" on, with no line', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => rate('ambali', null, i * 10 + (i === 0 ? 0 : 1), (i + 1) * 10, 11, 2, 5, '2020-01-01', null));
    await show(nine);
    expect(button('period-add').props.disabled).toBeFalsy();
    expect(texts().some(text => text.startsWith('This rate already covers') || text.startsWith('You have the most'))).toBe(false);
  });
});

describe('who sees them', () => {
  it('staff see neither action', async () => {
    mockRole = 'staff';
    await show(inForce());
    expect(button('period-add')).toBeUndefined();
    expect(button('period-change-rate')).toBeUndefined();
  });

  it('offline both are off, as "Add rate" is today', async () => {
    mockOffline = true;
    await show(inForce());
    expect(button('period-add').props.disabled).toBe(true);
    expect(button('period-change-rate').props.disabled).toBe(true);
  });

  it('a deactivated item shows neither', async () => {
    await show(inForce(), false);
    expect(button('period-add')).toBeUndefined();
    expect(button('period-change-rate')).toBeUndefined();
  });
});
