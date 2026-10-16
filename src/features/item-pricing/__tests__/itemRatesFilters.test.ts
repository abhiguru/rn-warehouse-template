import { setLanguage } from '@/i18n';
import { normalizeValues } from '@/features/filters/filterModel';
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

  it('offers the chip Type only: no Customer chip, no Needs a rate, nothing for items (P-35, P-39)', () => {
    expect(ITEM_RATES_FILTERS.fastFilters).toEqual(['priceType']);
    expect(ITEM_RATES_FILTERS.fields.map(f => label(f.key))).toEqual(['Type']);
    expect(ITEM_RATES_FILTERS.sort).toBeUndefined();
  });

  it('labels follow the language', () => {
    setLanguage('gu');
    expect(label('priceType')).toBe('પ્રકાર');
    expect(ITEM_RATES_CONFIG.title).toBe('આઇટમના દર');
    setLanguage('en');
    expect(label('priceType')).toBe('Type');
  });

  it('turns Type = One-time into a request', () => {
    expect(ITEM_RATES_FILTERS.toRequest({ priceType: 'one_time' }, undefined, ctx)).toEqual({ priceType: 'one_time' });
    expect(ITEM_RATES_FILTERS.toRequest({}, undefined, ctx)).toEqual({ priceType: 'all' });
  });

  it('ignores a value saved for a field the list no longer has (Customer, Needs a rate)', () => {
    const saved = { customers: [{ id: 'orchard-b', label: 'Review Orchard B' }], needsRate: true, priceType: 'monthly' };
    expect(ITEM_RATES_FILTERS.toRequest(saved, undefined, ctx)).toEqual({ priceType: 'monthly' });
    // What the list keeps from a saved set: only known, visible, active fields.
    expect(normalizeValues(ITEM_RATES_FILTERS, saved, ctx)).toEqual({ priceType: 'monthly' });
  });
});
