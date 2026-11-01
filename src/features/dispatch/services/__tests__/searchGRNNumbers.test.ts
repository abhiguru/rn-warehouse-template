import { searchGRNNumbers } from '../grnDetailService';

const calls: Array<[string, ...unknown[]]> = [];
let mockRows: unknown[] = [];
jest.mock('@/config/supabaseConfig', () => ({
  getAuthenticatedClient: async () => {
    // A PostgREST query builder: every call returns the builder, awaiting it gives the rows.
    const builder: any = {};
    for (const method of ['select', 'ilike', 'order', 'limit', 'eq']) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: mockRows, error: null });
    return {
      from: (table: string) => {
        calls.push(['from', table]);
        return builder;
      },
    };
  },
}));

const CUSTOMER_A = '33333333-2222-4333-8444-555555555555';

describe('searchGRNNumbers', () => {
  beforeEach(() => {
    calls.length = 0;
    mockRows = [{ id: 'grn-1', gr_no: 'A0010', date: '2026-10-01', customer_name: 'Fictional Traders' }];
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("searches only the given customer's GRNs", async () => {
    const results = await searchGRNNumbers('001', CUSTOMER_A);

    expect(calls).toContainEqual(['from', 'goodsreceived']);
    expect(calls).toContainEqual(['ilike', 'gr_no', '%001%']);
    expect(calls).toContainEqual(['eq', 'customer_id', CUSTOMER_A]);
    expect(calls).toContainEqual(['eq', 'out_of_stock', false]);
    expect(results).toEqual([{ id: 'grn-1', gr_no: 'A0010', date: '2026-10-01', customer_name: 'Fictional Traders' }]);
  });

  it('asks nothing for an empty query', async () => {
    expect(await searchGRNNumbers('  ', CUSTOMER_A)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it.each([
    ['D0102', '%D%0102%'],
    ['DV0102', '%DV%0102%'],
    ['0102', '%0102%'],
    ['A', '%A%'],
    ['0', '%0%'],
    ['2', '%2%'],
    ['20102', '%20102%'],
  ])('searches %s as %s, so a letter prefix finds a longer one', async (typed, pattern) => {
    await searchGRNNumbers(typed, CUSTOMER_A);

    expect(calls).toContainEqual(['ilike', 'gr_no', pattern]);
  });

  it.each([
    ['D', 'D', 'D%'],
    ['D0102', 'D', 'D%0102%'],
    ['DV0102', 'D', 'D%V0102%'],
    ['DV0102', 'DV', 'DV%0102%'],
    ['DV1', 'DV', 'DV%1%'],
    ['001', '0', '0%01%'],
    ['0', '0', '0%'],
    ['A_', 'A_', 'A\\_%'],
  ])('with a prefix button tapped, %s after %s is searched as %s (starts with the prefix)', async (typed, prefix, pattern) => {
    await searchGRNNumbers(typed, CUSTOMER_A, { startsWith: prefix });

    expect(calls).toContainEqual(['ilike', 'gr_no', pattern]);
  });
});
