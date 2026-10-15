import { setLanguage } from '@/i18n';
import { ITEM_RATES_CONFIG, ITEM_RATES_FILTERS } from '../itemRatesFilters';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn() }));

afterEach(() => setLanguage('en'));

const ctx = { role: 'admin' as const, isWarehouseRole: true, assignedCustomers: [] };
const label = (key: string) => ITEM_RATES_FILTERS.fields.find(f => f.key === key)!.label;

describe('ITEM_RATES_FILTERS', () => {
  it('has no result count, so a sheet never says "No prices match" (P-02)', () => {
    expect(ITEM_RATES_FILTERS.fetchCount).toBeUndefined();
    expect((ITEM_RATES_CONFIG as { countResults?: unknown }).countResults).toBeUndefined();
  });

  it('offers the chips Customer and Type, no Needs a rate, and nothing for items (P-35, P-39)', () => {
    expect(ITEM_RATES_FILTERS.fastFilters).toEqual(['customers', 'priceType']);
    expect(ITEM_RATES_FILTERS.fields.map(f => label(f.key))).toEqual(['Customer', 'Type']);
    expect(ITEM_RATES_FILTERS.sort).toBeUndefined();
  });

  it('labels follow the language', () => {
    setLanguage('gu');
    expect(label('customers')).toBe('વેપારી');
    expect(label('priceType')).toBe('પ્રકાર');
    expect(ITEM_RATES_CONFIG.title).toBe('આઇટમના દર');
    setLanguage('en');
    expect(label('priceType')).toBe('Type');
  });

  it('turns Customer = Review Orchard B into a request', () => {
    const request = ITEM_RATES_FILTERS.toRequest({ customers: [{ id: 'orchard-b', label: 'Review Orchard B' }], priceType: 'one_time' }, undefined, ctx);
    expect(request).toEqual({ customerIds: ['orchard-b'], priceType: 'one_time' });
    expect(ITEM_RATES_FILTERS.toRequest({}, undefined, ctx)).toEqual({ customerIds: [], priceType: 'all' });
    // A Needs a rate value left in a saved filter is ignored.
    expect(ITEM_RATES_FILTERS.toRequest({ needsRate: true }, undefined, ctx)).toEqual({ customerIds: [], priceType: 'all' });
  });
});
