/**
 * WH-125: stock aging keeps each line's item id from the server (migration 144), so two items with the same name and
 * different packaging words stay two cards. The real service and the real grouping run; only the RPC answer is faked.
 * The GRN activity search hint names only what that search looks in.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n/language';
import { t } from '@/i18n';
import { getCustomerStockAging } from '../stock-aging-service';
import { groupStockAgingLines } from '@/features/filters/configs/reports/stockAging';
import { GRN_ACTIVITY_CUSTOMER } from '@/features/filters/configs/reports/grnActivity';
import { GRN_FILTERS } from '@/features/filters/configs/grn';

jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: jest.fn(),
  getStoredToken: jest.fn(async () => ({ isValid: true, type: 'custom', authToken: 'x' })),
}));

const CUSTOMER = 'cccccccc-1111-4222-8333-444444444444';
const EGG_BOX = 'eeeeeeee-0000-4000-8000-000000000001';
const EGG_TREY = 'eeeeeeee-0000-4000-8000-000000000002';

const line = (grn: string, itemId: string | undefined, packaging: string, stock: number, days: number) => ({
  grn_id: `grn-${grn}`,
  gr_no: grn,
  ...(itemId ? { item_id: itemId } : {}),
  item_name: 'Egg',
  packaging,
  current_stock: stock,
  original_qty: stock,
  weight: 10,
  rack: 'R1',
  package_mark: 'PM',
  grn_date: '2026-01-01',
  aging_days: days,
  aging_bucket: '0-120',
  dispatch_info: { total_dispatched: 0, dispatch_count: 0, last_dispatch_date: null, days_since_last_dispatch: null, avg_days_between_dispatches: null },
});

const rpc = jest.fn();
const answer = (items: unknown[]) =>
  rpc.mockResolvedValue({ data: { success: true, data: { summary: {}, by_bucket: {}, items } }, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  setLanguage('en');
});
afterEach(() => jest.restoreAllMocks());

describe('stock aging keeps the item id', () => {
  it('passes each line\'s item_id through the service', async () => {
    answer([line('101', EGG_BOX, 'Box', 5, 10), line('102', EGG_TREY, 'Trey', 7, 20)]);
    const result = await getCustomerStockAging({ customerId: CUSTOMER });
    expect(result.success).toBe(true);
    expect(result.data!.items.map(i => i.item_id)).toEqual([EGG_BOX, EGG_TREY]);
  });

  it('leaves item_id undefined for an older server that does not send it', async () => {
    answer([line('101', undefined, 'Box', 5, 10)]);
    const result = await getCustomerStockAging({ customerId: CUSTOMER });
    expect(result.data!.items[0].item_id).toBeUndefined();
  });

  it('gives two cards for two same-name items with different packaging words', async () => {
    answer([line('101', EGG_BOX, 'Box', 5, 10), line('102', EGG_TREY, 'Trey', 7, 20), line('103', EGG_BOX, 'Box', 2, 30)]);
    const { data } = await getCustomerStockAging({ customerId: CUSTOMER });
    const groups = groupStockAgingLines(data!.items);
    expect(groups).toHaveLength(2);
    const box = groups.find(g => g.key === EGG_BOX)!;
    const trey = groups.find(g => g.key === EGG_TREY)!;
    expect([box.itemName, box.packaging, box.totalStock, box.lines.length]).toEqual(['Egg', 'box', 7, 2]);
    expect([trey.itemName, trey.packaging, trey.totalStock, trey.lines.length]).toEqual(['Egg', 'Trey', 7, 1]);
  });
});

describe('search hints', () => {
  it('the GRN activity hint does not promise dates, because that search does not look in dates', () => {
    expect(GRN_ACTIVITY_CUSTOMER.search?.dates).toBe(false);
    expect(GRN_ACTIVITY_CUSTOMER.search?.placeholder).toBe('GRN no., customer or item');
    expect(GRN_ACTIVITY_CUSTOMER.search?.placeholder).not.toMatch(/date/i);
  });

  it('the GRN list hint keeps "date", because that list does search dates', () => {
    expect(GRN_FILTERS.search?.dates).toBe(true);
    expect(GRN_FILTERS.search?.placeholder).toMatch(/date/i);
    expect(GRN_FILTERS.search?.placeholder).toBe(t('filters.list.grn.search'));
  });

  it('the GRN activity hint has a Gujarati text of its own', () => {
    setLanguage('gu');
    expect(GRN_ACTIVITY_CUSTOMER.search?.placeholder).toBe(t('filters.list.grnActivity.search'));
    expect(GRN_ACTIVITY_CUSTOMER.search?.placeholder).not.toBe('GRN no., customer or item');
    expect(GRN_ACTIVITY_CUSTOMER.search?.placeholder).not.toBe(GRN_FILTERS.search?.placeholder);
  });
});
